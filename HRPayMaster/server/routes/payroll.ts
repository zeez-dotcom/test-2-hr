import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import { HttpError } from "../errorHandler";
import { LoanPaymentUndoError, storage, type EmployeeScheduleSummary } from "../storage";
import {
  insertPayrollRunSchema,
  insertPayrollEntrySchema,
  payrollRuns,
  payrollEntries as payrollEntriesTable,
  loans as loansTable,
  loanPayments as loanPaymentsTable,
} from "@shared/schema";
import type {
  Company,
  EmployeeWithDepartment,
  LoanWithEmployee,
  VacationRequestWithEmployee,
  VacationRequest,
  EmployeeEvent as EmployeeEventRecord,
  PayrollCalendarConfig,
  PayrollFrequencyConfig,
  PayrollExportFormatConfig,
  PayrollScenarioToggle,
  SessionUser,
} from "@shared/schema";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { requirePermission } from "./auth";
import {
  calculateEmployeePayroll,
  calculateTotals,
  type PayrollCalculationOverrides,
} from "../utils/payroll";
import { shouldPauseLoanForLeave } from "../utils/loans";
import { buildPayrollExports, type PayrollExportRequest } from "../utils/payrollExports";
import {
  createRouteMetricsMiddleware,
  payrollPreviewRequestsTotal,
  payrollPreviewDurationSeconds,
  payrollGenerateRequestsTotal,
  payrollGenerateDurationSeconds,
} from "../metrics";

export const payrollRouter = Router();

const trackPayrollPreviewMetrics = createRouteMetricsMiddleware({
  counter: payrollPreviewRequestsTotal,
  histogram: payrollPreviewDurationSeconds,
  resolveLabels: req => ({ method: req.method }),
});

const trackPayrollGenerateMetrics = createRouteMetricsMiddleware({
  counter: payrollGenerateRequestsTotal,
  histogram: payrollGenerateDurationSeconds,
  resolveLabels: req => ({ method: req.method }),
});

const deductionsSchema = z.object({
  taxDeduction: z.number().optional(),
  socialSecurityDeduction: z.number().optional(),
  healthInsuranceDeduction: z.number().optional(),
});

const payrollVacationOverrideSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  leaveType: z.enum(["annual", "sick", "emergency", "unpaid"]),
  deductFromSalary: z.boolean().optional(),
  reason: z.string().min(1).optional(),
});

const logPayrollAudit = async (
  req: Request,
  summary: string,
  entity: { type: string; id?: string | null },
  metadata?: Record<string, unknown>,
) => {
  const actorId = (req.user as SessionUser | undefined)?.id;
  if (!actorId) return;
  try {
    await storage.logSecurityEvent({
      actorId,
      eventType: "payroll_change",
      entityType: entity.type,
      entityId: entity.id ?? null,
      summary,
      metadata: metadata ?? null,
    });
  } catch (error) {
    console.error("Failed to log payroll audit event", error);
  }
};

const overridesSchema = z.object({
  skippedVacationIds: z.array(z.string().min(1)).optional(),
  skippedLoanIds: z.array(z.string().min(1)).optional(),
  skippedEventIds: z.array(z.string().min(1)).optional(),
});

const scenarioToggleDefaults: Record<string, boolean> = {
  attendance: true,
  loans: true,
  bonuses: true,
  allowances: true,
  statutory: true,
  overtime: true,
};

const DEFAULT_COMPANY_CURRENCY = "KWD";
const DEFAULT_COMPANY_LOCALE = "en-KW";

const formatCompanyCurrency = (amount: number, company?: Company | null) => {
  const currency = company?.currencyCode?.trim() || DEFAULT_COMPANY_CURRENCY;
  const locale = company?.locale?.trim() || DEFAULT_COMPANY_LOCALE;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
};

const scenarioToggleSchema = z
  .object({
    attendance: z.boolean().optional(),
    loans: z.boolean().optional(),
    bonuses: z.boolean().optional(),
    allowances: z.boolean().optional(),
    statutory: z.boolean().optional(),
    overtime: z.boolean().optional(),
  })
  .catchall(z.boolean());

const exportFormatRequestSchema = z
  .object({
    formatId: z.string().optional(),
    type: z.enum(["bank", "gl", "statutory"]).optional(),
    format: z.enum(["pdf", "csv", "xlsx"]).optional(),
    filename: z.string().optional(),
  })
  .refine(value => Boolean(value.formatId || value.type), {
    message: "formatId or type is required",
  });

const scenarioVariantSchema = z.object({
  scenarioKey: z.string().min(1),
  label: z.string().optional(),
  scenarioToggles: scenarioToggleSchema.optional(),
});

const previewPayrollSchema = z.object({
  period: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  calendarId: z.string().optional(),
  scenarioKey: z.string().optional(),
  scenarioToggles: scenarioToggleSchema.optional(),
  comparisons: z.array(scenarioVariantSchema).optional(),
  useAttendance: z.boolean().optional(),
  overrides: overridesSchema.optional(),
  deductions: deductionsSchema.optional(),
});

const generatePayrollSchema = z.object({
  period: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  calendarId: z.string().optional(),
  cycleLabel: z.string().optional(),
  scenarioKey: z.string().optional(),
  scenarioToggles: scenarioToggleSchema.optional(),
  status: z.enum(["draft", "completed"]).optional().default("completed"),
  useAttendance: z.boolean().optional(),
  deductions: deductionsSchema.optional(),
  overrides: overridesSchema.optional(),
  exports: z.array(exportFormatRequestSchema).optional(),
});

const BONUS_EVENT_TYPES = new Set(["bonus", "commission", "overtime"]);
const DEDUCTION_EVENT_TYPES = new Set(["deduction", "penalty"]);

type PayrollInputs = {
  employees: EmployeeWithDepartment[];
  loans: LoanWithEmployee[];
  vacationRequests: VacationRequestWithEmployee[];
  employeeEvents: EmployeeEventRecord[];
  attendanceSummary: Record<string, number>;
  scheduleSummary: Record<string, EmployeeScheduleSummary>;
};

const parseAmount = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveTitle = (value: unknown, fallback: string) => {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  return fallback;
};

