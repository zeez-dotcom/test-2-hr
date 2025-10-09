import { describe, it, expect } from "vitest";
import {
  formatAllowanceLabel,
  summarizeAllowances,
  formatAllowanceSummaryForCsv,
  formatCurrency,
} from "./utils";

describe("formatAllowanceLabel", () => {
  it("capitalizes words and appends allowance when missing", () => {
    expect(formatAllowanceLabel("housing")).toBe("Housing Allowance");
    expect(formatAllowanceLabel("transport_stipend")).toBe("Transport Stipend Allowance");
  });

  it("preserves existing allowance suffix", () => {
    expect(formatAllowanceLabel("food_allowance")).toBe("Food Allowance");
  });

  it("handles camelCase and empty values", () => {
    expect(formatAllowanceLabel("medicalAllowance")).toBe("Medical Allowance");
    expect(formatAllowanceLabel("")).toBe("Allowance");
  });
});

describe("summarizeAllowances", () => {
  it("returns formatted entries and totals while ignoring zero amounts", () => {
    const { total, entries } = summarizeAllowances({
      housing: 150,
      travel_bonus: "50",
      zero_value: 0,
      invalid: "not-a-number",
    });

    expect(total).toBe(200);
    expect(entries).toEqual([
      { key: "housing", label: "Housing Allowance", amount: 150 },
      { key: "travel_bonus", label: "Travel Bonus Allowance", amount: 50 },
    ]);
  });

  it("returns empty summary when no allowances exist", () => {
    const summary = summarizeAllowances(null);

    expect(summary.total).toBe(0);
    expect(summary.entries).toHaveLength(0);
  });
});

describe("formatAllowanceSummaryForCsv", () => {
  it("returns a semi-colon separated summary with total when multiple allowances exist", () => {
    const csvValue = formatAllowanceSummaryForCsv({
      housing: 100,
      food_allowance: 25,
    });

    expect(csvValue).toBe(
      [
        `Total: ${formatCurrency(125)}`,
        `Housing Allowance: ${formatCurrency(100)}`,
        `Food Allowance: ${formatCurrency(25)}`,
      ].join("; "),
    );
  });

  it("returns label-value pairs without total when a single allowance exists", () => {
    const csvValue = formatAllowanceSummaryForCsv({
      transport: "50",
    });

    expect(csvValue).toBe(`Transport Allowance: ${formatCurrency(50)}`);
  });

  it("returns an empty string when no allowances are provided", () => {
    expect(formatAllowanceSummaryForCsv(null)).toBe("");
  });
});
