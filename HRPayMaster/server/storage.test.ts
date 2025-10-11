import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  selectMock,
  transactionMock,
  insertMock,
  updateMock,
  loanPaymentsFindManyMock,
  carAssignmentsFindManyMock,
  employeeEventsFindManyMock,
  sickLeaveTrackingFindFirstMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  transactionMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  loanPaymentsFindManyMock: vi.fn(),
  carAssignmentsFindManyMock: vi.fn(),
  employeeEventsFindManyMock: vi.fn(),
  sickLeaveTrackingFindFirstMock: vi.fn(),
}));

vi.mock('./db', () => ({
  db: {
    select: selectMock,
    transaction: transactionMock,
    insert: insertMock,
    update: updateMock,
    query: {
      loanPayments: { findMany: loanPaymentsFindManyMock },
      carAssignments: { findMany: carAssignmentsFindManyMock },
      employeeEvents: { findMany: employeeEventsFindManyMock },
      sickLeaveTracking: { findFirst: sickLeaveTrackingFindFirstMock },
    },
  },
}));

import { storage } from './storage';
import { loanPayments, sickLeaveTracking } from '@shared/schema';

describe('getMonthlyEmployeeSummary', () => {
  beforeEach(() => {
    selectMock.mockReset();
    transactionMock.mockReset();
    transactionMock.mockImplementation(async cb => cb({ select: selectMock }));
    updateMock.mockReset();
    sickLeaveTrackingFindFirstMock.mockReset();
  });

  it('returns payroll, loans, and events for the month', async () => {
    const payrollRows = [{ entry: { id: 'p1', grossPay: '100', netPay: '80' } }];
    const loanRows = [{ id: 'l1', remainingAmount: '200', status: 'active' }];
    const eventRows = [
      { id: 'e1', eventType: 'bonus', amount: '10', eventDate: '2024-02-10' },
    ];

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

describe('getPayrollRuns', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('falls back to empty allowance metadata when employee events query fails with missing table error', async () => {
    const payrollRun = {
      id: 'run-1',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      createdAt: '2024-02-01',
      status: 'completed',
      processedBy: 'admin',
      totalGrossPay: 1000,
      totalNetPay: 900,
      totalDeductions: 100,
      notes: null,
    } as any;

    selectMock
      .mockReturnValueOnce({
        from: () => ({
          orderBy: vi.fn().mockResolvedValue([payrollRun]),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: vi.fn().mockResolvedValue([
              {
                id: 'entry-1',
                createdAt: '2024-02-01',
                payrollRunId: payrollRun.id,
                employeeId: 'emp-1',
                grossPay: 100,
                baseSalary: 100,
                bonusAmount: 0,
                workingDays: 22,
                actualWorkingDays: 22,
                vacationDays: 0,
                taxDeduction: 0,
                socialSecurityDeduction: 0,
                healthInsuranceDeduction: 0,
                loanDeduction: 0,
                otherDeductions: 0,
                netPay: 90,
                adjustmentReason: null,
                employee: null,
              },
            ]),
          }),
        }),
      });

    const postgresError: any = new Error('relation "employee_events" does not exist');
    postgresError.code = '42P01';

    const eventsSpy = vi.spyOn(storage, 'getEmployeeEvents').mockRejectedValue(postgresError);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const runs = await storage.getPayrollRuns();

      expect(runs).toHaveLength(1);
      expect(runs[0].allowanceKeys).toEqual([]);
      expect(runs[0].entries).toHaveLength(1);
      expect(runs[0].entries[0].allowances).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to load allowance metadata due to missing data source:',
        postgresError,
      );
    } finally {
      eventsSpy.mockRestore();
      warnSpy.mockRestore();
    }
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



describe('getEmployeeEvents', () => {
  beforeEach(() => {
    selectMock.mockReset();
    employeeEventsFindManyMock.mockReset();
    (storage as any).hasRecurringEmployeeEventsColumns = undefined;
    (storage as any).loggedMissingRecurringEventColumns = false;
  });

  it('falls back to legacy query when recurrence columns are missing', async () => {
    employeeEventsFindManyMock.mockRejectedValueOnce({ code: '42703' });

    const fallbackRows = [
      {
        event: {
          id: 'event-1',
          employeeId: 'emp-1',
          eventType: 'allowance',
          title: 'Housing',
          description: 'Monthly housing allowance',
          amount: '100',
          eventDate: '2024-01-05',
          affectsPayroll: true,
          documentUrl: null,
          status: 'active',
          addedBy: null,
          createdAt: '2024-01-05T00:00:00Z',
        },
        employee: { id: 'emp-1', firstName: 'Alice', lastName: 'Smith' },
      },
    ];

    selectMock.mockReturnValueOnce({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            orderBy: vi.fn().mockResolvedValue(fallbackRows),
          }),
        }),
      }),
    });

    const result = await storage.getEmployeeEvents(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      { eventType: 'allowance' },
    );

    expect(employeeEventsFindManyMock).toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: 'event-1',
        recurrenceType: 'none',
        recurrenceEndDate: null,
      }),
    ]);
  });
});