const calculateVacationDaysInPeriod = (
  vacation: VacationRequestWithEmployee,
  start: Date,
  end: Date,
) => {
  const vacStart = new Date(Math.max(new Date(vacation.startDate).getTime(), start.getTime()));
  const vacEnd = new Date(Math.min(new Date(vacation.endDate).getTime(), end.getTime()));
  return Math.max(0, Math.ceil((vacEnd.getTime() - vacStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
};

const serializeAllowancesForStorage = (
  allowances: Record<string, number> | undefined,
  enabled: boolean,
): Record<string, number> | null => {
  if (!enabled) {
    return null;
  }
  if (!allowances) {
    return {};
  }
  const normalized = Object.entries(allowances).reduce<Record<string, number>>(
    (acc, [key, value]) => {
      if (Number.isFinite(value)) {
        acc[key] = Number(value);
      }
      return acc;
    },
    {},
  );
  return normalized;
};

const getEmployeeDisplayName = (employee: EmployeeWithDepartment) => {
  const englishName = [employee.firstName, employee.lastName]
    .filter(part => typeof part === "string" && part.trim() !== "")
    .join(" ")
    .trim();
  if (englishName) {
    return englishName;
  }
  if (employee.nickname && employee.nickname.trim() !== "") {
    return employee.nickname.trim();
  }
  return employee.employeeCode ?? "Employee";
};

const resolveScenarioToggles = (
  input: Record<string, boolean> | undefined,
  base?: Record<string, boolean>,
) => {
  const toggles: Record<string, boolean> = { ...scenarioToggleDefaults, ...(base ?? {}) };
  if (!input) {
    return toggles;
  }
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "boolean") {
      toggles[key] = value;
    }
  }
  return toggles;
};

const applyScenarioOverrides = (
  toggles: Record<string, boolean>,
  overrides?: PayrollScenarioToggle[],
) => {
  if (!Array.isArray(overrides)) {
    return toggles;
  }
  for (const override of overrides) {
    if (!override || typeof override.key !== "string") {
      continue;
    }
    const enabled = override.enabled ?? true;
    toggles[override.key] = enabled;
  }
  return toggles;
};

const filterEventsByScenario = (
  events: EmployeeEventRecord[],
  toggles: Record<string, boolean>,
) =>
  events.filter(event => {
    if (!toggles.allowances && event.eventType === "allowance") {
      return false;
    }
    if (!toggles.overtime && event.eventType === "overtime") {
      return false;
    }
    if (!toggles.bonuses && event.eventType !== "overtime" && BONUS_EVENT_TYPES.has(event.eventType)) {
      return false;
    }
    return true;
  });

const mapExportRequests = (
  requests: Array<z.infer<typeof exportFormatRequestSchema>> | undefined,
  availableFormats: PayrollExportFormatConfig[],
): PayrollExportRequest[] => {
  if (!requests || requests.length === 0) {
    return [];
  }
  const result: PayrollExportRequest[] = [];
  for (const request of requests) {
    let matched: PayrollExportFormatConfig | undefined;
    if (request.formatId) {
      matched = availableFormats.find(format => format.id === request.formatId);
    }
    if (!matched && request.type) {
      matched = availableFormats.find(format => {
        if (!format.enabled && format.enabled !== undefined) {
          return false;
        }
        if (format.type !== request.type) {
          return false;
        }
        if (request.format) {
          return format.format === request.format;
        }
        return true;
      });
    }

    if (matched && matched.enabled === false) {
      continue;
    }

    if (matched) {
      result.push({
        id: matched.id,
        type: matched.type,
        format: matched.format,
        filename: request.filename,
      });
      continue;
    }

    const fallbackType = (request.type ?? "bank") as PayrollExportFormatConfig["type"];
    const fallbackFormat = (request.format ?? (fallbackType === "bank"
      ? "csv"
      : fallbackType === "gl"
        ? "xlsx"
        : "pdf")) as PayrollExportFormatConfig["format"];
    result.push({
      id: request.formatId,
      type: fallbackType,
      format: fallbackFormat,
      filename: request.filename,
    });
  }
  return result;
};

const resolveCalendarConfiguration = (
  company: Company | undefined,
  calendarId?: string,
): { calendar?: PayrollCalendarConfig; frequency?: PayrollFrequencyConfig } => {
  if (!company) {
    return {};
  }
  const calendars = Array.isArray(company.payrollCalendars)
    ? (company.payrollCalendars as PayrollCalendarConfig[])
    : [];
  const frequencies = Array.isArray(company.payrollFrequencies)
    ? (company.payrollFrequencies as PayrollFrequencyConfig[])
    : [];

  let calendar = calendarId
    ? calendars.find(cal => cal.id === calendarId)
    : calendars[0];

  if (!calendar && calendars.length > 0) {
    calendar = calendars[0];
  }

  const frequency = calendar
    ? frequencies.find(freq => freq.id === calendar?.frequencyId) ?? frequencies[0]
    : frequencies[0];

  return { calendar, frequency };
};

const deriveScenarioDefaults = (
  frequency?: PayrollFrequencyConfig,
  calendar?: PayrollCalendarConfig,
) => {
  const toggles = { ...scenarioToggleDefaults };
  if (frequency?.defaultScenarios) {
    applyScenarioOverrides(toggles, frequency.defaultScenarios);
  }
  if (calendar?.scenarioOverrides) {
    applyScenarioOverrides(toggles, calendar.scenarioOverrides);
  }
  return toggles;
};

const toDateOrUndefined = (value?: string | null) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const isWithinRange = (
  value: string | null | undefined,
  start: Date,
  end: Date,
) => {
  const date = toDateOrUndefined(value ?? undefined);
  if (!date) {
    return false;
  }
  return date >= start && date <= end;
};

const buildOverrideSets = (
  overrides?: z.infer<typeof overridesSchema>,
): PayrollCalculationOverrides | undefined => {
  if (!overrides) {
    return undefined;
  }

  let hasAny = false;
  const sets: PayrollCalculationOverrides = {};

  if (overrides.skippedVacationIds && overrides.skippedVacationIds.length > 0) {
    sets.skippedVacationIds = new Set(overrides.skippedVacationIds);
    hasAny = true;
  }
  if (overrides.skippedLoanIds && overrides.skippedLoanIds.length > 0) {
    sets.skippedLoanIds = new Set(overrides.skippedLoanIds);
    hasAny = true;
  }
  if (overrides.skippedEventIds && overrides.skippedEventIds.length > 0) {
    sets.skippedEventIds = new Set(overrides.skippedEventIds);
    hasAny = true;
  }

  return hasAny ? sets : undefined;
};

const resolveUseAttendance = async (overrideValue: unknown) => {
  if (overrideValue !== undefined) {
    return Boolean(overrideValue);
  }
  const companies = await storage.getCompanies();
  const company = companies[0];
  return Boolean((company as any)?.useAttendanceForDeductions);
};

const loadPayrollInputs = async ({
  start,
  end,
  useAttendance,
}: {
  start: Date;
  end: Date;
  useAttendance: boolean;
}): Promise<PayrollInputs> => {
  const [employees, loans, vacationRequests, rawEvents, scheduleSummary] = await Promise.all([
    storage.getEmployees({ status: ["active"], includeTerminated: false }),
    storage.getLoans(start, end),
    storage.getVacationRequests(start, end),
    storage.getEmployeeEvents(start, end),
    storage.getScheduleSummary(start, end),
  ]);

  const attendanceSummary: Record<string, number> = useAttendance
    ? await storage.getAttendanceSummary(start, end)
    : {};

  const employeeEvents = rawEvents.map(({ employee, ...event }) => ({
    ...event,
    affectsPayroll: (event as any).affectsPayroll ?? true,
  })) as EmployeeEventRecord[];

  return {
    employees,
    loans,
    vacationRequests,
    employeeEvents,
    attendanceSummary,
    scheduleSummary,
  };
};

const overlapsRange = (event: EmployeeEventRecord, start: Date, end: Date) => {
  const recurrenceStart = toDateOrUndefined(event.eventDate);
  if (!recurrenceStart || recurrenceStart > end) {
    return false;
  }
  const recurrenceEnd = toDateOrUndefined(event.recurrenceEndDate ?? undefined);
  if (!recurrenceEnd) {
    return true;
  }
  return recurrenceEnd >= start;
};

interface PayrollPreviewVacationImpact {
  id: string;
  startDate: string;
  endDate: string;
  daysInPeriod: number;
}

interface PayrollPreviewLoanImpact {
  id: string;
  reason: string | null;
  monthlyDeduction: number;
  remainingAmount: number;
}

interface PayrollPreviewEventImpact {
  id: string;
  title: string;
  amount: number;
  eventType: string;
  eventDate: string | null;
  effect: "bonus" | "deduction";
}

interface PayrollPreviewAllowanceImpact {
  id: string;
  title: string;
  amount: number;
  source: "period" | "recurring";
}

interface PayrollPreviewEmployeeImpact {
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  position: string | null;
  vacations: PayrollPreviewVacationImpact[];
  loans: PayrollPreviewLoanImpact[];
  events: PayrollPreviewEventImpact[];
  allowances: PayrollPreviewAllowanceImpact[];
}

interface PayrollPreviewScenarioResponse {
  scenarioKey: string;
  scenarioLabel: string;
  toggles: Record<string, boolean>;
  totals: { gross: number; net: number; deductions: number };
  employees: PayrollPreviewEmployeeImpact[];
}

interface PayrollPreviewResponse {
  period: string;
  startDate: string;
  endDate: string;
  calendarId: string | null;
  cycleLabel: string | null;
  scenarios: PayrollPreviewScenarioResponse[];
}

const buildEmployeePreview = (
  employee: EmployeeWithDepartment,
  context: Omit<PayrollInputs, "employees" | "attendanceSummary" | "scheduleSummary">,
  start: Date,
  end: Date,
  toggles?: Record<string, boolean>,
): PayrollPreviewEmployeeImpact => {
  const employeeVacations = context.vacationRequests.filter(vacation =>
    vacation.employeeId === employee.id &&
    vacation.status === "approved" &&
    new Date(vacation.startDate) <= end &&
    new Date(vacation.endDate) >= start,
  );

  const vacations: PayrollPreviewVacationImpact[] = [];
  for (const vacation of employeeVacations) {
    const id = vacation.id ?? `${employee.id}-vacation-${vacations.length}`;
    vacations.push({
      id,
      startDate: vacation.startDate,
      endDate: vacation.endDate,
      daysInPeriod: calculateVacationDaysInPeriod(vacation, start, end),
    });
  }

  const employeeLoans = context.loans.filter(loan => {
    const isActive = loan.status === "active" || loan.status === "approved";
    return (
      loan.employeeId === employee.id &&
      isActive &&
      parseAmount(loan.remainingAmount) > 0
    );
  });

  const loans: PayrollPreviewLoanImpact[] = [];
  for (const loan of employeeLoans) {
    const id = loan.id ?? `${employee.id}-loan-${loans.length}`;
    const remaining = parseAmount(loan.remainingAmount);
    const monthly = parseAmount(loan.monthlyDeduction);
    loans.push({
      id,
      reason: (loan as any).reason ?? null,
      monthlyDeduction: Math.min(monthly, remaining),
      remainingAmount: remaining,
    });
  }

  const eventsForEmployee = context.employeeEvents.filter(event =>
    event.employeeId === employee.id &&
    event.affectsPayroll &&
    event.status === "active" &&
    event.eventType !== "vacation",
  );

  const eventsInPeriod = eventsForEmployee.filter(event =>
    isWithinRange(event.eventDate ?? undefined, start, end),
  );

  const events: PayrollPreviewEventImpact[] = [];
  const allowances: PayrollPreviewAllowanceImpact[] = [];

  const includeAllowances = toggles?.allowances !== false;
  const includeBonuses = toggles?.bonuses !== false;
  const includeOvertime = toggles?.overtime !== false;

  for (const event of eventsInPeriod) {
    if (event.eventType === "allowance") {
      if (!includeAllowances) {
        continue;
      }
      allowances.push({
        id: event.id ?? `${employee.id}-allowance-${allowances.length}`,
        title: resolveTitle((event as any).title, "Allowance"),
        amount: parseAmount(event.amount),
        source: "period",
      });
      continue;
    }

    if (event.eventType === "overtime" && !includeOvertime) {
      continue;
    }

    if (
      !BONUS_EVENT_TYPES.has(event.eventType) &&
      !DEDUCTION_EVENT_TYPES.has(event.eventType)
    ) {
      continue;
    }

    if (!includeBonuses && event.eventType !== "overtime" && BONUS_EVENT_TYPES.has(event.eventType)) {
      continue;
    }

    events.push({
      id: event.id ?? `${employee.id}-event-${events.length}`,
      title: resolveTitle((event as any).title, event.eventType),
      amount: parseAmount(event.amount),
      eventType: event.eventType,
      eventDate: event.eventDate ?? null,
      effect: BONUS_EVENT_TYPES.has(event.eventType) ? "bonus" : "deduction",
    });
  }

  if (includeAllowances) {
    eventsForEmployee
      .filter(
        event =>
          event.eventType === "allowance" &&
          event.recurrenceType === "monthly" &&
          overlapsRange(event, start, end),
      )
      .forEach(event => {
        if (isWithinRange(event.eventDate ?? undefined, start, end)) {
          return;
        }
        allowances.push({
          id: event.id ?? `${employee.id}-allowance-${allowances.length}`,
          title: resolveTitle((event as any).title, "Allowance"),
          amount: parseAmount(event.amount),
          source: "recurring",
        });
      });
  }

  const employeeName = getEmployeeDisplayName(employee);

  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode ?? null,
    employeeName,
    position: employee.position ?? null,
    vacations,
    loans,
    events,
    allowances,
  };
};

