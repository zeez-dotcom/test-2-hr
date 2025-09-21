import { describe, it, expect } from 'vitest';
import { insertLoanSchema, insertLoanPaymentSchema } from './schema';

describe('insertLoanSchema normalization', () => {
  const baseLoan = {
    amount: '1000',
    monthlyDeduction: '100',
    startDate: '2024-01-01',
  } as const;

  it('accepts UUID employeeId unchanged', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    const parsed = insertLoanSchema.parse({
      employeeId: uuid,
      ...baseLoan,
    });
    expect(parsed.employeeId).toBe(uuid);
  });

  it('normalizes scientific notation employeeId', () => {
    const parsed = insertLoanSchema.parse({
      employeeId: '1.23e+4',
      ...baseLoan,
    });
    expect(parsed.employeeId).toBe('12300');
  });
});

describe('insertLoanPaymentSchema normalization', () => {
  const basePayment = {
    amount: '250',
  } as const;

  it('keeps UUID identifiers intact', () => {
    const uuidA = '123e4567-e89b-12d3-a456-426614174000';
    const uuidB = '223e4567-e89b-12d3-a456-426614174111';
    const uuidC = '323e4567-e89b-12d3-a456-426614174222';

    const parsed = insertLoanPaymentSchema.parse({
      loanId: uuidA,
      payrollRunId: uuidB,
      employeeId: uuidC,
      ...basePayment,
    });

    expect(parsed.loanId).toBe(uuidA);
    expect(parsed.payrollRunId).toBe(uuidB);
    expect(parsed.employeeId).toBe(uuidC);
  });

  it('normalizes scientific notation identifiers', () => {
    const parsed = insertLoanPaymentSchema.parse({
      loanId: '1.23e+4',
      payrollRunId: '5.67e+8',
      employeeId: '9.01e+2',
      ...basePayment,
    });

    expect(parsed.loanId).toBe('12300');
    expect(parsed.payrollRunId).toBe('567000000');
    expect(parsed.employeeId).toBe('901');
  });
});
