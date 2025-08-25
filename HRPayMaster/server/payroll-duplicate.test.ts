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
  },
}));

vi.mock('./db', () => ({
  db: {
    query: {
      payrollRuns: {
        findFirst: vi.fn(),
      },
    },
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
    vi.mocked(db.query.payrollRuns.findFirst).mockReset();
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
    };
    vi.mocked(db.query.payrollRuns.findFirst).mockResolvedValue(existing as any);

    const res = await request(app)
      .post('/api/payroll/generate')
      .send({ period: 'Feb 2024', startDate: '2024-01-15', endDate: '2024-01-20' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Payroll run already exists for this period');
    expect(storage.getEmployees).not.toHaveBeenCalled();
  });
});

