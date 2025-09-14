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

describe('Chatbot monthly summary', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
    queryClient.setQueryData(['/api/employees'], [
      { id: '1', firstName: 'Alice', lastName: 'Smith' },
    ]);
  });

  it('renders monthly summary when selected', async () => {
    apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        payroll: { gross: 1000, net: 900 },
        loanBalance: 100,
        events: [],
      },
      headers: new Headers(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Chatbot />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('Alice Smith'));
    fireEvent.click(screen.getByText('Monthly summary'));
    fireEvent.click(screen.getByText('Send'));

    expect(
      await screen.findByText(
        'Gross: 1000, Net: 900, Loan balance: 100. Events: No events.',
      ),
    ).toBeInTheDocument();
  });

  it('handles no data response', async () => {
    apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        payroll: { gross: 0, net: 0 },
        loanBalance: 0,
        events: [],
      },
      headers: new Headers(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Chatbot />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('Alice Smith'));
    fireEvent.click(screen.getByText('Monthly summary'));
    fireEvent.click(screen.getByText('Send'));

    expect(
      await screen.findByText(
        'Gross: 0, Net: 0, Loan balance: 0. Events: No events.',
      ),
    ).toBeInTheDocument();
  });

  it('shows error when unauthorized', async () => {
    apiGet.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'Unauthorized',
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <Chatbot />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('Alice Smith'));
    fireEvent.click(screen.getByText('Monthly summary'));
    fireEvent.click(screen.getByText('Send'));

    expect(
      await screen.findByText('Could not retrieve summary'),
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

