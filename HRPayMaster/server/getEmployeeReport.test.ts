import { describe, it, expect, vi } from 'vitest';

const payrollRows = [
  { period: '2024-02', entry: { id: 'p2' } },
  { period: '2024-01', entry: { id: 'p1' } },
];

const eventRows = [
  { period: '2024-02', event: { id: 'e2', eventType: 'bonus' } },
];

const loanRows = [
  { period: '2024-01', loan: { id: 'l1' } },
];

const vacationRows: any[] = [];

vi.mock('./db', () => ({
  db: {
    select: vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => payrollRows,
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => eventRows,
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => loanRows,
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => vacationRows,
        }),
      }),
  },
}));

import { storage } from './storage';

describe('getEmployeeReport', () => {
  it('returns periods sorted by period', async () => {
    const result = await storage.getEmployeeReport('emp1', {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      groupBy: 'month',
    });

    expect(result.map((r) => r.period)).toEqual(['2024-01', '2024-02']);
  });
});

// Stubs for future company-level report tests
describe('getCompanyPayrollSummary', () => {
  it.todo('returns aggregated payroll data');
});

describe('getLoanBalances', () => {
  it.todo('returns outstanding loan balances');
});

describe('getAssetUsage', () => {
  it.todo('returns active asset assignment counts');
});

