import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  selectMock,
  transactionMock,
  insertMock,
  updateMock,
  deleteMock,
  loansFindFirstMock,
  loanPaymentsFindManyMock,
  carAssignmentsFindManyMock,
  employeeEventsFindManyMock,
  sickLeaveTrackingFindFirstMock,
  loanAmortizationSchedulesFindManyMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  transactionMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  loansFindFirstMock: vi.fn(),
  loanPaymentsFindManyMock: vi.fn(),
  carAssignmentsFindManyMock: vi.fn(),
  employeeEventsFindManyMock: vi.fn(),
  sickLeaveTrackingFindFirstMock: vi.fn(),
  loanAmortizationSchedulesFindManyMock: vi.fn(),
}));

vi.mock('./db', () => ({
  db: {
    select: selectMock,
    transaction: transactionMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    query: {
      loans: { findFirst: loansFindFirstMock },
      loanPayments: { findMany: loanPaymentsFindManyMock },
      carAssignments: { findMany: carAssignmentsFindManyMock },
      employeeEvents: { findMany: employeeEventsFindManyMock },
      sickLeaveTracking: { findFirst: sickLeaveTrackingFindFirstMock },
      loanAmortizationSchedules: { findMany: loanAmortizationSchedulesFindManyMock },
    },
  },
}));

import { storage } from './storage';
import {
  loanPayments,
  sickLeaveTracking,
  loanAmortizationSchedules,
  employees,
  loans,
  loanApprovalStages,
  loanDocuments,
} from '@shared/schema';

describe('getMonthlyEmployeeSummary', () => {
  beforeEach(() => {
    selectMock.mockReset();
    transactionMock.mockReset();
    deleteMock.mockReset();
    loanAmortizationSchedulesFindManyMock.mockReset();
    transactionMock.mockImplementation(async cb =>
      cb({
        select: selectMock,
        insert: insertMock,
        update: updateMock,
        delete: deleteMock.mockReturnValue({ where: vi.fn() }),
        query: {
          loanAmortizationSchedules: { findMany: loanAmortizationSchedulesFindManyMock },
        },
      }),
    );
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
                allowances: null,
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

describe('loan persistence', () => {
  beforeEach(() => {
    insertMock.mockReset();
    updateMock.mockReset();
    loansFindFirstMock.mockReset();
  });

  it('normalizes values and defaults remaining amount when creating loans', async () => {
    const inserted: any[] = [];
    insertMock.mockImplementationOnce((table) => {
      expect(table).toBe(loans);
      return {
        values: (vals: any) => {
          inserted.push(vals);
          return {
            returning: vi.fn().mockResolvedValue([{ id: 'loan-1', ...vals }]),
          };
        },
      };
    });

    const result = await storage.createLoan({
      employeeId: 'emp-1',
      amount: 1000,
      monthlyDeduction: 100,
      startDate: '2024-01-01',
      status: undefined,
      approvalState: undefined,
      interestRate: undefined,
    } as any);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      employeeId: 'emp-1',
      amount: '1000',
      monthlyDeduction: '100',
      remainingAmount: '1000',
      interestRate: '0',
      status: 'pending',
    });
    expect(result).toMatchObject({ id: 'loan-1' });
  });

  it('returns existing loan when no update payload is provided', async () => {
    loansFindFirstMock.mockResolvedValueOnce({ id: 'loan-1', amount: '900' });

    const result = await storage.updateLoan('loan-1', {});

    expect(updateMock).not.toHaveBeenCalled();
    expect(loansFindFirstMock).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 'loan-1', amount: '900' });
  });

  it('normalizes numeric fields when updating loans', async () => {
    updateMock.mockImplementationOnce((table) => {
      expect(table).toBe(loans);
      return {
        set: (vals: any) => {
          expect(vals).toMatchObject({
            amount: '1200',
            monthlyDeduction: '150',
            remainingAmount: '800',
            interestRate: '5',
            status: 'active',
          });
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'loan-1', amount: '1200' }]),
            }),
          };
        },
      };
    });

    const updated = await storage.updateLoan('loan-1', {
      amount: 1200,
      monthlyDeduction: 150,
      remainingAmount: 800,
      interestRate: 5,
      status: 'active',
    } as any);

    expect(updated).toEqual({ id: 'loan-1', amount: '1200' });
    expect(loansFindFirstMock).not.toHaveBeenCalled();
  });
});

