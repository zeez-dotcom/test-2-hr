import { addDays, addMonths, format, nextFriday, parse, isValid, startOfMonth } from "date-fns";

// Supported intents the chatbot can understand
export type ChatIntent =
  | "addBonus"
  | "addDeduction"
  | "requestVacation"
  | "cancelVacation"
  | "changeVacation"
  | "assignAsset"
  | "assignCar"
  | "returnCar"
  | "assetDocument"
  | "employeeDocuments"
  | "returnAsset"
  | "runPayroll"
  | "help"
  | "loanStatus"
  | "reportSummary"
  | "monthlySummary"
  | "employeeInfo"
  | "createLoan"
  | "updateLoan"
  | "updateEmployee"
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
  if (lower.includes("cancel") && lower.includes("vacation")) {
    return { type: "cancelVacation" };
  }
  if (lower.includes("change") && lower.includes("vacation")) {
    return { type: "changeVacation" };
  }

  if (lower.includes("assign") && lower.includes("asset")) {
    return { type: "assignAsset" };
  }
  if ((lower.includes("upload") || lower.includes("document")) && lower.includes("asset")) {
    return { type: "assetDocument" };
  }
  if ((lower.includes("return") || lower.includes("handover")) && lower.includes("asset")) {
    return { type: "returnAsset" };
  }
  if (lower.includes("assign") && lower.includes("car")) {
    return { type: "assignCar" };
  }
  if ((lower.includes("return") || lower.includes("handover")) && lower.includes("car")) {
    return { type: "returnCar" };
  }

  if (lower.includes("payroll")) {
    return { type: "runPayroll" };
  }

  if (lower.includes("loan")) {
    return { type: "loanStatus" };
  }

  if (
    (lower.includes("current month") || lower.includes("monthly")) &&
    lower.includes("summary")
  ) {
    return { type: "monthlySummary" };
  }

  if (lower.includes("report") || lower.includes("summary")) {
    return { type: "reportSummary" };
  }

  if (lower.includes("info") || lower.includes("profile") || lower.includes("details")) {
    return { type: "employeeInfo" };
  }

  if (lower.includes("help")) {
    return { type: "help" };
  }

  if (lower.includes("create") && lower.includes("loan")) {
    return { type: "createLoan" };
  }
  if (lower.includes("update") && lower.includes("loan")) {
    return { type: "updateLoan" };
  }
  if (lower.includes("update") && (lower.includes("employee") || lower.includes("profile") || lower.includes("field"))) {
    return { type: "updateEmployee" };
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
