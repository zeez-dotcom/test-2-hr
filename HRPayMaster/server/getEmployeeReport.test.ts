import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    select: vi.fn(),
  },
}));

import { db } from './db';
import { storage } from './storage';

beforeEach(() => {
  vi.mocked(db.select).mockReset();
});

describe('getEmployeeReport', () => {
  it('returns periods sorted by period', async () => {
    vi.mocked(db.select)
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
      });

    const result = await storage.getEmployeeReport('emp1', {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      groupBy: 'month',
    });

    expect(result.map((r) => r.period)).toEqual(['2024-01', '2024-02']);
  });
});

describe('getCompanyPayrollSummary', () => {
  it('aggregates payroll entries by period', async () => {
    const rows = [
      { period: '2024-01', entry: { id: 'a1' } },
      { period: '2024-01', entry: { id: 'a2' } },
      { period: '2024-02', entry: { id: 'b1' } },
    ];
    vi.mocked(db.select).mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: async () => rows,
        }),
      }),
    });

    const result = await storage.getCompanyPayrollSummary({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      groupBy: 'month',
    });

    expect(result).toEqual([
      { period: '2024-01', payrollEntries: [{ id: 'a1' }, { id: 'a2' }] },
      { period: '2024-02', payrollEntries: [{ id: 'b1' }] },
    ]);
  });

  it('returns empty array when no payroll data', async () => {
    vi.mocked(db.select).mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: async () => [],
        }),
      }),
    });

    const result = await storage.getCompanyPayrollSummary({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      groupBy: 'month',
    });

    expect(result).toEqual([]);
  });
});

describe('getLoanBalances', () => {
  it('sums remaining balances per employee', async () => {
    const rows = [
      { employeeId: 'e1', remaining: 100 },
      { employeeId: 'e1', remaining: 50 },
      { employeeId: 'e2', remaining: 25 },
    ];
    vi.mocked(db.select).mockReturnValueOnce({
      from: () => ({
        where: async () => rows,
      }),
    });

    const result = await storage.getLoanBalances();
    expect(result).toEqual([
      { employeeId: 'e1', balance: 150 },
      { employeeId: 'e2', balance: 25 },
    ]);
  });

  it('returns empty array when no loans', async () => {
    vi.mocked(db.select).mockReturnValueOnce({
      from: () => ({
        where: async () => [],
      }),
    });
    const result = await storage.getLoanBalances();
    expect(result).toEqual([]);
  });
});

describe('getAssetUsage', () => {
  it('returns assignment counts for active assets', async () => {
    const rows = [
      { assetId: 'a1', name: 'Laptop', count: 2 },
      { assetId: 'a2', name: 'Phone', count: 1 },
    ];
    vi.mocked(db.select).mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            groupBy: async () => rows,
          }),
        }),
      }),
    });

    const result = await storage.getAssetUsage();
    expect(result).toEqual([
      { assetId: 'a1', name: 'Laptop', assignments: 2 },
      { assetId: 'a2', name: 'Phone', assignments: 1 },
    ]);
  });

  it('returns empty array when no active assignments', async () => {
    vi.mocked(db.select).mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            groupBy: async () => [],
          }),
        }),
      }),
    });
    const result = await storage.getAssetUsage();
    expect(result).toEqual([]);
  });
});

