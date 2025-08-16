import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from './errorHandler';

vi.mock('./storage', () => {
  return {
    storage: {
      getEmployees: vi.fn(),
      createEmployee: vi.fn(),
      getPayrollRuns: vi.fn(),
      getLoans: vi.fn(),
      getCars: vi.fn(),
    },
  };
});

import { registerRoutes } from './routes';
import { payrollRouter } from './routes/payroll';
import { loansRouter } from './routes/loans';
import { carsRouter } from './routes/cars';
import { storage } from './storage';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stub authentication for tests
    // @ts-ignore
    req.isAuthenticated = () => true;
    next();
  });
  return app;
}

describe('employee routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    await registerRoutes(app);
    app.use('/api/payroll', payrollRouter);
    app.use('/api/loans', loansRouter);
    app.use('/api/cars', carsRouter);
    app.use(errorHandler);
    vi.clearAllMocks();
  });

  it('GET /api/employees returns employees list', async () => {
    const mockEmployees = [
      { id: '1', firstName: 'John', lastName: 'Doe', position: 'Dev', salary: '0', workLocation: 'Office', startDate: '2024-01-01' },
    ];
    (storage.getEmployees as any).mockResolvedValue(mockEmployees);

    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockEmployees);
  });

  it('POST /api/employees validates input data', async () => {
    const res = await request(app).post('/api/employees').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid employee data');
  });

  it('GET /api/payroll returns payroll runs', async () => {
    const mockRuns = [
      { id: '1', period: '2024-01', startDate: '2024-01-01', endDate: '2024-01-31', grossAmount: '0', totalDeductions: '0', netAmount: '0', status: 'completed' }
    ];
    (storage.getPayrollRuns as any).mockResolvedValue(mockRuns);

    const res = await request(app).get('/api/payroll');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockRuns);
  });

  it('GET /api/loans returns loans list', async () => {
    const mockLoans = [
      { id: '1', employeeId: '1', amount: '1000', status: 'active', remainingAmount: '500', monthlyDeduction: '100' }
    ];
    (storage.getLoans as any).mockResolvedValue(mockLoans);

    const res = await request(app).get('/api/loans');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockLoans);
  });

  it('GET /api/cars returns cars list', async () => {
    const mockCars = [
      { id: '1', make: 'Toyota', model: 'Corolla', year: 2020, status: 'available' }
    ];
    (storage.getCars as any).mockResolvedValue(mockCars);

    const res = await request(app).get('/api/cars');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockCars);
  });
});
