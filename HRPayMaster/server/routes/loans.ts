import { Router } from "express";
import { HttpError } from "../errorHandler";
import { storage } from "../storage";
import { insertLoanSchema } from "@shared/schema";
import { z } from "zod";
import { parseNumber } from "../utils/normalize";

export const loansRouter = Router();

loansRouter.get("/", async (req, res, next) => {
  try {
    const loans = await storage.getLoans();
    res.json(loans);
  } catch (error) {
    next(new HttpError(500, "Failed to fetch loans"));
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
    next(new HttpError(500, "Failed to fetch loan"));
  }
});

loansRouter.post("/", async (req, res, next) => {
  try {
    const parsedAmount = parseNumber(req.body.amount);
    if (parsedAmount !== undefined) {
      req.body.amount = parsedAmount.toString();
    }
    req.body.remainingAmount ??= req.body.amount;
    req.body.status ??= "pending";
    const loan = insertLoanSchema.parse(req.body);
    const newLoan = await storage.createLoan(loan);
    res.status(201).json(newLoan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid loan data", error.errors));
    }
    next(new HttpError(500, "Failed to create loan"));
  }
});

loansRouter.put("/:id", async (req, res, next) => {
  try {
    const updates = insertLoanSchema.partial().parse(req.body);
    const updatedLoan = await storage.updateLoan(req.params.id, updates);
    if (!updatedLoan) {
      return next(new HttpError(404, "Loan not found"));
    }
    res.json(updatedLoan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new HttpError(400, "Invalid loan data", error.errors));
    }
    next(new HttpError(500, "Failed to update loan"));
  }
});

loansRouter.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await storage.deleteLoan(req.params.id);
    if (!deleted) {
      return next(new HttpError(404, "Loan not found"));
    }
    res.status(204).send();
  } catch (error) {
    next(new HttpError(500, "Failed to delete loan"));
  }
});

