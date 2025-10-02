/// <reference types="vitest" />
// @vitest-environment node

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { payrollRouter } from './routes/payroll';
import { errorHandler } from './errorHandler';
import { payrollRuns, payrollEntries, loanPayments } from '@shared/schema';

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
}

const dbState = vi.hoisted(() => ({
  payrollRuns: new Map<string, PayrollRunState>(),
  payrollEntries: new Map<string, PayrollEntryState>(),
  loanPayments: new Map<string, LoanPaymentState>(),
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

vi.mock('./db', async () => {
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

  const transaction = async (cb: (tx: { delete: typeof deleteFactory }) => Promise<unknown>) => {
    const tx = { delete: deleteFactory };
    return await cb(tx as { delete: typeof deleteFactory });
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

    dbState.payrollRuns.set('run-1', { id: 'run-1', period: 'Jan 2024' });
    dbState.payrollRuns.set('run-2', { id: 'run-2', period: 'Feb 2024' });

    dbState.payrollEntries.set('entry-1', { id: 'entry-1', payrollRunId: 'run-1' });
    dbState.payrollEntries.set('entry-2', { id: 'entry-2', payrollRunId: 'run-2' });

    dbState.loanPayments.set('payment-1', { id: 'payment-1', payrollRunId: 'run-1' });
    dbState.loanPayments.set('payment-2', { id: 'payment-2', payrollRunId: 'run-2' });

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
