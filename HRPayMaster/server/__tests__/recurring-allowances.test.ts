import { describe, it, expect, beforeEach, vi } from 'vitest';

const { employeeEventsFindManyMock, selectMock } = vi.hoisted(() => ({
  employeeEventsFindManyMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    query: {
      employeeEvents: {
        findMany: employeeEventsFindManyMock,
      },
    },
    select: selectMock,
  },
}));

import { storage } from '../storage';

describe('DatabaseStorage recurring allowance expansion', () => {
  beforeEach(() => {
    employeeEventsFindManyMock.mockReset();
    selectMock.mockReset();
  });

  it('returns monthly allowance occurrences for overlapping periods in getEmployeeEvents', async () => {
    const allowanceEvent = {
      id: 'evt-1',
      employeeId: 'emp-1',
      eventDate: '2023-11-15',
      eventType: 'allowance',
      amount: '150',
      status: 'active',
      affectsPayroll: true,
      recurrenceType: 'monthly',
      recurrenceEndDate: null,
      employee: {
        id: 'emp-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    };
    employeeEventsFindManyMock.mockResolvedValue([allowanceEvent]);

    const results = await storage.getEmployeeEvents(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'evt-1',
      employeeId: 'emp-1',
      eventType: 'allowance',
      recurrenceType: 'monthly',
      eventDate: '2024-01-15',
    });
  });

  it('includes recurring allowance occurrences in employee reports', async () => {
    const rawAllowance = {
      id: 'evt-2',
      employeeId: 'emp-2',
      eventDate: '2023-12-05',
      eventType: 'allowance',
      amount: '200',
      status: 'active',
      affectsPayroll: true,
      recurrenceType: 'monthly',
      recurrenceEndDate: null,
    };

    selectMock
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [rawAllowance],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      });

    const report = await storage.getEmployeeReport('emp-2', {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      groupBy: 'month',
    });

    expect(report).toEqual([
      {
        period: '2024-01',
        payrollEntries: [],
        employeeEvents: [
          expect.objectContaining({
            id: 'evt-2',
            eventType: 'allowance',
            eventDate: '2024-01-05',
          }),
        ],
        loans: [],
        vacationRequests: [],
      },
    ]);
  });
});
