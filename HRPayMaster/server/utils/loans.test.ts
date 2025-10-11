import { describe, it, expect } from 'vitest';
import {
  generateAmortizationSchedule,
  mapScheduleToInsert,
  shouldPauseLoanForLeave,
  validateLoanPolicies,
} from './loans';

describe('generateAmortizationSchedule', () => {
  it('produces a schedule that amortizes the balance', () => {
    const schedule = generateAmortizationSchedule({
      amount: 1200,
      monthlyPayment: 100,
      interestRate: 0,
      startDate: '2024-01-01',
    });

    expect(schedule).toHaveLength(12);
    expect(schedule[0].remainingBalance).toBe(1100);
    expect(schedule.at(-1)?.remainingBalance).toBe(0);
  });

  it('throws when payment cannot cover monthly interest', () => {
    expect(() =>
      generateAmortizationSchedule({
        amount: 1000,
        monthlyPayment: 5,
        interestRate: 20,
        startDate: '2024-01-01',
      }),
    ).toThrow(/insufficient/);
  });
});

describe('validateLoanPolicies', () => {
  it('detects salary affordability and missing approvals', () => {
    const result = validateLoanPolicies({
      loan: {
        amount: '1000',
        monthlyDeduction: '600',
        interestRate: '0',
        startDate: '2024-01-01',
        endDate: null,
        status: 'pending',
      },
      approvalStages: [
        { id: 'stage-1', loanId: 'loan-1', stageName: 'Manager', stageOrder: 1, status: 'pending' } as any,
      ],
      documents: [],
      existingSchedule: [],
      employeeSalary: 800,
      strict: true,
    });

    expect(result.violations).toContain('Monthly deduction exceeds 50% of employee salary.');
    expect(result.violations).toContain(
      'Approval stage "Manager" is not approved (pending).',
    );
    expect(result.violations).toContain(
      'At least one supporting document must be uploaded before activation.',
    );
    expect(result.isCompliant).toBe(false);
  });

  it('returns warnings when schedule does not cover principal', () => {
    const result = validateLoanPolicies({
      loan: {
        amount: '1000',
        monthlyDeduction: '200',
        interestRate: '0',
        startDate: '2024-01-01',
        endDate: null,
        status: 'pending',
      },
      approvalStages: [],
      documents: [],
      existingSchedule: [
        { paymentAmount: 100, principalAmount: 100, interestAmount: 0 } as any,
      ],
      employeeSalary: 1000,
      strict: false,
    });

    expect(result.warnings).toContain('Amortization schedule does not cover the full loan amount.');
  });
});

describe('shouldPauseLoanForLeave', () => {
  it('matches overlapping vacations tagged to pause loans', () => {
    const shouldPause = shouldPauseLoanForLeave({
      vacations: [
        {
          startDate: '2024-04-01',
          endDate: '2024-04-30',
          status: 'approved',
          reason: 'Family trip [pause-loans]',
        },
      ],
      start: new Date('2024-04-01'),
      end: new Date('2024-04-30'),
    });

    expect(shouldPause).toBe(true);
  });
});

describe('mapScheduleToInsert', () => {
  it('maps generated schedule entries to insert payload', () => {
    const schedule = generateAmortizationSchedule({
      amount: 300,
      monthlyPayment: 100,
      interestRate: 0,
      startDate: '2024-01-01',
    });

    const mapped = mapScheduleToInsert('loan-1', schedule);
    expect(mapped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ loanId: 'loan-1', installmentNumber: 1 }),
      ]),
    );
  });
});
