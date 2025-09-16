import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from './routes';
import { errorHandler } from './errorHandler';

vi.mock('./storage', () => ({
  storage: {
    getCompanyPayrollByDepartment: vi.fn(),
  },
}));

describe('reports: payroll by department', () => {
  let app: express.Express;
  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // @ts-ignore
      req.isAuthenticated = () => true;
      // @ts-ignore
      req.user = { role: 'admin' };
      next();
    });
    await registerRoutes(app);
    app.use(errorHandler);
  });

  it('returns mapped rows', async () => {
    const { storage } = await import('./storage');
    vi.mocked(storage.getCompanyPayrollByDepartment).mockResolvedValue([
      { period: '2024-01', departmentId: 'd1', departmentName: 'Sales', grossPay: 1000, netPay: 900 },
      { period: '2024-01', departmentId: 'd2', departmentName: 'Tech', grossPay: 2000, netPay: 1800 },
    ] as any);

    const res = await request(app)
      .get('/api/reports/payroll-by-department?startDate=2024-01-01&endDate=2024-01-31')
      .send();

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      period: '2024-01',
      departmentId: 'd1',
      departmentName: 'Sales',
      totals: { grossPay: 1000, netPay: 900 },
    });
  });
});

