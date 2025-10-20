import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errorHandler";
import { requirePermission } from "./auth";
import { storage } from "../storage";
import type {
  AllowanceView,
  Employee,
  EmployeeEvent,
  EmployeeSummary,
  InsertEmployeeEvent,
} from "@shared/schema";

export const allowancesRouter = Router();

type EventWithEmployee = EmployeeEvent & { employee?: Employee | null };

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const isoDateSchema = z
  .string()
  .regex(isoDatePattern, "Date must be in YYYY-MM-DD format");

const allowanceListQuerySchema = z.object({
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  employeeId: z.string().trim().min(1).optional(),
  recurrenceType: z.enum(["none", "monthly"]).optional(),
  status: z.string().trim().min(1).optional(),
});

const allowanceBaseSchema = z.object({
  employeeId: z.string().trim().min(1, "Employee is required"),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional().nullable(),
  amount: z.coerce.number().min(0, "Amount must be zero or greater"),
  eventDate: isoDateSchema.optional(),
  recurrenceType: z.enum(["none", "monthly"]).optional().default("none"),
  recurrenceEndDate: isoDateSchema.optional().nullable(),
  affectsPayroll: z.boolean().optional(),
  status: z.string().trim().optional(),
});

const allowanceCreateSchema = allowanceBaseSchema;
const allowanceUpdateSchema = allowanceBaseSchema.partial();

const parseIsoDate = (value: string): Date => {
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    year < 1970 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new HttpError(400, "Invalid date");
  }
  return new Date(Date.UTC(year, month - 1, day));
};

const resolveDateRange = (start?: string, end?: string) => {
  if (!start && !end) {
    return { startDate: undefined, endDate: undefined };
  }
  const normalizedStart = parseIsoDate(start ?? end!);
  const normalizedEnd = parseIsoDate(end ?? start!);
  if (normalizedStart > normalizedEnd) {
    throw new HttpError(400, "startDate must be before or equal to endDate");
  }
  return { startDate: normalizedStart, endDate: normalizedEnd };
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const deriveRecurrenceType = (value: unknown): "none" | "monthly" =>
  value === "monthly" ? "monthly" : "none";

const toEmployeeSummary = (employee: Employee | undefined, fallbackId: string): EmployeeSummary => {
  const parts = [employee?.firstName, employee?.lastName].filter(
    (part): part is string => Boolean(part && part.trim().length > 0),
  );
  const fullName = parts.length > 0 ? parts.join(" ") : null;
  const employeeCode = employee?.employeeCode?.trim() ?? fallbackId;
  const firstName = employee?.firstName?.trim() ?? employeeCode;
  const position = employee?.position?.trim() ?? "Employee";

  return {
    id: employee?.id ?? fallbackId,
    employeeCode,
    firstName,
    lastName: employee?.lastName ?? null,
    position,
    departmentId: employee?.departmentId ?? null,
    fullName,
  };
};

const toIsoStringOrNull = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
};

const formatAllowance = (event: EventWithEmployee): AllowanceView => {
  const recurrenceType = deriveRecurrenceType(event.recurrenceType);
  return {
    id: event.id,
    employeeId: event.employeeId,
    employee: toEmployeeSummary(event.employee ?? undefined, event.employeeId),
    title: event.title ?? "",
    description: event.description ?? null,
    amount: toNumber(event.amount),
    eventDate: event.eventDate,
    recurrenceType,
    recurrenceEndDate: event.recurrenceEndDate ?? null,
    status: event.status ?? "active",
    affectsPayroll: Boolean(event.affectsPayroll ?? true),
    isRecurring: recurrenceType === "monthly",
    createdAt: toIsoStringOrNull((event as { createdAt?: unknown }).createdAt),
  };
};

allowancesRouter.get(
  "/",
  requirePermission("payroll:view"),
  async (req, res, next) => {
    try {
      const query = allowanceListQuerySchema.parse(req.query);
      const { startDate, endDate } = resolveDateRange(query.startDate, query.endDate);

      const events = await storage.getEmployeeEvents(startDate, endDate, {
        employeeId: query.employeeId,
        eventType: "allowance",
      });

      const filtered = events.filter((event) => {
        if (query.recurrenceType && deriveRecurrenceType(event.recurrenceType) !== query.recurrenceType) {
          return false;
        }
        if (query.status && (event.status ?? "active") !== query.status) {
          return false;
        }
        return true;
      });

      res.json(filtered.map(formatAllowance));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid query parameters", error.errors));
      }
      if (error instanceof HttpError) {
        return next(error);
      }
      next(new HttpError(500, "Failed to fetch allowances", error));
    }
  },
);

