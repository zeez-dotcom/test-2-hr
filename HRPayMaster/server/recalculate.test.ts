import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from './routes';
import { errorHandler } from './errorHandler';

vi.mock('./db', () => {
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => []),
    })),
  }));
  const transaction = vi.fn(async (cb: any) => cb({ update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })) }));
  return { db: { select, transaction } };
});

describe('payroll recalculate', () => {
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

  it('returns 404 when no entries found', async () => {
    const res = await request(app)
      .post('/api/payroll/any-id/recalculate')
      .send();
    expect(res.status).toBe(404);
    expect(res.body.error?.message).toMatch(/No payroll entries/i);
  });
});

