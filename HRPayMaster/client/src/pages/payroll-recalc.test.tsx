import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import Payroll from './payroll';
import '@testing-library/jest-dom';

describe('Payroll page - Recalc action', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('shows Recalc button when runs exist and user can generate', () => {
    queryClient.setQueryData(['/api/me'], { role: 'admin' });
    queryClient.setQueryData(['/api/payroll'], [
      { id: 'r1', period: 'Jan', startDate: '2024-01-01', endDate: '2024-01-31', grossAmount: '0', netAmount: '0', totalDeductions: '0', status: 'completed' },
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <Payroll />
      </QueryClientProvider>
    );

    expect(screen.getByText('Recalc')).toBeInTheDocument();
  });
});

