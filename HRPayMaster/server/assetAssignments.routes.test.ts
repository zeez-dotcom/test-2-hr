import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from './routes';
import { errorHandler } from './errorHandler';
import { storage } from './storage';
import { assetService } from './assetService';

vi.mock('./db', () => ({
  db: {
    query: {
      payrollRuns: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('./storage', () => ({
  storage: {
    getAssetAssignments: vi.fn(),
    getAssetAssignment: vi.fn(),
    createAssetAssignment: vi.fn(),
    updateAssetAssignment: vi.fn(),
    deleteAssetAssignment: vi.fn(),
    updateAsset: vi.fn(),
    createEmployeeEvent: vi.fn(),
    getVacationRequests: vi.fn(),
  },
}));

vi.mock('./assetService', () => ({
  assetService: {
    getAssets: vi.fn(),
    getAsset: vi.fn(),
    createAsset: vi.fn(),
    updateAsset: vi.fn(),
    deleteAsset: vi.fn(),
    getAssignments: vi.fn(),
    getAssignment: vi.fn(),
    createAssignment: vi.fn(),
    updateAssignment: vi.fn(),
    deleteAssignment: vi.fn(),
    invalidateAssignmentCache: vi.fn(),
  },
}));

function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    // Stub auth middleware
    // @ts-ignore
    req.isAuthenticated = () => true;
    // @ts-ignore
    req.user = { role: 'admin' };
    next();
  });
  return app;
}

describe('asset assignment routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = createApp();
    await registerRoutes(app);
    app.use(errorHandler);
    vi.clearAllMocks();
    vi.mocked(storage.getVacationRequests).mockResolvedValue([]);
  });

  it('POST /api/asset-assignments creates assignment', async () => {
    const newAssignment = {
      id: 'assign1',
      assetId: 'asset1',
      employeeId: 'emp1',
      assignedDate: '2024-02-01',
      status: 'active',
    };
    vi.mocked(assetService.createAssignment).mockResolvedValue(newAssignment as any);
    vi.mocked(storage.getAssetAssignment).mockResolvedValue({
      ...newAssignment,
      asset: { name: 'Laptop' },
      employee: { firstName: 'John', lastName: 'Doe' },
    } as any);

    const res = await request(app)
      .post('/api/asset-assignments')
      .send({ assetId: 'asset1', employeeId: 'emp1', assignedDate: '2024-02-01' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(newAssignment);
    expect(assetService.createAssignment).toHaveBeenCalledWith({
      assetId: 'asset1',
      employeeId: 'emp1',
      assignedDate: '2024-02-01',
    });
    expect(storage.updateAsset).toHaveBeenCalledWith('asset1', { status: 'assigned' });
    expect(storage.getVacationRequests).toHaveBeenCalled();
  });

  it('POST /api/asset-assignments returns 409 when vacation overlaps assignment date', async () => {
    const vacation = {
      id: 'vac1',
      employeeId: 'emp1',
      status: 'approved',
      startDate: '2024-01-05',
      endDate: '2024-01-10',
    };
    vi.mocked(storage.getVacationRequests).mockResolvedValue([vacation] as any);

    const res = await request(app)
      .post('/api/asset-assignments')
      .send({ assetId: 'asset1', employeeId: 'emp1', assignedDate: '2024-01-08' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('Employee has approved vacation overlapping 2024-01-08');
    expect(assetService.createAssignment).not.toHaveBeenCalled();
    const [start, end] = vi.mocked(storage.getVacationRequests).mock.calls[0];
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    expect((start as Date).toISOString()).toBe(new Date('2024-01-08').toISOString());
    expect((end as Date).toISOString()).toBe(new Date('2024-01-08').toISOString());
  });

  it('POST /api/asset-assignments validates required fields', async () => {
    const res = await request(app).post('/api/asset-assignments').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid asset assignment data');
    expect(assetService.createAssignment).not.toHaveBeenCalled();
  });

  it('PUT /api/asset-assignments/:id updates assignment and asset status', async () => {
    vi.mocked(assetService.updateAssignment).mockResolvedValue({
      id: 'assign1',
      assetId: 'asset1',
      employeeId: 'emp1',
      assignedDate: '2024-02-01',
      status: 'completed',
    } as any);
    vi.mocked(storage.getAssetAssignment).mockResolvedValue({
      id: 'assign1',
      assetId: 'asset1',
      employeeId: 'emp1',
      assignedDate: '2024-02-01',
      status: 'completed',
      asset: { name: 'Laptop' },
      employee: { firstName: 'John', lastName: 'Doe' },
    } as any);

    const res = await request(app)
      .put('/api/asset-assignments/assign1')
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(assetService.updateAssignment).toHaveBeenCalledWith('assign1', { status: 'completed' });
    expect(storage.updateAsset).toHaveBeenCalledWith('asset1', { status: 'available' });
  });

  it('DELETE /api/asset-assignments/:id removes assignment and updates asset', async () => {
    vi.mocked(storage.getAssetAssignment).mockResolvedValue({
      id: 'assign1',
      assetId: 'asset1',
      employeeId: 'emp1',
      status: 'active',
      asset: { name: 'Laptop' },
      employee: { firstName: 'John', lastName: 'Doe' },
    } as any);
    vi.mocked(assetService.deleteAssignment).mockResolvedValue(true);

    const res = await request(app).delete('/api/asset-assignments/assign1');

    expect(res.status).toBe(204);
    expect(assetService.deleteAssignment).toHaveBeenCalledWith('assign1');
    expect(storage.updateAsset).toHaveBeenCalledWith('asset1', { status: 'available' });
  });
});

