import { Router } from "express";
import { HttpError } from "../errorHandler";
import { storage } from "../storage";
import { z } from "zod";
import type {
  AllowanceReportResponse,
  Employee,
  EmployeeEvent,
  InsertReportSchedule,
  NotificationChannel,
  ReportSchedule,
} from "@shared/schema";
import { normalizeAllowanceTitle } from "../utils/payroll";
import { requirePermission } from "./auth";

export const reportsRouter = Router();

const defaultStartDate = () => {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), 0, 1)).toISOString().split("T")[0];
};
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

const toUtcDate = (isoDate: string) => {
  const [yearStr, monthStr, dayStr] = isoDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  return new Date(Date.UTC(year, month - 1, day));
};

const allowanceAmount = (value: unknown): number => {
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

const buildEmployeeName = (employee?: Employee | null): string | null => {
  if (!employee) return null;
  const parts = [employee.firstName, employee.lastName].filter(
    (part): part is string => Boolean(part && part.trim().length > 0),
  );
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return employee.firstName ?? employee.lastName ?? null;
};

type AllowanceEventWithEmployee = EmployeeEvent & { employee: Employee };

const buildAllowanceReport = (
  events: AllowanceEventWithEmployee[],
  groupBy: "month" | "year",
): AllowanceReportResponse => {
  const totals: AllowanceReportResponse["totals"] = {
    totalAmount: 0,
    recurringAmount: 0,
    oneTimeAmount: 0,
    allowanceCount: 0,
    employeeCount: 0,
  };

  const periodMap = new Map<
    string,
    {
      totalAmount: number;
      recurringAmount: number;
      oneTimeAmount: number;
      allowanceCount: number;
    }
  >();
  const employeeMap = new Map<
    string,
    {
      employeeId: string;
      employeeName: string | null;
      employeeCode: string | null;
      totalAmount: number;
      allowanceCount: number;
    }
  >();
  const typeMap = new Map<
    string,
    {
      title: string;
      totalAmount: number;
      allowanceCount: number;
      recurringCount: number;
      oneTimeCount: number;
    }
  >();
  const uniqueEmployees = new Set<string>();

  for (const event of events) {
    const amount = allowanceAmount(event.amount);
    const recurrenceType = event.recurrenceType === "monthly" ? "monthly" : "none";
    totals.totalAmount += amount;
    totals.allowanceCount += 1;
    if (recurrenceType === "monthly") {
      totals.recurringAmount += amount;
    } else {
      totals.oneTimeAmount += amount;
    }
    uniqueEmployees.add(event.employeeId);

    const periodKey =
      groupBy === "year" ? event.eventDate.slice(0, 4) : event.eventDate.slice(0, 7);
    const periodEntry =
      periodMap.get(periodKey) ??
      {
        totalAmount: 0,
        recurringAmount: 0,
        oneTimeAmount: 0,
        allowanceCount: 0,
      };
    periodEntry.totalAmount += amount;
    periodEntry.allowanceCount += 1;
    if (recurrenceType === "monthly") {
      periodEntry.recurringAmount += amount;
    } else {
      periodEntry.oneTimeAmount += amount;
    }
    periodMap.set(periodKey, periodEntry);

    const employeeEntry =
      employeeMap.get(event.employeeId) ??
      {
        employeeId: event.employeeId,
        employeeName: buildEmployeeName(event.employee),
        employeeCode: event.employee?.employeeCode ?? null,
        totalAmount: 0,
        allowanceCount: 0,
      };
    employeeEntry.totalAmount += amount;
    employeeEntry.allowanceCount += 1;
    employeeMap.set(event.employeeId, employeeEntry);

    const normalizedTitle = normalizeAllowanceTitle(event.title);
    const typeEntry =
      typeMap.get(normalizedTitle) ??
      {
        title: event.title ?? "Allowance",
        totalAmount: 0,
        allowanceCount: 0,
        recurringCount: 0,
        oneTimeCount: 0,
      };
    typeEntry.totalAmount += amount;
    typeEntry.allowanceCount += 1;
    if (recurrenceType === "monthly") {
      typeEntry.recurringCount += 1;
    } else {
      typeEntry.oneTimeCount += 1;
    }
    if (!typeEntry.title && event.title) {
      typeEntry.title = event.title;
    }
    typeMap.set(normalizedTitle, typeEntry);
  }

  totals.employeeCount = uniqueEmployees.size;

  const periods = Array.from(periodMap.entries())
    .sort(([a], [b]) => (a > b ? 1 : a < b ? -1 : 0))
    .map(([period, data]) => ({
      period,
      ...data,
    }));

  const topEmployees = Array.from(employeeMap.values()).sort((a, b) => {
    if (b.totalAmount !== a.totalAmount) {
      return b.totalAmount - a.totalAmount;
    }
    const aName = a.employeeName ?? "";
    const bName = b.employeeName ?? "";
    return aName.localeCompare(bName);
  });

  const allowanceTypes = Array.from(typeMap.values()).sort((a, b) => {
    if (b.totalAmount !== a.totalAmount) {
      return b.totalAmount - a.totalAmount;
    }
    return a.title.localeCompare(b.title);
  });

  return {
    totals,
    periods,
    topEmployees,
    allowanceTypes,
  };
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

    const response = report.map((period) => {
      const grossPay = period.payrollEntries.reduce(
        (sum, entry) => sum + Number(entry.grossPay || 0),
        0,
      );

      const netPay = period.payrollEntries.reduce(
        (sum, entry) => sum + Number(entry.netPay || 0),
        0,
      );

      const allowances = period.payrollEntries.reduce((sum, entry) => {
        const rawAllowances =
          entry.allowances && typeof entry.allowances === "object"
            ? (entry.allowances as Record<string, unknown>)
            : {};

        const allowanceTotal = Object.values(rawAllowances).reduce<number>((allowanceSum, value) => {
          if (typeof value === "number") {
            return Number.isFinite(value) ? allowanceSum + value : allowanceSum;
          }

          if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) {
              return allowanceSum;
            }

            const numericValue = Number(trimmed);
            return Number.isFinite(numericValue) ? allowanceSum + numericValue : allowanceSum;
          }

          return allowanceSum;
        }, 0);

        return sum + allowanceTotal;
      }, 0);

      const bonuses = period.payrollEntries.reduce((sum, entry) => {
        const rawBonus = (entry as any).bonusAmount;
        if (typeof rawBonus === "number") {
          return Number.isFinite(rawBonus) ? sum + rawBonus : sum;
        }

        if (typeof rawBonus === "string") {
          const trimmed = rawBonus.trim();
          if (!trimmed) {
            return sum;
          }

          const numericBonus = Number(trimmed);
          return Number.isFinite(numericBonus) ? sum + numericBonus : sum;
        }

        return sum;
      }, 0);

      return {
        period: period.period,
        totals: {
          grossPay,
          netPay,
          allowances,
          bonuses,
        },
      };
    });

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

reportsRouter.get(
  "/api/reports/allowances",
  requirePermission("reports:finance"),
  async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy } = reportQuerySchema.parse(req.query);
    const events = await storage.getEmployeeEvents(
      toUtcDate(startDate),
      toUtcDate(endDate),
      { eventType: "allowance" },
    );
    const report = buildAllowanceReport(events as AllowanceEventWithEmployee[], groupBy);
    res.json(report);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid query parameters", error.errors));
    }
    if (error instanceof HttpError) {
      return next(error);
    }
    next(new HttpError(500, "Failed to fetch allowance summary", error));
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

