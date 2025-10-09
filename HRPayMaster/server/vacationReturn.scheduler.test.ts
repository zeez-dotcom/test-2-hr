import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processVacationReturnAlerts, VACATION_RETURN_LOOKAHEAD_DAYS, VACATION_RETURN_OVERDUE_LOOKBACK_DAYS } from './vacationReturnScheduler';
import { storage } from './storage';

vi.mock('./storage', () => ({
  storage: {
    getVacationRequests: vi.fn(),
    createNotification: vi.fn(),
    updateNotification: vi.fn(),
  },
}));

vi.mock('./vite', () => ({
  log: vi.fn(),
}));

describe('processVacationReturnAlerts', () => {
  const NOW = new Date('2024-02-10T08:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.createNotification).mockImplementation(async (payload: any) => ({
      id: 'notif-' + (Math.random() * 1000).toFixed(0),
      status: 'read',
      createdAt: new Date().toISOString(),
      ...payload,
    }));
    vi.mocked(storage.updateNotification).mockResolvedValue(undefined as any);
  });

  it('creates critical notifications for approved vacations ending soon', async () => {
    const vacation = {
      id: 'vac-1',
      employeeId: 'emp-1',
      status: 'approved',
      startDate: '2024-02-01',
      endDate: '2024-02-11',
      employee: {
        id: 'emp-1',
        firstName: 'Ranya',
        lastName: 'Hassan',
        status: 'on_leave',
      },
    };

    vi.mocked(storage.getVacationRequests).mockResolvedValue([vacation] as any);

    const processed = await processVacationReturnAlerts(NOW);

    expect(processed).toBe(1);
    expect(storage.getVacationRequests).toHaveBeenCalledTimes(1);
    const [start, end] = vi.mocked(storage.getVacationRequests).mock.calls[0];
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    const expectedStart = new Date(Date.UTC(2024, 1, 10) - VACATION_RETURN_OVERDUE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const expectedEnd = new Date(Date.UTC(2024, 1, 10) + VACATION_RETURN_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    expect((start as Date).toISOString()).toBe(expectedStart.toISOString());
    expect((end as Date).toISOString()).toBe(expectedEnd.toISOString());

    expect(storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 'emp-1',
      type: 'vacation_return_due',
      title: 'Vacation return due (2024-02-11)',
      priority: 'critical',
      daysUntilExpiry: 1,
      emailSent: false,
    }));
    const expiryArg = vi.mocked(storage.createNotification).mock.calls[0][0].expiryDate as Date;
    expect(expiryArg).toBeInstanceOf(Date);
    expect(expiryArg.toISOString()).toBe(new Date(Date.UTC(2024, 1, 11)).toISOString());

    expect(storage.updateNotification).toHaveBeenCalled();
    const updatePayload = vi.mocked(storage.updateNotification).mock.calls[0][1];
    expect(updatePayload).toMatchObject({
      message: expect.stringContaining('Reactivate the employee'),
      priority: 'critical',
      daysUntilExpiry: 1,
      status: 'unread',
    });
  });

  it('skips vacations that are not approved or whose employees are not on leave', async () => {
    vi.mocked(storage.getVacationRequests).mockResolvedValue([
      {
        id: 'vac-1',
        employeeId: 'emp-1',
        status: 'pending',
        endDate: '2024-02-11',
        employee: { id: 'emp-1', status: 'on_leave' },
      },
      {
        id: 'vac-2',
        employeeId: 'emp-2',
        status: 'approved',
        endDate: '2024-02-11',
        employee: { id: 'emp-2', status: 'active' },
      },
    ] as any);

    const processed = await processVacationReturnAlerts(NOW);

    expect(processed).toBe(0);
    expect(storage.createNotification).not.toHaveBeenCalled();
    expect(storage.updateNotification).not.toHaveBeenCalled();
  });

  it('marks overdue vacations and keeps notifications unread', async () => {
    const vacation = {
      id: 'vac-3',
      employeeId: 'emp-3',
      status: 'approved',
      startDate: '2024-01-25',
      endDate: '2024-02-05',
      employee: {
        id: 'emp-3',
        firstName: 'Omar',
        lastName: 'Saleh',
        status: 'on_leave',
      },
    };

    vi.mocked(storage.getVacationRequests).mockResolvedValue([vacation] as any);

    await processVacationReturnAlerts(NOW);

    expect(storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Vacation return overdue (2024-02-05)',
      daysUntilExpiry: -5,
    }));
    expect(storage.updateNotification).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      status: 'unread',
      daysUntilExpiry: -5,
    }));
  });
});
