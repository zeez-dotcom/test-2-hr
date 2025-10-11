import {
  type InsertLoan,
  type Loan,
  type LoanApprovalStage,
  type LoanAmortizationScheduleEntry,
  type LoanDocument,
} from "@shared/schema";

const toNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return 0;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== day) {
    result.setDate(0);
  }
  return result;
};

export interface AmortizationScheduleInput {
  amount: number;
  interestRate?: number | null;
  monthlyPayment: number;
  startDate: string | Date;
  endDate?: string | Date | null;
}

export interface GeneratedScheduleEntry {
  installmentNumber: number;
  dueDate: string;
  principalAmount: number;
  interestAmount: number;
  paymentAmount: number;
  remainingBalance: number;
}

export const generateAmortizationSchedule = (
  input: AmortizationScheduleInput,
): GeneratedScheduleEntry[] => {
  const principal = Math.max(0, Number(input.amount || 0));
  const monthlyPayment = Math.max(0, Number(input.monthlyPayment || 0));
  const annualRate = Number(input.interestRate || 0);
  const monthlyRate = annualRate > 0 ? annualRate / 12 / 100 : 0;
  if (principal <= 0 || monthlyPayment <= 0) {
    return [];
  }

  const schedule: GeneratedScheduleEntry[] = [];
  let balance = principal;
  let installment = 1;
  const start = new Date(input.startDate);
  if (Number.isNaN(start.getTime())) {
    return [];
  }
  const endDate = input.endDate ? new Date(input.endDate) : undefined;

  const maxInstallments = 600; // 50 years of monthly payments as hard cap

  while (balance > 0.01 && installment <= maxInstallments) {
    const dueDate = addMonths(start, installment - 1);
    if (endDate && dueDate > endDate) {
      // If a hard end date is provided, finish with a balloon payment
      const interestPortion = monthlyRate > 0 ? balance * monthlyRate : 0;
      const principalPortion = balance;
      const totalPayment = principalPortion + interestPortion;
      schedule.push({
        installmentNumber: installment,
        dueDate: dueDate.toISOString().split("T")[0],
        principalAmount: Number(principalPortion.toFixed(2)),
        interestAmount: Number(interestPortion.toFixed(2)),
        paymentAmount: Number(totalPayment.toFixed(2)),
        remainingBalance: 0,
      });
      balance = 0;
      break;
    }

    const interestPortion = monthlyRate > 0 ? balance * monthlyRate : 0;
    let principalPortion = monthlyPayment - interestPortion;
    if (principalPortion <= 0) {
      throw new Error(
        "Monthly payment is insufficient to cover interest; adjust policy or payment amount.",
      );
    }

    if (principalPortion > balance) {
      principalPortion = balance;
    }

    const totalPayment = principalPortion + interestPortion;
    balance = Math.max(0, balance - principalPortion);

    schedule.push({
      installmentNumber: installment,
      dueDate: dueDate.toISOString().split("T")[0],
      principalAmount: Number(principalPortion.toFixed(2)),
      interestAmount: Number(interestPortion.toFixed(2)),
      paymentAmount: Number(totalPayment.toFixed(2)),
      remainingBalance: Number(balance.toFixed(2)),
    });

    installment += 1;

    if (balance <= 0.01) {
      balance = 0;
      break;
    }
  }

  return schedule;
};

export interface LoanPolicyValidationContext {
  loan: Pick<Loan | InsertLoan, "amount" | "monthlyDeduction" | "interestRate" | "startDate" | "endDate" | "status"> & {
    approvalState?: string | null;
  };
  approvalStages?: LoanApprovalStage[];
  documents?: LoanDocument[];
  employeeSalary?: number | null;
  existingSchedule?: LoanAmortizationScheduleEntry[];
  strict?: boolean;
}

export interface LoanPolicyValidationResult {
  isCompliant: boolean;
  violations: string[];
  warnings: string[];
}

export const validateLoanPolicies = (
  context: LoanPolicyValidationContext,
): LoanPolicyValidationResult => {
  const violations: string[] = [];
  const warnings: string[] = [];

  const amount = toNumber(context.loan.amount);
  const payment = toNumber(context.loan.monthlyDeduction);
  const rate = Number(context.loan.interestRate ?? 0);

  if (amount <= 0) {
    violations.push("Loan amount must be greater than zero.");
  }
  if (payment <= 0) {
    violations.push("Monthly deduction must be greater than zero.");
  }

  const start = new Date(context.loan.startDate as string);
  const end = context.loan.endDate ? new Date(context.loan.endDate as string) : undefined;
  if (end && start > end) {
    violations.push("Start date must be before the end date.");
  }

  if (rate > 0 && payment <= amount * (rate / 12 / 100)) {
    violations.push(
      "Monthly deduction must exceed the interest portion to reduce principal.",
    );
  }

  if (context.employeeSalary !== undefined && context.employeeSalary !== null) {
    const salary = Number(context.employeeSalary);
    if (Number.isFinite(salary) && salary > 0) {
      const ratio = payment / salary;
      if (ratio > 0.5) {
        violations.push("Monthly deduction exceeds 50% of employee salary.");
      } else if (ratio > 0.35) {
        warnings.push("Monthly deduction exceeds 35% of employee salary.");
      }
    }
  }

  const strict = Boolean(context.strict);
  if (strict) {
    const approvalStages = context.approvalStages ?? [];
    const pendingStage = approvalStages.find(stage => stage.status !== "approved");
    if (pendingStage) {
      violations.push(
        `Approval stage "${pendingStage.stageName}" is not approved (${pendingStage.status}).`,
      );
    }

    const documents = context.documents ?? [];
    if (documents.length === 0) {
      violations.push("At least one supporting document must be uploaded before activation.");
    }
  }

  if (context.existingSchedule && context.existingSchedule.length > 0) {
    const totalScheduled = context.existingSchedule.reduce((sum, entry) => {
      return sum + toNumber(entry.paymentAmount);
    }, 0);
    if (totalScheduled + 0.01 < amount) {
      warnings.push("Amortization schedule does not cover the full loan amount.");
    }
  }

  return {
    isCompliant: violations.length === 0,
    violations,
    warnings,
  };
};

export const shouldPauseLoanForLeave = ({
  vacations,
  start,
  end,
}: {
  vacations: Array<{ startDate: string; endDate: string; status: string; reason?: string | null }>;
  start: Date;
  end: Date;
}): boolean => {
  return vacations.some(vacation => {
    if (vacation.status !== "approved") {
      return false;
    }
    const vacStart = new Date(vacation.startDate);
    const vacEnd = new Date(vacation.endDate);
    if (Number.isNaN(vacStart.getTime()) || Number.isNaN(vacEnd.getTime())) {
      return false;
    }
    const overlaps = vacStart <= end && vacEnd >= start;
    const wantsPause = String(vacation.reason ?? "").includes("[pause-loans]");
    return overlaps && wantsPause;
  });
};

export const mapScheduleToInsert = (
  loanId: string,
  entries: GeneratedScheduleEntry[],
): Array<{
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  principalAmount: number;
  interestAmount: number;
  paymentAmount: number;
  remainingBalance: number;
}> =>
  entries.map(entry => ({
    loanId,
    installmentNumber: entry.installmentNumber,
    dueDate: entry.dueDate,
    principalAmount: entry.principalAmount,
    interestAmount: entry.interestAmount,
    paymentAmount: entry.paymentAmount,
    remainingBalance: entry.remainingBalance,
  }));

