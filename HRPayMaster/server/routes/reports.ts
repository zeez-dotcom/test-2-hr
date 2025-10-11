import { Router } from "express";
import { HttpError } from "../errorHandler";
import { storage } from "../storage";
import { z } from "zod";
import type {
  InsertReportSchedule,
  NotificationChannel,
  ReportSchedule,
} from "@shared/schema";
import { requirePermission } from "./auth";

export const reportsRouter = Router();

const defaultStartDate = () =>
  new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
const defaultEndDate = () => new Date().toISOString().split("T")[0];

const reportQueryBaseSchema = z.object({
  startDate: z
    .string()
    .optional()
    .default(defaultStartDate)
    .refine((d) => !isNaN(Date.parse(d)), { message: "Invalid startDate" }),
  endDate: z
    .string()
    .optional()
    .default(defaultEndDate)
    .refine((d) => !isNaN(Date.parse(d)), { message: "Invalid endDate" }),
  groupBy: z.enum(["month", "year"]).optional().default("month"),
});

const withDateRangeGuard = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((value, ctx) => {
    const { startDate, endDate } = value as { startDate: string; endDate: string };
    if (new Date(startDate) > new Date(endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startDate must be before or equal to endDate",
        path: ["endDate"],
      });
    }
  });

const reportQuerySchema = withDateRangeGuard(reportQueryBaseSchema);

const departmentIdsSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    const list = Array.isArray(value)
      ? value
      : value
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
    return list.length ? list : undefined;
  });

const analyticsQuerySchema = withDateRangeGuard(
  reportQueryBaseSchema.extend({
    departmentIds: departmentIdsSchema,
  }),
);

const deliveryChannelEnum = z.enum(["email", "sms", "chat", "push"]);

const reportScheduleDeliverySchema = z
  .object({
    channels: z.array(deliveryChannelEnum).optional().default([]),
    emails: z.array(z.string().email()).optional().default([]),
    employeeIds: z.array(z.string()).optional().default([]),
  })
  .optional()
  .default({ channels: [], emails: [], employeeIds: [] });

const supportedReportTypes = [
  "department-costs",
  "department-overtime",
  "loan-exposure",
  "attendance-forecast",
] as const;

const reportScheduleBaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  reportType: z.enum(supportedReportTypes),
  filters: z.record(z.unknown()).optional().default({}),
  groupings: z.array(z.string()).optional().default([]),
  cadence: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional().default("monthly"),
  runTime: z
    .string()
    .regex(/^(\d{1,2}):(\d{2})$/, "runTime must be in HH:MM format")
    .optional(),
  timezone: z.string().optional().default("UTC"),
  exportFormat: z.enum(["json", "csv", "xlsx"]).optional().default("json"),
  delivery: reportScheduleDeliverySchema,
  status: z.enum(["active", "paused", "disabled"]).optional(),
});

const reportScheduleCreateSchema = reportScheduleBaseSchema;

const reportScheduleUpdateSchema = reportScheduleBaseSchema
  .partial()
  .extend({
    delivery: reportScheduleDeliverySchema.optional(),
  });

const toScheduleResponse = (schedule: ReportSchedule) => {
  const { deliveryChannels, recipients, notifyEmployeeIds, ...rest } = schedule as any;
  return {
    ...rest,
    filters: (schedule.filters as Record<string, unknown>) ?? {},
    groupings: schedule.groupings ?? [],
    delivery: {
      channels: deliveryChannels ?? [],
      emails: recipients ?? [],
      employeeIds: notifyEmployeeIds ?? [],
    },
  };
};

type ReportScheduleCreateInput = z.infer<typeof reportScheduleCreateSchema>;
type ReportScheduleUpdateInput = z.infer<typeof reportScheduleUpdateSchema>;

const normalizeDelivery = (delivery?: {
  channels?: NotificationChannel[];
  emails?: string[];
  employeeIds?: string[];
}) => ({
  channels: delivery?.channels ?? [],
  emails: delivery?.emails ?? [],
  employeeIds: delivery?.employeeIds ?? [],
});

const resolveCreateSchedulePayload = (
  input: ReportScheduleCreateInput,
): InsertReportSchedule => {
  const { delivery, ...rest } = input;
  const normalizedDelivery = normalizeDelivery(delivery);
  return {
    ...rest,
    filters: rest.filters ?? {},
    groupings: rest.groupings ?? [],
    deliveryChannels: normalizedDelivery.channels,
    recipients: normalizedDelivery.emails,
    notifyEmployeeIds: normalizedDelivery.employeeIds,
  } satisfies InsertReportSchedule;
};

