import { Router } from "express";
import { z } from "zod";
import {
  insertShiftTemplateSchema,
  insertEmployeeScheduleSchema,
} from "@shared/schema";
import { requireRole } from "./auth";
import { HttpError } from "../errorHandler";
import {
  storage,
  DEFAULT_OVERTIME_LIMIT_MINUTES,
  type EmployeeScheduleDetail,
} from "../storage";

const MANAGER_ROLES = ["admin", "hr", "manager"];

const scheduleAssignmentSchema = insertEmployeeScheduleSchema
  .extend({
    scheduleDate: z.string().min(1),
    customStartTime: z.string().min(1).or(z.null()).optional(),
    customEndTime: z.string().min(1).or(z.null()).optional(),
    customBreakMinutes: z
      .number({ coerce: true })
      .int()
      .nonnegative()
      .or(z.null())
      .optional(),
    shiftTemplateId: z.string().min(1).or(z.null()).optional(),
    overtimeMinutes: z.number({ coerce: true }).int().nonnegative().optional(),
    lateApprovalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
    absenceApprovalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
    overtimeApprovalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
    notes: z.string().optional().nullable(),
  })
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  });

const scheduleUpdateSchema = scheduleAssignmentSchema.partial();

const createSchedulesSchema = z.object({
  assignments: z.array(scheduleAssignmentSchema).min(1),
});

const approvalSchema = z.object({
  type: z.enum(["late", "absence", "overtime"]),
  status: z.enum(["approved", "rejected"]),
  notes: z.string().optional(),
  minutes: z.number({ coerce: true }).int().nonnegative().optional(),
});

const serializeSchedule = (schedule: EmployeeScheduleDetail) => {
  const pending: Array<"late" | "absence" | "overtime"> = [];
  if (
    schedule.expectedMinutes > 0 &&
    schedule.actualMinutes === 0 &&
    (schedule.absenceApprovalStatus ?? "pending") === "pending"
  ) {
    pending.push("absence");
  }
  if (
    schedule.varianceMinutes < -30 &&
    (schedule.lateApprovalStatus ?? "pending") === "pending"
  ) {
    pending.push("late");
  }
  if (
    schedule.varianceMinutes > 0 &&
    (schedule.overtimeApprovalStatus ?? "pending") === "pending"
  ) {
    pending.push("overtime");
  }

  return {
    id: schedule.id,
    employeeId: schedule.employeeId,
    employee: schedule.employee
      ? {
          id: schedule.employee.id,
          firstName: schedule.employee.firstName,
          lastName: schedule.employee.lastName,
          code: schedule.employee.employeeCode,
        }
      : null,
    scheduleDate: schedule.scheduleDate,
    shiftTemplateId: schedule.shiftTemplateId,
    shiftTemplate: schedule.shiftTemplate
      ? {
          id: schedule.shiftTemplate.id,
          name: schedule.shiftTemplate.name,
          startTime: schedule.shiftTemplate.startTime,
          endTime: schedule.shiftTemplate.endTime,
          breakMinutes: schedule.shiftTemplate.breakMinutes,
          expectedMinutes: schedule.shiftTemplate.expectedMinutes,
          overtimeLimitMinutes:
            schedule.shiftTemplate.overtimeLimitMinutes ?? DEFAULT_OVERTIME_LIMIT_MINUTES,
        }
      : null,
    customStartTime: schedule.customStartTime,
    customEndTime: schedule.customEndTime,
    customBreakMinutes: schedule.customBreakMinutes,
    expectedMinutes: schedule.expectedMinutes,
    overtimeMinutes: schedule.overtimeMinutes,
    lateApprovalStatus: schedule.lateApprovalStatus,
    absenceApprovalStatus: schedule.absenceApprovalStatus,
    overtimeApprovalStatus: schedule.overtimeApprovalStatus,
    notes: schedule.notes,
    actualMinutes: schedule.actualMinutes,
    varianceMinutes: schedule.varianceMinutes,
    attendanceRecords: schedule.attendanceRecords.map(record => ({
      id: record.id,
      checkIn: record.checkIn,
      checkOut: record.checkOut,
      hours: record.hours,
      source: record.source,
    })),
    pendingExceptions: pending,
  };
};

export const attendanceRouter = Router();

attendanceRouter.get("/templates", async (_req, res, next) => {
  try {
    const templates = await storage.getShiftTemplates();
    res.json(templates);
  } catch (error) {
    next(new HttpError(500, "Failed to load shift templates", error));
  }
});