describe('replaceLoanAmortizationSchedule', () => {
  beforeEach(() => {
    transactionMock.mockReset();
    insertMock.mockReset();
    deleteMock.mockReset();
    loanAmortizationSchedulesFindManyMock.mockReset();
  });

  it('preserves paid entries and inserts sanitized schedule', async () => {
    const preservedEntry: any = {
      loanId: 'loan-1',
      installmentNumber: 1,
      dueDate: '2024-01-01',
      principalAmount: '50',
      interestAmount: '0',
      paymentAmount: '50',
      remainingBalance: '150',
      status: 'paid',
    };
    const pendingEntry: any = {
      loanId: 'loan-1',
      installmentNumber: 2,
      dueDate: '2024-02-01',
      principalAmount: '60',
      interestAmount: '0',
      paymentAmount: '60',
      remainingBalance: '90',
      status: 'pending',
    };
    loanAmortizationSchedulesFindManyMock.mockResolvedValue([preservedEntry, pendingEntry]);

    const deleteWhere = vi.fn();
    deleteMock.mockReturnValue({ where: deleteWhere });

    const insertValues = vi.fn();
    insertMock.mockImplementation((table) => {
      expect(table).toBe(loanAmortizationSchedules);
      return { values: insertValues };
    });

    transactionMock.mockImplementation(async (cb) =>
      cb({
        query: { loanAmortizationSchedules: { findMany: loanAmortizationSchedulesFindManyMock } },
        delete: deleteMock,
        insert: insertMock,
      }),
    );

    await storage.replaceLoanAmortizationSchedule('loan-1', [
      {
        loanId: 'loan-1',
        installmentNumber: 1,
        dueDate: '2024-01-01',
        principalAmount: 55,
        interestAmount: 5,
        paymentAmount: 60,
        remainingBalance: 140,
      },
      {
        loanId: 'loan-1',
        installmentNumber: 3,
        dueDate: '2024-03-01',
        principalAmount: 70,
        interestAmount: 5,
        paymentAmount: 75,
        remainingBalance: 65,
      },
    ]);

    expect(deleteWhere).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalled();
    const inserted = insertValues.mock.calls[0][0];
    expect(inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ installmentNumber: 1, status: 'paid' }),
        expect.objectContaining({ installmentNumber: 3, status: 'pending' }),
      ]),
    );
  });
});



describe('deleteLoan', () => {
  beforeEach(() => {
    transactionMock.mockReset();
    deleteMock.mockReset();
  });

  it('deletes dependent loan records inside a transaction', async () => {
    const loanApprovalWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
    const loanDocumentWhere = vi.fn().mockResolvedValue({ rowCount: 2 });
    const scheduleWhere = vi.fn().mockResolvedValue({ rowCount: 3 });
    const paymentWhere = vi.fn().mockResolvedValue({ rowCount: 4 });
    const loanWhere = vi.fn().mockResolvedValue({ rowCount: 1 });

    const txDeleteMock = vi.fn((table: unknown) => {
      if (table === loanApprovalStages) {
        return { where: loanApprovalWhere };
      }
      if (table === loanDocuments) {
        return { where: loanDocumentWhere };
      }
      if (table === loanAmortizationSchedules) {
        return { where: scheduleWhere };
      }
      if (table === loanPayments) {
        return { where: paymentWhere };
      }
      if (table === loans) {
        return { where: loanWhere };
      }
      throw new Error('Unexpected table delete');
    });

    transactionMock.mockImplementation(async (cb) =>
      cb({
        delete: txDeleteMock,
      }),
    );

    const result = await storage.deleteLoan('loan-1');

    expect(result).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txDeleteMock.mock.calls.map(call => call[0])).toEqual([
      loanApprovalStages,
      loanDocuments,
      loanAmortizationSchedules,
      loanPayments,
      loans,
    ]);
    expect(loanApprovalWhere).toHaveBeenCalledTimes(1);
    expect(loanDocumentWhere).toHaveBeenCalledTimes(1);
    expect(scheduleWhere).toHaveBeenCalledTimes(1);
    expect(paymentWhere).toHaveBeenCalledTimes(1);
    expect(loanWhere).toHaveBeenCalledWith(expect.anything());
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

describe('updateEmployee', () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  it('persists document expiry fields to the employee record', async () => {
    updateMock.mockImplementationOnce((table) => {
      expect(table).toBe(employees);
      return {
        set: (vals: any) => {
          expect(vals).toEqual({
            visaExpiryDate: '2030-01-01',
            visaNumber: 'V-999',
            visaAlertDays: 60,
            civilIdExpiryDate: '2030-06-01',
          });
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                { id: 'emp-1', ...vals },
              ]),
            }),
          };
        },
      };
    });

    const result = await storage.updateEmployee('emp-1', {
      visaExpiryDate: '2030-01-01',
      visaNumber: 'V-999',
      visaAlertDays: 60,
      civilIdExpiryDate: '2030-06-01',
      employeeCode: 'should-be-ignored' as any,
    });

    expect(result).toEqual({
      id: 'emp-1',
      visaExpiryDate: '2030-01-01',
      visaNumber: 'V-999',
      visaAlertDays: 60,
      civilIdExpiryDate: '2030-06-01',
    });
  });
});

