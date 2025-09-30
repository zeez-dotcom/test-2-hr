import { Router } from "express";
import { HttpError } from "../errorHandler";
import { storage } from "../storage";
import {
  insertPayrollRunSchema,
  insertPayrollEntrySchema,
  payrollRuns,
  payrollEntries as payrollEntriesTable,
  loans as loansTable,
  loanPayments as loanPaymentsTable,
} from "@shared/schema";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { requireRole } from "./auth";
import { calculateEmployeePayroll, calculateTotals } from "../utils/payroll";

export const payrollRouter = Router();

const deductionsSchema = z.object({
  taxDeduction: z.number().optional(),
  socialSecurityDeduction: z.number().optional(),
  healthInsuranceDeduction: z.number().optional(),
});

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
    next(new HttpError(500, "Failed to fetch payroll runs"));
  }
});

// Recalculate payroll run totals (and fix entry netPay based on fields)
payrollRouter.post(
  "/:id/recalculate",
  requireRole(["admin", "hr"]),
  async (req, res, next) => {
    try {
      const runId = req.params.id;

      // Load entries for this run
      const entries = await db
        .select()
        .from(payrollEntriesTable)
        .where(eq(payrollEntriesTable.payrollRunId, runId));

      if (!entries || entries.length === 0) {
        return next(new HttpError(404, "No payroll entries found for this run"));
      }

      // Recompute net per entry and update if needed; compute totals
      let grossAmount = 0;
      let totalDeductions = 0;
      let netAmount = 0;

      await db.transaction(async (tx) => {
        for (const e of entries) {
          const gross = parseFloat(e.grossPay as any);
          const tax = parseFloat((e.taxDeduction as any) ?? "0");
          const soc = parseFloat((e.socialSecurityDeduction as any) ?? "0");
          const health = parseFloat((e.healthInsuranceDeduction as any) ?? "0");
          const loan = parseFloat((e.loanDeduction as any) ?? "0");
          const other = parseFloat((e.otherDeductions as any) ?? "0");
          const ded = tax + soc + health + loan + other;
          const net = Math.max(0, gross - ded);

          grossAmount += gross;
          totalDeductions += ded;
          netAmount += net;

          const storedNet = parseFloat((e.netPay as any) ?? "0");
          if (Math.abs(storedNet - net) > 0.01) {
            await tx
              .update(payrollEntriesTable)
              .set({ netPay: net.toString() })
              .where(eq(payrollEntriesTable.id, e.id));
          }
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

      res.json({
        id: runId,
        grossAmount: grossAmount.toString(),
        totalDeductions: totalDeductions.toString(),
        netAmount: netAmount.toString(),
        updated: true,
      });
    } catch (error) {
      console.error("Recalculate payroll error:", error);
      next(new HttpError(500, "Failed to recalculate payroll totals"));
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

    // Parse dates once for reuse below
    const start = new Date(startDate);
    const end = new Date(endDate);

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

    // Get all active employees
    const activeEmployees = await storage.getEmployees({
      status: ["active"],
      includeTerminated: false,
    });

    if (activeEmployees.length === 0) {
      return next(new HttpError(400, "No active employees found"));
    }

    // Get loans, vacation requests, and employee events for the period
    const loans = await storage.getLoans(start, end);
    const vacationRequests = await storage.getVacationRequests(start, end);
    const rawEvents = await storage.getEmployeeEvents(start, end);
    const employeeEvents = rawEvents.map(({ employee, ...e }) => ({
      ...e,
      affectsPayroll: (e as any).affectsPayroll ?? true,
    }));
    // Attendance summary per employee (optional)
    // Attendance-based deduction toggle: request body override or company setting
    const companies = await storage.getCompanies();
    const company = companies[0];
    const useAttendance = (req.body?.useAttendance !== undefined)
      ? Boolean(req.body.useAttendance)
      : Boolean((company as any)?.useAttendanceForDeductions);
    const attendanceSummary = useAttendance
      ? await storage.getAttendanceSummary(start, end)
      : {} as Record<string, number>;

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

payrollRouter.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await storage.deletePayrollRun(req.params.id);
    if (!deleted) {
      return next(new HttpError(404, "Payroll run not found"));
    }
    res.status(204).send();
  } catch (error) {
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
