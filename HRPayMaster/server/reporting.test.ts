import { describe, it, expect, beforeEach, vi } from 'vitest';

const { selectMock, loansFindManyMock, assetAssignmentsFindManyMock, carAssignmentsFindManyMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  loansFindManyMock: vi.fn(),
  assetAssignmentsFindManyMock: vi.fn(),
  carAssignmentsFindManyMock: vi.fn(),
}));

vi.mock('./db', () => ({
  db: {
    select: selectMock,
    query: {
      loans: { findMany: loansFindManyMock },
      assetAssignments: { findMany: assetAssignmentsFindManyMock },
      carAssignments: { findMany: carAssignmentsFindManyMock },
    },
  }
}));

import { storage } from './storage';

describe('getCompanyPayrollSummary', () => {
  beforeEach(() => {
    selectMock.mockReset();
    loansFindManyMock.mockReset();
    assetAssignmentsFindManyMock.mockReset();
    carAssignmentsFindManyMock.mockReset();
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
    loansFindManyMock.mockReset();
    assetAssignmentsFindManyMock.mockReset();
    carAssignmentsFindManyMock.mockReset();
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

describe('getLoanReportDetails', () => {
  beforeEach(() => {
    selectMock.mockReset();
    loansFindManyMock.mockReset();
    assetAssignmentsFindManyMock.mockReset();
    carAssignmentsFindManyMock.mockReset();
  });

  it('returns loan metrics with payment and vacation context', async () => {
    const loan = {
      id: 'l1',
      employeeId: 'e1',
      amount: '500',
      remainingAmount: '200',
      status: 'active',
      startDate: '2024-01-01',
      endDate: null,
      employee: { id: 'e1', firstName: 'Ada', lastName: 'Lovelace' },
    } as any;

    loansFindManyMock.mockResolvedValue([loan]);

    selectMock
      .mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: async () => [
              {
                loanId: 'l1',
                amount: '100',
                appliedDate: '2024-01-15',
                payrollDate: null,
              },
              {
                loanId: 'l1',
                amount: '50',
                appliedDate: null,
                payrollDate: '2023-12-15',
              },
            ],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            {
              employeeId: 'e1',
              start: '2024-01-01',
              end: '2024-01-10',
              reason: 'Annual [pause-loans]',
            },
          ],
        }),
      });

    const result = await storage.getLoanReportDetails({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    expect(result).toEqual([
      {
        loanId: 'l1',
        employeeId: 'e1',
        employee: loan.employee,
        originalAmount: 500,
        remainingAmount: 200,
        status: 'active',
        totalRepaid: 150,
        deductionInRange: 100,
        pausedByVacation: true,
        pauseNote: 'Paused via approved vacation (2024-01-01 – 2024-01-10)',
        startDate: '2024-01-01',
        endDate: null,
      },
    ]);
  });
});

describe('getAssetUsageDetails', () => {
  beforeEach(() => {
    assetAssignmentsFindManyMock.mockReset();
    carAssignmentsFindManyMock.mockReset();
  });

  it('returns assignment details with asset and employee context', async () => {
    assetAssignmentsFindManyMock.mockResolvedValue([
      {
        id: 'assign-b',
        assetId: 'asset-b',
        employeeId: 'emp-2',
        assignedDate: '2024-02-01',
        returnDate: null,
        status: 'active',
        notes: 'Primary phone',
        asset: {
          id: 'asset-b',
          type: 'IT',
          name: 'Phone',
          status: 'assigned',
          details: 'iPhone',
          createdAt: new Date(),
        },
        employee: {
          id: 'emp-2',
          employeeCode: 'E-002',
          firstName: 'Grace',
          lastName: 'Hopper',
        },
      },
      {
        id: 'assign-a',
        assetId: 'asset-a',
        employeeId: 'emp-1',
        assignedDate: '2024-01-01',
        returnDate: '2024-01-15',
        status: 'returned',
        notes: 'Loaner',
        asset: {
          id: 'asset-a',
          type: 'IT',
          name: 'Laptop',
          status: 'available',
          details: 'Dell XPS',
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
      endDate: '2024-12-31',
    });

    expect(assetAssignmentsFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything() })
    );
    expect(result).toEqual([
      {
        assignmentId: 'assign-a',
        assetId: 'asset-a',
        assetName: 'Laptop',
        assetType: 'IT',
        assetStatus: 'available',
        assetDetails: 'Dell XPS',
        employeeId: 'emp-1',
        employeeCode: 'E-001',
        employeeName: 'Ada Lovelace',
        assignedDate: '2024-01-01',
        returnDate: '2024-01-15',
        status: 'returned',
        notes: 'Loaner',
      },
      {
        assignmentId: 'assign-b',
        assetId: 'asset-b',
        assetName: 'Phone',
        assetType: 'IT',
        assetStatus: 'assigned',
        assetDetails: 'iPhone',
        employeeId: 'emp-2',
        employeeCode: 'E-002',
        employeeName: 'Grace Hopper',
        assignedDate: '2024-02-01',
        returnDate: null,
        status: 'active',
        notes: 'Primary phone',
      },
    ]);
  });

  it('filters assignments that fall completely outside the window', async () => {
    assetAssignmentsFindManyMock.mockResolvedValue([
      {
        id: 'outside-after',
        assetId: 'asset-c',
        employeeId: 'emp-3',
        assignedDate: '2024-02-10',
        returnDate: null,
        status: 'active',
        notes: null,
        asset: {
          id: 'asset-c',
          type: 'IT',
          name: 'Tablet',
          status: 'assigned',
          details: null,
          createdAt: new Date(),
        },
        employee: {
          id: 'emp-3',
          employeeCode: 'E-003',
          firstName: 'Linus',
          lastName: 'Torvalds',
        },
      },
      {
        id: 'outside-before',
        assetId: 'asset-d',
        employeeId: 'emp-4',
        assignedDate: '2023-11-01',
        returnDate: '2023-11-30',
        status: 'returned',
        notes: null,
        asset: {
          id: 'asset-d',
          type: 'IT',
          name: 'Monitor',
          status: 'available',
          details: null,
          createdAt: new Date(),
        },
        employee: {
          id: 'emp-4',
          employeeCode: 'E-004',
          firstName: 'Barbara',
          lastName: 'Liskov',
        },
      },
      {
        id: 'inside',
        assetId: 'asset-a',
        employeeId: 'emp-1',
        assignedDate: '2024-01-05',
        returnDate: null,
        status: 'active',
        notes: 'Ongoing',
        asset: {
          id: 'asset-a',
          type: 'IT',
          name: 'Laptop',
          status: 'assigned',
          details: null,
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
      endDate: '2024-01-31',
    });

    expect(result).toEqual([
      {
        assignmentId: 'inside',
        assetId: 'asset-a',
        assetName: 'Laptop',
        assetType: 'IT',
        assetStatus: 'assigned',
        assetDetails: null,
        employeeId: 'emp-1',
        employeeCode: 'E-001',
        employeeName: 'Ada Lovelace',
        assignedDate: '2024-01-05',
        returnDate: null,
        status: 'active',
        notes: 'Ongoing',
      },
    ]);
  });
});

describe('getFleetUsage', () => {
  beforeEach(() => {
    carAssignmentsFindManyMock.mockReset();
  });

  it('returns assignment details with vehicle and employee context', async () => {
    carAssignmentsFindManyMock.mockResolvedValue([
      {
        id: 'assign-truck',
        carId: 'car-truck',
        employeeId: 'emp-2',
        assignedDate: '2024-02-10',
        returnDate: null,
        status: 'active',
        notes: 'Logistics route',
        car: {
          id: 'car-truck',
          make: 'Toyota',
          model: 'Hilux',
          year: 2021,
          plateNumber: 'KUW-4567',
          vin: 'VIN-4567',
          serial: 'SER-4567',
        },
        employee: {
          id: 'emp-2',
          employeeCode: 'E-002',
          firstName: 'Grace',
          lastName: 'Hopper',
        },
      },
      {
        id: 'assign-sedan',
        carId: 'car-sedan',
        employeeId: 'emp-1',
        assignedDate: '2024-01-05',
        returnDate: '2024-01-20',
        status: 'returned',
        notes: 'Client visits',
        car: {
          id: 'car-sedan',
          make: 'Honda',
          model: 'Civic',
          year: 2022,
          plateNumber: 'KUW-1234',
          vin: 'VIN-1234',
          serial: 'SER-1234',
        },
        employee: {
          id: 'emp-1',
          employeeCode: 'E-001',
          firstName: 'Ada',
          lastName: 'Lovelace',
        },
      },
    ]);

    const result = await storage.getFleetUsage({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });

    expect(carAssignmentsFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything() })
    );
    expect(result).toEqual([
      {
        assignmentId: 'assign-sedan',
        carId: 'car-sedan',
        vehicle: 'Honda Civic 2022',
        plateNumber: 'KUW-1234',
        vin: 'VIN-1234',
        serial: 'SER-1234',
        employeeId: 'emp-1',
        employeeCode: 'E-001',
        employeeName: 'Ada Lovelace',
        assignedDate: '2024-01-05',
        returnDate: '2024-01-20',
        status: 'returned',
        notes: 'Client visits',
      },
      {
        assignmentId: 'assign-truck',
        carId: 'car-truck',
        vehicle: 'Toyota Hilux 2021',
        plateNumber: 'KUW-4567',
        vin: 'VIN-4567',
        serial: 'SER-4567',
        employeeId: 'emp-2',
        employeeCode: 'E-002',
        employeeName: 'Grace Hopper',
        assignedDate: '2024-02-10',
        returnDate: null,
        status: 'active',
        notes: 'Logistics route',
      },
    ]);
  });

  it('filters assignments that do not overlap the requested window', async () => {
    carAssignmentsFindManyMock.mockResolvedValue([
      {
        id: 'outside-before',
        carId: 'car-old',
        employeeId: 'emp-3',
        assignedDate: '2023-01-01',
        returnDate: '2023-01-20',
        status: 'completed',
        notes: null,
        car: {
          id: 'car-old',
          make: 'Nissan',
          model: 'Sunny',
          year: 2018,
          plateNumber: 'OLD-001',
          vin: null,
          serial: null,
        },
        employee: {
          id: 'emp-3',
          employeeCode: 'E-003',
          firstName: 'Linus',
          lastName: 'Torvalds',
        },
      },
      {
        id: 'outside-after',
        carId: 'car-future',
        employeeId: 'emp-4',
        assignedDate: '2024-05-01',
        returnDate: null,
        status: 'active',
        notes: null,
        car: {
          id: 'car-future',
          make: 'Ford',
          model: 'Focus',
          year: 2024,
          plateNumber: 'NEW-777',
          vin: 'VIN-777',
          serial: 'SER-777',
        },
        employee: {
          id: 'emp-4',
          employeeCode: 'E-004',
          firstName: 'Barbara',
          lastName: 'Liskov',
        },
      },
      {
        id: 'inside',
        carId: 'car-inside',
        employeeId: 'emp-1',
        assignedDate: '2024-03-10',
        returnDate: null,
        status: 'active',
        notes: 'Project support',
        car: {
          id: 'car-inside',
          make: 'Honda',
          model: 'Civic',
          year: 2021,
          plateNumber: 'MID-123',
          vin: 'VIN-123',
          serial: 'SER-123',
        },
        employee: {
          id: 'emp-1',
          employeeCode: 'E-001',
          firstName: 'Ada',
          lastName: 'Lovelace',
        },
      },
    ]);

    const result = await storage.getFleetUsage({
      startDate: '2024-02-01',
      endDate: '2024-04-30',
    });

    expect(result).toEqual([
      {
        assignmentId: 'inside',
        carId: 'car-inside',
        vehicle: 'Honda Civic 2021',
        plateNumber: 'MID-123',
        vin: 'VIN-123',
        serial: 'SER-123',
        employeeId: 'emp-1',
        employeeCode: 'E-001',
        employeeName: 'Ada Lovelace',
        assignedDate: '2024-03-10',
        returnDate: null,
        status: 'active',
        notes: 'Project support',
      },
    ]);
  });

  it('treats blank date filters as undefined', async () => {
    carAssignmentsFindManyMock.mockResolvedValue([]);

    const result = await storage.getFleetUsage({ startDate: '', endDate: '   ' });

    expect(result).toEqual([]);
    expect(carAssignmentsFindManyMock).toHaveBeenCalledTimes(1);
    const callArgs = carAssignmentsFindManyMock.mock.calls[0]?.[0];
    expect(callArgs?.where).toBeUndefined();
  });
});

