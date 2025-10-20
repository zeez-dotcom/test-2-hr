import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import { parseIntent } from "@shared/chatbot";
import { storage } from "../storage";
import { HttpError } from "../errorHandler";
import { ensureAuth, requireRole } from "./auth";
import { log } from "../vite";
import { chatbotMonthlySummaryRequestsTotal } from "../metrics";
import { addMonths, differenceInCalendarDays, format } from "date-fns";
import { assetService } from "../assetService";
import { chatbotKnowledgeIndex } from "../utils/chatbotKnowledge";

export const chatbotRouter = Router();

chatbotRouter.use("/api/chatbot", ensureAuth);

const ACTIONABLE_INTENTS = [
  "requestVacation",
  "cancelVacation",
  "changeVacation",
  "runPayroll",
  "acknowledgeDocument",
] as const;

type ActionableIntent = (typeof ACTIONABLE_INTENTS)[number];

const actionRequestSchema = z.object({
  intent: z.enum(ACTIONABLE_INTENTS),
  employeeId: z.string().optional(),
  payload: z.unknown().optional(),
  confirm: z.boolean().optional(),
});

type ActionRequest = z.infer<typeof actionRequestSchema>;

type ActionResponse =
  | {
      status: "needs-confirmation";
      confirmation: { message: string; payload: Record<string, unknown> };
    }
  | {
      status: "completed";
      message?: string;
      result?: unknown;
    };

const buildApiBaseUrl = (req: Request): string => {
  const host = req.get("host");
  if (!host) {
    throw new HttpError(500, "Unable to determine API host");
  }
  return `${req.protocol}://${host}`;
};

const forwardApiRequest = async (
  req: Request,
  path: string,
  init: RequestInit,
): Promise<Response> => {
  const baseUrl = buildApiBaseUrl(req);
  const headers = new Headers(init.headers ?? {});
  headers.set("content-type", headers.get("content-type") ?? "application/json");
  if (req.headers.cookie) {
    headers.set("cookie", req.headers.cookie);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HttpError(
      response.status,
      `Failed to execute ${path}`,
      text ? [{ message: text }] : undefined,
    );
  }

  return response;
};

const handleRequestVacation = async (
  req: Request,
  request: ActionRequest,
): Promise<ActionResponse> => {
  const schema = z.object({
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    reason: z.string().optional(),
    leaveType: z.string().optional(),
  });
  const payload = schema.parse(request.payload ?? {});
  const employeeId = request.employeeId;
  if (!employeeId) {
    throw new HttpError(400, "Employee selection required for vacation requests");
  }

  const days =
    differenceInCalendarDays(new Date(payload.endDate), new Date(payload.startDate)) + 1;

  const confirmationMessage = `Submit vacation for ${payload.startDate} to ${payload.endDate}?`;

  if (!request.confirm) {
    return {
      status: "needs-confirmation",
      confirmation: {
        message: confirmationMessage,
        payload: {
          employeeId,
          startDate: payload.startDate,
          endDate: payload.endDate,
          reason: payload.reason ?? null,
          leaveType: payload.leaveType ?? "annual",
        },
      },
    };
  }

  const created = await storage.createVacationRequest({
    employeeId,
    startDate: payload.startDate,
    endDate: payload.endDate,
    days,
    reason: payload.reason ?? null,
    leaveType: payload.leaveType ?? "annual",
    deductFromSalary: false,
    status: "pending",
  });
  return {
    status: "completed",
    message: `Vacation request for ${payload.startDate} to ${payload.endDate} submitted`,
    result: created,
  };
};

const handleCancelVacation = async (
  _req: Request,
  request: ActionRequest,
): Promise<ActionResponse> => {
  const employeeId = request.employeeId;
  if (!employeeId) {
    throw new HttpError(400, "Employee selection required to cancel vacation");
  }
  const requests = await storage.getVacationRequests();
  const target = requests.find(
    (vacation) =>
      vacation.employeeId === employeeId &&
      ["pending", "approved"].includes((vacation.status || "").toLowerCase()),
  );

  if (!target) {
    throw new HttpError(404, "No active vacation request found to cancel");
  }

  const summary = `${target.startDate} to ${target.endDate}`;

  if (!request.confirm) {
    return {
      status: "needs-confirmation",
      confirmation: {
        message: `Cancel vacation ${summary}?`,
        payload: { vacationId: target.id },
      },
    };
  }

  await storage.updateVacationRequest(target.id, { status: "cancelled" });
  return {
    status: "completed",
    message: `Vacation ${summary} cancelled`,
    result: { id: target.id },
  };
};

