import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from './routes';
import { errorHandler } from './errorHandler';
import { storage } from './storage';

vi.mock('./db', () => ({
  db: {
    query: {
      payrollRuns: { findFirst: vi.fn() },
    },
  },
}));

vi.mock('./storage', () => ({
  storage: {
    getLoanBalances: vi.fn(),
    getEmployeeReport: vi.fn(),
    getMonthlyEmployeeSummary: vi.fn(),
  },
}));

function createApp(role: string, id = '1') {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    // @ts-ignore
    req.isAuthenticated = () => true;
    // @ts-ignore
    req.user = { role, id };
    next();
  });
  return app;
}

function createUnauthenticatedApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    // @ts-ignore
    req.isAuthenticated = () => false;
    next();
  });
  return app;
}

describe('chatbot routes access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/chatbot returns 401 when not authenticated', async () => {
    const app = createUnauthenticatedApp();
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).post('/api/chatbot').send({ message: 'hello' });
    expect(res.status).toBe(401);
  });

  it('GET /api/chatbot/loan-status/:id returns 403 for non-admin/hr', async () => {
    const app = createApp('employee');
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/chatbot/loan-status/1');
    expect(res.status).toBe(403);
  });

  it('GET /api/chatbot/loan-status/:id returns 401 when not authenticated', async () => {
    const app = createUnauthenticatedApp();
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/chatbot/loan-status/1');
    expect(res.status).toBe(401);
  });

  it('GET /api/chatbot/loan-status/:id allows admin', async () => {
    const app = createApp('admin');
    await registerRoutes(app);
    app.use(errorHandler);

    vi.mocked(storage.getLoanBalances).mockResolvedValue([{ employeeId: '1', balance: 100 }]);

    const res = await request(app).get('/api/chatbot/loan-status/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balance: 100 });
  });

  it('GET /api/chatbot/report-summary/:id returns 403 for non-admin/hr', async () => {
    const app = createApp('employee');
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/chatbot/report-summary/1');
    expect(res.status).toBe(403);
  });

  it('GET /api/chatbot/report-summary/:id returns 401 when not authenticated', async () => {
    const app = createUnauthenticatedApp();
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/chatbot/report-summary/1');
    expect(res.status).toBe(401);
  });

  it('GET /api/chatbot/report-summary/:id allows admin', async () => {
    const app = createApp('admin');
    await registerRoutes(app);
    app.use(errorHandler);

    vi.mocked(storage.getEmployeeReport).mockResolvedValue([
      {
        payrollEntries: [
          {
            bonusAmount: '10',
            taxDeduction: '2',
            socialSecurityDeduction: '3',
            healthInsuranceDeduction: '0',
            loanDeduction: '5',
            otherDeductions: '1',
            netPay: '100',
          },
        ],
        employeeEvents: [
          { eventType: 'bonus', amount: '7' },
          { eventType: 'deduction', amount: '4' },
        ],
        loans: [{ monthlyDeduction: '8' }],
      },
    ] as any);

    const res = await request(app).get('/api/chatbot/report-summary/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ bonuses: 17, deductions: 23, netPay: 100 });
  });

  it('GET /api/chatbot/monthly-summary/:id returns 401 when not authenticated', async () => {
    const app = createUnauthenticatedApp();
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/chatbot/monthly-summary/1');
    expect(res.status).toBe(401);
  });

  it('GET /api/chatbot/monthly-summary/:id returns 403 for unauthorized role', async () => {
    const app = createApp('guest');
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/chatbot/monthly-summary/1');
    expect(res.status).toBe(403);
  });

  it('GET /api/chatbot/monthly-summary/:id returns 403 when employeeId mismatches user', async () => {
    const app = createApp('employee', '2');
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/chatbot/monthly-summary/1');
    expect(res.status).toBe(403);
  });

  it('GET /api/chatbot/monthly-summary/:id returns expected fields', async () => {
    const app = createApp('admin');
    await registerRoutes(app);
    app.use(errorHandler);

    vi.mocked(storage.getMonthlyEmployeeSummary).mockResolvedValue({
      payroll: [{ grossPay: '1000', netPay: '900' }],
      loans: [{ remainingAmount: '100' }],
      events: [{ title: 'Event' }],
    } as any);

    const res = await request(app).get('/api/chatbot/monthly-summary/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      payroll: { gross: 1000, net: 900 },
      loanBalance: 100,
      events: [{ title: 'Event' }],
    });
  });

  it('GET /api/chatbot/monthly-summary/:id handles no data', async () => {
    const app = createApp('admin');
    await registerRoutes(app);
    app.use(errorHandler);

    vi.mocked(storage.getMonthlyEmployeeSummary).mockResolvedValue({
      payroll: [],
      loans: [],
      events: [],
    } as any);

    const res = await request(app).get('/api/chatbot/monthly-summary/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      payroll: { gross: 0, net: 0 },
      loanBalance: 0,
      events: [],
    });
  });
});

