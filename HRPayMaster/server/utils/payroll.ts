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
  employeeId: string;
  status: string;
  remainingAmount: string;
  monthlyDeduction: string;
}

export interface VacationRequest {
  employeeId: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface EmployeeEvent {
  employeeId: string;
  eventDate: string;
  eventType: string;
  affectsPayroll: boolean;
  status: string;
  amount: string;
}

export interface EmployeePayroll {
  employeeId: string;
  grossPay: number;
  baseSalary: number;
  bonusAmount: number;
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
}): EmployeePayroll {
  const monthlySalary = parseFloat(employee.salary);

  const employeeVacations = vacationRequests.filter(v =>
    v.employeeId === employee.id &&
    v.status === "approved" &&
    new Date(v.startDate) <= end &&
    new Date(v.endDate) >= start
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

  const employeeLoans = loans.filter(l => {
    const isActive = l.status === "active" || l.status === "approved"; // tolerate legacy "approved"
    return (
      l.employeeId === employee.id &&
      isActive &&
      parseFloat(l.remainingAmount) > 0
    );
  });

  const loanDeduction = employee.status === 'active'
    ? employeeLoans.reduce((total, loan) => {
        return total + Math.min(parseFloat(loan.monthlyDeduction), parseFloat(loan.remainingAmount));
      }, 0)
    : 0;

  const employeeEventsInPeriod = employeeEvents.filter(event =>
    event.employeeId === employee.id &&
    event.affectsPayroll &&
    event.status === "active" &&
    new Date(event.eventDate) >= start &&
    new Date(event.eventDate) <= end &&
    event.eventType !== "vacation"
  );

  const bonusAmount = employeeEventsInPeriod
    .filter(event => ["bonus", "commission", "allowance", "overtime"].includes(event.eventType))
    .reduce((total, event) => total + parseFloat(event.amount), 0);

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
  }

  return {
    employeeId: employee.id,
    grossPay,
    baseSalary,
    bonusAmount,
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
