import { describe, it, expect, beforeEach, vi } from 'vitest';

const { employeeEventsFindManyMock, selectMock } = vi.hoisted(() => ({
  employeeEventsFindManyMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    query: {
      employeeEvents: {
        findMany: employeeEventsFindManyMock,
      },
    },
    select: selectMock,
  },
}));

import { storage } from '../storage';

describe('DatabaseStorage recurring allowance expansion', () => {
  beforeEach(() => {
    employeeEventsFindManyMock.mockReset();
    selectMock.mockReset();
    (storage as any).hasRecurringEmployeeEventsColumns = undefined;
    (storage as any).loggedMissingRecurringEventColumns = false;
  });

  it('returns monthly allowance occurrences for overlapping periods in getEmployeeEvents', async () => {
    const allowanceEvent = {
      id: 'evt-1',
      employeeId: 'emp-1',
      eventDate: '2023-11-15',
      eventType: 'allowance',
      amount: '150',
      status: 'active',
      affectsPayroll: true,
      recurrenceType: 'monthly',
      recurrenceEndDate: null,
      employee: {
        id: 'emp-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    };
    employeeEventsFindManyMock.mockResolvedValue([allowanceEvent]);

    const results = await storage.getEmployeeEvents(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'evt-1',
      employeeId: 'emp-1',
      eventType: 'allowance',
      recurrenceType: 'monthly',
      eventDate: '2024-01-15',
    });
  });

  it('includes recurring allowance occurrences in employee reports', async () => {
    const rawAllowance = {
      id: 'evt-2',
      employeeId: 'emp-2',
      eventDate: '2023-12-05',
      eventType: 'allowance',
      amount: '200',
      status: 'active',
      affectsPayroll: true,
      recurrenceType: 'monthly',
      recurrenceEndDate: null,
    };

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
          where: async () => [rawAllowance],
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

    const report = await storage.getEmployeeReport('emp-2', {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      groupBy: 'month',
    });

    expect(report).toEqual([
      {
        period: '2024-01',
        payrollEntries: [],
        employeeEvents: [
          expect.objectContaining({
            id: 'evt-2',
            eventType: 'allowance',
            eventDate: '2024-01-05',
          }),
        ],
        loans: [],
        vacationRequests: [],
      },
    ]);
  });

  it('includes allowance breakdown on payroll runs', async () => {
    const runRow = {
      id: 'run-allowance',
      period: 'Jan 2024',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      grossAmount: '1500',
      totalDeductions: '0',
      netAmount: '1500',
      status: 'completed',
      createdAt: new Date('2024-02-01'),
      updatedAt: new Date('2024-02-01'),
    } as any;

    const entryRow = {
      id: 'entry-1',
      createdAt: new Date('2024-02-01'),
      payrollRunId: 'run-allowance',
      employeeId: 'emp-1',
      grossPay: '1500',
      baseSalary: '1000',
      bonusAmount: '500',
      workingDays: 30,
      actualWorkingDays: 30,
      vacationDays: 0,
      taxDeduction: '0',
      socialSecurityDeduction: '0',
      healthInsuranceDeduction: '0',
      loanDeduction: '0',
      otherDeductions: '0',
      netPay: '1500',
      adjustmentReason: null,
      employee: {
        id: 'emp-1',
        employeeCode: 'E-001',
        firstName: 'Jane',
        lastName: 'Doe',
        arabicName: null,
        nickname: null,
        salary: '1000',
      },
    } as any;

    selectMock
      .mockReturnValueOnce({
        from: () => ({ where: async () => [runRow] }),
      })
      .mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({ where: async () => [entryRow] }),
        }),
      });

    const getEmployeeEventsSpy = vi
      .spyOn(storage, 'getEmployeeEvents')
      .mockResolvedValue([
        {
          employeeId: 'emp-1',
          eventDate: '2024-01-15',
          eventType: 'allowance',
          affectsPayroll: true,
          status: 'active',
          amount: '100',
          title: 'Housing Allowance',
        } as any,
        {
          employeeId: 'emp-1',
          eventDate: '2023-12-20',
          eventType: 'allowance',
          affectsPayroll: true,
          status: 'active',
          amount: '50',
          title: 'Food Allowance',
          recurrenceType: 'monthly',
          recurrenceEndDate: null,
        } as any,
      ]);

    const run = await storage.getPayrollRun('run-allowance');
    getEmployeeEventsSpy.mockRestore();

    expect(run?.entries).toHaveLength(1);
    expect(run?.entries?.[0].allowances).toEqual({ housing: 100, food: 50 });
    expect(run?.allowanceKeys).toEqual(['food', 'housing']);
  });

  it('hydrates payroll entries with monthly allowances for a single payroll run in getEmployeeReport', async () => {
    const entryRow = {
      id: 'entry-single',
      payrollRunId: 'run-single',
      employeeId: 'emp-allow',
      grossPay: '1500',
      baseSalary: '1200',
      bonusAmount: '300',
      taxDeduction: '0',
      socialSecurityDeduction: '0',
      healthInsuranceDeduction: '0',
      loanDeduction: '0',
      otherDeductions: '0',
      netPay: '1500',
    } as any;

    selectMock
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => [
              {
                period: '2024-01',
                entry: entryRow,
                runId: 'run-single',
                runStart: '2024-01-01',
                runEnd: '2024-01-31',
              },
            ],
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
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      });

    employeeEventsFindManyMock.mockResolvedValue([
      {
        id: 'evt-monthly',
        employeeId: 'emp-allow',
        eventDate: '2023-12-15',
        eventType: 'allowance',
        amount: '150',
        status: 'active',
        affectsPayroll: true,
        recurrenceType: 'monthly',
        recurrenceEndDate: null,
        title: 'Housing Allowance',
        employee: {
          id: 'emp-allow',
          firstName: 'Test',
          lastName: 'Employee',
        },
      },
    ]);

    const report = await storage.getEmployeeReport('emp-allow', {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      groupBy: 'month',
    });

    expect(report).toEqual([
      {
        period: '2024-01',
        payrollEntries: [
          expect.objectContaining({
            id: 'entry-single',
            allowances: { housing: 150 },
          }),
        ],
        employeeEvents: [],
        loans: [],
        vacationRequests: [],
      },
    ]);
  });

  it('hydrates payroll entries with recurring allowances across multiple payroll runs in getEmployeeReport', async () => {
    const januaryEntry = {
      id: 'entry-jan',
      payrollRunId: 'run-jan',
      employeeId: 'emp-allow',
      grossPay: '1500',
      baseSalary: '1200',
      bonusAmount: '300',
      taxDeduction: '0',
      socialSecurityDeduction: '0',
      healthInsuranceDeduction: '0',
      loanDeduction: '0',
      otherDeductions: '0',
      netPay: '1500',
    } as any;

    const februaryEntry = {
      id: 'entry-feb',
      payrollRunId: 'run-feb',
      employeeId: 'emp-allow',
      grossPay: '1525',
      baseSalary: '1200',
      bonusAmount: '325',
      taxDeduction: '0',
      socialSecurityDeduction: '0',
      healthInsuranceDeduction: '0',
      loanDeduction: '0',
      otherDeductions: '0',
      netPay: '1525',
    } as any;

    selectMock
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => [
              {
                period: '2024-01',
                entry: januaryEntry,
                runId: 'run-jan',
                runStart: '2024-01-01',
                runEnd: '2024-01-31',
              },
              {
                period: '2024-02',
                entry: februaryEntry,
                runId: 'run-feb',
                runStart: '2024-02-01',
                runEnd: '2024-02-29',
              },
            ],
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
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      });

    employeeEventsFindManyMock
      .mockResolvedValueOnce([
        {
          id: 'evt-monthly',
          employeeId: 'emp-allow',
          eventDate: '2023-12-15',
          eventType: 'allowance',
          amount: '150',
          status: 'active',
          affectsPayroll: true,
          recurrenceType: 'monthly',
          recurrenceEndDate: null,
          title: 'Housing Allowance',
          employee: {
            id: 'emp-allow',
            firstName: 'Test',
            lastName: 'Employee',
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'evt-monthly',
          employeeId: 'emp-allow',
          eventDate: '2023-12-15',
          eventType: 'allowance',
          amount: '150',
          status: 'active',
          affectsPayroll: true,
          recurrenceType: 'monthly',
          recurrenceEndDate: null,
          title: 'Housing Allowance',
          employee: {
            id: 'emp-allow',
            firstName: 'Test',
            lastName: 'Employee',
          },
        },
        {
          id: 'evt-transport',
          employeeId: 'emp-allow',
          eventDate: '2024-02-10',
          eventType: 'allowance',
          amount: '25',
          status: 'active',
          affectsPayroll: true,
          recurrenceType: 'none',
          recurrenceEndDate: null,
          title: 'Transport Allowance',
          employee: {
            id: 'emp-allow',
            firstName: 'Test',
            lastName: 'Employee',
          },
        },
      ]);

    const report = await storage.getEmployeeReport('emp-allow', {
      startDate: '2024-01-01',
      endDate: '2024-02-29',
      groupBy: 'month',
    });

    expect(report).toEqual([
      {
        period: '2024-01',
        payrollEntries: [
          expect.objectContaining({
            id: 'entry-jan',
            allowances: { housing: 150 },
          }),
        ],
        employeeEvents: [],
        loans: [],
        vacationRequests: [],
      },
      {
        period: '2024-02',
        payrollEntries: [
          expect.objectContaining({
            id: 'entry-feb',
            allowances: { housing: 150, transport: 25 },
          }),
        ],
        employeeEvents: [],
        loans: [],
        vacationRequests: [],
      },
    ]);
  });
});
