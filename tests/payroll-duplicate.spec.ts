import { test, expect } from '@playwright/test';
import express from '../HRPayMaster/node_modules/express';
import request from '../HRPayMaster/node_modules/supertest';

test('returns 409 when generating overlapping payroll run', async () => {
  process.env.DATABASE_URL = 'postgres://localhost/test';

  const { registerRoutes } = await import('../HRPayMaster/server/routes');
  const { errorHandler } = await import('../HRPayMaster/server/errorHandler');
  const { storage } = await import('../HRPayMaster/server/storage');
  const { db } = await import('../HRPayMaster/server/db');

  const app = express();
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
  db.query.payrollRuns.findFirst = async () => existing as any;

  let employeesCalled = false;
  storage.getEmployees = async () => {
    employeesCalled = true;
    return [] as any;
  };

  const res = await request(app)
    .post('/api/payroll/generate')
    .send({ period: 'Feb 2024', startDate: '2024-01-15', endDate: '2024-01-20' });

  expect(res.status).toBe(409);
  expect(res.body.error.message).toBe('Payroll run already exists for this period');
  expect(employeesCalled).toBe(false);
});
