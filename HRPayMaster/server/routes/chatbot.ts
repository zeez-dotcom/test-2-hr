import { Router } from "express";
import { parseIntent } from "@shared/chatbot";
import { storage } from "../storage";
import { HttpError } from "../errorHandler";

export const chatbotRouter = Router();

chatbotRouter.post("/api/chatbot", (req, res) => {
  const { message } = req.body ?? {};
  const intent = parseIntent(message ?? "");
  res.json(intent);
});

chatbotRouter.get(
  "/api/chatbot/loan-status/:id",
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
