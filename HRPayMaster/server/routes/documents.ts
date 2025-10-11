import { Router } from "express";
import { z } from "zod";
import {
  insertGenericDocumentSchema,
  documentSignatureStatusSchema,
  type DocumentSignatureStatus,
  type GenericDocument,
  type InsertGenericDocument,
} from "@shared/schema";
import { storage } from "../storage";
import { HttpError } from "../errorHandler";
import type { GenericDocumentFilters } from "../storage";

export const documentsRouter = Router();

const booleanTrueValues = new Set(["1", "true", "yes", "on"]);

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return undefined;
};

const toNullableString = (value: unknown): string | null => {
  const optional = toOptionalString(value);
  return optional ?? null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Number(numeric) : null;
};

const normalizeTagsInput = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    const tags = value
      .map((item) => (typeof item === "string" ? item : String(item ?? "")))
      .map((item) => item.trim())
      .filter(Boolean);
    return tags.length ? tags.join(",") : null;
  }
  if (typeof value === "string") {
    const tags = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return tags.length ? tags.join(",") : null;
  }
  return null;
};

const parseMetadataInput = (value: unknown): Record<string, unknown> | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
};

const querySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  employeeId: z.string().optional(),
  tag: z.string().optional(),
  tags: z.string().optional(),
  signatureStatus: z.string().optional(),
  versionGroupId: z.string().optional(),
  latestOnly: z.string().optional(),
});

documentsRouter.get("/api/documents", async (req, res, next) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const filters: GenericDocumentFilters = {};

    if (parsedQuery.search) {
      filters.search = parsedQuery.search;
    }
    if (parsedQuery.category) {
      filters.category = parsedQuery.category;
    }
    if (parsedQuery.employeeId) {
      filters.employeeId = parsedQuery.employeeId;
    }
    const tagsParam = normalizeTagsInput(parsedQuery.tags ?? parsedQuery.tag);
    if (tagsParam) {
      filters.tags = tagsParam.split(",");
    } else if (tagsParam === null) {
      filters.tags = [];
    }
    if (parsedQuery.signatureStatus) {
      if (parsedQuery.signatureStatus === "all") {
        filters.signatureStatus = "all";
      } else {
        const statusParse = documentSignatureStatusSchema.safeParse(parsedQuery.signatureStatus);
        if (!statusParse.success) {
          throw new HttpError(400, "Invalid signature status filter");
        }
        filters.signatureStatus = statusParse.data as DocumentSignatureStatus;
      }
    }
    if (parsedQuery.versionGroupId) {
      filters.versionGroupId = parsedQuery.versionGroupId;
    }
    if (parsedQuery.latestOnly !== undefined) {
      filters.latestOnly = booleanTrueValues.has(parsedQuery.latestOnly.toLowerCase());
    }

    const documents = await storage.getGenericDocuments(filters);
    res.json(documents);
  } catch (error) {
    next(error);
  }
});

const buildInsertPayload = (
  body: Record<string, unknown>,
  currentUserId?: string | null,
): { payload: Record<string, unknown>; baseDocumentId?: string | null } => {
  const documentUrl = toOptionalString(body.documentUrl) ?? toOptionalString(body.pdfDataUrl);
  const title = toOptionalString(body.title);
  const baseDocumentId = toOptionalString(body.baseDocumentId);

  if (!title || !documentUrl) {
    throw new HttpError(400, "title and documentUrl are required");
  }

  const payload: Record<string, unknown> = {
    title,
    documentUrl,
  };

  const setIfPresent = (
    key: string,
    valueFactory: () => string | number | Record<string, unknown> | null | undefined,
  ) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      payload[key] = valueFactory();
    }
  };

  setIfPresent("description", () => toNullableString(body.description));
  setIfPresent("category", () => toNullableString(body.category));
  setIfPresent("referenceNumber", () => toNullableString(body.referenceNumber));
  setIfPresent("controllerNumber", () => toNullableString(body.controllerNumber));
  setIfPresent("expiryDate", () => toNullableString(body.expiryDate));
  setIfPresent("alertDays", () => toNullableNumber(body.alertDays));
  setIfPresent("employeeId", () => toOptionalString(body.employeeId) ?? null);

  const hasTagsInput =
    Object.prototype.hasOwnProperty.call(body, "tags") ||
    Object.prototype.hasOwnProperty.call(body, "tag");
  if (hasTagsInput) {
    const tagsValue = normalizeTagsInput(body.tags ?? body.tag);
    payload.tags = tagsValue ?? null;
  }

  setIfPresent("metadata", () => parseMetadataInput(body.metadata) ?? null);
  setIfPresent("signatureMetadata", () => parseMetadataInput(body.signatureMetadata) ?? null);

  if (Object.prototype.hasOwnProperty.call(body, "signatureStatus")) {
    const value = toOptionalString(body.signatureStatus);
    if (value) {
      const parsed = documentSignatureStatusSchema.safeParse(value);
      if (!parsed.success) {
        throw new HttpError(400, "Invalid signature status");
      }
      payload.signatureStatus = parsed.data;
    } else {
      payload.signatureStatus = null;
    }
  }

  setIfPresent("signatureProvider", () => toNullableString(body.signatureProvider));
  setIfPresent("signatureEnvelopeId", () => toNullableString(body.signatureEnvelopeId));
  setIfPresent("signatureRecipientEmail", () => toNullableString(body.signatureRecipientEmail));
  setIfPresent("signatureRequestedAt", () => toNullableString(body.signatureRequestedAt));
  setIfPresent("signatureCompletedAt", () => toNullableString(body.signatureCompletedAt));
  setIfPresent("signatureDeclinedAt", () => toNullableString(body.signatureDeclinedAt));
  setIfPresent("signatureCancelledAt", () => toNullableString(body.signatureCancelledAt));
  setIfPresent("generatedFromTemplateKey", () => toNullableString(body.generatedFromTemplateKey));

  if (currentUserId) {
    payload.generatedByUserId = currentUserId;
  } else {
    setIfPresent("generatedByUserId", () => toNullableString(body.generatedByUserId));
  }

  return { payload, baseDocumentId };
};

