export interface DeductionsConfig {
  taxDeduction?: number;
  socialSecurityDeduction?: number;
  healthInsuranceDeduction?: number;
}

export interface Employee {
  id: string;
  salary: string;
  status: string;
}

export interface Loan {
  id?: string;
  employeeId: string;
  status: string;
  remainingAmount: string;
  monthlyDeduction: string;
}

export interface VacationRequest {
  id?: string;
  employeeId: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface EmployeeEvent {
  id?: string;
  employeeId: string;
  eventDate: string;
  eventType: string;
  affectsPayroll?: boolean | null;
  status: string;
  amount: string;
  title?: string;
  recurrenceType?: string | null;
  recurrenceEndDate?: string | null;
}

export interface PayrollCalculationOverrides {
  skippedVacationIds?: Set<string>;
  skippedLoanIds?: Set<string>;
  skippedEventIds?: Set<string>;
}

export interface EmployeePayroll {
  employeeId: string;
  grossPay: number;
  baseSalary: number;
  bonusAmount: number;
  allowances: Record<string, number>;
  workingDays: number;
  actualWorkingDays: number;
  vacationDays: number;
  taxDeduction: number;
  socialSecurityDeduction: number;
  healthInsuranceDeduction: number;
  loanDeduction: number;
  otherDeductions: number;
  netPay: number;
  adjustmentReason: string | null;
}

/**
 * Calculates payroll for a single employee.
 *
 * Assumes no automatic tax, social security or health insurance deductions
 * unless provided via the optional config.
 */
export function calculateEmployeePayroll({
  employee,
  loans,
  vacationRequests,
  employeeEvents,
  start,
  end,
  workingDays,
  attendanceDays,
  config,
  overrides,
}: {
  employee: Employee;
  loans: Loan[];
  vacationRequests: VacationRequest[];
  employeeEvents: EmployeeEvent[];
  start: Date;
  end: Date;
  workingDays: number;
  attendanceDays?: number;
  config?: DeductionsConfig;
  overrides?: PayrollCalculationOverrides;
}): EmployeePayroll {
  const monthlySalary = parseFloat(employee.salary);

  const skippedVacationIds = overrides?.skippedVacationIds;

  const employeeVacations = vacationRequests.filter(v =>
    v.employeeId === employee.id &&
    v.status === "approved" &&
    new Date(v.startDate) <= end &&
    new Date(v.endDate) >= start &&
    !(v.id && skippedVacationIds?.has(v.id))
  );

  const vacationDays = employeeVacations.reduce((total, vacation) => {
    const vacStart = new Date(Math.max(new Date(vacation.startDate).getTime(), start.getTime()));
    const vacEnd = new Date(Math.min(new Date(vacation.endDate).getTime(), end.getTime()));
    return total + Math.ceil((vacEnd.getTime() - vacStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, 0);

  const baseWorking = typeof attendanceDays === 'number' ? Math.min(workingDays, attendanceDays) : workingDays;
  const actualWorkingDays = Math.max(0, baseWorking - vacationDays);

  const baseSalary =
    employee.status === "active"
      ? (monthlySalary * actualWorkingDays) / workingDays
      : 0;

  const skippedLoanIds = overrides?.skippedLoanIds;

  const employeeLoans = loans.filter(l => {
    const isActive = l.status === "active" || l.status === "approved"; // tolerate legacy "approved"
    return (
      l.employeeId === employee.id &&
      isActive &&
      parseFloat(l.remainingAmount) > 0 &&
      !(l.id && skippedLoanIds?.has(l.id))
    );
  });

  const loanMismatches: string[] = [];

  const loanDeduction = employee.status === "active"
    ? employeeLoans.reduce((total, loan) => {
        const scheduledAmount = Number((loan as any).dueAmountForPeriod ?? 0);
        const remaining = parseFloat(loan.remainingAmount);
        const monthlyCap = parseFloat(loan.monthlyDeduction);
        const cappedAmount = Number.isFinite(monthlyCap) && monthlyCap > 0 ? monthlyCap : remaining;
        let effective = Math.min(cappedAmount, remaining);
        if (scheduledAmount > 0) {
          effective = Math.min(scheduledAmount, remaining, cappedAmount);
          if (Math.abs(scheduledAmount - cappedAmount) > 0.05) {
            loanMismatches.push(
              `${loan.id}: scheduled ${scheduledAmount.toFixed(2)} vs cap ${cappedAmount.toFixed(2)}`,
            );
          }
        }
        return total + (effective > 0 ? effective : 0);
      }, 0)
    : 0;

  const toDateOrUndefined = (value: string | null | undefined) => {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  const isWithinRange = (value: string | null | undefined) => {
    const date = toDateOrUndefined(value ?? undefined);
    if (!date) return false;
    return date >= start && date <= end;
  };

  const overlapsRange = (event: EmployeeEvent) => {
    const recurrenceStart = toDateOrUndefined(event.eventDate);
    if (!recurrenceStart) return false;
    if (recurrenceStart > end) return false;
    const recurrenceEnd = toDateOrUndefined(event.recurrenceEndDate ?? undefined);
    if (!recurrenceEnd) return true;
    return recurrenceEnd >= start;
  };

  const skippedEventIds = overrides?.skippedEventIds;

  const employeeEventsForEmployee = employeeEvents.filter(event =>
    event.employeeId === employee.id &&
    Boolean(event.affectsPayroll) &&
    event.status === "active" &&
    event.eventType !== "vacation" &&
    !(event.id && skippedEventIds?.has(event.id))
  );

  const employeeEventsInPeriod = employeeEventsForEmployee.filter(event =>
    isWithinRange(event.eventDate)
  );

  const allowances = new Map<string, number>();

  const addAllowance = (title: string | undefined, amount: number, shouldInclude: boolean) => {
    if (!shouldInclude) {
      return;
    }
    const normalizedTitle = normalizeAllowanceTitle(title);
    const current = allowances.get(normalizedTitle) ?? 0;
    allowances.set(normalizedTitle, current + amount);
  };

  for (const event of employeeEventsInPeriod) {
    if (event.eventType !== "allowance") {
      continue;
    }
    const amount = parseFloat(event.amount);
    if (!Number.isFinite(amount)) continue;
    addAllowance((event as any).title as string | undefined, amount, true);
  }

  employeeEventsForEmployee
    .filter(
      event =>
        event.eventType === "allowance" &&
        event.recurrenceType === "monthly" &&
        overlapsRange(event),
    )
    .forEach(event => {
      const amount = parseFloat(event.amount);
      if (!Number.isFinite(amount)) {
        return;
      }
      const withinRange = isWithinRange(event.eventDate);
      if (event.id && skippedEventIds?.has(event.id)) {
        return;
      }
      addAllowance((event as any).title as string | undefined, amount, !withinRange);
    });

  const allowanceTotal = Array.from(allowances.values()).reduce((sum, value) => sum + value, 0);

  const bonusAmount = employeeEventsInPeriod
    .filter(event => ["bonus", "commission", "overtime"].includes(event.eventType))
    .reduce((total, event) => total + parseFloat(event.amount), 0) + allowanceTotal;

  const eventDeductions = employeeEventsInPeriod
    .filter(event => ["deduction", "penalty"].includes(event.eventType))
    .reduce((total, event) => total + parseFloat(event.amount), 0);

  const grossPay = baseSalary + bonusAmount;

  const taxDeduction = config?.taxDeduction ?? 0;
  const socialSecurityDeduction = config?.socialSecurityDeduction ?? 0;
  const healthInsuranceDeduction = config?.healthInsuranceDeduction ?? 0;
  const otherDeductions = eventDeductions;

  const totalEmpDeductions =
    taxDeduction +
    socialSecurityDeduction +
    healthInsuranceDeduction +
    loanDeduction +
    otherDeductions;

  const netPay = Math.max(0, grossPay - totalEmpDeductions);

  let adjustmentReason = "";
  if (vacationDays > 0) {
    adjustmentReason += `${vacationDays} vacation days. `;
  }
  if (loanDeduction > 0) {
    adjustmentReason += `Loan deduction: ${loanDeduction.toFixed(2)} KWD. `;
    if (loanMismatches.length > 0) {
      adjustmentReason += `Schedule variance (${loanMismatches.join(", ")}). `;
    }
  }

  return {
    employeeId: employee.id,
    grossPay,
    baseSalary,
    bonusAmount,
    allowances: Object.fromEntries(allowances.entries()),
    workingDays,
    actualWorkingDays,
    vacationDays,
    taxDeduction,
    socialSecurityDeduction,
    healthInsuranceDeduction,
    loanDeduction,
    otherDeductions,
    netPay,
    adjustmentReason: adjustmentReason.trim() || null,
  };
}

export function normalizeAllowanceTitle(title: string | undefined): string {
  if (!title) {
    return "allowance";
  }
  const cleaned = title
    .toLowerCase()
    .replace(/allowance/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!cleaned) {
    return "allowance";
  }
  return cleaned.replace(/\s+/g, "_");
}

/**
 * Calculate totals from individual payroll entries. Throws if totals do not
 * balance (gross != deductions + net).
 */
export function calculateTotals(entries: EmployeePayroll[]) {
  const grossAmount = entries.reduce((sum, e) => sum + e.grossPay, 0);
  const totalDeductions = entries.reduce(
    (sum, e) =>
      sum +
      e.taxDeduction +
      e.socialSecurityDeduction +
      e.healthInsuranceDeduction +
      e.loanDeduction +
      e.otherDeductions,
    0,
  );
  const netAmount = entries.reduce((sum, e) => sum + e.netPay, 0);

  if (Math.abs(grossAmount - totalDeductions - netAmount) > 0.01) {
    throw new Error("Totals do not balance");
  }

  return { grossAmount, totalDeductions, netAmount };
}
