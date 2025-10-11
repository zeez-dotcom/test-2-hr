import { Router, type Request } from "express";
import { HttpError } from "../errorHandler";
import { storage } from "../storage";
import {
  insertLoanSchema,
  loanApprovalStageInputSchema,
  loanDocumentInputSchema,
} from "@shared/schema";
import { z } from "zod";
import { requirePermission } from "./auth";
import type { SessionUser } from "@shared/schema";
import {
  generateAmortizationSchedule,
  mapScheduleToInsert,
  validateLoanPolicies,
} from "../utils/loans";

export const loansRouter = Router();

const loanCreateSchema = insertLoanSchema.extend({
  approvalStages: z.array(loanApprovalStageInputSchema).optional(),
  documents: z
    .array(loanDocumentInputSchema.omit({ id: true, remove: true }))
    .optional(),
});

const loanStageStatusUpdateSchema = z.object({
  id: z.string().min(1),
  status: z
    .enum(["pending", "approved", "rejected", "delegated", "skipped"])
    .optional(),
  notes: z.string().optional(),
  actedAt: z.string().optional(),
});

const loanUpdateSchema = insertLoanSchema.partial().extend({
  approvalStages: z.array(loanApprovalStageInputSchema).optional(),
  stageUpdates: z.array(loanStageStatusUpdateSchema).optional(),
  documents: z.array(loanDocumentInputSchema).optional(),
  regenerateSchedule: z.boolean().optional(),
  policyCheckOnly: z.boolean().optional(),
});

const toNumber = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
};

const logLoanAudit = async (
  req: Request,
  eventType: string,
  summary: string,
  loanId: string,
  metadata?: Record<string, unknown>,
) => {
  const actorId = (req.user as SessionUser | undefined)?.id;
  if (!actorId) return;
  try {
    await storage.logSecurityEvent({
      actorId,
      eventType,
      entityType: "loan",
      entityId: loanId,
      summary,
      metadata: metadata ?? null,
    });
  } catch (error) {
    console.error("Failed to log loan audit event", error);
  }
};

loansRouter.get("/", requirePermission("loans:view"), async (req, res, next) => {
  try {
    const loans = await storage.getLoans();
    res.json(loans);
  } catch (error) {
    console.error("Failed to fetch loans:", error);
    next(new HttpError(500, "Failed to fetch loans", error));
  }
});

loansRouter.get("/:id", requirePermission("loans:view"), async (req, res, next) => {
  try {
    const loan = await storage.getLoan(req.params.id);
    if (!loan) {
      return next(new HttpError(404, "Loan not found"));
    }
    res.json(loan);
  } catch (error) {
    console.error("Failed to fetch loan:", error);
    next(new HttpError(500, "Failed to fetch loan", error));
  }
});

loansRouter.get(
  "/:id/statement",
  requirePermission("loans:view"),
  async (req, res, next) => {
  try {
    const statement = await storage.getLoanStatement(req.params.id);
    if (!statement) {
      return next(new HttpError(404, "Loan not found"));
    }
    res.json(statement);
  } catch (error) {
    console.error("Failed to generate loan statement:", error);
    next(new HttpError(500, "Failed to generate loan statement", error));
  }
});