const inheritableVersionFields: Array<keyof InsertGenericDocument> = [
  "employeeId",
  "description",
  "category",
  "tags",
  "referenceNumber",
  "controllerNumber",
  "expiryDate",
  "alertDays",
  "metadata",
  "generatedFromTemplateKey",
  "generatedByUserId",
  "signatureStatus",
  "signatureProvider",
  "signatureEnvelopeId",
  "signatureRecipientEmail",
  "signatureRequestedAt",
  "signatureCompletedAt",
  "signatureDeclinedAt",
  "signatureCancelledAt",
  "signatureMetadata",
];

const mergeWithBaseDocument = (
  baseDocument: GenericDocument,
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = {};

  for (const key of inheritableVersionFields) {
    if (!Object.prototype.hasOwnProperty.call(payload, key) || payload[key] === undefined) {
      merged[key] = baseDocument[key as keyof GenericDocument];
    }
  }

  return { ...merged, ...payload };
};

documentsRouter.post("/api/documents", async (req, res, next) => {
  try {
    const { payload, baseDocumentId } = buildInsertPayload(req.body ?? {}, (req.user as any)?.id ?? null);
    const parsed = insertGenericDocumentSchema.safeParse(payload);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid document payload");
    }
    const document = await storage.createGenericDocument(parsed.data, { baseDocumentId });
    res.status(201).json(document);
  } catch (error) {
    next(error);
  }
});

documentsRouter.post("/api/documents/:id/versions", async (req, res, next) => {
  try {
    const baseDocument = await storage.getGenericDocument(req.params.id);
    if (!baseDocument) {
      throw new HttpError(404, "Document not found");
    }
    const { payload } = buildInsertPayload(req.body ?? {}, (req.user as any)?.id ?? null);
    const mergedPayload = mergeWithBaseDocument(baseDocument, payload);
    const parsed = insertGenericDocumentSchema.safeParse(mergedPayload);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid document payload");
    }
    const document = await storage.createGenericDocument(parsed.data, { baseDocumentId: req.params.id });
    res.status(201).json(document);
  } catch (error) {
    next(error);
  }
});

documentsRouter.get("/api/documents/:id", async (req, res, next) => {
  try {
    const document = await storage.getGenericDocument(req.params.id);
    if (!document) {
      throw new HttpError(404, "Document not found");
    }
    const versions = await storage.getGenericDocuments({ versionGroupId: document.versionGroupId, latestOnly: false });
    res.json({ document, versions });
  } catch (error) {
    next(error);
  }
});

documentsRouter.get("/api/documents/:id/versions", async (req, res, next) => {
  try {
    const document = await storage.getGenericDocument(req.params.id);
    if (!document) {
      throw new HttpError(404, "Document not found");
    }
    const versions = await storage.getGenericDocuments({ versionGroupId: document.versionGroupId, latestOnly: false });
    res.json(versions);
  } catch (error) {
    next(error);
  }
});