const resolveUpdateSchedulePayload = (
  input: ReportScheduleUpdateInput,
): Partial<InsertReportSchedule> => {
  const { delivery, ...rest } = input;
  const payload: Partial<InsertReportSchedule> = { ...rest };
  if (delivery) {
    const normalizedDelivery = normalizeDelivery(delivery);
    payload.deliveryChannels = normalizedDelivery.channels;
    payload.recipients = normalizedDelivery.emails;
    payload.notifyEmployeeIds = normalizedDelivery.employeeIds;
  }
  if (Object.prototype.hasOwnProperty.call(input, "filters")) {
    payload.filters = rest.filters ?? {};
  }
  if (Object.prototype.hasOwnProperty.call(input, "groupings")) {
    payload.groupings = rest.groupings ?? [];
  }
  return payload;
};

// Employee and company report routes

// Employee report route
reportsRouter.get(
  "/api/reports/employees/:id",
  requirePermission("reports:view"),
  async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy } = reportQuerySchema.parse(req.query);
    const report = await storage.getEmployeeReport(req.params.id, {
      startDate,
      endDate,
      groupBy,
    });

    const response = report.map((period) => {
      const bonuses =
        period.payrollEntries.reduce(
          (sum, e) => sum + Number(e.bonusAmount || 0),
          0
        ) +
        period.employeeEvents
          .filter((e) => e.eventType === "bonus")
          .reduce((s, e) => s + Number(e.amount || 0), 0);

      const deductions =
        period.payrollEntries.reduce(
          (sum, e) =>
            sum +
            Number(e.taxDeduction || 0) +
            Number(e.socialSecurityDeduction || 0) +
            Number(e.healthInsuranceDeduction || 0) +
            Number(e.loanDeduction || 0) +
            Number(e.otherDeductions || 0),
          0
        ) +
        period.employeeEvents
          .filter((e) => e.eventType === "deduction" || e.eventType === "penalty")
          .reduce((s, e) => s + Number(e.amount || 0), 0) +
        period.loans.reduce((s, l) => s + Number(l.monthlyDeduction || 0), 0);

      const netPay = period.payrollEntries.reduce(
        (sum, e) => sum + Number(e.netPay || 0),
        0
      );

      return {
        period: period.period,
        totals: {
          bonuses,
          deductions,
          netPay,
        },
        payrollEntries: period.payrollEntries,
        employeeEvents: period.employeeEvents,
        loans: period.loans,
        vacationRequests: period.vacationRequests,
      };
    });

    res.json(response);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    next(new HttpError(500, "Failed to fetch employee report", error));
  }
  },
);

// Company-level report routes

// Payroll summary
reportsRouter.get(
  "/api/reports/payroll",
  requirePermission("reports:finance"),
  async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy } = reportQuerySchema.parse(req.query);
    const report = await storage.getCompanyPayrollSummary({
      startDate,
      endDate,
      groupBy,
    });

    const response = report.map((period) => ({
      period: period.period,
      totals: {
        grossPay: period.payrollEntries.reduce(
          (sum, e) => sum + Number(e.grossPay || 0),
          0
        ),
        netPay: period.payrollEntries.reduce(
          (sum, e) => sum + Number(e.netPay || 0),
          0
        ),
      },
    }));

    res.json(response);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    next(new HttpError(500, "Failed to fetch payroll summary", error));
  }
  },
);

// Loan balances / loan repayment details
reportsRouter.get(
  "/api/reports/loan-balances",
  requirePermission("reports:finance"),
  async (req, res, next) => {
  try {
    const { startDate, endDate } = reportQuerySchema.parse(req.query);
    const report = await storage.getLoanReportDetails({ startDate, endDate });
    res.json(report);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    next(new HttpError(500, "Failed to fetch loan balances", error));
  }
  },
);

// Asset usage
reportsRouter.get(
  "/api/reports/asset-usage",
  requirePermission("reports:view"),
  async (req, res, next) => {
  try {
    const { startDate, endDate } = reportQuerySchema.parse(req.query);
    const report = await storage.getAssetUsageDetails({ startDate, endDate });
    res.json(report);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    next(new HttpError(500, "Failed to fetch asset usage", error));
  }
  },
);

// Fleet usage
reportsRouter.get(
  "/api/reports/fleet-usage",
  requirePermission("reports:view"),
  async (req, res, next) => {
  try {
    const rawStartDate =
      typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const rawEndDate =
      typeof req.query.endDate === "string" ? req.query.endDate : undefined;

    const trimmedStartDate = rawStartDate?.trim();
    const trimmedEndDate = rawEndDate?.trim();

    const { startDate, endDate } = reportQuerySchema.parse({
      ...req.query,
      startDate: trimmedStartDate ? trimmedStartDate : undefined,
      endDate: trimmedEndDate ? trimmedEndDate : undefined,
    });

    const report = await storage.getFleetUsage({
      startDate: trimmedStartDate ? startDate : undefined,
      endDate: trimmedEndDate ? endDate : undefined,
    });
    res.json(report);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    next(new HttpError(500, "Failed to fetch fleet usage", error));
  }
  },
);