loansRouter.post("/", requirePermission("loans:manage"), async (req, res, next) => {
  try {
    const payload = loanCreateSchema.parse({
      ...req.body,
      remainingAmount: req.body.remainingAmount ?? req.body.amount,
      status: req.body.status ?? "pending",
    });

    const { approvalStages, documents, ...loanInput } = payload;

    const newLoan = await storage.createLoan(loanInput);

    if (approvalStages && approvalStages.length > 0) {
      await storage.setLoanApprovalStages(
        newLoan.id,
        approvalStages.map(stage => ({ ...stage, loanId: newLoan.id })),
      );
    }

    if (documents && documents.length > 0) {
      await Promise.all(
        documents.map(doc =>
          storage.createLoanDocument({
            ...doc,
            loanId: newLoan.id,
            uploadedBy: doc.uploadedBy ?? undefined,
          }),
        ),
      );
    }

    const scheduleEntries = generateAmortizationSchedule({
      amount: toNumber(newLoan.amount),
      monthlyPayment: toNumber(newLoan.monthlyDeduction),
      interestRate: toNumber(newLoan.interestRate),
      startDate: newLoan.startDate,
      endDate: newLoan.endDate ?? undefined,
    });

    const scheduleInsert = mapScheduleToInsert(newLoan.id, scheduleEntries);
    if (scheduleInsert.length > 0) {
      await storage.replaceLoanAmortizationSchedule(newLoan.id, scheduleInsert, {
        preservePaid: false,
      });
    }

    const [loanDetails, stages, docs, schedule] = await Promise.all([
      storage.getLoan(newLoan.id),
      storage.getLoanApprovalStages(newLoan.id),
      storage.getLoanDocuments(newLoan.id),
      storage.getLoanAmortizationSchedule(newLoan.id),
    ]);

    if (!loanDetails) {
      throw new Error("Loan not found after creation");
    }

    const employee = await storage.getEmployee(loanDetails.employeeId);

    const policyResult = validateLoanPolicies({
      loan: loanDetails,
      approvalStages: stages,
      documents: docs,
      existingSchedule: schedule,
      employeeSalary: employee ? toNumber(employee.salary) : undefined,
      strict: false,
    });

    await storage.updateLoan(newLoan.id, {
      approvalState: stages.length > 0 ? "in_review" : loanDetails.approvalState,
      policyMetadata: {
        lastCheckedAt: new Date().toISOString(),
        violations: policyResult.violations,
        warnings: policyResult.warnings,
      } as any,
    });

    const enrichedLoan = await storage.getLoan(newLoan.id);

    // Log event
    try {
      await storage.createEmployeeEvent({
        employeeId: newLoan.employeeId,
        eventType: "employee_update",
        title: `Loan created (${newLoan.amount})`,
        description: `Loan created with monthly deduction ${newLoan.monthlyDeduction}`,
        amount: "0",
        eventDate: new Date().toISOString().split("T")[0],
        affectsPayroll: true,
        recurrenceType: "none",
      });
    } catch {}

    await logLoanAudit(
      req,
      "loan_change",
      "Created loan",
      newLoan.id,
      {
        employeeId: newLoan.employeeId,
        amount: newLoan.amount,
        status: newLoan.status,
      },
    );

    res.status(201).json({ loan: enrichedLoan, policy: policyResult });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid loan data", error.errors));
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Failed to create loan:", err);
    next(new HttpError(500, "Failed to create loan", err));
  }
});

