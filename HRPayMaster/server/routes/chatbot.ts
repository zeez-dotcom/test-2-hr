import { Router } from "express";
import { parseIntent } from "@shared/chatbot";
import { storage } from "../storage";
import { HttpError } from "../errorHandler";
import { ensureAuth, requireRole } from "./auth";
import { log } from "../vite";
import { chatbotMonthlySummaryRequestsTotal } from "../metrics";

export const chatbotRouter = Router();

chatbotRouter.use(ensureAuth);

chatbotRouter.post("/api/chatbot", (req, res) => {
  const { message } = req.body ?? {};
  const intent = parseIntent(message ?? "");
  res.json(intent);
});

chatbotRouter.get(
  "/api/chatbot/loan-status/:id",
  requireRole(["admin", "hr"]),
  async (req, res, next) => {
    try {
      const balances = await storage.getLoanBalances();
      const balance =
        balances.find((b) => b.employeeId === req.params.id)?.balance || 0;
      res.json({ balance });
    } catch (err) {
      next(new HttpError(500, "Failed to fetch loan status"));
    }
  }
);

chatbotRouter.get(
  "/api/chatbot/report-summary/:id",
  requireRole(["admin", "hr"]),
  async (req, res, next) => {
    try {
      const today = new Date();
      const startDate = new Date(today.getFullYear(), 0, 1)
        .toISOString()
        .split("T")[0];
      const endDate = today.toISOString().split("T")[0];
      const report = await storage.getEmployeeReport(req.params.id, {
        startDate,
        endDate,
        groupBy: "year",
      });
      const totals = report.reduce(
        (acc, period) => {
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
              .filter(
                (e) => e.eventType === "deduction" || e.eventType === "penalty"
              )
              .reduce((s, e) => s + Number(e.amount || 0), 0) +
            period.loans.reduce(
              (s, l) => s + Number(l.monthlyDeduction || 0),
              0
            );
          const netPay = period.payrollEntries.reduce(
            (sum, e) => sum + Number(e.netPay || 0),
            0
          );
          acc.bonuses += bonuses;
          acc.deductions += deductions;
          acc.netPay += netPay;
          return acc;
        },
        { bonuses: 0, deductions: 0, netPay: 0 }
      );
      res.json(totals);
    } catch (err) {
      next(new HttpError(500, "Failed to fetch report summary"));
    }
  }
);

chatbotRouter.get(
  "/api/chatbot/monthly-summary/:employeeId",
  requireRole(["admin", "hr", "employee"]),
  async (req, res, next) => {
    const start = process.hrtime.bigint();
    const { employeeId } = req.params;
    if (!employeeId) {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      chatbotMonthlySummaryRequestsTotal.inc({ status: "error" });
      log(
        JSON.stringify({
          route: "chatbot/monthly-summary",
          employeeId,
          status: "error",
          error: "Invalid employeeId",
          durationMs,
        }),
        "chatbot",
      );
      return next(new HttpError(400, "Invalid employeeId"));
    }
    try {
      const now = new Date();
      const summary = await storage.getMonthlyEmployeeSummary(
        employeeId,
        now,
      );

      const payroll = {
        gross: summary.payroll.reduce(
          (sum, e) => sum + Number(e.grossPay || 0),
          0,
        ),
        net: summary.payroll.reduce(
          (sum, e) => sum + Number(e.netPay || 0),
          0,
        ),
      };

      const loanBalance = summary.loans.reduce(
        (sum, l) => sum + Number(l.remainingAmount || 0),
        0,
      );

      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      chatbotMonthlySummaryRequestsTotal.inc({ status: "success" });
      log(
        JSON.stringify({
          route: "chatbot/monthly-summary",
          employeeId,
          status: "success",
          durationMs,
        }),
        "chatbot",
      );

      res.json({
        payroll,
        loanBalance,
        events: summary.events,
      });
    } catch (err) {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      chatbotMonthlySummaryRequestsTotal.inc({ status: "error" });
      log(
        JSON.stringify({
          route: "chatbot/monthly-summary",
          employeeId,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
          durationMs,
        }),
        "chatbot",
      );
      next(new HttpError(500, "Failed to fetch monthly summary"));
    }
  },
);
