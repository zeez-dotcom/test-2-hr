import { Router } from "express";
import { requireRole } from "./auth";
import { storage } from "../storage";

export const templatesRouter = Router();

// List all templates
templatesRouter.get("/api/templates", async (_req, res, next) => {
  try {
    const list = await storage.getTemplates();
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// Get template by key
templatesRouter.get("/api/templates/:key", async (req, res, next) => {
  try {
    const row = await storage.getTemplateByKey(req.params.key);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// Upsert template by key (admin only)
templatesRouter.put("/api/templates/:key", requireRole(["admin"]), async (req, res, next) => {
  try {
    const { en, ar } = req.body || {};
    if (typeof en !== 'string' || typeof ar !== 'string') {
      return res.status(400).json({ ok: false, error: 'Invalid payload' });
    }
    const row = await storage.upsertTemplate(req.params.key, { en, ar });
    res.json({ ok: true, data: row });
  } catch (err) {
    next(err);
  }
});
