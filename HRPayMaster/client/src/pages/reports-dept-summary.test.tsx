import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { toLocalYMD } from '@/lib/date';
import Reports from './reports';
import '@testing-library/jest-dom';
import '@/lib/i18n';

describe('Reports page - Dept Summary tab', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('renders Dept Summary tab', () => {
    // Seed minimal data
    const currentYear = new Date().getFullYear();
    const start = toLocalYMD(new Date(currentYear, 0, 1));
    const end = toLocalYMD(new Date(currentYear, 11, 31));

    queryClient.setQueryData(['/api/employees'], []);
    queryClient.setQueryData(['/api/employee-events'], []);
    queryClient.setQueryData(['/api/payroll'], []);
    queryClient.setQueryData(['/api/reports/payroll', start, end], []);
    queryClient.setQueryData(['/api/reports/loan-balances', start, end], []);
    queryClient.setQueryData(['/api/asset-assignments', start, end], []);
    queryClient.setQueryData(['/api/car-assignments', start, end], []);
    queryClient.setQueryData(['/api/reports/payroll-by-department', start, end], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Reports />
      </QueryClientProvider>
    );

    expect(screen.getByText('Dept Summary')).toBeInTheDocument();
  });
});