documentsRouter.put("/api/documents/:id", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};

    const ensureOptional = (key: string, value: unknown) => {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        updates[key] = value;
      }
    };

    ensureOptional("title", toOptionalString(body.title));
    ensureOptional("description", toNullableString(body.description));
    const documentUrl = toOptionalString(body.documentUrl) ?? toOptionalString(body.pdfDataUrl);
    if (Object.prototype.hasOwnProperty.call(body, "documentUrl") || Object.prototype.hasOwnProperty.call(body, "pdfDataUrl")) {
      if (!documentUrl) {
        throw new HttpError(400, "documentUrl cannot be empty");
      }
      updates.documentUrl = documentUrl;
    }
    ensureOptional("category", toNullableString(body.category));
    const tagsValue = normalizeTagsInput(body.tags ?? body.tag);
    if (tagsValue !== undefined) {
      updates.tags = tagsValue;
    }
    ensureOptional("referenceNumber", toNullableString(body.referenceNumber));
    ensureOptional("controllerNumber", toNullableString(body.controllerNumber));
    ensureOptional("expiryDate", toNullableString(body.expiryDate));
    if (Object.prototype.hasOwnProperty.call(body, "alertDays")) {
      updates.alertDays = toNullableNumber(body.alertDays);
    }
    if (Object.prototype.hasOwnProperty.call(body, "employeeId")) {
      updates.employeeId = toOptionalString(body.employeeId) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "metadata")) {
      updates.metadata = parseMetadataInput(body.metadata) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "signatureMetadata")) {
      updates.signatureMetadata = parseMetadataInput(body.signatureMetadata) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "signatureStatus")) {
      const value = toOptionalString(body.signatureStatus);
      if (value) {
        const parsed = documentSignatureStatusSchema.safeParse(value);
        if (!parsed.success) {
          throw new HttpError(400, "Invalid signature status");
        }
        updates.signatureStatus = parsed.data;
      } else {
        updates.signatureStatus = null;
      }
    }
    ensureOptional("signatureProvider", toNullableString(body.signatureProvider));
    ensureOptional("signatureEnvelopeId", toNullableString(body.signatureEnvelopeId));
    ensureOptional("signatureRecipientEmail", toNullableString(body.signatureRecipientEmail));
    ensureOptional("signatureRequestedAt", toNullableString(body.signatureRequestedAt));
    ensureOptional("signatureCompletedAt", toNullableString(body.signatureCompletedAt));
    ensureOptional("signatureDeclinedAt", toNullableString(body.signatureDeclinedAt));
    ensureOptional("signatureCancelledAt", toNullableString(body.signatureCancelledAt));
    ensureOptional("generatedFromTemplateKey", toNullableString(body.generatedFromTemplateKey));

    const parsed = insertGenericDocumentSchema.partial().safeParse(updates);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid document update");
    }

    if (Object.keys(parsed.data).length === 0) {
      const existing = await storage.getGenericDocument(req.params.id);
      if (!existing) {
        throw new HttpError(404, "Document not found");
      }
      res.json(existing);
      return;
    }

    const document = await storage.updateGenericDocument(req.params.id, parsed.data);
    if (!document) {
      throw new HttpError(404, "Document not found");
    }
    res.json(document);
  } catch (error) {
    next(error);
  }
});

documentsRouter.delete("/api/documents/:id", async (req, res, next) => {
  try {
    const deleted = await storage.deleteGenericDocument(req.params.id);
    if (!deleted) {
      throw new HttpError(404, "Document not found");
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

const signatureSendSchema = z.object({
  provider: z.string().min(1).optional(),
  envelopeId: z.string().min(1).optional(),
  recipientEmail: z.string().email().optional(),
  status: documentSignatureStatusSchema.optional(),
  requestedAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

documentsRouter.post("/api/documents/:id/signature", async (req, res, next) => {
  try {
    const parsed = signatureSendSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "Invalid signature payload");
    }
    const data = parsed.data;
    const updates: Record<string, unknown> = {
      signatureStatus: data.status ?? "sent",
      signatureProvider: data.provider ?? null,
      signatureEnvelopeId: data.envelopeId ?? null,
      signatureRecipientEmail: data.recipientEmail ?? null,
      signatureRequestedAt: data.requestedAt ?? new Date().toISOString(),
    };
    if (data.metadata !== undefined) {
      updates.signatureMetadata = data.metadata;
    }
    const document = await storage.updateGenericDocument(req.params.id, updates);
    if (!document) {
      throw new HttpError(404, "Document not found");
    }
    res.json(document);
  } catch (error) {
    next(error);
  }
});

const signatureCallbackSchema = z.object({
  envelopeId: z.string().min(1),
  status: documentSignatureStatusSchema,
  completedAt: z.string().datetime().optional(),
  declinedAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
  provider: z.string().optional(),
});

documentsRouter.post("/api/documents/signature/callback", async (req, res, next) => {
  try {
    const parsed = signatureCallbackSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, "Invalid signature callback payload");
    }
    const updates: Record<string, unknown> = {
      signatureStatus: parsed.data.status,
      signatureCompletedAt: parsed.data.completedAt ?? null,
      signatureDeclinedAt: parsed.data.declinedAt ?? null,
      signatureCancelledAt: parsed.data.cancelledAt ?? null,
    };
    if (parsed.data.metadata !== undefined) {
      updates.signatureMetadata = parsed.data.metadata;
    }
    if (parsed.data.provider !== undefined) {
      updates.signatureProvider = parsed.data.provider;
    }
    const document = await storage.updateGenericDocumentByEnvelope(parsed.data.envelopeId, updates);
    if (!document) {
      throw new HttpError(404, "Document not found");
    }
    res.json({ ok: true, document });
  } catch (error) {
    next(error);
  }
});