allowancesRouter.post(
  "/",
  requirePermission("payroll:manage"),
  async (req, res, next) => {
    try {
      const payload = allowanceCreateSchema.parse(req.body);
      const normalizedDescription = payload.description?.trim() ?? undefined;
      const eventDate =
        payload.eventDate ??
        new Date().toISOString().split("T")[0];

      if (payload.recurrenceType === "monthly" && payload.recurrenceEndDate) {
        const start = parseIsoDate(eventDate);
        const end = parseIsoDate(payload.recurrenceEndDate);
        if (end < start) {
          throw new HttpError(400, "recurrenceEndDate must be on or after eventDate");
        }
      }

      const insertPayload: InsertEmployeeEvent = {
        employeeId: payload.employeeId,
        eventType: "allowance",
        title: payload.title,
        description: normalizedDescription && normalizedDescription.length > 0 ? normalizedDescription : payload.title,
        amount: payload.amount.toString(),
        eventDate,
        affectsPayroll: payload.affectsPayroll ?? true,
        status: payload.status ?? "active",
        recurrenceType: payload.recurrenceType ?? "none",
        recurrenceEndDate:
          payload.recurrenceType === "monthly"
            ? payload.recurrenceEndDate ?? null
            : null,
      };

      const created = await storage.createEmployeeEvent(insertPayload);
      const employee = await storage.getEmployee(created.employeeId);
      res.status(201).json(formatAllowance({ ...created, employee }));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid allowance payload", error.errors));
      }
      if (error instanceof HttpError) {
        return next(error);
      }
      next(new HttpError(500, "Failed to create allowance", error));
    }
  },
);

allowancesRouter.put(
  "/:id",
  requirePermission("payroll:manage"),
  async (req, res, next) => {
    try {
      const allowanceId = req.params.id?.trim();
      if (!allowanceId) {
        return next(new HttpError(400, "Allowance id is required"));
      }

      const existing = await storage.getEmployeeEvent(allowanceId);
      if (!existing) {
        return next(new HttpError(404, "Allowance not found"));
      }
      if (existing.eventType !== "allowance") {
        return next(new HttpError(400, "Event is not an allowance"));
      }

      const payload = allowanceUpdateSchema.parse(req.body);

      const updatePayload: Partial<InsertEmployeeEvent> = {
        eventType: "allowance",
      };

      if (payload.title !== undefined) {
        updatePayload.title = payload.title;
      }
      if (payload.description !== undefined) {
        const normalized = payload.description?.trim() ?? "";
        updatePayload.description =
          normalized.length > 0
            ? normalized
            : payload.title ?? existing.description ?? existing.title;
      }
      if (payload.amount !== undefined) {
        updatePayload.amount = payload.amount.toString();
      }
      if (payload.employeeId !== undefined) {
        updatePayload.employeeId = payload.employeeId;
      }
      if (payload.eventDate !== undefined) {
        updatePayload.eventDate = payload.eventDate;
      }
      if (payload.affectsPayroll !== undefined) {
        updatePayload.affectsPayroll = payload.affectsPayroll;
      }
      if (payload.status !== undefined) {
        updatePayload.status = payload.status;
      }

      const nextEventDate = payload.eventDate ?? existing.eventDate;
      const nextRecurrenceType =
        payload.recurrenceType ?? deriveRecurrenceType(existing.recurrenceType);

      let nextRecurrenceEnd: string | null | undefined = existing.recurrenceEndDate ?? null;
      if (payload.recurrenceType !== undefined) {
        updatePayload.recurrenceType = payload.recurrenceType;
        if (payload.recurrenceType === "monthly") {
          nextRecurrenceEnd =
            payload.recurrenceEndDate === undefined
              ? existing.recurrenceEndDate ?? null
              : payload.recurrenceEndDate;
          updatePayload.recurrenceEndDate = nextRecurrenceEnd;
        } else {
          nextRecurrenceEnd = null;
          updatePayload.recurrenceEndDate = null;
        }
      } else if (payload.recurrenceEndDate !== undefined) {
        nextRecurrenceEnd = payload.recurrenceEndDate;
        updatePayload.recurrenceEndDate = nextRecurrenceEnd;
      }

      if (nextRecurrenceType === "monthly" && nextRecurrenceEnd) {
        const start = parseIsoDate(nextEventDate);
        const end = parseIsoDate(nextRecurrenceEnd);
        if (end < start) {
          throw new HttpError(400, "recurrenceEndDate must be on or after eventDate");
        }
      }

      const updated = await storage.updateEmployeeEvent(allowanceId, updatePayload);
      if (!updated) {
        return next(new HttpError(404, "Allowance not found"));
      }
      const employee = await storage.getEmployee(updated.employeeId);
      res.json(formatAllowance({ ...updated, employee }));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid allowance payload", error.errors));
      }
      if (error instanceof HttpError) {
        return next(error);
      }
      next(new HttpError(500, "Failed to update allowance", error));
    }
  },
);

allowancesRouter.delete(
  "/:id",
  requirePermission("payroll:manage"),
  async (req, res, next) => {
    try {
      const allowanceId = req.params.id?.trim();
      if (!allowanceId) {
        return next(new HttpError(400, "Allowance id is required"));
      }

      const existing = await storage.getEmployeeEvent(allowanceId);
      if (!existing) {
        return next(new HttpError(404, "Allowance not found"));
      }
      if (existing.eventType !== "allowance") {
        return next(new HttpError(400, "Event is not an allowance"));
      }

      await storage.deleteEmployeeEvent(allowanceId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof HttpError) {
        return next(error);
      }
      next(new HttpError(500, "Failed to delete allowance", error));
    }
  },
);
