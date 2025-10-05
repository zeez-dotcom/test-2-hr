import React from 'react';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import * as http from '@/lib/http';
import Chatbot from './chatbot';
import '@testing-library/jest-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'chatbot.intents.monthlySummary': 'Monthly summary',
        'chatbot.selectAction': 'Select action',
        'errors.monthlySummaryForbidden': 'You do not have access to this employee',
        'errors.general': 'An unexpected error occurred',
      } as Record<string, string>)[key] || key,
  }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange }: any) => (
    <div>
      {React.Children.map(children, (child) =>
        React.cloneElement(child, { onValueChange }),
      )}
    </div>
  ),
  SelectContent: ({ children, onValueChange }: any) => (
    <div>
      {React.Children.map(children, (child) =>
        React.cloneElement(child, { onValueChange }),
      )}
    </div>
  ),
  SelectItem: ({ children, value, onValueChange }: any) => (
    <div data-value={value} onClick={() => onValueChange(value)}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

const apiGet = vi.spyOn(http, 'apiGet');

const employeesFixture = [
  { id: '1', firstName: 'Alice', lastName: 'Smith' },
];

const createSuccessResponse = <T>(data: T) => ({
  ok: true as const,
  status: 200,
  data,
  headers: new Headers(),
});

const collectionEndpoints = new Set([
  '/api/assets',
  '/api/asset-assignments',
  '/api/vacations',
  '/api/cars',
  '/api/car-assignments',
]);

describe('Chatbot monthly summary', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
    queryClient.setQueryData(['/api/employees'], employeesFixture);
    apiGet.mockImplementation(async (url: string) => {
      if (url === '/api/employees') {
        return createSuccessResponse(employeesFixture);
      }

      if (collectionEndpoints.has(url)) {
        return createSuccessResponse<any[]>([]);
      }

      throw new Error(`Unhandled apiGet request for ${url}`);
    });
  });

  it('renders monthly summary when selected', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Chatbot />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('Alice Smith'));
    fireEvent.click(screen.getByText('Monthly summary'));

    apiGet.mockResolvedValueOnce(
      createSuccessResponse({
        payroll: { gross: 1000, net: 900 },
        loanBalance: 100,
        events: [],
      }),
    );

    fireEvent.click(screen.getByText('Send'));

    expect(
      await screen.findByText(
        'Gross: 1000, Net: 900, Loan balance: 100. Events: No events.',
      ),
    ).toBeInTheDocument();
  });

  it('handles no data response', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Chatbot />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('Alice Smith'));
    fireEvent.click(screen.getByText('Monthly summary'));

    apiGet.mockResolvedValueOnce(
      createSuccessResponse({
        payroll: { gross: 0, net: 0 },
        loanBalance: 0,
        events: [],
      }),
    );

    fireEvent.click(screen.getByText('Send'));

    expect(
      await screen.findByText(
        'Gross: 0, Net: 0, Loan balance: 0. Events: No events.',
      ),
    ).toBeInTheDocument();
  });

  it('shows localized error when unauthorized', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Chatbot />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('Alice Smith'));
    fireEvent.click(screen.getByText('Monthly summary'));

    apiGet.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: { error: { code: 'monthlySummaryForbidden' } },
      headers: new Headers(),
    } as any);

    fireEvent.click(screen.getByText('Send'));

    expect(
      await screen.findByText('You do not have access to this employee'),
    ).toBeInTheDocument();
  });
});

afterAll(() => {
  apiGet.mockRestore();
  vi.unmock('react-i18next');
  vi.unmock('@/components/ui/button');
  vi.unmock('@/components/ui/input');
  vi.unmock('@/components/ui/select');
});