const toComparableTime = (value: unknown) => {
  if (!value) return Number.POSITIVE_INFINITY;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
  }
  const date = new Date(String(value));
  const time = date.getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
};

payrollRouter.get("/", async (req, res, next) => {
  try {
    const payrollRuns = await storage.getPayrollRuns();
    res.json(payrollRuns);
  } catch (error) {
    console.error("Failed to fetch payroll runs:", error);
    next(new HttpError(500, "Failed to fetch payroll runs", error));
  }
});

// Recalculate payroll run totals (and fix entry netPay based on fields)
payrollRouter.post(
  "/:id/recalculate",
  requirePermission("payroll:manage"),
  async (req, res, next) => {
    try {
      const runId = req.params.id;

      const existingRun = await db.query.payrollRuns.findFirst({
        where: (runs, { eq: eqFn }) => eqFn(runs.id, runId),
      });

      if (!existingRun) {
        return next(new HttpError(404, "Payroll run not found"));
      }

      const scenarioToggleInput = existingRun.scenarioToggles as
        | Record<string, boolean>
        | null
        | undefined;
      const scenarioToggles = resolveScenarioToggles(scenarioToggleInput ?? undefined);

      const parsedDeductions = deductionsSchema.safeParse(req.body?.deductions ?? {});
      if (!parsedDeductions.success) {
        return next(
          new HttpError(400, "Invalid deduction data", parsedDeductions.error.errors),
        );
      }

      const start = new Date(existingRun.startDate);
      const end = new Date(existingRun.endDate);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return next(new HttpError(400, "Invalid payroll run period"));
      }

      const activeEmployees = await storage.getEmployees({
        status: ["active"],
        includeTerminated: false,
      });

      const loans = await storage.getLoans(start, end);
      const vacationRequests = await storage.getVacationRequests(start, end);
      const rawEvents = await storage.getEmployeeEvents(start, end);
      const employeeEvents = rawEvents.map(({ employee, ...event }) => ({
        ...event,
        affectsPayroll: (event as any).affectsPayroll ?? true,
      }));
      const scenarioEvents = filterEventsByScenario(employeeEvents, scenarioToggles);

      const companies = await storage.getCompanies();
      const company = companies[0];
      const useAttendance =
        req.body?.useAttendance !== undefined
          ? Boolean(req.body.useAttendance)
          : Boolean((company as any)?.useAttendanceForDeductions);
      const shouldUseAttendance = scenarioToggles.attendance !== false && useAttendance;
      const attendanceSummary = shouldUseAttendance
        ? await storage.getAttendanceSummary(start, end)
        : ({} as Record<string, number>);

      const scenarioAttendanceSummary = scenarioToggles.attendance !== false ? attendanceSummary : {};
      const scenarioLoans = scenarioToggles.loans ? loans : [];

      const deductionConfig =
        scenarioToggles.statutory !== false
          ? parsedDeductions.data
          : { taxDeduction: 0, socialSecurityDeduction: 0, healthInsuranceDeduction: 0 };

      const allowancesEnabled = scenarioToggles.allowances !== false;

      const payrollEntries = await Promise.all(
        activeEmployees.map(employee => {
          const employeeWorkingDays =
            employee.standardWorkingDays ||
            (Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

          return calculateEmployeePayroll({
            employee,
            loans: scenarioLoans,
            vacationRequests,
            employeeEvents: scenarioEvents,
            start,
            end,
            workingDays: employeeWorkingDays,
            attendanceDays: scenarioAttendanceSummary[employee.id],
            config: deductionConfig,
            currencyCode: company?.currencyCode,
            locale: company?.locale,
          });
        }),
      );

      const { grossAmount, totalDeductions, netAmount } = calculateTotals(payrollEntries);

      await db.transaction(async tx => {
        await tx
          .delete(payrollEntriesTable)
          .where(eq(payrollEntriesTable.payrollRunId, runId));

        if (payrollEntries.length > 0) {
          await tx.insert(payrollEntriesTable).values(
            payrollEntries.map(entry => ({
              employeeId: entry.employeeId,
              grossPay: entry.grossPay.toString(),
              baseSalary: entry.baseSalary.toString(),
              bonusAmount: entry.bonusAmount.toString(),
              workingDays: entry.workingDays,
              actualWorkingDays: entry.actualWorkingDays,
              vacationDays: entry.vacationDays,
              taxDeduction: entry.taxDeduction.toString(),
              socialSecurityDeduction: entry.socialSecurityDeduction.toString(),
              healthInsuranceDeduction: entry.healthInsuranceDeduction.toString(),
              loanDeduction: entry.loanDeduction.toString(),
              otherDeductions: entry.otherDeductions.toString(),
              netPay: entry.netPay.toString(),
              adjustmentReason: entry.adjustmentReason,
              allowances: serializeAllowancesForStorage(entry.allowances, allowancesEnabled),
              payrollRunId: runId,
            })),
          );
        }

        await tx
          .update(payrollRuns)
          .set({
            grossAmount: grossAmount.toString(),
            totalDeductions: totalDeductions.toString(),
            netAmount: netAmount.toString(),
          })
          .where(eq(payrollRuns.id, runId));
      });

      const updatedRun = await storage.getPayrollRun(runId);
      if (!updatedRun) {
        return next(new HttpError(500, "Failed to load updated payroll run"));
      }

      await logPayrollAudit(
        req,
        "Recalculated payroll run totals",
        { type: "payroll_run", id: runId },
        {
          grossAmount: updatedRun.grossAmount,
          netAmount: updatedRun.netAmount,
          totalDeductions: updatedRun.totalDeductions,
        },
      );

      res.json(updatedRun);
    } catch (error) {
      console.error("Recalculate payroll error:", error);
      next(new HttpError(500, "Failed to recalculate payroll totals"));
    }
  },
);

