import { Router } from "express";
import { HttpError } from "../errorHandler";
import { storage } from "../storage";
import { z } from "zod";

export const reportsRouter = Router();

const defaultStartDate = () =>
  new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
const defaultEndDate = () => new Date().toISOString().split("T")[0];

const reportQuerySchema = z
  .object({
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
  })
  .superRefine(({ startDate, endDate }, ctx) => {
    if (new Date(startDate) > new Date(endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startDate must be before or equal to endDate",
        path: ["endDate"],
      });
    }
  });

// Employee and company report routes

// Employee report route
reportsRouter.get("/api/reports/employees/:id", async (req, res, next) => {
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
});

// Company-level report routes

// Payroll summary
reportsRouter.get("/api/reports/payroll", async (req, res, next) => {
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
});

// Loan balances / loan repayment details
reportsRouter.get("/api/reports/loan-balances", async (req, res, next) => {
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
});

// Asset usage
reportsRouter.get("/api/reports/asset-usage", async (req, res, next) => {
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
});

// Fleet usage
reportsRouter.get("/api/reports/fleet-usage", async (req, res, next) => {
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
});

// Payroll by department
reportsRouter.get("/api/reports/payroll-by-department", async (req, res, next) => {
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
});

// allow both named and default imports of this router
export default reportsRouter;

