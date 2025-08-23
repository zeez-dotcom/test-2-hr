import { describe, it, expect, beforeEach, vi } from 'vitest';

const { findFirstMock, updateMock, insertMock } = vi.hoisted(() => {
  return {
    findFirstMock: vi.fn(),
    updateMock: vi.fn(),
    insertMock: vi.fn(),
  };
});

vi.mock('./db', () => ({
  db: {
    query: {
      assetAssignments: {
        findFirst: findFirstMock,
      },
    },
    update: updateMock,
    insert: insertMock,
  },
}));

import { storage } from './storage';

describe('createAssetAssignment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('auto-completes existing assignment and creates a new one', async () => {
    const existing = {
      id: 'old',
      assetId: 'asset1',
      employeeId: 'emp1',
      assignedDate: '2024-01-01',
      status: 'active',
    };

    const newAssignment = {
      assetId: 'asset1',
      employeeId: 'emp2',
      assignedDate: '2024-02-01',
    };

    findFirstMock.mockResolvedValueOnce(existing);

    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    updateMock.mockReturnValueOnce({ set: setMock });

    const returningMock = vi.fn().mockResolvedValue([
      { id: 'new', ...newAssignment, status: 'active' },
    ]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    insertMock.mockReturnValueOnce({ values: valuesMock });

    const result = await storage.createAssetAssignment(newAssignment as any);

    expect(setMock).toHaveBeenCalledWith({
      status: 'completed',
      returnDate: newAssignment.assignedDate,
    });
    expect(valuesMock).toHaveBeenCalledWith({
      ...newAssignment,
      status: 'active',
    });
    expect(result).toEqual({
      id: 'new',
      ...newAssignment,
      status: 'active',
    });
  });

  it('rejects when asset already assigned to the same employee', async () => {
    const existing = {
      id: 'old',
      assetId: 'asset1',
      employeeId: 'emp1',
      assignedDate: '2024-01-01',
      status: 'active',
    };

    const newAssignment = {
      assetId: 'asset1',
      employeeId: 'emp1',
      assignedDate: '2024-02-01',
    };

    findFirstMock.mockResolvedValueOnce(existing);

    await expect(
      storage.createAssetAssignment(newAssignment as any),
    ).rejects.toThrow('Asset already assigned');

    expect(updateMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

