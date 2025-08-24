import { Router } from "express";
import { HttpError } from "../errorHandler";
import { storage } from "../storage";
import {
  insertPayrollRunSchema,
  insertPayrollEntrySchema,
  payrollRuns,
  payrollEntries as payrollEntriesTable,
  loans as loansTable,
} from "@shared/schema";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";

export const payrollRouter = Router();

payrollRouter.get("/", async (req, res, next) => {
  try {
    const payrollRuns = await storage.getPayrollRuns();
    res.json(payrollRuns);
  } catch (error) {
    next(new HttpError(500, "Failed to fetch payroll runs"));
  }
});

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

payrollRouter.post("/generate", async (req, res, next) => {
  try {
    const { period, startDate, endDate } = req.body;

    if (!period || !startDate || !endDate) {
      return next(new HttpError(400, "Period, start date, and end date are required"));
    }

    // Prevent duplicate payroll runs for overlapping periods
    const existingRuns = await storage.getPayrollRuns();
    const newStart = new Date(startDate);
    const newEnd = new Date(endDate);
    const hasOverlap = existingRuns.some(run => {
      const runStart = new Date(run.startDate);
      const runEnd = new Date(run.endDate);
      return runStart <= newEnd && runEnd >= newStart;
    });

    if (hasOverlap) {
      return next(new HttpError(409, "Payroll run already exists for this period"));
    }

    // Get all active employees
    const employees = await storage.getEmployees();
    const activeEmployees = employees.filter(emp => emp.status === "active");

    if (activeEmployees.length === 0) {
      return next(new HttpError(400, "No active employees found"));
    }

    // Get loans, vacation requests, and employee events for the period
    const loans = await storage.getLoans();
    const vacationRequests = await storage.getVacationRequests();
    const employeeEvents = await storage.getEmployeeEvents();

    // Define period range
    const start = new Date(startDate);
    const end = new Date(endDate);
    // Calculate number of days in this payroll period
    const workingDays =
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Calculate totals
    let grossAmount = 0;
    let totalDeductions = 0;

    const payrollEntries = await Promise.all(activeEmployees.map(async employee => {
      const monthlySalary = parseFloat(employee.salary);

      // Calculate vacation days for this employee in the period
      const employeeVacations = vacationRequests.filter(v =>
        v.employeeId === employee.id &&
        v.status === "approved" &&
        new Date(v.startDate) <= end &&
        new Date(v.endDate) >= start
      );

      const vacationDays = employeeVacations.reduce((total, vacation) => {
        const vacStart = new Date(Math.max(new Date(vacation.startDate).getTime(), start.getTime()));
        const vacEnd = new Date(Math.min(new Date(vacation.endDate).getTime(), end.getTime()));
        return total + Math.ceil((vacEnd.getTime() - vacStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      }, 0);

      // Calculate actual working days for this employee
      const actualWorkingDays = Math.max(0, workingDays - vacationDays);

      // Calculate pro-rated salary based on working days in the period
      const baseSalary =
        employee.status === "active"
          ? (monthlySalary * actualWorkingDays) / workingDays
          : 0;

      // Calculate loan deductions for this employee
      const employeeLoans = loans.filter(l =>
        l.employeeId === employee.id &&
        l.status === "active" &&
        parseFloat(l.remainingAmount) > 0
      );

      const loanDeduction = employeeLoans.reduce((total, loan) => {
        return total + Math.min(parseFloat(loan.monthlyDeduction), parseFloat(loan.remainingAmount));
      }, 0);

      // Calculate employee events (bonuses, deductions, etc.) for this period
      const periodStart = new Date(startDate);
      const periodEnd = new Date(endDate);

      const employeeEventsInPeriod = employeeEvents.filter(event =>
        event.employeeId === employee.id &&
        event.affectsPayroll &&
        event.status === "active" &&
        new Date(event.eventDate) >= periodStart &&
        new Date(event.eventDate) <= periodEnd &&
        event.eventType !== "vacation"
      );

      const bonusAmount = employeeEventsInPeriod
        .filter(event => ['bonus', 'allowance', 'overtime'].includes(event.eventType))
        .reduce((total, event) => total + parseFloat(event.amount), 0);

      const eventDeductions = employeeEventsInPeriod
        .filter(event => ['deduction', 'penalty'].includes(event.eventType))
        .reduce((total, event) => total + parseFloat(event.amount), 0);

      // Add bonuses to get gross pay
      const grossPay = baseSalary + bonusAmount;

      // Calculate standard deductions (optional - can be configured per company)
      const taxDeduction = 0; // No automatic tax deduction
      const socialSecurityDeduction = 0; // No automatic social security deduction
      const healthInsuranceDeduction = 0; // No automatic health insurance deduction

      const otherDeductions = eventDeductions;

      const totalEmpDeductions = taxDeduction + socialSecurityDeduction + healthInsuranceDeduction + loanDeduction + otherDeductions;
      const netPay = Math.max(0, grossPay - totalEmpDeductions);

      grossAmount += grossPay;
      totalDeductions += totalEmpDeductions;

      // Create notifications for significant payroll events
      let adjustmentReason = "";
      if (vacationDays > 0) {
        adjustmentReason += `${vacationDays} vacation days. `;

        // Create notification for vacation impact
        await storage.createNotification({
          employeeId: employee.id,
          type: "vacation_approved",
          title: "Vacation Deduction Applied",
          message: `${vacationDays} vacation days deducted from ${period} payroll`,
          priority: "medium",
          status: "unread",
          expiryDate: endDate,
          daysUntilExpiry: 0,
          emailSent: false
        });
      }

      if (loanDeduction > 0) {
        adjustmentReason += `Loan deduction: ${loanDeduction.toFixed(2)} KWD. `;

        // Create notification for loan deduction
        await storage.createNotification({
          employeeId: employee.id,
          type: "loan_deduction",
          title: "Loan Deduction Applied",
          message: `${loanDeduction.toFixed(2)} KWD deducted for loan repayment in ${period}`,
          priority: "low",
          status: "unread",
          expiryDate: endDate,
          daysUntilExpiry: 0,
          emailSent: false
        });
      }

      return {
        employeeId: employee.id,
        grossPay: grossPay.toString(),
        baseSalary: baseSalary.toString(),
        bonusAmount: bonusAmount.toString(),
        workingDays,
        actualWorkingDays: actualWorkingDays,
        vacationDays: vacationDays,
        taxDeduction: taxDeduction.toString(),
        socialSecurityDeduction: socialSecurityDeduction.toString(),
        healthInsuranceDeduction: healthInsuranceDeduction.toString(),
        loanDeduction: loanDeduction.toString(),
        otherDeductions: otherDeductions.toString(),
        netPay: netPay.toString(),
        adjustmentReason: adjustmentReason.trim() || null,
      };
    }));

    const netAmount = grossAmount - totalDeductions;

    // Wrap payroll run creation, entry insertion, and loan updates in a transaction
    const payrollRun = await db.transaction(async tx => {
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
          ...entry,
          payrollRunId: newRun.id,
        });
      }

      for (const loan of loans.filter(l => l.status === "active")) {
        const loanDeduction = payrollEntries.find(
          entry => entry.employeeId === loan.employeeId,
        )?.loanDeduction;
        if (loanDeduction && parseFloat(loanDeduction) > 0) {
          const newRemaining = Math.max(
            0,
            parseFloat(loan.remainingAmount) - parseFloat(loanDeduction),
          );
          await tx
            .update(loansTable)
            .set({
              remainingAmount: newRemaining.toString(),
              status: newRemaining <= 0 ? "completed" : "active",
            })
            .where(eq(loansTable.id, loan.id));
        }
      }

      return newRun;
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

