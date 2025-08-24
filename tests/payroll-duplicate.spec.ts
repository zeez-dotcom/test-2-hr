import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from '../HRPayMaster/server/routes';
import { errorHandler } from '../HRPayMaster/server/errorHandler';
import { storage } from '../HRPayMaster/server/storage';

process.env.DATABASE_URL = 'postgres://localhost/test';

vi.mock('../HRPayMaster/server/storage', () => {
  return {
    storage: {
      getPayrollRuns: vi.fn(),
      getEmployees: vi.fn(),
      getLoans: vi.fn(),
      getVacationRequests: vi.fn(),
      getEmployeeEvents: vi.fn(),
      createNotification: vi.fn(),
    },
  };
});

function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    // @ts-ignore
    req.isAuthenticated = () => true;
    next();
  });
  return app;
}

describe('payroll duplicate prevention', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    await registerRoutes(app);
    app.use(errorHandler);
    vi.clearAllMocks();
  });

  it('returns 409 when generating overlapping payroll run', async () => {
    const existing = [{
      id: 'run1',
      period: 'Jan 2024',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      grossAmount: '0',
      totalDeductions: '0',
      netAmount: '0',
      status: 'completed',
    }];
    (storage.getPayrollRuns as any).mockResolvedValue(existing);

    const res = await request(app)
      .post('/api/payroll/generate')
      .send({ period: 'Feb 2024', startDate: '2024-01-15', endDate: '2024-01-20' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Payroll run already exists for this period');
    expect(storage.getEmployees).not.toHaveBeenCalled();
  });
});