payrollRouter.post(
  "/preview",
  requirePermission("payroll:manage"),
  trackPayrollPreviewMetrics,
  async (req, res, next) => {
    try {
      const parsed = previewPayrollSchema.parse(req.body ?? {});

      const start = new Date(parsed.startDate);
      const end = new Date(parsed.endDate);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return next(new HttpError(400, "Invalid payroll period"));
      }

      if (start > end) {
        return next(new HttpError(400, "Start date must be before end date"));
      }

      const overrideSets = buildOverrideSets(parsed.overrides);

      const companies = await storage.getCompanies();
      const company = companies[0];
      const { calendar, frequency } = resolveCalendarConfiguration(company, parsed.calendarId);
      const baseDefaults = deriveScenarioDefaults(frequency, calendar);
      const baseToggles = resolveScenarioToggles(parsed.scenarioToggles as Record<string, boolean> | undefined, baseDefaults);
      const scenarioKey = parsed.scenarioKey ?? (calendar?.id ? `${calendar.id}-baseline` : "baseline");

      const scenarioPlans: Array<{
        key: string;
        label: string;
        toggles: Record<string, boolean>;
      }> = [
        {
          key: scenarioKey,
          label: parsed.scenarioKey ?? calendar?.name ?? frequency?.name ?? scenarioKey,
          toggles: baseToggles,
        },
      ];

      if (parsed.comparisons) {
        for (const variant of parsed.comparisons) {
          const variantBase = resolveScenarioToggles(baseToggles, baseDefaults);
          scenarioPlans.push({
            key: variant.scenarioKey,
            label: variant.label ?? variant.scenarioKey,
            toggles: resolveScenarioToggles(variant.scenarioToggles as Record<string, boolean> | undefined, variantBase),
          });
        }
      }

      const baseUseAttendance = await resolveUseAttendance(parsed.useAttendance);
      const shouldLoadAttendance = baseUseAttendance && scenarioPlans.some(plan => plan.toggles.attendance);

      const inputs = await loadPayrollInputs({
        start,
        end,
        useAttendance: shouldLoadAttendance,
      });

      if (inputs.employees.length === 0) {
        return next(new HttpError(400, "No active employees found"));
      }

      const deductionBaseline = deductionsSchema.parse(parsed.deductions ?? {});

      const scenarios = [] as Array<{
        scenarioKey: string;
        scenarioLabel: string;
        toggles: Record<string, boolean>;
        totals: { gross: number; net: number; deductions: number };
        employees: PayrollPreviewEmployeeImpact[];
      }>;

      for (const plan of scenarioPlans) {
        const scenarioLoans = plan.toggles.loans ? inputs.loans : [];
        const scenarioEvents = filterEventsByScenario(inputs.employeeEvents, plan.toggles);
        const scenarioAttendance = plan.toggles.attendance ? inputs.attendanceSummary : {};
        const deductionConfig = plan.toggles.statutory
          ? deductionBaseline
          : { taxDeduction: 0, socialSecurityDeduction: 0, healthInsuranceDeduction: 0 };

        const payrollEntries = await Promise.all(
          inputs.employees.map(employee => {
            const employeeWorkingDays =
              employee.standardWorkingDays ||
              Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            return calculateEmployeePayroll({
              employee,
              loans: scenarioLoans,
              vacationRequests: inputs.vacationRequests,
              employeeEvents: scenarioEvents,
              start,
              end,
              workingDays: employeeWorkingDays,
              attendanceDays: scenarioAttendance[employee.id],
              config: deductionConfig,
              overrides: overrideSets,
              currencyCode: company?.currencyCode,
              locale: company?.locale,
            });
          }),
        );

        const totals = calculateTotals(payrollEntries);

        const previewEmployees = inputs.employees.map(employee =>
          buildEmployeePreview(
            employee,
            {
              loans: scenarioLoans,
              vacationRequests: inputs.vacationRequests,
              employeeEvents: scenarioEvents,
            },
            start,
            end,
            plan.toggles,
          ),
        );

        scenarios.push({
          scenarioKey: plan.key,
          scenarioLabel: plan.label,
          toggles: plan.toggles,
          totals: {
            gross: totals.grossAmount,
            net: totals.netAmount,
            deductions: totals.totalDeductions,
          },
          employees: previewEmployees,
        });
      }

      res.json({
        period: parsed.period,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        calendarId: calendar?.id ?? null,
        cycleLabel: calendar?.name ?? frequency?.name ?? null,
        scenarios,
      });
    } catch (error) {
      console.error("Failed to preview payroll impacts:", error);
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid preview payload", error.errors));
      }
      next(new HttpError(500, "Failed to preview payroll impacts", error));
    }
  },
);

