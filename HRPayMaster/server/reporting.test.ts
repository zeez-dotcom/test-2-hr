import { describe, it, expect, beforeEach, vi } from 'vitest';

const { selectMock } = vi.hoisted(() => ({
  selectMock: vi.fn()
}));

vi.mock('./db', () => ({
  db: { select: selectMock }
}));

import { storage } from './storage';

describe('getCompanyPayrollSummary', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('groups payroll entries by period', async () => {
    const rows = [
      { period: '2024-01', entry: { grossPay: '1000', netPay: '900' } },
      { period: '2024-01', entry: { grossPay: '500', netPay: '400' } },
      { period: '2024-02', entry: { grossPay: '800', netPay: '700' } }
    ];
    selectMock.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: async () => rows
        })
      })
    });

    const result = await storage.getCompanyPayrollSummary({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      groupBy: 'month'
    });

    expect(result).toEqual([
      {
        period: '2024-01',
        payrollEntries: [
          { grossPay: '1000', netPay: '900' },
          { grossPay: '500', netPay: '400' }
        ]
      },
      {
        period: '2024-02',
        payrollEntries: [{ grossPay: '800', netPay: '700' }]
      }
    ]);
  });
});

describe('getLoanBalances', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('aggregates remaining loan amounts by employee', async () => {
    const rows = [
      { employeeId: 'e1', remaining: '100' },
      { employeeId: 'e1', remaining: '50' },
      { employeeId: 'e2', remaining: '200' }
    ];
    selectMock.mockReturnValue({
      from: () => ({
        where: async () => rows
      })
    });

    const result = await storage.getLoanBalances();
    expect(result).toEqual([
      { employeeId: 'e1', balance: 150 },
      { employeeId: 'e2', balance: 200 }
    ]);
  });
});

describe('getAssetUsage', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('returns active asset assignment counts', async () => {
    const rows = [
      { assetId: 'a1', name: 'Laptop', count: 2 },
      { assetId: 'a2', name: 'Phone', count: 1 }
    ];
    selectMock.mockReturnValue({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            groupBy: async () => rows
          })
        })
      })
    });

    const result = await storage.getAssetUsage();
    expect(result).toEqual([
      { assetId: 'a1', name: 'Laptop', assignments: 2 },
      { assetId: 'a2', name: 'Phone', assignments: 1 }
    ]);
  });
});

