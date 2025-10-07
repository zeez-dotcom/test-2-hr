import { Router } from "express";
import { HttpError } from "../errorHandler";
import { storage } from "../storage";
import { insertLoanSchema } from "@shared/schema";
import { z } from "zod";
import { requireRole } from "./auth";

export const loansRouter = Router();

loansRouter.get("/", async (req, res, next) => {
  try {
    const loans = await storage.getLoans();
    res.json(loans);
  } catch (error) {
    console.error("Failed to fetch loans:", error);
    next(new HttpError(500, "Failed to fetch loans", error));
  }
});

loansRouter.get("/:id", async (req, res, next) => {
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

loansRouter.post("/", requireRole(["admin", "hr"]), async (req, res, next) => {
  try {
    req.body.remainingAmount ??= req.body.amount;
    req.body.status ??= "pending";
    const loan = insertLoanSchema.parse(req.body);
    const newLoan = await storage.createLoan(loan);
    // Log event
    try {
      await storage.createEmployeeEvent({
        employeeId: newLoan.employeeId,
        eventType: 'employee_update',
        title: `Loan created (${newLoan.amount})`,
        description: `Loan created with monthly deduction ${newLoan.monthlyDeduction}`,
        amount: '0',
        eventDate: new Date().toISOString().split('T')[0],
        affectsPayroll: true,
        recurrenceType: 'none',
      });
    } catch {}
    res.status(201).json(newLoan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid loan data", error.errors));
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Failed to create loan:", err);
    next(new HttpError(500, "Failed to create loan", err));
  }
});

loansRouter.put("/:id", requireRole(["admin", "hr"]), async (req, res, next) => {
  try {
    const updates = insertLoanSchema.partial().parse(req.body);
    const updatedLoan = await storage.updateLoan(req.params.id, updates);
    if (!updatedLoan) {
      return next(new HttpError(404, "Loan not found"));
    }
    // Log event
    try {
      await storage.createEmployeeEvent({
        employeeId: updatedLoan.employeeId,
        eventType: 'employee_update',
        title: `Loan updated`,
        description: `Loan updated for employee`,
        amount: '0',
        eventDate: new Date().toISOString().split('T')[0],
        affectsPayroll: true,
        recurrenceType: 'none',
      });
    } catch {}
    res.json(updatedLoan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid loan data", error.errors));
    }
    console.error("Failed to update loan:", error);
    next(new HttpError(500, "Failed to update loan", error));
  }
});

loansRouter.delete("/:id", requireRole(["admin", "hr"]), async (req, res, next) => {
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
    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete loan:", error);
    next(new HttpError(500, "Failed to delete loan", error));
  }
});