const handleChangeVacation = async (
  _req: Request,
  request: ActionRequest,
): Promise<ActionResponse> => {
  const employeeId = request.employeeId;
  if (!employeeId) {
    throw new HttpError(400, "Employee selection required to change vacation");
  }

  const schema = z.object({
    startDate: z.string().min(1),
    endDate: z.string().min(1),
  });
  const payload = schema.parse(request.payload ?? {});

  const requests = await storage.getVacationRequests();
  const target = requests.find(
    (vacation) =>
      vacation.employeeId === employeeId &&
      ["pending", "approved"].includes((vacation.status || "").toLowerCase()),
  );

  if (!target) {
    throw new HttpError(404, "No active vacation request found to update");
  }

  if (!request.confirm) {
    return {
      status: "needs-confirmation",
      confirmation: {
        message: `Update vacation to ${payload.startDate} - ${payload.endDate}?`,
        payload: { vacationId: target.id, ...payload },
      },
    };
  }

  const days =
    differenceInCalendarDays(new Date(payload.endDate), new Date(payload.startDate)) + 1;

  const updated = await storage.updateVacationRequest(target.id, {
    startDate: payload.startDate,
    endDate: payload.endDate,
    days,
    status: target.status,
  });

  return {
    status: "completed",
    message: `Vacation updated to ${payload.startDate} - ${payload.endDate}`,
    result: updated,
  };
};

const handleRunPayroll = async (
  req: Request,
  request: ActionRequest,
): Promise<ActionResponse> => {
  const schema = z.object({
    period: z.string().min(1),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    overrides: z.record(z.any()).optional(),
  });
  const payload = schema.parse(request.payload ?? {});

  const confirmMessage = `Preview payroll for ${payload.period} (${payload.startDate} - ${payload.endDate})?`;

  if (!request.confirm) {
    return {
      status: "needs-confirmation",
      confirmation: {
        message: confirmMessage,
        payload,
      },
    };
  }

  const response = await forwardApiRequest(req, "/api/payroll/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  return {
    status: "completed",
    message: `Payroll preview ready for ${payload.period}`,
    result: data,
  };
};

const handleAcknowledgeDocument = async (
  _req: Request,
  request: ActionRequest,
): Promise<ActionResponse> => {
  const schema = z.object({
    documentId: z.string().min(1),
  });
  const payload = schema.parse(request.payload ?? {});

  const document = await storage.getGenericDocument(payload.documentId);
  if (!document) {
    throw new HttpError(404, "Document not found");
  }

  const title = document.title || "document";
  if (!request.confirm) {
    return {
      status: "needs-confirmation",
      confirmation: {
        message: `Acknowledge receipt of ${title}?`,
        payload,
      },
    };
  }

  await storage.updateGenericDocument(document.id, {
    signatureStatus: "completed",
  });

  return {
    status: "completed",
    message: `${title} acknowledged`,
    result: { id: document.id },
  };
};

const actionHandlers: Record<ActionableIntent, (req: Request, request: ActionRequest) => Promise<ActionResponse>> = {
  requestVacation: handleRequestVacation,
  cancelVacation: handleCancelVacation,
  changeVacation: handleChangeVacation,
  runPayroll: handleRunPayroll,
  acknowledgeDocument: handleAcknowledgeDocument,
};

chatbotRouter.post("/api/chatbot", (req, res) => {
  const { message } = req.body ?? {};
  const intent = parseIntent(message ?? "");
  res.json(intent);
});

chatbotRouter.post("/api/chatbot/intents", async (req, res, next) => {
  try {
    const parsed = actionRequestSchema.parse(req.body ?? {});
    const handler = actionHandlers[parsed.intent as ActionableIntent];
    if (!handler) {
      throw new HttpError(400, `Unsupported intent '${parsed.intent}'`);
    }
    const result = await handler(req, parsed);
    res.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return next(error);
    }
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid intent payload", error.errors));
    }
    next(new HttpError(500, "Failed to process intent", undefined, "chatbotIntentError"));
  }
});

