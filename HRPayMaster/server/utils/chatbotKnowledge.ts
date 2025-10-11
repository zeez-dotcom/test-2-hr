import { performance } from "node:perf_hooks";
import { log } from "../vite";
import { storage } from "../storage";

interface KnowledgeEntry {
  id: string;
  type: "policy" | "template";
  title: string;
  description?: string | null;
  category?: string | null;
  tags?: string | null;
  content: string;
  tokens: string[];
}

export interface KnowledgeSearchResult {
  id: string;
  type: "policy" | "template";
  title: string;
  snippet: string;
  score: number;
  category?: string | null;
  tags?: string | null;
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "for",
  "to",
  "in",
  "on",
  "with",
  "by",
  "is",
  "are",
  "be",
  "as",
  "at",
  "from",
  "that",
  "this",
  "these",
  "those",
]);

const tokenize = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
};

export class ChatbotKnowledgeIndex {
  private entries: KnowledgeEntry[] = [];
  private lastLoadedAt = 0;
  private readonly ttlMs: number;

  constructor(ttlMinutes = 10) {
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  async ensureLoaded(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastLoadedAt < this.ttlMs && this.entries.length) {
      return;
    }

    const start = performance.now();
    const [documents, templates] = await Promise.all([
      storage.getGenericDocuments({ latestOnly: true }),
      storage.getTemplates(),
    ]);

    const docEntries: KnowledgeEntry[] = documents.map((doc) => {
      const contentParts: string[] = [];
      if (doc.title) contentParts.push(doc.title);
      if (doc.description) contentParts.push(doc.description);
      if (doc.category) contentParts.push(doc.category);
      if (doc.tags) contentParts.push(doc.tags);
      if (doc.referenceNumber) contentParts.push(doc.referenceNumber);
      if (doc.controllerNumber) contentParts.push(doc.controllerNumber);

      const content = contentParts.join(" \n");
      return {
        id: doc.id,
        type: "policy",
        title: doc.title || "Untitled Document",
        description: doc.description,
        category: doc.category,
        tags: doc.tags,
        content,
        tokens: tokenize(content),
      };
    });

    const templateEntries: KnowledgeEntry[] = templates.map((tpl) => {
      const contentParts: string[] = [tpl.key];
      if (tpl.en) contentParts.push(tpl.en);
      if (tpl.ar) contentParts.push(tpl.ar);
      const content = contentParts.join(" \n");
      return {
        id: tpl.id ?? tpl.key,
        type: "template",
        title: tpl.key,
        description: tpl.en,
        category: "template",
        tags: null,
        content,
        tokens: tokenize(content),
      };
    });

    this.entries = [...docEntries, ...templateEntries];
    this.lastLoadedAt = now;
    const duration = Math.round(performance.now() - start);
    log(`chatbot knowledge index refreshed (${this.entries.length} items) in ${duration}ms`);
  }

  async search(query: string, limit = 5): Promise<KnowledgeSearchResult[]> {
    await this.ensureLoaded();
    const tokens = tokenize(query);
    if (!tokens.length) return [];

    const tokenSet = new Set(tokens);
    const results = this.entries
      .map((entry) => {
        let score = 0;
        for (const token of entry.tokens) {
          if (tokenSet.has(token)) {
            score += 2;
          }
        }
        if (!score) {
          // fallback partial match on title/description
          const title = entry.title.toLowerCase();
          for (const token of tokens) {
            if (title.includes(token)) {
              score += 1;
            }
          }
        }
        return { entry, score };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ entry, score }) => ({
        id: entry.id,
        type: entry.type,
        title: entry.title,
        score,
        snippet: entry.description || entry.content.slice(0, 180),
        category: entry.category,
        tags: entry.tags,
      }));

    return results;
  }
}

export const chatbotKnowledgeIndex = new ChatbotKnowledgeIndex();