payrollRouter.get("/:id", async (req, res, next) => {
  try {
    const payrollRun = await storage.getPayrollRun(req.params.id);
    if (!payrollRun) {
      return next(new HttpError(404, "Payroll run not found"));
    }
    res.json(payrollRun);
  } catch (error) {
    next(new HttpError(500, "Failed to fetch payroll run"));
  }
});

payrollRouter.post(
  "/",
  requirePermission("payroll:manage"),
  async (req, res, next) => {
    try {
      const payrollRun = insertPayrollRunSchema.parse(req.body);
      const newPayrollRun = await storage.createPayrollRun(payrollRun);
      await logPayrollAudit(
        req,
        "Created payroll run",
        { type: "payroll_run", id: newPayrollRun.id },
        {
          startDate: newPayrollRun.startDate,
          endDate: newPayrollRun.endDate,
          status: newPayrollRun.status,
        },
      );
      res.status(201).json(newPayrollRun);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid payroll data", error.errors));
      }
      next(new HttpError(500, "Failed to create payroll run"));
    }
  },
);


payrollRouter.post(
  "/generate",
  requirePermission("payroll:manage"),
  trackPayrollGenerateMetrics,
  async (req, res, next) => {
  try {
    const parsed = generatePayrollSchema.parse(req.body ?? {});

    const start = new Date(parsed.startDate);
    const end = new Date(parsed.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return next(new HttpError(400, "Invalid payroll period"));
    }

    if (start > end) {
      return next(new HttpError(400, "Start date must be before end date"));
    }

    const status = parsed.status ?? "completed";
    const overrideSets = buildOverrideSets(parsed.overrides);

    const companies = await storage.getCompanies();
    const company = companies[0];
    const { calendar, frequency } = resolveCalendarConfiguration(company, parsed.calendarId);
    const baseDefaults = deriveScenarioDefaults(frequency, calendar);
    const scenarioToggles = resolveScenarioToggles(
      parsed.scenarioToggles as Record<string, boolean> | undefined,
      baseDefaults,
    );
    const scenarioKey = parsed.scenarioKey ?? (calendar?.id ? `${calendar.id}-baseline` : "baseline");
    const cycleLabel = parsed.cycleLabel ?? calendar?.name ?? frequency?.name ?? null;

    const baseUseAttendance = await resolveUseAttendance(parsed.useAttendance);
    const shouldUseAttendance = baseUseAttendance && scenarioToggles.attendance;

    const {
      employees,
      loans,
      vacationRequests,
      employeeEvents,
      attendanceSummary,
      scheduleSummary,
    } = await loadPayrollInputs({ start, end, useAttendance: shouldUseAttendance });

    if (employees.length === 0) {
      return next(new HttpError(400, "No active employees found"));
    }

    const newStart = start.toISOString().split("T")[0];
    const newEnd = end.toISOString().split("T")[0];
    const existingRun = await db.query.payrollRuns.findFirst({
      where: (runs, { lte, gte, and, or, isNull, eq: eqFn }) => {
        const overlap = and(lte(runs.startDate, newEnd), gte(runs.endDate, newStart));
        if (calendar?.id) {
          return and(overlap, or(eqFn(runs.calendarId, calendar.id), isNull(runs.calendarId)));
        }
        return overlap;
      },
    });

    if (existingRun) {
      return next(new HttpError(409, "Payroll run already exists for this period"));
    }

    const scenarioLoans = scenarioToggles.loans ? loans : [];
    const scenarioEvents = filterEventsByScenario(employeeEvents, scenarioToggles);
    const scenarioAttendance = scenarioToggles.attendance ? attendanceSummary : {};
    const deductionBaseline = deductionsSchema.parse(parsed.deductions ?? {});
    const deductionConfig = scenarioToggles.statutory
      ? deductionBaseline
      : { taxDeduction: 0, socialSecurityDeduction: 0, healthInsuranceDeduction: 0 };
    const allowancesEnabled = scenarioToggles.allowances !== false;

    const vacationsByEmployee = new Map<string, VacationRequestWithEmployee[]>();
    for (const vacation of vacationRequests) {
      const list = vacationsByEmployee.get(vacation.employeeId);
      if (list) {
        list.push(vacation);
      } else {
        vacationsByEmployee.set(vacation.employeeId, [vacation]);
      }
    }

    const loanScheduleContext = new Map<
      string,
      { entries: Array<{ installmentNumber: number; paymentAmount: unknown }>; amount: number }
    >();
    const scheduleStatusPromises: Array<Promise<void>> = [];
    const shouldFinalize = status === "completed";
    const shouldFinalizeLoans = shouldFinalize && scenarioToggles.loans;

    if (scenarioToggles.loans) {
      for (const loan of scenarioLoans) {
        if (!loan) continue;
        const isActiveLoan = loan.status === "active" || loan.status === "approved";
        if (!isActiveLoan || overrideSets?.skippedLoanIds?.has(loan.id)) {
          (loan as any).dueAmountForPeriod = 0;
          continue;
        }

        const dueEntries = ((loan as any).scheduleDueThisPeriod ?? []) as Array<{
          installmentNumber: number;
          paymentAmount: unknown;
          status: string;
        }>;

        const pauseLoan = shouldPauseLoanForLeave({
          vacations: vacationsByEmployee.get(loan.employeeId) ?? [],
          start,
          end,
        });

        const pendingEntries = dueEntries.filter(entry => entry.status === "pending");
        const pausedEntries = dueEntries.filter(entry => entry.status === "paused");

        if (shouldFinalizeLoans && pauseLoan && pendingEntries.length > 0) {
          scheduleStatusPromises.push(
            storage.updateLoanScheduleStatuses(
              loan.id,
              pendingEntries.map(entry => entry.installmentNumber),
              "paused",
            ),
          );
        }

        if (shouldFinalizeLoans && !pauseLoan && pausedEntries.length > 0) {
          scheduleStatusPromises.push(
            storage.updateLoanScheduleStatuses(
              loan.id,
              pausedEntries.map(entry => entry.installmentNumber),
              "pending",
            ),
          );
        }

        const activeEntries = pauseLoan
          ? []
          : dueEntries.filter(entry => entry.status === "pending" || entry.status === "paused");

        const dueAmount = activeEntries.reduce(
          (sum, entry) => sum + parseAmount(entry.paymentAmount),
          0,
        );
        const roundedDueAmount = Number(dueAmount.toFixed(2));

        (loan as any).dueAmountForPeriod = roundedDueAmount;
        (loan as any).scheduleDueThisPeriod = activeEntries;

        loanScheduleContext.set(loan.id, {
          entries: activeEntries,
          amount: roundedDueAmount,
        });
      }
    }

    if (shouldFinalizeLoans && scheduleStatusPromises.length > 0) {
      await Promise.all(scheduleStatusPromises);
    }

    const payrollEntries = await Promise.all(
      employees.map(employee => {
        const employeeWorkingDays =
          employee.standardWorkingDays ||
          Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return calculateEmployeePayroll({
          employee,
          loans: scenarioLoans,
          vacationRequests,
          employeeEvents: scenarioEvents,
          start,
          end,
          workingDays: employeeWorkingDays,
          attendanceDays: scenarioAttendance[employee.id],
          config: deductionConfig,
          overrides: overrideSets,
          currencyCode: company?.currencyCode,
          locale: company?.locale,
        });
      }),
    );

    const entriesByEmployee = new Map<string, (typeof payrollEntries)[number]>();
    for (const entry of payrollEntries) {
      entriesByEmployee.set(entry.employeeId, entry);
    }

    const activeLoansByEmployee = new Map<string, typeof scenarioLoans[number][]>();
    if (scenarioToggles.loans) {
      for (const loan of scenarioLoans) {
        if (loan.status !== "active") continue;
        if (overrideSets?.skippedLoanIds?.has(loan.id)) continue;
        const remaining = Number.parseFloat(String(loan.remainingAmount ?? 0));
        if (!(remaining > 0)) continue;
        const bucket = activeLoansByEmployee.get(loan.employeeId);
        if (bucket) {
          bucket.push(loan);
        } else {
          activeLoansByEmployee.set(loan.employeeId, [loan]);
        }
      }

      for (const loanList of activeLoansByEmployee.values()) {
        loanList.sort((a, b) => {
          const startDiff = toComparableTime(a.startDate) - toComparableTime(b.startDate);
          if (startDiff !== 0) return startDiff;
          const createdDiff = toComparableTime(a.createdAt) - toComparableTime(b.createdAt);
          if (createdDiff !== 0) return createdDiff;
          return a.id.localeCompare(b.id);
        });
      }
    }

    const { grossAmount, totalDeductions, netAmount } = calculateTotals(payrollEntries);

    const payrollRun = await db.transaction(async tx => {
      try {
        const [newRun] = await tx
          .insert(payrollRuns)
          .values({
            period: parsed.period,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            grossAmount: grossAmount.toString(),
            totalDeductions: totalDeductions.toString(),
            netAmount: netAmount.toString(),
            status,
            calendarId: calendar?.id ?? parsed.calendarId ?? null,
            cycleLabel,
            scenarioKey,
            scenarioToggles,
            exportArtifacts: [],
          })
          .returning();

        for (const entry of payrollEntries) {
          await tx.insert(payrollEntriesTable).values({
            employeeId: entry.employeeId,
            grossPay: entry.grossPay.toString(),
            baseSalary: entry.baseSalary.toString(),
            bonusAmount: entry.bonusAmount.toString(),
            allowances: serializeAllowancesForStorage(entry.allowances, allowancesEnabled),
            workingDays: entry.workingDays,
            actualWorkingDays: entry.actualWorkingDays,
            vacationDays: entry.vacationDays,
            taxDeduction: entry.taxDeduction.toString(),
            socialSecurityDeduction: entry.socialSecurityDeduction.toString(),
            healthInsuranceDeduction: entry.healthInsuranceDeduction.toString(),
            loanDeduction: entry.loanDeduction.toString(),
            otherDeductions: entry.otherDeductions.toString(),
            netPay: entry.netPay.toString(),
            adjustmentReason: entry.adjustmentReason,
            payrollRunId: newRun.id,
          });
        }

        if (shouldFinalizeLoans && activeLoansByEmployee.size > 0) {
          const loanReductions = new Map<string, number>();
          for (const [employeeId, employeeLoans] of activeLoansByEmployee.entries()) {
            let remainingDeduction = entriesByEmployee.get(employeeId)?.loanDeduction ?? 0;
            if (!(remainingDeduction > 0)) continue;

            const paymentsToInsert: Array<{
              loanId: string;
              payrollRunId: string;
              employeeId: string;
              amount: string;
              appliedDate: string;
              source: string;
            }> = [];

            for (const loan of employeeLoans) {
              if (remainingDeduction <= 0) {
                break;
              }

              const remainingAmount = Number.parseFloat(String(loan.remainingAmount ?? 0));
              const monthlyCap = Number.parseFloat(String(loan.monthlyDeduction ?? 0));

              if (!Number.isFinite(remainingAmount) || remainingAmount <= 0) {
                continue;
              }

              const scheduleContext = loanScheduleContext.get(loan.id);
              const scheduledAmount = scheduleContext?.amount ?? 0;

              const capAmount = Number.isFinite(monthlyCap) && monthlyCap > 0 ? monthlyCap : Infinity;
              const targetAmount = scheduledAmount > 0 ? scheduledAmount : capAmount;
              const appliedAmount = Math.min(
                remainingAmount,
                targetAmount,
                remainingDeduction,
                capAmount,
              );
              if (!(appliedAmount > 0)) {
                continue;
              }

              paymentsToInsert.push({
                loanId: loan.id,
                payrollRunId: newRun.id,
                employeeId,
                amount: appliedAmount.toFixed(2),
                appliedDate: parsed.endDate,
                source: "payroll",
              });
              remainingDeduction = Number(Math.max(0, remainingDeduction - appliedAmount));
              loanReductions.set(
                loan.id,
                (loanReductions.get(loan.id) ?? 0) + appliedAmount,
              );

              if (scheduleContext && scheduleContext.entries.length > 0) {
                const installments = scheduleContext.entries.map(
                  entry => entry.installmentNumber,
                );
                const scheduledTotal = scheduleContext.amount;
                if (Math.abs(scheduledTotal - appliedAmount) <= 0.05) {
                  await storage.updateLoanScheduleStatuses(
                    loan.id,
                    installments,
                    "paid",
                    {
                      payrollRunId: newRun.id,
                      paidAt: parsed.endDate,
                      tx,
                    },
                  );
                }
              }
            }

            if (paymentsToInsert.length > 0) {
              await tx.insert(loanPaymentsTable).values(paymentsToInsert);
            }
          }

          if (loanReductions.size > 0) {
            for (const [loanId, totalPaid] of loanReductions.entries()) {
              if (!(totalPaid > 0)) continue;
              const loan = scenarioLoans.find(item => item.id === loanId);
              if (!loan) continue;
              const currentRemaining = parseAmount(
                (loan as any).remainingAmount ?? loan.remainingAmount ?? 0,
              );
              const updatedRemainingRaw = Number(
                Math.max(0, currentRemaining - totalPaid).toFixed(2),
              );
              const nextStatus =
                updatedRemainingRaw <= 0.01
                  ? "completed"
                  : (loan.status as string) ?? "active";

              await tx
                .update(loansTable)
                .set({
                  remainingAmount: updatedRemainingRaw.toFixed(2),
                  status: nextStatus,
                })
                .where(eq(loansTable.id, loanId));

              (loan as any).remainingAmount = updatedRemainingRaw.toFixed(2);
              (loan as any).status = nextStatus;
            }
          }
        }

        return newRun;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    });

    if (shouldFinalize) {
      try {
        for (const entry of payrollEntries) {
          if (entry.vacationDays > 0) {
            await storage.createNotification({
              employeeId: entry.employeeId,
              type: "vacation_approved",
              title: "Vacation Deduction Applied",
              message: `${entry.vacationDays} vacation days deducted from ${parsed.period} payroll`,
              priority: "medium",
              status: "unread",
              expiryDate: parsed.endDate,
              daysUntilExpiry: 0,
              emailSent: false,
              deliveryChannels: ["email"],
              escalationHistory: [],
            });
          }
          if (scenarioToggles.loans && entry.loanDeduction > 0) {
            await storage.createNotification({
              employeeId: entry.employeeId,
              type: "loan_deduction",
              title: "Loan Deduction Applied",
              message: `${formatCompanyCurrency(entry.loanDeduction, company)} deducted for loan repayment in ${parsed.period}`,
              priority: "low",
              status: "unread",
              expiryDate: parsed.endDate,
              daysUntilExpiry: 0,
              emailSent: false,
              deliveryChannels: ["email"],
              escalationHistory: [],
            });
          }

          if (scenarioToggles.attendance) {
            const scheduleInfo = scheduleSummary[entry.employeeId];
            if (scheduleInfo) {
              const anomalies: string[] = [];
              if (scheduleInfo.missingPunches > 0) {
                anomalies.push(
                  `${scheduleInfo.missingPunches} scheduled shift${
                    scheduleInfo.missingPunches === 1 ? "" : "s"
                  } without punches`,
                );
              }
              if (scheduleInfo.pendingAbsence.length > 0) {
                anomalies.push(
                  `${scheduleInfo.pendingAbsence.length} absence approval${
                    scheduleInfo.pendingAbsence.length === 1 ? "" : "s"
                  } pending`,
                );
              }
              if (scheduleInfo.pendingLate.length > 0) {
                anomalies.push(
                  `${scheduleInfo.pendingLate.length} late arrival approval${
                    scheduleInfo.pendingLate.length === 1 ? "" : "s"
                  } pending`,
                );
              }
              if (scheduleInfo.pendingOvertime.length > 0) {
                anomalies.push(
                  `${scheduleInfo.pendingOvertime.length} overtime approval${
                    scheduleInfo.pendingOvertime.length === 1 ? "" : "s"
                  } pending`,
                );
              }
              if (scheduleInfo.overtimeLimitBreaches.length > 0) {
                anomalies.push(
                  `${scheduleInfo.overtimeLimitBreaches.length} overtime limit breach${
                    scheduleInfo.overtimeLimitBreaches.length === 1 ? "" : "es"
                  } detected`,
                );
              }

              if (anomalies.length > 0) {
                const hasCritical =
                  scheduleInfo.overtimeLimitBreaches.length > 0 || scheduleInfo.missingPunches > 0;
              await storage.createNotification({
                employeeId: entry.employeeId,
                type: "attendance_variance",
                title: `Schedule variance for ${parsed.period}`,
                message: `Attendance variance detected: ${anomalies.join("; ")}.`,
                priority: hasCritical ? "high" : "medium",
                status: "unread",
                expiryDate: parsed.endDate,
                daysUntilExpiry: 0,
                emailSent: false,
                deliveryChannels: ["email"],
                escalationHistory: [],
              });
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to create payroll notifications:", error);
      }
    }

    const availableFormats = Array.isArray(company?.payrollExportFormats)
      ? (company!.payrollExportFormats as PayrollExportFormatConfig[])
      : [];
    const exportRequests = mapExportRequests(parsed.exports, availableFormats);

    if (exportRequests.length > 0) {
      const artifacts = await buildPayrollExports({
        run: payrollRun,
        entries: payrollEntries.map(entry => ({
          employeeId: entry.employeeId,
          grossPay: entry.grossPay,
          netPay: entry.netPay,
          loanDeduction: entry.loanDeduction,
          otherDeductions: entry.otherDeductions,
          bonusAmount: entry.bonusAmount,
          taxDeduction: entry.taxDeduction,
          socialSecurityDeduction: entry.socialSecurityDeduction,
          healthInsuranceDeduction: entry.healthInsuranceDeduction,
        })),
        employees,
        scenarioKey,
        toggles: scenarioToggles,
        requests: exportRequests,
      });

      if (artifacts.length > 0) {
        await db
          .update(payrollRuns)
          .set({ exportArtifacts: artifacts })
          .where(eq(payrollRuns.id, payrollRun.id));
        payrollRun.exportArtifacts = artifacts;
      }
    }

    payrollRun.calendarId = payrollRun.calendarId ?? calendar?.id ?? parsed.calendarId ?? null;
    payrollRun.cycleLabel = payrollRun.cycleLabel ?? cycleLabel;
    payrollRun.scenarioKey = scenarioKey;
    payrollRun.scenarioToggles = scenarioToggles;

    await logPayrollAudit(
      req,
      "Generated payroll run",
      { type: "payroll_run", id: payrollRun.id },
      {
        startDate: payrollRun.startDate,
        endDate: payrollRun.endDate,
        status: payrollRun.status,
        scenarioKey,
      },
    );

    res.status(201).json(payrollRun);
  } catch (error) {
    console.error("Payroll generation error:", error);
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid payroll payload", error.errors));
    }
    next(new HttpError(500, "Failed to generate payroll"));
  }
});

payrollRouter.post(
  "/entries/:id/vacation",
  requirePermission("payroll:manage"),
  async (req, res, next) => {
    try {
      const entryId = req.params.id;
      const body = payrollVacationOverrideSchema.parse(req.body ?? {});

      const payrollEntry = await db.query.payrollEntries.findFirst({
        where: (entry, { eq: eqFn }) => eqFn(entry.id, entryId),
        with: { payrollRun: true },
      });

      if (!payrollEntry) {
        return next(new HttpError(404, "Payroll entry not found"));
      }

      const start = new Date(body.startDate);
      const end = new Date(body.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        return next(new HttpError(400, "Invalid vacation date range"));
      }

      const totalDays =
        Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))) + 1;

      const reason =
        body.reason ??
        `${body.leaveType} leave: ${totalDays} day${totalDays === 1 ? "" : "s"} (${body.startDate} → ${body.endDate})${
          body.leaveType === "emergency" && !body.deductFromSalary ? " (no salary deduction)" : ""
        }`;

      const overrideMetadata = {
        payrollRunId: payrollEntry.payrollRunId,
        payrollEntryId: payrollEntry.id,
      } as const;

      const actorId = (req.user as SessionUser | undefined)?.id ?? payrollEntry.employeeId;

      const employeeRequests = await db.query.vacationRequests.findMany({
        where: (vacation, { eq: eqFn }) => eqFn(vacation.employeeId, payrollEntry.employeeId),
      });

      const existingOverride = employeeRequests.find(request => {
        const logEntries = Array.isArray(request.auditLog) ? (request.auditLog as any[]) : [];
        return logEntries.some(entry => {
          const meta = (entry as any).metadata as Record<string, unknown> | null | undefined;
          return meta?.payrollEntryId === payrollEntry.id;
        });
      });

      const payrollRun = (payrollEntry as any).payrollRun as
        | { period?: string | null }
        | undefined;

      const auditEntry = {
        id: randomUUID(),
        actorId,
        action: "comment" as const,
        actionAt: new Date().toISOString(),
        notes: `Vacation override applied via payroll run ${payrollRun?.period ?? payrollEntry.payrollRunId}`,
        metadata: overrideMetadata,
      };

      let savedRequest: VacationRequest | undefined;

      if (existingOverride) {
        const baseLog = Array.isArray(existingOverride.auditLog)
          ? (existingOverride.auditLog as any[])
          : [];
        savedRequest = await storage.updateVacationRequest(existingOverride.id, {
          startDate: body.startDate,
          endDate: body.endDate,
          days: totalDays,
          leaveType: body.leaveType,
          deductFromSalary: body.deductFromSalary ?? false,
          status: "approved",
          reason,
          auditLog: [...baseLog, auditEntry],
        });
      }

      if (!savedRequest) {
        savedRequest = await storage.createVacationRequest({
          employeeId: payrollEntry.employeeId,
          startDate: body.startDate,
          endDate: body.endDate,
          days: totalDays,
          leaveType: body.leaveType,
          deductFromSalary: body.deductFromSalary ?? false,
          status: "approved",
          reason,
          auditLog: [auditEntry],
        });
      }

      const updatedEntry = await storage.updatePayrollEntry(entryId, {
        vacationDays: totalDays,
        adjustmentReason: reason,
      });

      if (!updatedEntry) {
        return next(new HttpError(500, "Failed to update payroll entry with vacation override"));
      }

      await logPayrollAudit(
        req,
        "Applied manual vacation override",
        { type: "payroll_entry", id: entryId },
        {
          payrollRunId: payrollEntry.payrollRunId,
          vacationRequestId: savedRequest.id,
          startDate: body.startDate,
          endDate: body.endDate,
          leaveType: body.leaveType,
          days: totalDays,
        },
      );

      res.json({ payrollEntry: updatedEntry, vacationRequest: savedRequest });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid vacation override data", error.errors));
      }
      console.error("Failed to upsert payroll vacation override:", error);
      next(new HttpError(500, "Failed to upsert payroll vacation override"));
    }
  },
);

