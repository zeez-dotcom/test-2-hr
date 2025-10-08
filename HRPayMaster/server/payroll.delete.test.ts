/// <reference types="vitest" />
// @vitest-environment node

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { payrollRouter } from './routes/payroll';
import { errorHandler } from './errorHandler';
import { payrollRuns, payrollEntries, loanPayments, loans } from '@shared/schema';

interface PayrollRunState {
  id: string;
  period: string;
}

interface PayrollEntryState {
  id: string;
  payrollRunId: string;
}

interface LoanPaymentState {
  id: string;
  payrollRunId: string;
  loanId: string;
  amount: string;
}

interface LoanState {
  id: string;
  amount: string;
  remainingAmount: string;
  status: string;
}

const dbState = vi.hoisted(() => ({
  payrollRuns: new Map<string, PayrollRunState>(),
  payrollEntries: new Map<string, PayrollEntryState>(),
  loanPayments: new Map<string, LoanPaymentState>(),
  loans: new Map<string, LoanState>(),
}));

const extractConditionValue = (condition: unknown): string | undefined => {
  if (!condition) return undefined;
  if (typeof condition === 'string') return condition;
  if (typeof condition === 'object') {
    const obj = condition as Record<string, unknown>;
    if (typeof obj.right === 'string') return obj.right;
    if (obj.right && typeof obj.right === 'object' && 'value' in obj.right) {
      const value = (obj.right as Record<string, unknown>).value;
      if (typeof value === 'string') return value;
    }
    if (Array.isArray(obj.queryChunks)) {
      for (const chunk of obj.queryChunks as Array<Record<string, unknown>>) {
        if (typeof chunk?.value === 'string') {
          return chunk.value;
        }
      }
    }
    if (typeof obj.value === 'string') return obj.value;
  }
  return undefined;
};

const extractConditionValues = (condition: unknown): string[] => {
  if (!condition) return [];
  if (Array.isArray(condition)) {
    return condition.filter((value): value is string => typeof value === 'string');
  }
  if (typeof condition === 'object') {
    const obj = condition as Record<string, unknown>;
    if (Array.isArray(obj.values)) {
      return obj.values.filter((value): value is string => typeof value === 'string');
    }
    if (Array.isArray(obj.queryChunks)) {
      const collected: string[] = [];
      for (const chunk of obj.queryChunks as Array<Record<string, unknown>>) {
        const chunkValue = chunk?.value;
        if (Array.isArray(chunkValue)) {
          collected.push(
            ...chunkValue.filter((value): value is string => typeof value === 'string'),
          );
        } else if (
          chunkValue &&
          typeof chunkValue === 'object' &&
          'value' in (chunkValue as Record<string, unknown>) &&
          typeof (chunkValue as Record<string, unknown>).value === 'string'
        ) {
          collected.push((chunkValue as Record<string, string>).value);
        } else if (typeof chunkValue === 'string') {
          collected.push(chunkValue);
        }

        if ('0' in chunk) {
          const first = (chunk as Record<string, unknown>)['0'];
          if (Array.isArray(first)) {
            collected.push(
              ...first.filter((value): value is string => typeof value === 'string'),
            );
          } else if (
            first &&
            typeof first === 'object' &&
            'value' in (first as Record<string, unknown>) &&
            typeof (first as Record<string, unknown>).value === 'string'
          ) {
            collected.push((first as Record<string, string>).value);
          }
        }
      }
      if (collected.length > 0) {
        return collected
          .map(value => value.trim())
          .filter(value => value.length > 0 && value.toLowerCase() !== 'in');
      }
    }
    if (Array.isArray(obj.value)) {
      return obj.value.filter((value): value is string => typeof value === 'string');
    }
  }
  return [];
};

