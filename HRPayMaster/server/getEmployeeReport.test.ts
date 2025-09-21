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

const { selectMock, assetAssignmentsFindManyMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  assetAssignmentsFindManyMock: vi.fn(),
}));

vi.mock('./db', () => ({
  db: {
    select: selectMock,
    query: {
      assetAssignments: { findMany: assetAssignmentsFindManyMock },
    },
  },
}));

import { db } from './db';
import { storage } from './storage';

beforeEach(() => {
  selectMock.mockReset();
  assetAssignmentsFindManyMock.mockReset();
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

describe('getAssetUsageDetails', () => {
  it('returns assignment details for overlapping records', async () => {
    assetAssignmentsFindManyMock.mockResolvedValue([
      {
        id: 'assign-1',
        assetId: 'asset-1',
        employeeId: 'emp-1',
        assignedDate: '2024-01-05',
        returnDate: null,
        status: 'active',
        notes: 'Primary asset',
        asset: {
          id: 'asset-1',
          type: 'IT',
          name: 'Laptop',
          status: 'assigned',
          details: 'MacBook',
          createdAt: new Date(),
        },
        employee: {
          id: 'emp-1',
          employeeCode: 'E-001',
          firstName: 'Ada',
          lastName: 'Lovelace',
        },
      },
    ]);

    const result = await storage.getAssetUsageDetails({
      startDate: '2024-01-01',
      endDate: '2024-02-01',
    });

    expect(result).toEqual([
      {
        assignmentId: 'assign-1',
        assetId: 'asset-1',
        assetName: 'Laptop',
        assetType: 'IT',
        assetStatus: 'assigned',
        assetDetails: 'MacBook',
        employeeId: 'emp-1',
        employeeCode: 'E-001',
        employeeName: 'Ada Lovelace',
        assignedDate: '2024-01-05',
        returnDate: null,
        status: 'active',
        notes: 'Primary asset',
      },
    ]);
  });

  it('returns empty array when no assignments overlap the window', async () => {
    assetAssignmentsFindManyMock.mockResolvedValue([
      {
        id: 'assign-old',
        assetId: 'asset-2',
        employeeId: 'emp-2',
        assignedDate: '2023-01-01',
        returnDate: '2023-02-01',
        status: 'returned',
        notes: null,
        asset: {
          id: 'asset-2',
          type: 'IT',
          name: 'Tablet',
          status: 'available',
          details: null,
          createdAt: new Date(),
        },
        employee: {
          id: 'emp-2',
          employeeCode: 'E-002',
          firstName: 'Grace',
          lastName: 'Hopper',
        },
      },
    ]);

    const result = await storage.getAssetUsageDetails({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    expect(result).toEqual([]);
  });
});

