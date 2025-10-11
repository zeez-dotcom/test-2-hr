import { Router } from "express";
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
  EmployeeWithDepartment,
  LoanWithEmployee,
  VacationRequestWithEmployee,
  EmployeeEvent as EmployeeEventRecord,
} from "@shared/schema";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { requireRole } from "./auth";
import {
  calculateEmployeePayroll,
  calculateTotals,
  type PayrollCalculationOverrides,
} from "../utils/payroll";

export const payrollRouter = Router();

const deductionsSchema = z.object({
  taxDeduction: z.number().optional(),
  socialSecurityDeduction: z.number().optional(),
  healthInsuranceDeduction: z.number().optional(),
});

const overridesSchema = z.object({
  skippedVacationIds: z.array(z.string().min(1)).optional(),
  skippedLoanIds: z.array(z.string().min(1)).optional(),
  skippedEventIds: z.array(z.string().min(1)).optional(),
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

interface PayrollPreviewResponse {
  period: string;
  startDate: string;
  endDate: string;
  employees: PayrollPreviewEmployeeImpact[];
}

const buildEmployeePreview = (
  employee: EmployeeWithDepartment,
  context: Omit<PayrollInputs, "employees" | "attendanceSummary" | "scheduleSummary">,
  start: Date,
  end: Date,
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

  for (const event of eventsInPeriod) {
    if (event.eventType === "allowance") {
      allowances.push({
        id: event.id ?? `${employee.id}-allowance-${allowances.length}`,
        title: resolveTitle((event as any).title, "Allowance"),
        amount: parseAmount(event.amount),
        source: "period",
      });
      continue;
    }

    if (
      !BONUS_EVENT_TYPES.has(event.eventType) &&
      !DEDUCTION_EVENT_TYPES.has(event.eventType)
    ) {
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
  requireRole(["admin", "hr"]),
  async (req, res, next) => {
    try {
      const runId = req.params.id;

      const existingRun = await db.query.payrollRuns.findFirst({
        where: (runs, { eq: eqFn }) => eqFn(runs.id, runId),
      });

      if (!existingRun) {
        return next(new HttpError(404, "Payroll run not found"));
      }

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

      const companies = await storage.getCompanies();
      const company = companies[0];
      const useAttendance =
        req.body?.useAttendance !== undefined
          ? Boolean(req.body.useAttendance)
          : Boolean((company as any)?.useAttendanceForDeductions);
      const attendanceSummary = useAttendance
        ? await storage.getAttendanceSummary(start, end)
        : ({} as Record<string, number>);

      const deductionConfig = parsedDeductions.data;

      const payrollEntries = await Promise.all(
        activeEmployees.map(employee => {
          const employeeWorkingDays =
            employee.standardWorkingDays ||
            (Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

          return calculateEmployeePayroll({
            employee,
            loans,
            vacationRequests,
            employeeEvents,
            start,
            end,
            workingDays: employeeWorkingDays,
            attendanceDays: attendanceSummary[employee.id],
            config: deductionConfig,
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

      res.json(updatedRun);
    } catch (error) {
      console.error("Recalculate payroll error:", error);
      next(new HttpError(500, "Failed to recalculate payroll totals"));
    }
  },
);

payrollRouter.post(
  "/preview",
  requireRole(["admin", "hr"]),
  async (req, res, next) => {
    try {
      const { period, startDate, endDate } = req.body ?? {};

      if (!period || !startDate || !endDate) {
        return next(new HttpError(400, "Period, start date, and end date are required"));
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return next(new HttpError(400, "Invalid payroll period"));
      }

      if (start > end) {
        return next(new HttpError(400, "Start date must be before end date"));
      }

      const useAttendance = await resolveUseAttendance(req.body?.useAttendance);
      const { employees, loans, vacationRequests, employeeEvents } = await loadPayrollInputs({
        start,
        end,
        useAttendance,
      });

      if (employees.length === 0) {
        return next(new HttpError(400, "No active employees found"));
      }

      const previewEmployees = employees.map(employee =>
        buildEmployeePreview(
          employee,
          { loans, vacationRequests, employeeEvents },
          start,
          end,
        ),
      );

      const response: PayrollPreviewResponse = {
        period,
        startDate,
        endDate,
        employees: previewEmployees,
      };

      res.json(response);
    } catch (error) {
      console.error("Failed to preview payroll impacts:", error);
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

payrollRouter.post("/", async (req, res, next) => {
  try {
    const payrollRun = insertPayrollRunSchema.parse(req.body);
    const newPayrollRun = await storage.createPayrollRun(payrollRun);
    res.status(201).json(newPayrollRun);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid payroll data", error.errors));
    }
    next(new HttpError(500, "Failed to create payroll run"));
  }
});

payrollRouter.post("/generate", requireRole(["admin", "hr"]), async (req, res, next) => {
  try {
    // optional standard deduction configuration can be supplied in req.body.deductions
    const { period, startDate, endDate } = req.body;

    if (!period || !startDate || !endDate) {
      return next(new HttpError(400, "Period, start date, and end date are required"));
    }

    const parsedDeductions = deductionsSchema.safeParse(req.body.deductions ?? {});
    if (!parsedDeductions.success) {
      return next(
        new HttpError(400, "Invalid deduction data", parsedDeductions.error.errors),
      );
    }

    const deductionConfig = parsedDeductions.data;

    const overridesInput =
      typeof req.body?.overrides === "object" && req.body.overrides !== null
        ? req.body.overrides
        : {};
    const parsedOverrides = overridesSchema.safeParse(overridesInput);
    if (!parsedOverrides.success) {
      return next(
        new HttpError(400, "Invalid override data", parsedOverrides.error.errors),
      );
    }
    const overrideSets = buildOverrideSets(parsedOverrides.data);

    // Parse dates once for reuse below
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return next(new HttpError(400, "Invalid payroll period"));
    }

    if (start > end) {
      return next(new HttpError(400, "Start date must be before end date"));
    }

    // Prevent duplicate payroll runs for overlapping periods
    const newStart = start.toISOString().split("T")[0];
    const newEnd = end.toISOString().split("T")[0];
    const existingRun = await db.query.payrollRuns.findFirst({
      where: (runs, { lte, gte, and }) =>
        and(lte(runs.startDate, newEnd), gte(runs.endDate, newStart)),
    });

    if (existingRun) {
      return next(new HttpError(409, "Payroll run already exists for this period"));
    }

    const useAttendance = await resolveUseAttendance(req.body?.useAttendance);

    const {
      employees: activeEmployees,
      loans,
      vacationRequests,
      employeeEvents,
      attendanceSummary,
      scheduleSummary,
    } = await loadPayrollInputs({ start, end, useAttendance });

    if (activeEmployees.length === 0) {
      return next(new HttpError(400, "No active employees found"));
    }

    const payrollEntries = await Promise.all(
      activeEmployees.map(employee => {
        const employeeWorkingDays = employee.standardWorkingDays ||
          (Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        return calculateEmployeePayroll({
          employee,
          loans,
          vacationRequests,
          employeeEvents,
          start,
          end,
          workingDays: employeeWorkingDays,
          attendanceDays: attendanceSummary[employee.id],
          config: deductionConfig,
          overrides: overrideSets,
        });
      })
    );

    const entriesByEmployee = new Map<string, (typeof payrollEntries)[number]>();
    for (const entry of payrollEntries) {
      entriesByEmployee.set(entry.employeeId, entry);
    }

    const activeLoansByEmployee = new Map<string, typeof loans[number][]>();
    for (const loan of loans) {
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

    // Create notifications for significant payroll events
    for (const entry of payrollEntries) {
      if (entry.vacationDays > 0) {
        await storage.createNotification({
          employeeId: entry.employeeId,
          type: "vacation_approved",
          title: "Vacation Deduction Applied",
          message: `${entry.vacationDays} vacation days deducted from ${period} payroll`,
          priority: "medium",
          status: "unread",
          expiryDate: endDate,
          daysUntilExpiry: 0,
          emailSent: false,
        });
      }
      if (entry.loanDeduction > 0) {
        await storage.createNotification({
          employeeId: entry.employeeId,
          type: "loan_deduction",
          title: "Loan Deduction Applied",
          message: `${entry.loanDeduction.toFixed(2)} KWD deducted for loan repayment in ${period}`,
          priority: "low",
          status: "unread",
          expiryDate: endDate,
          daysUntilExpiry: 0,
          emailSent: false,
        });
      }

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
            title: `Schedule variance for ${period}`,
            message: `Attendance variance detected: ${anomalies.join(
              "; ",
            )}.`,
            priority: hasCritical ? "high" : "medium",
            status: "unread",
            expiryDate: endDate,
            daysUntilExpiry: 0,
            emailSent: false,
          });
        }
      }
    }

    const { grossAmount, totalDeductions, netAmount } = calculateTotals(payrollEntries);

    // Wrap payroll run creation, entry insertion, and loan updates in a transaction
    const payrollRun = await db.transaction(async tx => {
      try {
        const [newRun] = await tx
          .insert(payrollRuns)
          .values({
            period,
            startDate,
            endDate,
            grossAmount: grossAmount.toString(),
            totalDeductions: totalDeductions.toString(),
            netAmount: netAmount.toString(),
            status: "completed",
          })
          .returning();

        for (const entry of payrollEntries) {
          await tx.insert(payrollEntriesTable).values({
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
            payrollRunId: newRun.id,
          });
        }

        for (const [employeeId, entry] of entriesByEmployee.entries()) {
          let remainingDeduction = entry.loanDeduction;
          if (!remainingDeduction || remainingDeduction <= 0) continue;

          const employeeLoans = activeLoansByEmployee.get(employeeId);
          if (!employeeLoans || employeeLoans.length === 0) continue;

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
            if (!Number.isFinite(monthlyCap) || monthlyCap <= 0) {
              continue;
            }

            const appliedAmount = Math.min(remainingAmount, monthlyCap, remainingDeduction);
            if (!(appliedAmount > 0)) {
              continue;
            }

            const newRemaining = Math.max(0, remainingAmount - appliedAmount);

            await tx
              .update(loansTable)
              .set({
                remainingAmount: newRemaining.toFixed(2),
                status: newRemaining <= 0 ? "completed" : "active",
              })
              .where(eq(loansTable.id, loan.id));

            paymentsToInsert.push({
              loanId: loan.id,
              payrollRunId: newRun.id,
              employeeId,
              amount: appliedAmount.toFixed(2),
              appliedDate: endDate,
              source: "payroll",
            });

            remainingDeduction = Math.max(0, remainingDeduction - appliedAmount);
            loan.remainingAmount = newRemaining.toFixed(2) as any;
            if (newRemaining <= 0) {
              loan.status = "completed" as any;
            }
          }

          if (paymentsToInsert.length > 0) {
            await tx.insert(loanPaymentsTable).values(paymentsToInsert);
          }
        }

        return newRun;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    });

    res.status(201).json(payrollRun);
  } catch (error) {
    console.error("Payroll generation error:", error);
    next(new HttpError(500, "Failed to generate payroll"));
  }
});

payrollRouter.put("/:id", async (req, res, next) => {
  try {
    const updates = insertPayrollRunSchema.partial().parse(req.body);
    const updatedPayrollRun = await storage.updatePayrollRun(req.params.id, updates);
    if (!updatedPayrollRun) {
      return next(new HttpError(404, "Payroll run not found"));
    }
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
  requireRole(["admin", "hr"]),
  async (req, res, next) => {
    try {
      const result = await storage.undoPayrollRunLoanDeductions(req.params.id);
      if (!result) {
        return next(new HttpError(404, "Payroll run not found"));
      }
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

payrollRouter.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await storage.deletePayrollRun(req.params.id);
    if (!deleted) {
      return next(new HttpError(404, "Payroll run not found"));
    }
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
payrollRouter.put("/entries/:id", async (req, res, next) => {
  try {
    const updates = insertPayrollEntrySchema.partial().parse(req.body);
    const updatedEntry = await storage.updatePayrollEntry(req.params.id, updates);
    if (!updatedEntry) {
      return next(new HttpError(404, "Payroll entry not found"));
    }
    res.json(updatedEntry);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid payroll entry data", error.errors));
    }
    next(new HttpError(500, "Failed to update payroll entry"));
  }
});
