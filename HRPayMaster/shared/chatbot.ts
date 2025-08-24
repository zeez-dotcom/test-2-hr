import { addDays, addMonths, format, nextFriday, parse, isValid, startOfMonth } from "date-fns";

// Supported intents the chatbot can understand
export type ChatIntent =
  | "addBonus"
  | "addDeduction"
  | "requestVacation"
  | "runPayroll"
  | "help"
  | "unknown";

export interface ParsedIntent {
  type: ChatIntent;
}

export function parseIntent(message: string): ParsedIntent {
  const lower = message.toLowerCase();

  if (lower.includes("bonus")) {
    return { type: "addBonus" };
  }

  if (lower.includes("deduct") || lower.includes("deduction")) {
    return { type: "addDeduction" };
  }

  if (lower.includes("vacation")) {
    return { type: "requestVacation" };
  }

  if (lower.includes("payroll")) {
    return { type: "runPayroll" };
  }

  if (lower.includes("help")) {
    return { type: "help" };
  }

  return { type: "unknown" };
}

export function resolveDate(input: string, ref: Date = new Date()): string {
  const lower = input.toLowerCase().trim();
  if (lower === "today") return format(ref, "yyyy-MM-dd");
  if (lower === "tomorrow") return format(addDays(ref, 1), "yyyy-MM-dd");
  if (lower === "this month") return format(startOfMonth(ref), "yyyy-MM-dd");
  if (lower === "next month")
    return format(startOfMonth(addMonths(ref, 1)), "yyyy-MM-dd");
  if (lower === "next friday") return format(nextFriday(ref), "yyyy-MM-dd");
  const parsed = parse(lower, "yyyy-MM-dd", ref);
  if (isValid(parsed)) return format(parsed, "yyyy-MM-dd");
  return format(ref, "yyyy-MM-dd");
}
