import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerRoutes } from './routes';
import { errorHandler } from './errorHandler';
import { storage } from './storage';

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
  });

  it('POST /api/asset-assignments creates assignment', async () => {
    const newAssignment = {
      id: 'assign1',
      assetId: 'asset1',
      employeeId: 'emp1',
      assignedDate: '2024-02-01',
      status: 'active',
    };
    vi.mocked(storage.createAssetAssignment).mockResolvedValue(newAssignment as any);
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
    expect(storage.createAssetAssignment).toHaveBeenCalledWith({
      assetId: 'asset1',
      employeeId: 'emp1',
      assignedDate: '2024-02-01',
    });
    expect(storage.updateAsset).toHaveBeenCalledWith('asset1', { status: 'assigned' });
  });

  it('POST /api/asset-assignments validates required fields', async () => {
    const res = await request(app).post('/api/asset-assignments').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid asset assignment data');
    expect(storage.createAssetAssignment).not.toHaveBeenCalled();
  });

  it('PUT /api/asset-assignments/:id updates assignment and asset status', async () => {
    vi.mocked(storage.updateAssetAssignment).mockResolvedValue({
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
    vi.mocked(storage.deleteAssetAssignment).mockResolvedValue(true);

    const res = await request(app).delete('/api/asset-assignments/assign1');

    expect(res.status).toBe(204);
    expect(storage.updateAsset).toHaveBeenCalledWith('asset1', { status: 'available' });
  });
});

