import { describe, it, expect } from "vitest";
import { formatAllowanceLabel, summarizeAllowances } from "./utils";

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