describe('checkDocumentExpiries', () => {
  beforeEach(() => {
    selectMock.mockReset();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes driving and company license information when available', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-01T00:00:00Z'));

    const rows = [
      {
        employee: {
          id: 'emp-1',
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@example.com',
          employeeCode: 'E001',
          visaExpiryDate: null,
          visaNumber: null,
          visaAlertDays: null,
          civilIdExpiryDate: null,
          civilId: null,
          civilIdAlertDays: null,
          passportExpiryDate: null,
          passportNumber: null,
          passportAlertDays: null,
          drivingLicenseNumber: 'DL-123',
          drivingLicenseExpiryDate: '2024-03-06',
          drivingLicenseAlertDays: 45,
        },
        company: {
          id: 'comp-1',
          name: 'Acme Corp',
          email: 'info@acme.test',
          companyLicenseNumber: 'LIC-99',
          companyLicenseExpiryDate: '2024-03-04',
          companyLicenseAlertDays: 120,
        },
      },
    ];

    selectMock.mockReturnValueOnce({
      from: () => ({
        leftJoin: () => Promise.resolve(rows),
      }),
    });

    const result = await storage.checkDocumentExpiries();

    const expectedDrivingDays = Math.ceil(
      (Date.parse('2024-03-06') - Date.parse('2024-03-01T00:00:00Z')) /
        (1000 * 60 * 60 * 24),
    );
    const expectedCompanyDays = Math.ceil(
      (Date.parse('2024-03-04') - Date.parse('2024-03-01T00:00:00Z')) /
        (1000 * 60 * 60 * 24),
    );

    expect(result).toEqual([
      {
        employeeId: 'emp-1',
        employeeName: 'Alice Smith',
        email: 'alice@example.com',
        companyId: 'comp-1',
        companyName: 'Acme Corp',
        drivingLicense: {
          number: 'DL-123',
          expiryDate: '2024-03-06',
          alertDays: 45,
          daysUntilExpiry: expectedDrivingDays,
        },
      },
      {
        employeeId: null,
        employeeName: 'Acme Corp',
        email: 'info@acme.test',
        companyId: 'comp-1',
        companyName: 'Acme Corp',
        companyLicense: {
          number: 'LIC-99',
          expiryDate: '2024-03-04',
          alertDays: 120,
          daysUntilExpiry: expectedCompanyDays,
        },
      },
    ]);
  });

  it('avoids duplicate company license entries and applies alert defaults', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-01T00:00:00Z'));

    const rows = [
      {
        employee: {
          id: 'emp-1',
          firstName: 'John',
          lastName: 'Doe',
          email: null,
          employeeCode: 'E100',
          visaExpiryDate: null,
          visaNumber: null,
          visaAlertDays: null,
          civilIdExpiryDate: null,
          civilId: null,
          civilIdAlertDays: null,
          passportExpiryDate: null,
          passportNumber: null,
          passportAlertDays: null,
          drivingLicenseNumber: 'DL-999',
          drivingLicenseExpiryDate: '2024-05-03',
          drivingLicenseAlertDays: null,
        },
        company: {
          id: 'comp-2',
          name: 'Beta LLC',
          email: null,
          companyLicenseNumber: 'LIC-200',
          companyLicenseExpiryDate: '2024-05-10',
          companyLicenseAlertDays: null,
        },
      },
      {
        employee: {
          id: 'emp-2',
          firstName: 'NoDocs',
          lastName: 'Person',
          email: null,
          employeeCode: 'E101',
          visaExpiryDate: null,
          visaNumber: null,
          visaAlertDays: null,
          civilIdExpiryDate: null,
          civilId: null,
          civilIdAlertDays: null,
          passportExpiryDate: null,
          passportNumber: null,
          passportAlertDays: null,
          drivingLicenseNumber: null,
          drivingLicenseExpiryDate: null,
          drivingLicenseAlertDays: null,
        },
        company: {
          id: 'comp-2',
          name: 'Beta LLC',
          email: null,
          companyLicenseNumber: 'LIC-200',
          companyLicenseExpiryDate: '2024-05-10',
          companyLicenseAlertDays: null,
        },
      },
    ];

    selectMock.mockReturnValueOnce({
      from: () => ({
        leftJoin: () => Promise.resolve(rows),
      }),
    });

    const result = await storage.checkDocumentExpiries();

    const expectedDrivingDays = Math.ceil(
      (Date.parse('2024-05-03') - Date.parse('2024-05-01T00:00:00Z')) /
        (1000 * 60 * 60 * 24),
    );
    const expectedCompanyDays = Math.ceil(
      (Date.parse('2024-05-10') - Date.parse('2024-05-01T00:00:00Z')) /
        (1000 * 60 * 60 * 24),
    );

    expect(result).toEqual([
      {
        employeeId: 'emp-1',
        employeeName: 'John Doe',
        email: null,
        companyId: 'comp-2',
        companyName: 'Beta LLC',
        drivingLicense: {
          number: 'DL-999',
          expiryDate: '2024-05-03',
          alertDays: 30,
          daysUntilExpiry: expectedDrivingDays,
        },
      },
      {
        employeeId: null,
        employeeName: 'Beta LLC',
        email: null,
        companyId: 'comp-2',
        companyName: 'Beta LLC',
        companyLicense: {
          number: 'LIC-200',
          expiryDate: '2024-05-10',
          alertDays: 60,
          daysUntilExpiry: expectedCompanyDays,
        },
      },
    ]);
  });
});