payrollRouter.put(
  "/:id",
  requirePermission(["payroll:manage", "payroll:approve"]),
  async (req, res, next) => {
  try {
    const updates = insertPayrollRunSchema.partial().parse(req.body);
    const updatedPayrollRun = await storage.updatePayrollRun(req.params.id, updates);
    if (!updatedPayrollRun) {
      return next(new HttpError(404, "Payroll run not found"));
    }
    await logPayrollAudit(
      req,
      "Updated payroll run",
      { type: "payroll_run", id: updatedPayrollRun.id },
      { updatedFields: Object.keys(updates) },
    );
    res.json(updatedPayrollRun);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid payroll data", error.errors));
    }
    next(new HttpError(500, "Failed to update payroll run"));
  }
});

payrollRouter.post(
  "/:id/undo-loan-deductions",
  requirePermission("payroll:manage"),
  async (req, res, next) => {
    try {
      const result = await storage.undoPayrollRunLoanDeductions(req.params.id);
      if (!result) {
        return next(new HttpError(404, "Payroll run not found"));
      }
      await logPayrollAudit(
        req,
        "Undid payroll loan deductions",
        { type: "payroll_run", id: req.params.id },
        { restoredPayments: result.loanPayments.length },
      );
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof LoanPaymentUndoError) {
        return next(
          new HttpError(
            409,
            "Payroll run cannot be reversed because loan payments from this run cannot be restored.",
            {
              loanId: error.loanId,
              reason: error.message,
            },
            "payrollRunLoanUndoBlocked",
          ),
        );
      }
      next(new HttpError(500, "Failed to undo payroll loan deductions"));
    }
  },
);

