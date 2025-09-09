import { describe, it, expect } from "vitest";
import { z } from "zod";
import { insertLoanSchema } from "@shared/schema";

// replicate form schema from loans page
const loanSchema = insertLoanSchema
  .omit({ remainingAmount: true })
  .extend({
    amount: z.coerce.number().positive(),
    monthlyDeduction: z.coerce.number().positive(),
  })
  .refine((d) => d.monthlyDeduction <= d.amount, {
    path: ["monthlyDeduction"],
    message: "Monthly deduction must be ≤ amount",
  });

describe("loan schema", () => {
  it("coerces numeric strings to numbers", () => {
    const parsed = loanSchema.parse({
      employeeId: "1",
      amount: "1000",
      monthlyDeduction: "200",
      startDate: "2024-01-01",
    });
    expect(parsed.amount).toBe(1000);
    expect(parsed.monthlyDeduction).toBe(200);
  });

  it("enforces monthly deduction not exceeding amount", () => {
    const result = loanSchema.safeParse({
      employeeId: "1",
      amount: "500",
      monthlyDeduction: "600",
      startDate: "2024-01-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["monthlyDeduction"]);
    }
  });

  it("allows monthly deduction equal to amount", () => {
    const parsed = loanSchema.parse({
      employeeId: "1",
      amount: "500",
      monthlyDeduction: "500",
      startDate: "2024-01-01",
    });
    expect(parsed.monthlyDeduction).toBe(500);
  });
});