attendanceRouter.post(
  "/templates",
  requireRole(MANAGER_ROLES),
  async (req, res, next) => {
    try {
      const template = insertShiftTemplateSchema.parse(req.body);
      const created = await storage.createShiftTemplate(template);
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid template data", error.errors));
      }
      next(new HttpError(500, "Failed to create shift template", error));
    }
  },
);

attendanceRouter.put(
  "/templates/:id",
  requireRole(MANAGER_ROLES),
  async (req, res, next) => {
    try {
      const updates = insertShiftTemplateSchema.partial().parse(req.body);
      const updated = await storage.updateShiftTemplate(req.params.id, updates);
      if (!updated) {
        return next(new HttpError(404, "Shift template not found"));
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid template data", error.errors));
      }
      next(new HttpError(500, "Failed to update shift template", error));
    }
  },
);

attendanceRouter.delete(
  "/templates/:id",
  requireRole(MANAGER_ROLES),
  async (req, res, next) => {
    try {
      const deleted = await storage.deleteShiftTemplate(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Shift template not found"));
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete shift template", error));
    }
  },
);

attendanceRouter.get("/schedules", async (req, res, next) => {
  try {
    const { start, end, employeeId } = req.query as Record<string, string | undefined>;
    const filters: { start?: Date; end?: Date; employeeId?: string } = {};
    if (start) {
      const startDate = new Date(start);
      if (Number.isNaN(startDate.getTime())) {
        return next(new HttpError(400, "Invalid start date"));
      }
      filters.start = startDate;
    }
    if (end) {
      const endDate = new Date(end);
      if (Number.isNaN(endDate.getTime())) {
        return next(new HttpError(400, "Invalid end date"));
      }
      filters.end = endDate;
    }
    if (employeeId) {
      filters.employeeId = employeeId;
    }
    const schedules = await storage.getEmployeeSchedules(filters);
    res.json(schedules.map(serializeSchedule));
  } catch (error) {
    next(new HttpError(500, "Failed to load schedules", error));
  }
});

attendanceRouter.post(
  "/schedules",
  requireRole(MANAGER_ROLES),
  async (req, res, next) => {
    try {
      const payload = createSchedulesSchema.parse(req.body);
      const created = await storage.createEmployeeSchedules(payload.assignments);
      res.status(201).json(created.map(serializeSchedule));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid schedule data", error.errors));
      }
      next(new HttpError(500, "Failed to create schedules", error));
    }
  },
);

attendanceRouter.put(
  "/schedules/:id",
  requireRole(MANAGER_ROLES),
  async (req, res, next) => {
    try {
      const updates = scheduleUpdateSchema.parse(req.body);
      if (Object.keys(updates).length === 0) {
        const current = await storage.getEmployeeSchedule(req.params.id);
        if (!current) {
          return next(new HttpError(404, "Schedule not found"));
        }
        return res.json(serializeSchedule(current));
      }
      const updated = await storage.updateEmployeeSchedule(req.params.id, updates);
      if (!updated) {
        return next(new HttpError(404, "Schedule not found"));
      }
      res.json(serializeSchedule(updated));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid schedule data", error.errors));
      }
      next(new HttpError(500, "Failed to update schedule", error));
    }
  },
);

attendanceRouter.delete(
  "/schedules/:id",
  requireRole(MANAGER_ROLES),
  async (req, res, next) => {
    try {
      const deleted = await storage.deleteEmployeeSchedule(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Schedule not found"));
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete schedule", error));
    }
  },
);

attendanceRouter.post(
  "/schedules/:id/approvals",
  requireRole(MANAGER_ROLES),
  async (req, res, next) => {
    try {
      const { type, status, notes, minutes } = approvalSchema.parse(req.body);
      const updates: Partial<z.infer<typeof scheduleAssignmentSchema>> = {};
      if (type === "late") {
        updates.lateApprovalStatus = status;
      } else if (type === "absence") {
        updates.absenceApprovalStatus = status;
      } else {
        updates.overtimeApprovalStatus = status;
        if (status === "approved" && minutes !== undefined) {
          updates.overtimeMinutes = minutes;
        }
        if (status === "rejected") {
          updates.overtimeMinutes = 0;
        }
      }
      if (notes !== undefined) {
        updates.notes = notes;
      }
      const updated = await storage.updateEmployeeSchedule(req.params.id, updates);
      if (!updated) {
        return next(new HttpError(404, "Schedule not found"));
      }
      res.json(serializeSchedule(updated));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid approval payload", error.errors));
      }
      next(new HttpError(500, "Failed to update approval status", error));
    }
  },
);

