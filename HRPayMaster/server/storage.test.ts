import { describe, it, expect, beforeEach, vi } from 'vitest';

const { selectMock, transactionMock, insertMock, loanPaymentsFindManyMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  transactionMock: vi.fn(),
  insertMock: vi.fn(),
  loanPaymentsFindManyMock: vi.fn(),
}));

vi.mock('./db', () => ({
  db: {
    transaction: transactionMock,
    insert: insertMock,
    query: {
      loanPayments: { findMany: loanPaymentsFindManyMock },
    },
  },
}));

import { storage } from './storage';
import { loanPayments } from '@shared/schema';

describe('getMonthlyEmployeeSummary', () => {
  beforeEach(() => {
    selectMock.mockReset();
    transactionMock.mockReset();
    transactionMock.mockImplementation(async cb => cb({ select: selectMock }));
  });

  it('returns payroll, loans, and events for the month', async () => {
    const payrollRows = [{ entry: { id: 'p1', grossPay: '100', netPay: '80' } }];
    const loanRows = [{ id: 'l1', remainingAmount: '200', status: 'active' }];
    const eventRows = [{ id: 'e1', eventType: 'bonus', amount: '10' }];

    selectMock
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => payrollRows,
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => loanRows,
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => eventRows,
        }),
      });

    const result = await storage.getMonthlyEmployeeSummary('emp1', new Date('2024-02-15'));
    expect(result).toEqual({
      payroll: [payrollRows[0].entry],
      loans: loanRows,
      events: eventRows,
    });
  });

  it('returns empty arrays when no data', async () => {
    selectMock
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      });

    const result = await storage.getMonthlyEmployeeSummary('emp1', new Date('2024-02-15'));
    expect(result).toEqual({ payroll: [], loans: [], events: [] });
  });
});

describe('loan payment helpers', () => {
  beforeEach(() => {
    insertMock.mockReset();
    loanPaymentsFindManyMock.mockReset();
  });

  it('creates a single loan payment with normalized values', async () => {
    const inserted: any[] = [];
    insertMock.mockImplementationOnce(table => {
      expect(table).toBe(loanPayments);
      return {
        values: (vals: any) => {
          inserted.push(vals);
          return {
            returning: vi.fn().mockResolvedValue([{ id: 'lp1', ...vals }]),
          };
        },
      };
    });

    const result = await storage.createLoanPayment({
      loanId: 'loan-1',
      payrollRunId: 'run-1',
      employeeId: 'emp-1',
      amount: 50,
      appliedDate: '2024-01-31',
      source: 'manual',
    });

    expect(inserted).toEqual([
      {
        loanId: 'loan-1',
        payrollRunId: 'run-1',
        employeeId: 'emp-1',
        amount: '50',
        appliedDate: '2024-01-31',
        source: 'manual',
      },
    ]);
    expect(result).toEqual({
      id: 'lp1',
      loanId: 'loan-1',
      payrollRunId: 'run-1',
      employeeId: 'emp-1',
      amount: '50',
      appliedDate: '2024-01-31',
      source: 'manual',
    });
  });

  it('creates multiple loan payments in bulk', async () => {
    const inserted: any[] = [];
    insertMock.mockImplementationOnce(table => {
      expect(table).toBe(loanPayments);
      return {
        values: (vals: any) => {
          inserted.push(vals);
          return {
            returning: vi
              .fn()
              .mockResolvedValue(
                vals.map((value: any, index: number) => ({ id: `lp${index + 1}`, ...value })),
              ),
          };
        },
      };
    });

    const result = await storage.createLoanPayments([
      {
        loanId: 'loan-1',
        payrollRunId: 'run-2',
        employeeId: 'emp-1',
        amount: 25,
        appliedDate: '2024-02-29',
        source: 'manual',
      },
      {
        loanId: 'loan-2',
        payrollRunId: 'run-2',
        employeeId: 'emp-1',
        amount: 10,
      },
    ]);

    expect(inserted).toHaveLength(1);
    expect(inserted[0][0]).toEqual({
      loanId: 'loan-1',
      payrollRunId: 'run-2',
      employeeId: 'emp-1',
      amount: '25',
      appliedDate: '2024-02-29',
      source: 'manual',
    });
    expect(inserted[0][1]).toMatchObject({
      loanId: 'loan-2',
      payrollRunId: 'run-2',
      employeeId: 'emp-1',
      amount: '10',
      source: 'payroll',
    });
    expect(inserted[0][1].appliedDate).toBeUndefined();
    expect(result).toEqual([
      {
        id: 'lp1',
        loanId: 'loan-1',
        payrollRunId: 'run-2',
        employeeId: 'emp-1',
        amount: '25',
        appliedDate: '2024-02-29',
        source: 'manual',
      },
      {
        id: 'lp2',
        loanId: 'loan-2',
        payrollRunId: 'run-2',
        employeeId: 'emp-1',
        amount: '10',
        appliedDate: undefined,
        source: 'payroll',
      },
    ]);
  });

  it('skips insert when no loan payments are provided', async () => {
    const result = await storage.createLoanPayments([]);
    expect(result).toEqual([]);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('fetches loan payments by loan and payroll run', async () => {
    loanPaymentsFindManyMock.mockResolvedValueOnce([{ id: 'lp1' }]);
    const byLoan = await storage.getLoanPaymentsByLoan('loan-1');
    expect(loanPaymentsFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything(), orderBy: expect.anything() }),
    );
    expect(byLoan).toEqual([{ id: 'lp1' }]);

    loanPaymentsFindManyMock.mockReset();
    loanPaymentsFindManyMock.mockResolvedValueOnce([{ id: 'lp2' }]);
    const byRun = await storage.getLoanPaymentsForPayroll('run-3');
    expect(loanPaymentsFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything(), orderBy: expect.anything() }),
    );
    expect(byRun).toEqual([{ id: 'lp2' }]);
  });
});