vi.mock('./db', async () => {
  const buildSelection = (
    table: unknown,
    selection: Record<string, unknown> | undefined,
    condition: unknown,
  ) => {
    let rows: Array<Record<string, any>> = [];

    if (table === loanPayments) {
      const value = extractConditionValue(condition);
      rows = Array.from(dbState.loanPayments.values()).filter(payment => {
        return value ? payment.payrollRunId === value : true;
      });
    } else if (table === payrollEntries) {
      const value = extractConditionValue(condition);
      rows = Array.from(dbState.payrollEntries.values()).filter(entry => {
        return value ? entry.payrollRunId === value : true;
      });
    } else if (table === payrollRuns) {
      const value = extractConditionValue(condition);
      rows = Array.from(dbState.payrollRuns.values()).filter(run => {
        return value ? run.id === value : true;
      });
    } else if (table === loans) {
      const values = extractConditionValues(condition);
      rows = Array.from(dbState.loans.values()).filter(loan => {
        return values.length > 0 ? values.includes(loan.id) : true;
      });
    }

    if (!selection) {
      return rows.map(row => ({ ...row }));
    }

    const keys = Object.keys(selection);
    return rows.map(row => {
      const mapped: Record<string, unknown> = {};
      for (const key of keys) {
        mapped[key] = row[key];
      }
      return mapped;
    });
  };

  const selectFactory = (selection: Record<string, unknown>) => ({
    from: (table: unknown) => ({
      where: (condition: unknown) => {
        const results = buildSelection(table, selection, condition);
        const promise = Promise.resolve(results);
        return Object.assign(promise, {
          limit: (count: number) => Promise.resolve(results.slice(0, count)),
        });
      },
      limit: (count: number) => {
        const results = buildSelection(table, selection, undefined);
        return Promise.resolve(results.slice(0, count));
      },
    }),
  });

  const deleteFactory = (table: unknown) => ({
    where: async (condition: unknown) => {
      const value = extractConditionValue(condition);
      let rowCount = 0;

      if (table === loanPayments) {
        for (const [id, payment] of Array.from(dbState.loanPayments.entries())) {
          if (payment.payrollRunId === value) {
            dbState.loanPayments.delete(id);
            rowCount++;
          }
        }
      } else if (table === payrollEntries) {
        for (const [id, entry] of Array.from(dbState.payrollEntries.entries())) {
          if (entry.payrollRunId === value) {
            dbState.payrollEntries.delete(id);
            rowCount++;
          }
        }
      } else if (table === payrollRuns && value) {
        if (dbState.payrollRuns.delete(value)) {
          rowCount = 1;
        }
      }

      return { rowCount };
    },
  });

  const updateFactory = (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: async (condition: unknown) => {
        const value = extractConditionValue(condition);
        let rowCount = 0;

        if (table === loans && value) {
          const loan = dbState.loans.get(value);
          if (loan) {
            Object.assign(loan, values);
            dbState.loans.set(value, loan);
            rowCount = 1;
          }
        }

        return { rowCount };
      },
    }),
  });

  const transaction = async (
    cb: (
      tx: {
        delete: typeof deleteFactory;
        select: typeof selectFactory;
        update: typeof updateFactory;
      },
    ) => Promise<unknown>,
  ) => {
    const tx = {
      delete: deleteFactory,
      select: selectFactory,
      update: updateFactory,
    };
    return await cb(tx as {
      delete: typeof deleteFactory;
      select: typeof selectFactory;
      update: typeof updateFactory;
    });
  };

  return {
    db: {
      transaction,
    },
    pool: {},
  };
});

describe('DELETE /api/payroll/:id', () => {
  let app: express.Express;

  beforeEach(() => {
    dbState.payrollRuns = new Map();
    dbState.payrollEntries = new Map();
    dbState.loanPayments = new Map();
    dbState.loans = new Map();

    dbState.payrollRuns.set('run-1', { id: 'run-1', period: 'Jan 2024' });
    dbState.payrollRuns.set('run-2', { id: 'run-2', period: 'Feb 2024' });

    dbState.payrollEntries.set('entry-1', { id: 'entry-1', payrollRunId: 'run-1' });
    dbState.payrollEntries.set('entry-2', { id: 'entry-2', payrollRunId: 'run-2' });

    dbState.loanPayments.set('payment-1', {
      id: 'payment-1',
      payrollRunId: 'run-1',
      loanId: 'loan-1',
      amount: '100.00',
    });
    dbState.loanPayments.set('payment-2', {
      id: 'payment-2',
      payrollRunId: 'run-2',
      loanId: 'loan-2',
      amount: '200.00',
    });

    dbState.loans.set('loan-1', {
      id: 'loan-1',
      amount: '1000.00',
      remainingAmount: '400.00',
      status: 'active',
    });
    dbState.loans.set('loan-2', {
      id: 'loan-2',
      amount: '1500.00',
      remainingAmount: '600.00',
      status: 'active',
    });

    app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use((req, _res, next) => {
      // @ts-ignore - stub auth middleware
      req.isAuthenticated = () => true;
      // @ts-ignore
      req.user = { role: 'admin' };
      next();
    });
    app.use('/api/payroll', payrollRouter);
    app.use(errorHandler);
  });

  it('restores loan balances and removes payments when undoing deductions', async () => {
    const res = await request(app).post('/api/payroll/run-1/undo-loan-deductions');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      payrollRun: expect.objectContaining({ id: 'run-1' }),
    });
    expect(res.body.loanPayments).toEqual([
      expect.objectContaining({ id: 'payment-1', payrollRunId: 'run-1', amount: '100.00' }),
    ]);
    expect(res.body.loans).toEqual([
      expect.objectContaining({ id: 'loan-1', remainingAmount: '500.00', status: 'active' }),
    ]);

    expect(dbState.loanPayments.has('payment-1')).toBe(false);
    expect(dbState.loanPayments.has('payment-2')).toBe(true);
    expect(dbState.loans.get('loan-1')).toEqual(
      expect.objectContaining({ remainingAmount: '500.00', status: 'active' }),
    );

    const deleteRes = await request(app).delete('/api/payroll/run-1');
    expect(deleteRes.status).toBe(204);
    expect(dbState.payrollRuns.has('run-1')).toBe(false);
    expect(dbState.payrollRuns.has('run-2')).toBe(true);
  });

  it('removes payroll run with dependent entries and loan payments', async () => {
    const res = await request(app).delete('/api/payroll/run-1');

    expect(res.status).toBe(204);
    expect(dbState.payrollRuns.has('run-1')).toBe(false);
    expect(dbState.payrollRuns.has('run-2')).toBe(true);
    expect(Array.from(dbState.payrollEntries.values()).filter(entry => entry.payrollRunId === 'run-1')).toHaveLength(0);
    expect(Array.from(dbState.loanPayments.values()).filter(payment => payment.payrollRunId === 'run-1')).toHaveLength(0);
    expect(Array.from(dbState.payrollEntries.values()).filter(entry => entry.payrollRunId === 'run-2')).toHaveLength(1);
    expect(Array.from(dbState.loanPayments.values()).filter(payment => payment.payrollRunId === 'run-2')).toHaveLength(1);
  });
});