describe('getCarAssignments', () => {
  beforeEach(() => {
    carAssignmentsFindManyMock.mockReset();
  });

  const assignmentRows = [
    {
      id: 'assign-1',
      carId: 'car-1',
      employeeId: 'emp-1',
      assignedDate: '2024-01-01',
      returnDate: '2024-01-10',
      status: 'completed',
      notes: null,
      car: { id: 'car-1', plateNumber: 'ABC123', vin: 'VIN1', serial: 'SER1' },
      employee: { id: 'emp-1', firstName: 'Alice', lastName: 'Smith' },
      assigner: { id: 'mgr-1', firstName: 'Manager', lastName: 'One' },
    },
    {
      id: 'assign-2',
      carId: 'car-2',
      employeeId: 'emp-2',
      assignedDate: '2024-02-01',
      returnDate: null,
      status: 'active',
      notes: null,
      car: { id: 'car-2', plateNumber: 'XYZ789', vin: 'VIN2', serial: 'SER2' },
      employee: { id: 'emp-2', firstName: 'Bob', lastName: 'Jones' },
      assigner: null,
    },
  ];

  it('returns all assignments when no filters provided', async () => {
    carAssignmentsFindManyMock.mockResolvedValueOnce(assignmentRows as any);
    const result = await storage.getCarAssignments();

    expect(carAssignmentsFindManyMock).toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0].car?.plateNumber).toBe('ABC123');
    expect(result[1].assigner).toBeUndefined();
  });

  it('filters assignments by provided vehicle identifiers', async () => {
    carAssignmentsFindManyMock.mockResolvedValueOnce(assignmentRows as any);

    const result = await storage.getCarAssignments({ plateNumber: 'xyz', vin: 'vin2', serial: 'ser2' });

    expect(result).toEqual([
      expect.objectContaining({ id: 'assign-2', car: expect.objectContaining({ plateNumber: 'XYZ789' }) }),
    ]);
  });

  it('applies individual filters when some fields are omitted', async () => {
    carAssignmentsFindManyMock.mockResolvedValueOnce(assignmentRows as any);

    const byPlate = await storage.getCarAssignments({ plateNumber: 'abc123' });
    expect(byPlate).toEqual([
      expect.objectContaining({ id: 'assign-1' }),
    ]);

    carAssignmentsFindManyMock.mockResolvedValueOnce(assignmentRows as any);
    const byVin = await storage.getCarAssignments({ vin: 'vin1' });
    expect(byVin).toEqual([
      expect.objectContaining({ id: 'assign-1' }),
    ]);
  });
});

describe('sick leave balance methods', () => {
  beforeEach(() => {
    insertMock.mockReset();
    updateMock.mockReset();
    sickLeaveTrackingFindFirstMock.mockReset();
  });

  it('returns an existing balance record', async () => {
    const record = {
      id: 'bal-1',
      employeeId: 'emp-1',
      year: 2024,
      totalSickDaysUsed: 2,
      remainingSickDays: 12,
      lastUpdated: new Date().toISOString(),
    } as any;

    sickLeaveTrackingFindFirstMock.mockResolvedValueOnce(record);

    const result = await storage.getSickLeaveBalance('emp-1', 2024);

    expect(sickLeaveTrackingFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.any(Function) }),
    );
    expect(result).toEqual(record);
  });

  it('creates a new balance row', async () => {
    insertMock.mockImplementationOnce(table => {
      expect(table).toBe(sickLeaveTracking);
      return {
        values: (vals: any) => {
          expect(vals).toEqual({
            employeeId: 'emp-1',
            year: 2024,
            totalSickDaysUsed: 0,
            remainingSickDays: 14,
          });
          return {
            returning: vi.fn().mockResolvedValue([
              { id: 'bal-1', ...vals },
            ]),
          };
        },
      };
    });

    const result = await storage.createSickLeaveBalance({
      employeeId: 'emp-1',
      year: 2024,
      totalSickDaysUsed: 0,
      remainingSickDays: 14,
    });

    expect(result).toEqual({
      id: 'bal-1',
      employeeId: 'emp-1',
      year: 2024,
      totalSickDaysUsed: 0,
      remainingSickDays: 14,
    });
  });

  it('updates an existing balance row', async () => {
    updateMock.mockImplementationOnce(table => {
      expect(table).toBe(sickLeaveTracking);
      return {
        set: (vals: any) => {
          expect(vals).toMatchObject({
            totalSickDaysUsed: 5,
            remainingSickDays: 9,
          });
          expect(vals.lastUpdated).toBeInstanceOf(Date);
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: 'bal-1',
                  employeeId: 'emp-1',
                  year: 2024,
                  totalSickDaysUsed: 5,
                  remainingSickDays: 9,
                  lastUpdated: vals.lastUpdated,
                },
              ]),
            }),
          };
        },
      };
    });

    const result = await storage.updateSickLeaveBalance('bal-1', {
      totalSickDaysUsed: 5,
      remainingSickDays: 9,
    });

    expect(result).toMatchObject({
      id: 'bal-1',
      totalSickDaysUsed: 5,
      remainingSickDays: 9,
    });
  });

  it('returns the persisted record when no update fields provided', async () => {
    const record = {
      id: 'bal-1',
      employeeId: 'emp-1',
      year: 2024,
      totalSickDaysUsed: 1,
      remainingSickDays: 13,
      lastUpdated: new Date().toISOString(),
    } as any;

    sickLeaveTrackingFindFirstMock.mockResolvedValueOnce(record);

    const result = await storage.updateSickLeaveBalance('bal-1', {});

    expect(result).toEqual(record);
    expect(sickLeaveTrackingFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.any(Function) }),
    );
  });
});

