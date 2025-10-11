import { describe, it, expect } from 'vitest';
import { calculateEmployeePayroll, calculateTotals } from './payroll';

const baseDates = {
  start: new Date('2024-01-01'),
  end: new Date('2024-01-30'),
  workingDays: 30,
};

describe('calculateEmployeePayroll', () => {
  it('applies vacation days and loan deductions', () => {
    const employee = { id: 'e1', salary: '3000', status: 'active' };
    const loans = [{ employeeId: 'e1', status: 'active', remainingAmount: '500', monthlyDeduction: '100' }];
    const vacations = [{ employeeId: 'e1', status: 'approved', startDate: '2024-01-05', endDate: '2024-01-06' }];
    const events: any[] = [];

    const entry = calculateEmployeePayroll({
      employee,
      loans,
      vacationRequests: vacations,
      employeeEvents: events,
      ...baseDates,
    });

    expect(entry.baseSalary).toBe(2800);
    expect(entry.loanDeduction).toBe(100);
    expect(entry.vacationDays).toBe(2);
    expect(entry.netPay).toBe(2700);
    expect(entry.allowances).toEqual({});
  });

  it('uses configurable standard deductions', () => {
    const employee = { id: 'e1', salary: '1000', status: 'active' };
    const entry = calculateEmployeePayroll({
      employee,
      loans: [],
      vacationRequests: [],
      employeeEvents: [],
      ...baseDates,
      config: { taxDeduction: 50 },
    });
    expect(entry.taxDeduction).toBe(50);
    expect(entry.netPay).toBe(950);
    expect(entry.allowances).toEqual({});
  });

  it('aggregates allowance events by normalized title', () => {
    const employee = { id: 'e1', salary: '1000', status: 'active' };
    const entry = calculateEmployeePayroll({
      employee,
      loans: [],
      vacationRequests: [],
      employeeEvents: [
        {
          employeeId: 'e1',
          eventDate: '2024-01-10',
          eventType: 'allowance',
          affectsPayroll: true,
          status: 'active',
          amount: '75',
          title: 'Housing Allowance',
          recurrenceType: 'none',
          recurrenceEndDate: null,
        } as any,
        {
          employeeId: 'e1',
          eventDate: '2023-12-01',
          eventType: 'allowance',
          affectsPayroll: true,
          status: 'active',
          amount: '50',
          title: 'Food Allowance',
          recurrenceType: 'monthly',
          recurrenceEndDate: null,
        } as any,
      ],
      ...baseDates,
    });

    expect(entry.allowances).toEqual({ housing: 75, food: 50 });
    expect(entry.bonusAmount).toBeCloseTo(125);
  });

  it('uses amortization schedule amounts when present', () => {
    const employee = { id: 'e1', salary: '2000', status: 'active' };
    const loans = [
      {
        employeeId: 'e1',
        status: 'active',
        remainingAmount: '400',
        monthlyDeduction: '300',
        dueAmountForPeriod: 150,
        scheduleDueThisPeriod: [{ status: 'pending' }],
      } as any,
    ];

    const entry = calculateEmployeePayroll({
      employee,
      loans,
      vacationRequests: [],
      employeeEvents: [],
      ...baseDates,
    });

    expect(entry.loanDeduction).toBe(150);
    expect(entry.adjustmentReason).toContain('Loan deduction');
  });
});

describe('calculateTotals', () => {
  it('sums entry values and validates totals', () => {
    const entries = [
      {
        employeeId: 'e1',
        grossPay: 2800,
        baseSalary: 2800,
        bonusAmount: 0,
        allowances: {},
        workingDays: 30,
        actualWorkingDays: 28,
        vacationDays: 2,
        taxDeduction: 0,
        socialSecurityDeduction: 0,
        healthInsuranceDeduction: 0,
        loanDeduction: 100,
        otherDeductions: 0,
        netPay: 2700,
        adjustmentReason: null,
      },
    ];

    const totals = calculateTotals(entries);
    expect(totals).toEqual({ grossAmount: 2800, totalDeductions: 100, netAmount: 2700 });
  });
});
