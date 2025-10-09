import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from './routes';
import { errorHandler } from './errorHandler';
import { storage } from './storage';
import { db } from './db';
import {
  payrollRuns,
  payrollEntries as payrollEntriesTable,
  loanPayments as loanPaymentsTable,
  loans as loansTable,
} from '@shared/schema';

vi.mock('./storage', () => ({
  storage: {
    getEmployees: vi.fn(),
    getLoans: vi.fn(),
    getVacationRequests: vi.fn(),
    getEmployeeEvents: vi.fn(),
    getCompanies: vi.fn(),
    createNotification: vi.fn(),
    getAttendanceSummary: vi.fn(),
  },
}));

vi.mock('./db', () => ({
  db: {
    query: {
      payrollRuns: {
        findFirst: vi.fn(),
      },
    },
    transaction: vi.fn(),
  },
}));

describe('payroll generate', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use((req, _res, next) => {
      // @ts-ignore
      req.isAuthenticated = () => true;
      // @ts-ignore
      req.user = { role: 'admin' };
      next();
    });

    await registerRoutes(app);
    app.use(errorHandler);

    vi.mocked(storage.getEmployees).mockReset();
    vi.mocked(storage.getLoans).mockReset();
    vi.mocked(storage.getVacationRequests).mockReset();
    vi.mocked(storage.getEmployeeEvents).mockReset();
    vi.mocked(storage.getCompanies).mockReset();
    vi.mocked(storage.createNotification).mockReset();
    vi.mocked(storage.getAttendanceSummary).mockReset();
    vi.mocked(db.query.payrollRuns.findFirst).mockReset();
    vi.mocked(db.transaction).mockReset();

    vi.mocked(storage.getCompanies).mockResolvedValue([] as any);
    vi.mocked(storage.getAttendanceSummary).mockResolvedValue({});
  });

  it('returns a preview of payroll impacts for active employees', async () => {
    vi.mocked(storage.getEmployees).mockResolvedValue([
      {
        id: 'emp-1',
        firstName: 'John',
        lastName: 'Doe',
        employeeCode: 'E-1',
        position: 'Developer',
        salary: '3000',
        status: 'active',
        standardWorkingDays: 30,
      },
    ] as any);
    vi.mocked(storage.getLoans).mockResolvedValue([
      {
        id: 'loan-1',
        employeeId: 'emp-1',
        status: 'active',
        remainingAmount: '200',
        monthlyDeduction: '75',
        startDate: '2023-11-01',
        endDate: '2024-06-01',
        createdAt: '2023-11-01T00:00:00.000Z',
      },
    ] as any);
    vi.mocked(storage.getVacationRequests).mockResolvedValue([
      {
        id: 'vac-1',
        employeeId: 'emp-1',
        status: 'approved',
        startDate: '2024-01-05',
        endDate: '2024-01-06',
      },
    ] as any);
    vi.mocked(storage.getEmployeeEvents).mockResolvedValue([
      {
        id: 'evt-bonus',
        employeeId: 'emp-1',
        eventType: 'bonus',
        eventDate: '2024-01-10',
        affectsPayroll: true,
        status: 'active',
        amount: '150',
        title: 'Project Bonus',
      },
      {
        id: 'evt-deduction',
        employeeId: 'emp-1',
        eventType: 'deduction',
        eventDate: '2024-01-12',
        affectsPayroll: true,
        status: 'active',
        amount: '50',
        title: 'Late Fee',
      },
      {
        id: 'evt-allowance',
        employeeId: 'emp-1',
        eventType: 'allowance',
        eventDate: '2024-01-08',
        affectsPayroll: true,
        status: 'active',
        amount: '100',
        title: 'Housing',
        recurrenceType: 'none',
      },
      {
        id: 'evt-allowance-recurring',
        employeeId: 'emp-1',
        eventType: 'allowance',
        eventDate: '2023-12-01',
        affectsPayroll: true,
        status: 'active',
        amount: '50',
        title: 'Transport',
        recurrenceType: 'monthly',
        recurrenceEndDate: null,
      },
    ] as any);

    const res = await request(app)
      .post('/api/payroll/preview')
      .send({ period: 'Jan 2024', startDate: '2024-01-01', endDate: '2024-01-31' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ period: 'Jan 2024', startDate: '2024-01-01', endDate: '2024-01-31' });
    expect(res.body.employees).toHaveLength(1);
    const employeePreview = res.body.employees[0];
    expect(employeePreview.employeeId).toBe('emp-1');
    expect(employeePreview.employeeName).toBe('John Doe');
    expect(employeePreview.vacations).toEqual([
      expect.objectContaining({ id: 'vac-1', daysInPeriod: 2 }),
    ]);
    expect(employeePreview.loans).toEqual([
      expect.objectContaining({ id: 'loan-1', monthlyDeduction: 75, remainingAmount: 200 }),
    ]);
    expect(employeePreview.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'evt-bonus', effect: 'bonus', amount: 150 }),
        expect.objectContaining({ id: 'evt-deduction', effect: 'deduction', amount: 50 }),
      ]),
    );
    expect(employeePreview.allowances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'evt-allowance', source: 'period', amount: 100 }),
        expect.objectContaining({ id: 'evt-allowance-recurring', source: 'recurring', amount: 50 }),
      ]),
    );
  });

  it('returns 409 when overlapping payroll run exists', async () => {
    const existing = {
      id: 'run1',
      period: 'Jan 2024',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      grossAmount: '0',
      totalDeductions: '0',
      netAmount: '0',
      status: 'completed',
    } as any;
    vi.mocked(db.query.payrollRuns.findFirst).mockResolvedValue(existing);

    const res = await request(app)
      .post('/api/payroll/generate')
      .send({ period: 'Feb 2024', startDate: '2024-01-15', endDate: '2024-01-20' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Payroll run already exists for this period');
    expect(storage.getEmployees).not.toHaveBeenCalled();
  });

  it('applies vacation and loan deductions and creates notifications', async () => {
    vi.mocked(db.query.payrollRuns.findFirst).mockResolvedValue(null);
    vi.mocked(storage.getEmployees).mockResolvedValue([
      { id: 'e1', salary: '3000', status: 'active' },
    ] as any);

    const loanData = [
      {
        id: 'loan-1',
        employeeId: 'e1',
        status: 'active',
        remainingAmount: '90',
        monthlyDeduction: '100',
        startDate: '2023-12-01',
        endDate: '2024-06-01',
        createdAt: '2023-12-15T00:00:00.000Z',
      },
      {
        id: 'loan-2',
        employeeId: 'e1',
        status: 'active',
        remainingAmount: '200',
        monthlyDeduction: '75',
        startDate: '2023-11-15',
        endDate: '2024-05-01',
        createdAt: '2023-11-20T00:00:00.000Z',
      },
    ] as any;
    vi.mocked(storage.getLoans).mockImplementation(async (start, end) =>
      loanData.filter(
        l =>
          !start ||
          !end ||
          (new Date(l.startDate) <= end &&
            (!l.endDate || new Date(l.endDate) >= start)),
      ),
    );

    vi.mocked(storage.getVacationRequests).mockImplementation(async () => [
      {
        employeeId: 'e1',
        status: 'approved',
        startDate: '2024-01-05',
        endDate: '2024-01-06',
      },
    ] as any);

    const eventData = [
      {
        employeeId: 'e1',
        eventDate: '2024-01-10',
        eventType: 'bonus',
        affectsPayroll: true,
        status: 'active',
        amount: '200',
      },
      {
        employeeId: 'e1',
        eventDate: '2024-02-10',
        eventType: 'bonus',
        affectsPayroll: true,
        status: 'active',
        amount: '300',
      },
    ] as any;
    vi.mocked(storage.getEmployeeEvents).mockImplementation(async (start, end) =>
      eventData.filter(
        e =>
          !start || !end ||
          (new Date(e.eventDate) >= start && new Date(e.eventDate) <= end),
      ),
    );

    const insertedLoanPayments: any[] = [];
    const updateSetCalls: any[] = [];

    const insert = vi.fn().mockImplementation((table) => {
      if (table === payrollRuns) {
        return {
          values: (vals: any) => ({
            returning: vi.fn().mockResolvedValue([{ id: 'run1', ...vals }]),
          }),
        };
      }
      if (table === payrollEntriesTable) {
        return {
          values: vi.fn().mockResolvedValue(undefined),
        };
      }
      if (table === loanPaymentsTable) {
        return {
          values: vi.fn().mockImplementation((vals: any) => {
            if (Array.isArray(vals)) {
              insertedLoanPayments.push(...vals);
            } else {
              insertedLoanPayments.push(vals);
            }
            return Promise.resolve();
          }),
        };
      }
      throw new Error('Unexpected insert table');
    });

    const update = vi.fn().mockImplementation((table) => {
      if (table !== loansTable) {
        throw new Error('Unexpected update table');
      }
      return {
        set: (vals: any) => {
          updateSetCalls.push(vals);
          return { where: vi.fn().mockResolvedValue(undefined) };
        },
      };
    });
    const tx = { insert, update, rollback: vi.fn() } as any;
    vi.mocked(db.transaction).mockImplementation(async cb => cb(tx));

    const res = await request(app)
      .post('/api/payroll/generate')
      .send({ period: 'Jan', startDate: '2024-01-01', endDate: '2024-01-30' });

    expect(res.status).toBe(201);
    expect(res.body.grossAmount).toBe('3000');
    expect(res.body.totalDeductions).toBe('165');
    expect(res.body.netAmount).toBe('2835');
    expect(storage.getLoans).toHaveBeenCalledWith(
      new Date('2024-01-01'),
      new Date('2024-01-30'),
    );
    expect(storage.getVacationRequests).toHaveBeenCalledWith(
      new Date('2024-01-01'),
      new Date('2024-01-30'),
    );
    expect(storage.getEmployeeEvents).toHaveBeenCalledWith(
      new Date('2024-01-01'),
      new Date('2024-01-30'),
    );
    expect(storage.createNotification).toHaveBeenCalledTimes(2);
    expect(storage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'vacation_approved' }),
    );
    expect(storage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'loan_deduction' }),
    );

    expect(updateSetCalls).toEqual([
      { remainingAmount: '125.00', status: 'active' },
      { remainingAmount: '0.00', status: 'completed' },
    ]);

    expect(insertedLoanPayments).toEqual([
      {
        loanId: 'loan-2',
        payrollRunId: 'run1',
        employeeId: 'e1',
        amount: '75.00',
        appliedDate: '2024-01-30',
        source: 'payroll',
      },
      {
        loanId: 'loan-1',
        payrollRunId: 'run1',
        employeeId: 'e1',
        amount: '90.00',
        appliedDate: '2024-01-30',
        source: 'payroll',
      },
    ]);
  });

  it('includes recurring allowances that began before the payroll period', async () => {
    vi.mocked(db.query.payrollRuns.findFirst).mockResolvedValue(null);
    vi.mocked(storage.getEmployees).mockResolvedValue([
      { id: 'emp-1', salary: '1000', status: 'active' },
    ] as any);
    vi.mocked(storage.getLoans).mockResolvedValue([] as any);
    vi.mocked(storage.getVacationRequests).mockResolvedValue([] as any);
    vi.mocked(storage.getEmployeeEvents).mockResolvedValue([
      {
        id: 'evt-allowance',
        employeeId: 'emp-1',
        eventDate: '2023-12-15',
        eventType: 'allowance',
        affectsPayroll: true,
        status: 'active',
        amount: '150',
        recurrenceType: 'monthly',
        recurrenceEndDate: null,
      },
    ] as any);

    const insertedEntries: any[] = [];
    const insert = vi.fn().mockImplementation(table => {
      if (table === payrollRuns) {
        return {
          values: (vals: any) => ({
            returning: vi.fn().mockResolvedValue([{ id: 'run-allowance', ...vals }]),
          }),
        };
      }
      if (table === payrollEntriesTable) {
        return {
          values: vi.fn().mockImplementation(async (vals: any) => {
            insertedEntries.push(vals);
          }),
        };
      }
      if (table === loanPaymentsTable) {
        return {
          values: vi.fn().mockResolvedValue(undefined),
        };
      }
      throw new Error('Unexpected insert table');
    });

    const update = vi.fn().mockImplementation(table => {
      if (table !== loansTable) {
        throw new Error('Unexpected update table');
      }
      return {
        set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
      };
    });

    const tx = { insert, update, rollback: vi.fn() } as any;
    vi.mocked(db.transaction).mockImplementation(async cb => cb(tx));

    const res = await request(app)
      .post('/api/payroll/generate')
      .send({ period: 'Jan 2024', startDate: '2024-01-01', endDate: '2024-01-31' });

    expect(res.status).toBe(201);
    expect(res.body.grossAmount).toBe('1150');
    expect(res.body.netAmount).toBe('1150');
    expect(insertedEntries).toHaveLength(1);
    expect(insertedEntries[0]).toMatchObject({
      employeeId: 'emp-1',
      bonusAmount: '150',
      grossPay: '1150',
      netPay: '1150',
    });
    expect(storage.getEmployeeEvents).toHaveBeenCalledWith(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
    );
    expect(storage.createNotification).not.toHaveBeenCalled();
  });

  it('honors override skips for vacations, loans, and events', async () => {
    vi.mocked(db.query.payrollRuns.findFirst).mockResolvedValue(null);
    vi.mocked(storage.getEmployees).mockResolvedValue([
      { id: 'emp-override', salary: '3000', status: 'active', standardWorkingDays: 30 },
    ] as any);
    vi.mocked(storage.getLoans).mockResolvedValue([
      {
        id: 'loan-override',
        employeeId: 'emp-override',
        status: 'active',
        remainingAmount: '200',
        monthlyDeduction: '75',
        startDate: '2023-11-01',
        endDate: '2024-06-01',
        createdAt: '2023-11-01T00:00:00.000Z',
      },
    ] as any);
    vi.mocked(storage.getVacationRequests).mockResolvedValue([
      {
        id: 'vac-override',
        employeeId: 'emp-override',
        status: 'approved',
        startDate: '2024-01-05',
        endDate: '2024-01-06',
      },
    ] as any);
    vi.mocked(storage.getEmployeeEvents).mockResolvedValue([
      {
        id: 'evt-bonus-override',
        employeeId: 'emp-override',
        eventType: 'bonus',
        eventDate: '2024-01-10',
        affectsPayroll: true,
        status: 'active',
        amount: '150',
        title: 'Project Bonus',
      },
      {
        id: 'evt-deduction-override',
        employeeId: 'emp-override',
        eventType: 'deduction',
        eventDate: '2024-01-12',
        affectsPayroll: true,
        status: 'active',
        amount: '60',
        title: 'Penalty',
      },
      {
        id: 'evt-allowance-override',
        employeeId: 'emp-override',
        eventType: 'allowance',
        eventDate: '2024-01-08',
        affectsPayroll: true,
        status: 'active',
        amount: '100',
        title: 'Housing',
        recurrenceType: 'none',
      },
      {
        id: 'evt-allowance-recurring-override',
        employeeId: 'emp-override',
        eventType: 'allowance',
        eventDate: '2023-12-01',
        affectsPayroll: true,
        status: 'active',
        amount: '50',
        title: 'Transport',
        recurrenceType: 'monthly',
        recurrenceEndDate: null,
      },
    ] as any);

    const insertedEntries: any[] = [];
    const insertedLoanPayments: any[] = [];
    const updateSetCalls: any[] = [];

    const insert = vi.fn().mockImplementation(table => {
      if (table === payrollRuns) {
        return {
          values: (vals: any) => ({
            returning: vi.fn().mockResolvedValue([{ id: 'run-override', ...vals }]),
          }),
        };
      }
      if (table === payrollEntriesTable) {
        return {
          values: vi.fn().mockImplementation(async (vals: any) => {
            insertedEntries.push(vals);
          }),
        };
      }
      if (table === loanPaymentsTable) {
        return {
          values: vi.fn().mockImplementation((vals: any) => {
            if (Array.isArray(vals)) {
              insertedLoanPayments.push(...vals);
            } else {
              insertedLoanPayments.push(vals);
            }
            return Promise.resolve();
          }),
        };
      }
      throw new Error('Unexpected insert table');
    });

    const update = vi.fn().mockImplementation(table => {
      if (table !== loansTable) {
        throw new Error('Unexpected update table');
      }
      return {
        set: (vals: any) => {
          updateSetCalls.push(vals);
          return { where: vi.fn().mockResolvedValue(undefined) };
        },
      };
    });

    const tx = { insert, update, rollback: vi.fn() } as any;
    vi.mocked(db.transaction).mockImplementation(async cb => cb(tx));

    const res = await request(app)
      .post('/api/payroll/generate')
      .send({
        period: 'Jan 2024',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        overrides: {
          skippedVacationIds: ['vac-override'],
          skippedLoanIds: ['loan-override'],
          skippedEventIds: [
            'evt-bonus-override',
            'evt-deduction-override',
            'evt-allowance-override',
            'evt-allowance-recurring-override',
          ],
        },
      });

    expect(res.status).toBe(201);
    expect(insertedEntries).toHaveLength(1);
    expect(insertedEntries[0]).toMatchObject({
      employeeId: 'emp-override',
      vacationDays: 0,
      loanDeduction: '0',
      bonusAmount: '0',
      otherDeductions: '0',
    });
    expect(insertedLoanPayments).toHaveLength(0);
    expect(updateSetCalls).toEqual([]);
    expect(storage.createNotification).not.toHaveBeenCalled();
  });

  it('rolls back transaction on failure', async () => {
    vi.mocked(db.query.payrollRuns.findFirst).mockResolvedValue(null);
    vi.mocked(storage.getEmployees).mockResolvedValue([
      { id: 'e1', salary: '1000', status: 'active' },
    ] as any);
    vi.mocked(storage.getLoans).mockResolvedValue([] as any);
    vi.mocked(storage.getVacationRequests).mockResolvedValue([] as any);
    vi.mocked(storage.getEmployeeEvents).mockResolvedValue([] as any);

    const returning = vi.fn().mockRejectedValue(new Error('fail'));
    const insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning }) });
    const tx = { insert, update: vi.fn(), rollback: vi.fn() } as any;
    vi.mocked(db.transaction).mockImplementation(async cb => {
      try {
        return await cb(tx);
      } catch (err) {
        throw err;
      }
    });

    const res = await request(app)
      .post('/api/payroll/generate')
      .send({ period: 'Jan', startDate: '2024-01-01', endDate: '2024-01-30' });

    expect(res.status).toBe(500);
    expect(tx.rollback).toHaveBeenCalled();
  });
});
