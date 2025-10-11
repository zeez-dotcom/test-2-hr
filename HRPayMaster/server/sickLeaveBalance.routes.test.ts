// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from './routes';
import { errorHandler } from './errorHandler';

const storageMock = vi.hoisted(() => ({
  getEmployee: vi.fn(),
  getSickLeaveBalance: vi.fn(),
  createSickLeaveBalance: vi.fn(),
  updateSickLeaveBalance: vi.fn(),
}));

vi.mock('./db', () => ({
  db: {
    query: {},
  },
}));

vi.mock('./storage', () => ({
  storage: storageMock,
}));

function createApp(role: string, id = '1') {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    // @ts-ignore - injected by tests
    req.isAuthenticated = () => true;
    // @ts-ignore - injected by tests
    req.user = { role, id };
    next();
  });
  return app;
}

function createUnauthenticatedApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    // @ts-ignore - injected by tests
    req.isAuthenticated = () => false;
    next();
  });
  return app;
}

describe('sick leave balance routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/employees/:id/sick-leave-balance returns 401 when unauthenticated', async () => {
    const app = createUnauthenticatedApp();
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/employees/emp-1/sick-leave-balance');
    expect(res.status).toBe(401);
  });

  it('GET /api/employees/:id/sick-leave-balance returns 404 when employee missing', async () => {
    storageMock.getEmployee.mockResolvedValueOnce(undefined as any);

    const app = createApp('hr');
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/employees/emp-1/sick-leave-balance');
    expect(res.status).toBe(404);
    expect(storageMock.getSickLeaveBalance).not.toHaveBeenCalled();
  });

  it('GET /api/employees/:id/sick-leave-balance validates year query', async () => {
    storageMock.getEmployee.mockResolvedValueOnce({ id: 'emp-1' });

    const app = createApp('hr');
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/employees/emp-1/sick-leave-balance?year=not-a-number');
    expect(res.status).toBe(400);
    expect(storageMock.getSickLeaveBalance).not.toHaveBeenCalled();
  });

  it('GET /api/employees/:id/sick-leave-balance returns existing record', async () => {
    const balance = {
      id: 'bal-1',
      employeeId: 'emp-1',
      year: 2024,
      totalSickDaysUsed: 3,
      remainingSickDays: 11,
      lastUpdated: new Date().toISOString(),
    };

    storageMock.getEmployee.mockResolvedValueOnce({ id: 'emp-1' });
    storageMock.getSickLeaveBalance.mockResolvedValueOnce(balance as any);

    const app = createApp('hr');
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/employees/emp-1/sick-leave-balance?year=2024');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(balance);
    expect(storageMock.createSickLeaveBalance).not.toHaveBeenCalled();
  });

  it('GET /api/employees/:id/sick-leave-balance creates default when missing', async () => {
    storageMock.getEmployee.mockResolvedValueOnce({ id: 'emp-1' });
    storageMock.getSickLeaveBalance.mockResolvedValueOnce(undefined as any);
    storageMock.createSickLeaveBalance.mockResolvedValueOnce({
      id: 'bal-1',
      employeeId: 'emp-1',
      year: 2024,
      totalSickDaysUsed: 0,
      remainingSickDays: 14,
      lastUpdated: new Date().toISOString(),
    } as any);

    const app = createApp('hr');
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app).get('/api/employees/emp-1/sick-leave-balance?year=2024');
    expect(res.status).toBe(200);
    expect(storageMock.createSickLeaveBalance).toHaveBeenCalledWith({
      employeeId: 'emp-1',
      year: 2024,
      totalSickDaysUsed: 0,
      remainingSickDays: 14,
    });
  });

  it('POST /api/employees/:id/sick-leave-balance returns 404 when employee missing', async () => {
    storageMock.getEmployee.mockResolvedValueOnce(undefined as any);

    const app = createApp('hr');
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app)
      .post('/api/employees/emp-1/sick-leave-balance')
      .send({ year: 2024, daysUsed: 2 });
    expect(res.status).toBe(404);
    expect(storageMock.getSickLeaveBalance).not.toHaveBeenCalled();
  });

  it('POST /api/employees/:id/sick-leave-balance rejects requests exceeding balance', async () => {
    storageMock.getEmployee.mockResolvedValueOnce({ id: 'emp-1' });
    storageMock.getSickLeaveBalance.mockResolvedValueOnce({
      id: 'bal-1',
      employeeId: 'emp-1',
      year: 2024,
      totalSickDaysUsed: 2,
      remainingSickDays: 1,
    } as any);

    const app = createApp('hr');
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app)
      .post('/api/employees/emp-1/sick-leave-balance')
      .send({ year: 2024, daysUsed: 3 });
    expect(res.status).toBe(400);
    expect(storageMock.updateSickLeaveBalance).not.toHaveBeenCalled();
  });

  it('POST /api/employees/:id/sick-leave-balance updates existing balance', async () => {
    const balance = {
      id: 'bal-1',
      employeeId: 'emp-1',
      year: 2024,
      totalSickDaysUsed: 3,
      remainingSickDays: 11,
    };

    const updated = {
      ...balance,
      totalSickDaysUsed: 6,
      remainingSickDays: 8,
      lastUpdated: new Date().toISOString(),
    };

    storageMock.getEmployee.mockResolvedValueOnce({ id: 'emp-1' });
    storageMock.getSickLeaveBalance.mockResolvedValueOnce(balance as any);
    storageMock.updateSickLeaveBalance.mockResolvedValueOnce(updated as any);

    const app = createApp('hr');
    await registerRoutes(app);
    app.use(errorHandler);

    const res = await request(app)
      .post('/api/employees/emp-1/sick-leave-balance')
      .send({ year: 2024, daysUsed: 3 });

    expect(res.status).toBe(200);
    expect(storageMock.updateSickLeaveBalance).toHaveBeenCalledWith('bal-1', {
      totalSickDaysUsed: 6,
      remainingSickDays: 8,
    });
    expect(res.body).toEqual(updated);
  });
});
