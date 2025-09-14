import { describe, it, expect, beforeEach, vi } from 'vitest';

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock('./db', () => ({
  db: { select: selectMock },
}));

import { storage } from './storage';

describe('getMonthlyEmployeeSummary', () => {
  beforeEach(() => {
    selectMock.mockReset();
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

