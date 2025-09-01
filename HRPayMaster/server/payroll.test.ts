import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from './routes';
import { errorHandler } from './errorHandler';
import { storage } from './storage';
import { db } from './db';

vi.mock('./storage', () => ({
  storage: {
    getEmployees: vi.fn(),
    getLoans: vi.fn(),
    getVacationRequests: vi.fn(),
    getEmployeeEvents: vi.fn(),
    createNotification: vi.fn(),
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
    vi.mocked(storage.createNotification).mockReset();
    vi.mocked(db.query.payrollRuns.findFirst).mockReset();
    vi.mocked(db.transaction).mockReset();
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
    vi.mocked(storage.getLoans).mockResolvedValue([
      { employeeId: 'e1', status: 'active', remainingAmount: '500', monthlyDeduction: '100' },
    ] as any);
    vi.mocked(storage.getVacationRequests).mockResolvedValue([
      { employeeId: 'e1', status: 'approved', startDate: '2024-01-05', endDate: '2024-01-06' },
    ] as any);
    vi.mocked(storage.getEmployeeEvents).mockResolvedValue([] as any);

    const insert = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals) => ({ returning: vi.fn().mockResolvedValue([{ id: 'run1', ...vals }]) })),
    }));
    const update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) });
    const tx = { insert, update, rollback: vi.fn() } as any;
    vi.mocked(db.transaction).mockImplementation(async cb => cb(tx));

    const res = await request(app)
      .post('/api/payroll/generate')
      .send({ period: 'Jan', startDate: '2024-01-01', endDate: '2024-01-30' });

    expect(res.status).toBe(201);
    expect(res.body.grossAmount).toBe('2800');
    expect(res.body.totalDeductions).toBe('100');
    expect(res.body.netAmount).toBe('2700');
    expect(storage.createNotification).toHaveBeenCalledTimes(2);
    expect(storage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'vacation_approved' }),
    );
    expect(storage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'loan_deduction' }),
    );
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