chatbotRouter.get("/api/chatbot/knowledge", async (req, res, next) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limitRaw = typeof req.query.limit === "string" ? req.query.limit : undefined;
    const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 5, 1), 10) : 5;
    if (!query) {
      res.json({ results: [] });
      return;
    }
    const results = await chatbotKnowledgeIndex.search(query, limit);
    res.json({ results });
  } catch (error) {
    next(new HttpError(500, "Failed to search knowledge base"));
  }
});

chatbotRouter.get(
  "/api/chatbot/employee-summary/:id",
  requireRole(["admin", "hr"]),
  async (req, res, next) => {
    try {
      const employee = await storage.getEmployee(req.params.id);
      if (!employee) return next(new HttpError(404, "Employee not found"));

      // Assets assigned
      const assets = (await assetService.getAssignments()).filter(
        (a) => a.employeeId === req.params.id && a.status === "active",
      );
      const cars = (await storage.getCarAssignments()).filter(a => a.employeeId === req.params.id && a.status === 'active');

      // Loans summary and forecast
      const loans = (await storage.getLoans()).filter(l => l.employeeId === req.params.id);
      const totalTaken = loans.reduce((s, l) => s + Number(l.amount || 0), 0);
      const remaining = loans.reduce((s, l) => s + Number(l.remainingAmount || 0), 0);
      const monthly = loans.filter(l => l.status === 'active' || l.status === 'approved').reduce((s, l) => s + Number(l.monthlyDeduction || 0), 0);
      const forecasts = loans.filter(l => (Number(l.monthlyDeduction) > 0) && (Number(l.remainingAmount) > 0) && (l.status === 'active' || l.status === 'approved')).map(l => {
        const months = Math.ceil(Number(l.remainingAmount) / Number(l.monthlyDeduction));
        const finish = addMonths(new Date(), months);
        return { id: l.id, months, finishDate: format(finish, 'yyyy-MM') };
      });
      const completionDate = forecasts.length ? forecasts.reduce((latest, f) => latest > f.finishDate ? latest : f.finishDate, forecasts[0].finishDate) : null;

      res.json({
        employee,
        assets: assets.map(a => ({ id: a.assetId, name: a.asset?.name, assignedDate: a.assignedDate })),
        car: cars[0] ? { id: cars[0].carId, plateNumber: cars[0].car?.plateNumber, assignedDate: cars[0].assignedDate } : null,
        loans: {
          totalTaken,
          remaining,
          monthly,
          forecasts,
          completionDate,
        },
      });
    } catch (err) {
      next(new HttpError(500, "Failed to fetch employee summary"));
    }
  }
);

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
      next(
        new HttpError(500, "Failed to fetch loan status", undefined, "loanStatusFetchError"),
      );
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
      next(
        new HttpError(500, "Failed to fetch report summary", undefined, "reportSummaryFetchError"),
      );
    }
  }
);

chatbotRouter.get(
  "/api/chatbot/monthly-summary/:employeeId",
  requireRole(["admin", "hr", "employee"]),
  async (req, res, next) => {
    const start = process.hrtime.bigint();
    const { employeeId } = req.params;
    const user = req.user as Express.User & { role?: string; id?: string };
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
      return next(
        new HttpError(400, "Invalid employeeId", undefined, "monthlySummaryInvalidEmployeeId"),
      );
    }

    if (user.role !== "admin" && user.role !== "hr" && user.id !== employeeId) {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      chatbotMonthlySummaryRequestsTotal.inc({ status: "error" });
      log(
        JSON.stringify({
          route: "chatbot/monthly-summary",
          employeeId,
          status: "error",
          error: "Forbidden",
          durationMs,
        }),
        "chatbot",
      );
      return next(
        new HttpError(403, "Forbidden", undefined, "monthlySummaryForbidden"),
      );
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
      next(
        new HttpError(500, "Failed to fetch monthly summary", undefined, "monthlySummaryFetchError"),
      );
    }
  },
);
