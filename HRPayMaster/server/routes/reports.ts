import { Router } from "express";
import { HttpError } from "../errorHandler";
import { storage } from "../storage";
import { z } from "zod";

export const reportsRouter = Router();

// Employee report route
reportsRouter.get("/api/reports/employees/:id", async (req, res, next) => {
  const querySchema = z.object({
    startDate: z
      .string()
      .refine((d) => !isNaN(Date.parse(d)), { message: "Invalid startDate" }),
    endDate: z
      .string()
      .refine((d) => !isNaN(Date.parse(d)), { message: "Invalid endDate" }),
    groupBy: z.enum(["month", "year"]).optional().default("month"),
  });

  try {
    const { startDate, endDate, groupBy } = querySchema.parse(req.query);
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
});