// Payroll by department
reportsRouter.get(
  "/api/reports/payroll-by-department",
  requirePermission("reports:finance"),
  async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy } = reportQuerySchema.parse(req.query);
    const rows = await storage.getCompanyPayrollByDepartment({ startDate, endDate, groupBy });
    const response = rows.map(r => ({
      period: r.period,
      departmentId: r.departmentId,
      departmentName: r.departmentName || "Unassigned",
      totals: {
        grossPay: r.grossPay,
        netPay: r.netPay,
      },
    }));
    res.json(response);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    next(new HttpError(500, "Failed to fetch payroll by department", error));
  }
  },
);

reportsRouter.get(
  "/api/reports/department-costs",
  requirePermission("reports:finance"),
  async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy, departmentIds } = analyticsQuerySchema.parse(req.query);
    const data = await storage.getDepartmentCostAnalytics({ startDate, endDate, groupBy, departmentIds });
    res.json(data);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    next(new HttpError(500, "Failed to compute department cost analytics", error));
  }
  },
);

reportsRouter.get(
  "/api/reports/department-overtime",
  requirePermission("reports:view"),
  async (req, res, next) => {
  try {
    const { startDate, endDate, departmentIds } = analyticsQuerySchema.parse(req.query);
    const data = await storage.getDepartmentOvertimeMetrics({ startDate, endDate, departmentIds });
    res.json(data);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    next(new HttpError(500, "Failed to compute overtime metrics", error));
  }
  },
);

reportsRouter.get(
  "/api/reports/loan-exposure",
  requirePermission("reports:finance"),
  async (req, res, next) => {
  try {
    const { startDate, endDate, departmentIds } = analyticsQuerySchema.parse(req.query);
    const data = await storage.getDepartmentLoanExposure({ startDate, endDate, departmentIds });
    res.json(data);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    next(new HttpError(500, "Failed to compute loan exposure", error));
  }
  },
);

reportsRouter.get(
  "/api/reports/attendance-forecast",
  requirePermission("reports:view"),
  async (req, res, next) => {
  try {
    const { startDate, endDate, departmentIds } = analyticsQuerySchema.parse(req.query);
    const data = await storage.getAttendanceForecast({ startDate, endDate, departmentIds });
    res.json(data);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    next(new HttpError(500, "Failed to compute attendance forecast", error));
  }
  },
);

reportsRouter.get(
  "/api/reports/schedules",
  requirePermission("reports:finance"),
  async (_req, res, next) => {
  try {
    const schedules = await storage.getReportSchedules();
    res.json(schedules.map(toScheduleResponse));
  } catch (error) {
    console.error(error);
    next(new HttpError(500, "Failed to load report schedules", error));
  }
  },
);

reportsRouter.post(
  "/api/reports/schedules",
  requirePermission("reports:finance"),
  async (req, res, next) => {
  try {
    const parsed = reportScheduleCreateSchema.parse(req.body);
    const payload = resolveCreateSchedulePayload(parsed);
    const created = await storage.createReportSchedule(payload);
    res.status(201).json(toScheduleResponse(created));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid schedule payload", error.errors));
    }
    next(new HttpError(500, "Failed to create report schedule", error));
  }
  },
);

reportsRouter.get(
  "/api/reports/schedules/:id",
  requirePermission("reports:finance"),
  async (req, res, next) => {
  try {
    const schedule = await storage.getReportSchedule(req.params.id);
    if (!schedule) {
      return next(new HttpError(404, "Report schedule not found"));
    }
    res.json(toScheduleResponse(schedule));
  } catch (error) {
    console.error(error);
    next(new HttpError(500, "Failed to load report schedule", error));
  }
  },
);

reportsRouter.put(
  "/api/reports/schedules/:id",
  requirePermission("reports:finance"),
  async (req, res, next) => {
  try {
    const parsed = reportScheduleUpdateSchema.parse(req.body);
    const payload = resolveUpdateSchedulePayload(parsed);
    const updated = await storage.updateReportSchedule(req.params.id, payload);
    if (!updated) {
      return next(new HttpError(404, "Report schedule not found"));
    }
    res.json(toScheduleResponse(updated));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid schedule payload", error.errors));
    }
    next(new HttpError(500, "Failed to update report schedule", error));
  }
  },
);

reportsRouter.post(
  "/api/reports/schedules/:id/run",
  requirePermission("reports:finance"),
  async (req, res, next) => {
  try {
    const updated = await storage.updateReportSchedule(req.params.id, {
      nextRunAt: new Date(),
      lastRunStatus: "queued",
      lastRunSummary: null,
    });
    if (!updated) {
      return next(new HttpError(404, "Report schedule not found"));
    }
    res.json(toScheduleResponse(updated));
  } catch (error) {
    console.error(error);
    next(new HttpError(500, "Failed to queue report schedule", error));
  }
  },
);

// allow both named and default imports of this router
export default reportsRouter;

