import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import Reports from './reports';
import '@testing-library/jest-dom';

describe('Reports page - Dept Summary tab', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('renders Dept Summary tab', () => {
    // Seed minimal data
    queryClient.setQueryData(['/api/employees'], []);
    queryClient.setQueryData(['/api/employee-events'], []);
    queryClient.setQueryData(['/api/payroll'], []);
    queryClient.setQueryData(['/api/reports/payroll', '', ''], []);
    queryClient.setQueryData(['/api/reports/loan-balances', '', ''], []);
    queryClient.setQueryData(['/api/reports/asset-usage', '', ''], []);
    queryClient.setQueryData(['/api/reports/payroll-by-department', '', ''], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Reports />
      </QueryClientProvider>
    );

    expect(screen.getByText('Dept Summary')).toBeInTheDocument();
  });
});