payrollRouter.delete(
  "/:id",
  requirePermission("payroll:manage"),
  async (req, res, next) => {
  try {
    const runId = req.params.id;
    const deleted = await storage.deletePayrollRun(runId);
    if (!deleted) {
      return next(new HttpError(404, "Payroll run not found"));
    }
    await logPayrollAudit(req, "Deleted payroll run", { type: "payroll_run", id: runId });
    res.status(204).send();
  } catch (error) {
    if (error instanceof LoanPaymentUndoError) {
      return next(
        new HttpError(
          409,
          "Payroll run cannot be deleted because loan payments from this run cannot be reversed.",
          {
            loanId: error.loanId,
            reason: error.message,
          },
          "payrollRunLoanUndoBlocked",
        ),
      );
    }
    next(new HttpError(500, "Failed to delete payroll run"));
  }
});

// Payroll entry routes
payrollRouter.put(
  "/entries/:id",
  requirePermission("payroll:manage"),
  async (req, res, next) => {
  try {
    const updates = insertPayrollEntrySchema.partial().parse(req.body);
    const updatedEntry = await storage.updatePayrollEntry(req.params.id, updates);
    if (!updatedEntry) {
      return next(new HttpError(404, "Payroll entry not found"));
    }
    await logPayrollAudit(
      req,
      "Updated payroll entry",
      { type: "payroll_entry", id: updatedEntry.id },
      { updatedFields: Object.keys(updates), payrollRunId: updatedEntry.payrollRunId },
    );
    res.json(updatedEntry);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid payroll entry data", error.errors));
    }
    next(new HttpError(500, "Failed to update payroll entry"));
  }
});