loansRouter.put("/:id", requirePermission(["loans:manage", "loans:approve"]), async (req, res, next) => {
  try {
    const loanId = req.params.id;
    const existingLoan = await storage.getLoan(loanId);
    if (!existingLoan) {
      return next(new HttpError(404, "Loan not found"));
    }

    const previousApprovalState = existingLoan.approvalState;
    const approvedStageIds: string[] = [];
    const rejectedStageIds: string[] = [];

    const payload = loanUpdateSchema.parse(req.body);
    const {
      approvalStages,
      stageUpdates,
      documents,
      regenerateSchedule,
      policyCheckOnly,
      ...loanUpdates
    } = payload;

    if (approvalStages) {
      await storage.setLoanApprovalStages(
        loanId,
        approvalStages.map(stage => ({ ...stage, loanId })),
      );
    }

    if (stageUpdates) {
      for (const stage of stageUpdates) {
        await storage.updateLoanApprovalStage(stage.id, {
          status: stage.status,
          notes: stage.notes,
          actedAt: stage.actedAt,
        });
        if (stage.status === "approved") {
          approvedStageIds.push(stage.id);
        }
        if (stage.status === "rejected") {
          rejectedStageIds.push(stage.id);
        }
      }

      if (approvedStageIds.length > 0) {
        await logLoanAudit(req, "loan_approval", "Loan stage approved", loanId, {
          stageIds: approvedStageIds,
        });
      }
      if (rejectedStageIds.length > 0) {
        await logLoanAudit(req, "loan_approval", "Loan stage rejected", loanId, {
          stageIds: rejectedStageIds,
        });
      }
    }

    if (documents) {
      const docsToCreate = documents.filter(doc => !doc.remove && !doc.id);
      const docsToRemove = documents.filter(doc => doc.remove && doc.id);

      if (docsToCreate.length > 0) {
        await Promise.all(
          docsToCreate.map(doc =>
            storage.createLoanDocument({
              ...doc,
              loanId,
              uploadedBy: doc.uploadedBy ?? undefined,
            }),
          ),
        );
      }

      if (docsToRemove.length > 0) {
        await Promise.all(docsToRemove.map(doc => storage.deleteLoanDocument(doc.id!)));
      }
    }

    const updatedStages = await storage.getLoanApprovalStages(loanId);
    const updatedDocuments = await storage.getLoanDocuments(loanId);
    const currentSchedule = await storage.getLoanAmortizationSchedule(loanId);

    const nextStatus = loanUpdates.status ?? existingLoan.status;

    const amountForSchedule = toNumber(loanUpdates.amount ?? existingLoan.amount);
    const monthlyPaymentForSchedule = toNumber(
      loanUpdates.monthlyDeduction ?? existingLoan.monthlyDeduction,
    );
    const interestRateForSchedule = toNumber(
      loanUpdates.interestRate ?? existingLoan.interestRate,
    );
    const startDateForSchedule = loanUpdates.startDate ?? existingLoan.startDate;
    const endDateForSchedule = loanUpdates.endDate ?? existingLoan.endDate ?? undefined;

    const needsScheduleUpdate = Boolean(
      regenerateSchedule ||
        loanUpdates.amount !== undefined ||
        loanUpdates.monthlyDeduction !== undefined ||
        loanUpdates.interestRate !== undefined ||
        loanUpdates.startDate !== undefined ||
        loanUpdates.endDate !== undefined,
    );

    let generatedScheduleInsert:
      | ReturnType<typeof mapScheduleToInsert>
      | undefined;

    if (needsScheduleUpdate) {
      const generated = generateAmortizationSchedule({
        amount: amountForSchedule,
        monthlyPayment: monthlyPaymentForSchedule,
        interestRate: interestRateForSchedule,
        startDate: startDateForSchedule,
        endDate: endDateForSchedule,
      });
      generatedScheduleInsert = mapScheduleToInsert(loanId, generated);
    }

    const employee = await storage.getEmployee(existingLoan.employeeId);

    const scheduleForValidation = generatedScheduleInsert
      ? (generatedScheduleInsert as unknown as any[])
      : currentSchedule;

    const policyResult = validateLoanPolicies({
      loan: { ...existingLoan, ...loanUpdates, status: nextStatus } as any,
      approvalStages: updatedStages,
      documents: updatedDocuments,
      existingSchedule: scheduleForValidation as any,
      employeeSalary: employee ? toNumber(employee.salary) : undefined,
      strict: nextStatus === "active",
    });

    if (policyResult.violations.length > 0 && nextStatus === "active") {
      return next(
        new HttpError(
          409,
          policyResult.violations.join(" ") || "Loan policy validation failed",
        ),
      );
    }

    if (Object.keys(loanUpdates).length > 0) {
      await storage.updateLoan(loanId, loanUpdates);
    }

    if (generatedScheduleInsert) {
      await storage.replaceLoanAmortizationSchedule(loanId, generatedScheduleInsert);
    }

    const approvalState = updatedStages.length === 0
      ? existingLoan.approvalState
      : updatedStages.every(stage => stage.status === "approved")
      ? "approved"
      : updatedStages.some(stage => stage.status === "rejected")
      ? "rejected"
      : "in_review";

    await storage.updateLoan(loanId, {
      approvalState,
      policyMetadata: {
        lastCheckedAt: new Date().toISOString(),
        violations: policyResult.violations,
        warnings: policyResult.warnings,
      } as any,
    });

    if (previousApprovalState !== approvalState) {
      await logLoanAudit(req, "loan_approval", "Loan approval state updated", loanId, {
        previousApprovalState,
        approvalState,
      });
    }

    const finalLoan = await storage.getLoan(loanId);

    if (!finalLoan) {
      throw new Error("Loan not found after update");
    }

    if (!policyCheckOnly) {
      try {
        await storage.createEmployeeEvent({
          employeeId: finalLoan.employeeId,
          eventType: "employee_update",
          title: "Loan updated",
          description: "Loan details updated",
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: true,
          recurrenceType: "none",
        });
      } catch {}
    }

    await logLoanAudit(
      req,
      "loan_change",
      "Updated loan",
      loanId,
      {
        updatedFields: Object.keys(loanUpdates),
        stageUpdates: stageUpdates?.map(stage => ({ id: stage.id, status: stage.status })),
        approvalState,
        regenerateSchedule: Boolean(regenerateSchedule),
      },
    );

    res.json({ loan: finalLoan, policy: policyResult });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid loan data", error.errors));
    }
    console.error("Failed to update loan:", error);
    next(new HttpError(500, "Failed to update loan", error));
  }
});

loansRouter.delete("/:id", requirePermission("loans:manage"), async (req, res, next) => {
  try {
    const loan = await storage.getLoan(req.params.id);
    const deleted = await storage.deleteLoan(req.params.id);
    if (!deleted) {
      return next(new HttpError(404, "Loan not found"));
    }
    try {
      if (loan) {
        await storage.createEmployeeEvent({
          employeeId: loan.employeeId,
          eventType: 'employee_update',
          title: `Loan deleted`,
          description: `Loan was deleted`,
          amount: '0',
          eventDate: new Date().toISOString().split('T')[0],
          affectsPayroll: false,
          recurrenceType: 'none',
        });
      }
    } catch {}
    await logLoanAudit(
      req,
      "loan_change",
      "Deleted loan",
      req.params.id,
      loan ? { employeeId: loan.employeeId } : undefined,
    );
    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete loan:", error);
    next(new HttpError(500, "Failed to delete loan", error));
  }
});
