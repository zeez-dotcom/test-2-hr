import { Router, type Request } from "express";
import { z } from "zod";
import { requirePermission } from "./auth";
import { storage } from "../storage";
import { HttpError } from "../errorHandler";
import type { SessionUser } from "@shared/schema";

export const securityRouter = Router();

const isoDateSchema = z
  .string()
  .optional()
  .refine(value => {
    if (!value) return true;
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  }, "Invalid date value");

const createAccessRequestSchema = z.object({
  permissionSetKey: z.string().min(1),
  reason: z.string().max(500).optional(),
  startAt: isoDateSchema,
  expiresAt: isoDateSchema,
});

const approveAccessRequestSchema = z.object({
  startAt: isoDateSchema,
  expiresAt: isoDateSchema,
  notes: z.string().max(500).optional(),
});

const rejectAccessRequestSchema = z.object({
  notes: z.string().max(500).optional(),
});

const parseDate = (value?: string | null): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "Invalid date provided");
  }
  return date;
};

const logSecurityAction = async (
  req: Request,
  eventType: string,
  summary: string,
  metadata?: Record<string, unknown>,
) => {
  const actorId = (req.user as SessionUser | undefined)?.id;
  if (!actorId) return;
  try {
    await storage.logSecurityEvent({
      actorId,
      eventType,
      entityType: "security",
      entityId: metadata?.entityId ? String(metadata.entityId) : null,
      summary,
      metadata: metadata ?? null,
    });
  } catch (error) {
    console.error("Failed to log security action", error);
  }
};

securityRouter.get(
  "/api/security/permission-sets",
  requirePermission("security:access:request"),
  async (_req, res, next) => {
    try {
      const sets = await storage.getPermissionSets();
      res.json(sets);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch permission sets"));
    }
  },
);

securityRouter.get(
  "/api/security/audit-events",
  requirePermission("security:audit:view"),
  async (req, res, next) => {
    try {
      const limitSchema = z.object({ limit: z.coerce.number().int().positive().max(500).optional() });
      const { limit } = limitSchema.parse(req.query);
      const events = await storage.getSecurityAuditEvents({ limit });
      res.json(events);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid query parameters", error.errors));
      }
      next(new HttpError(500, "Failed to load audit events"));
    }
  },
);

securityRouter.get("/api/security/access-requests", async (req, res, next) => {
  try {
    const user = req.user as SessionUser | undefined;
    if (!user) {
      return next(new HttpError(403, "Forbidden"));
    }
    const canReview = user.permissions.includes("security:access:review");
    const canRequest = user.permissions.includes("security:access:request");
    if (!canReview && !canRequest) {
      return next(new HttpError(403, "Forbidden"));
    }

    const querySchema = z.object({
      status: z.enum(["pending", "approved", "rejected", "all"]).optional(),
      includeResolved: z.coerce.boolean().optional(),
    });
    const { status, includeResolved } = querySchema.parse(req.query);

    const options: Parameters<typeof storage.getAccessRequests>[0] = {};
    if (canReview) {
      if (status) {
        options.status = status;
      }
      if (includeResolved !== undefined) {
        options.includeResolved = includeResolved;
      }
    } else {
      options.requesterId = user.id;
      options.includeResolved = true;
    }

    const requests = await storage.getAccessRequests(options);
    res.json(requests);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    next(new HttpError(500, "Failed to fetch access requests"));
  }
});

securityRouter.post(
  "/api/security/access-requests",
  requirePermission("security:access:request"),
  async (req, res, next) => {
    try {
      const user = req.user as SessionUser;
      const payload = createAccessRequestSchema.parse(req.body);
      const permissionSet = await storage.getPermissionSetByKey(payload.permissionSetKey);
      if (!permissionSet) {
        return next(new HttpError(404, "Permission set not found"));
      }
      const startAt = parseDate(payload.startAt);
      const expiresAt = parseDate(payload.expiresAt);
      const requestRecord = await storage.createAccessRequest({
        requesterId: user.id,
        permissionSetId: permissionSet.id,
        reason: payload.reason,
        startAt: startAt ?? null,
        expiresAt: expiresAt ?? null,
        status: "pending",
      });
      await logSecurityAction(req, "access_request", "Submitted access request", {
        permissionSet: permissionSet.key,
        startAt: startAt?.toISOString(),
        expiresAt: expiresAt?.toISOString(),
        entityId: requestRecord.id,
      });
      res.status(201).json(requestRecord);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid access request payload", error.errors));
      }
      next(new HttpError(500, "Failed to submit access request"));
    }
  },
);

securityRouter.post(
  "/api/security/access-requests/:id/approve",
  requirePermission("security:access:review"),
  async (req, res, next) => {
    try {
      const reviewer = req.user as SessionUser;
      const payload = approveAccessRequestSchema.parse(req.body);
      const requestId = req.params.id;
      const [existing] = await storage.getAccessRequests({ id: requestId, includeResolved: true });
      if (!existing) {
        return next(new HttpError(404, "Access request not found"));
      }
      if (existing.status !== "pending") {
        return next(new HttpError(409, "Access request already processed"));
      }

      const startAt = parseDate(payload.startAt) ?? new Date();
      const expiresAt = parseDate(payload.expiresAt) ?? null;

      const updated = await storage.updateAccessRequest(requestId, {
        status: "approved",
        reviewerId: reviewer.id,
        reviewedAt: new Date(),
        decisionNotes: payload.notes,
        startAt,
        expiresAt,
      });
      if (!updated) {
        return next(new HttpError(500, "Failed to update access request"));
      }

      await storage.grantPermissionSet({
        userId: updated.requesterId,
        permissionSetId: updated.permissionSetId,
        grantedById: reviewer.id,
        reason: updated.reason,
        startsAt: startAt,
        expiresAt,
      });

      await logSecurityAction(req, "access_request_approved", "Approved access request", {
        entityId: requestId,
        requesterId: updated.requesterId,
        startAt: startAt.toISOString(),
        expiresAt: expiresAt?.toISOString(),
      });

      const [detail] = await storage.getAccessRequests({ id: requestId, includeResolved: true });
      res.json(detail ?? updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid approval payload", error.errors));
      }
      next(new HttpError(500, "Failed to approve access request"));
    }
  },
);

securityRouter.post(
  "/api/security/access-requests/:id/reject",
  requirePermission("security:access:review"),
  async (req, res, next) => {
    try {
      const reviewer = req.user as SessionUser;
      const payload = rejectAccessRequestSchema.parse(req.body);
      const requestId = req.params.id;
      const [existing] = await storage.getAccessRequests({ id: requestId, includeResolved: true });
      if (!existing) {
        return next(new HttpError(404, "Access request not found"));
      }
      if (existing.status !== "pending") {
        return next(new HttpError(409, "Access request already processed"));
      }

      const updated = await storage.updateAccessRequest(requestId, {
        status: "rejected",
        reviewerId: reviewer.id,
        reviewedAt: new Date(),
        decisionNotes: payload.notes,
      });
      if (!updated) {
        return next(new HttpError(500, "Failed to update access request"));
      }

      await logSecurityAction(req, "access_request_rejected", "Rejected access request", {
        entityId: requestId,
        requesterId: updated.requesterId,
        notes: payload.notes,
      });

      const [detail] = await storage.getAccessRequests({ id: requestId, includeResolved: true });
      res.json(detail ?? updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid rejection payload", error.errors));
      }
      next(new HttpError(500, "Failed to reject access request"));
    }
  },
);

export default securityRouter;
