import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import EmployeeEvents from '../employee-events';
import '@testing-library/jest-dom';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
const locationState = vi.hoisted(() => ({ value: '/employee-events?month=2024-01' }));
const httpMocks = vi.hoisted(() => ({
  apiGet: vi.fn(async () => ({ ok: true, data: [] })),
  apiPost: vi.fn(async () => ({ ok: true, data: {} })),
  apiPut: vi.fn(async () => ({ ok: true })),
  apiDelete: vi.fn(async () => ({ ok: true })),
}));

vi.mock('wouter', () => ({
  useLocation: () => [locationState.value, vi.fn()],
}));

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return actual;
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
  toast,
}));

vi.mock('@/lib/http', () => httpMocks);

vi.mock('@/lib/event-receipts', () => ({
  generateEventReceipt: vi.fn(async () => undefined),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogTrigger: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: any) => <div>{children}</div>,
  CommandEmpty: ({ children }: any) => <div>{children}</div>,
  CommandGroup: ({ children }: any) => <div>{children}</div>,
  CommandInput: ({ value, onValueChange, placeholder }: any) => (
    <input
      placeholder={placeholder}
      value={value ?? ''}
      onChange={event => onValueChange?.(event.target.value)}
    />
  ),
  CommandItem: ({ children, onSelect }: any) => (
    <div role="option" onClick={() => onSelect?.()}>
      {children}
    </div>
  ),
  CommandList: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ onSelect }: any) => (
    <button
      type="button"
      data-testid="calendar"
      onClick={() => onSelect?.(new Date('2024-04-20'))}
    >
      Calendar
    </button>
  ),
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, id }: any) => (
    <input
      id={id}
      type="checkbox"
      role="switch"
      checked={Boolean(checked)}
      onChange={event => onCheckedChange?.(event.target.checked)}
    />
  ),
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  default: () => null,
}));

describe('EmployeeEvents recurrence controls', () => {
  beforeEach(() => {
    queryClient.clear();
    toast.mockReset();
    locationState.value = '/employee-events?month=2024-01';
    httpMocks.apiGet.mockReset();
    httpMocks.apiPost.mockReset();
    httpMocks.apiPut.mockReset();
    httpMocks.apiDelete.mockReset();
    httpMocks.apiGet.mockResolvedValue({ ok: true, data: [] });
  });

  it('shows recurring allowance for month filter and handles recurrence toggles', async () => {
    const user = userEvent.setup();

    const recurringEvent = {
      id: 'evt-allowance',
      employeeId: 'emp-1',
      employee: { id: 'emp-1', firstName: 'Alice', lastName: 'Smith' },
      eventType: 'allowance',
      recurrenceType: 'monthly',
      recurrenceEndDate: '2024-03-31',
      eventDate: '2023-12-15',
      amount: '150',
      status: 'active',
      affectsPayroll: true,
      title: 'Housing Allowance',
      description: 'Monthly stipend',
    };

    const bonusEvent = {
      id: 'evt-bonus',
      employeeId: 'emp-1',
      employee: { id: 'emp-1', firstName: 'Alice', lastName: 'Smith' },
      eventType: 'bonus',
      recurrenceType: 'none',
      recurrenceEndDate: null,
      eventDate: '2024-02-10',
      amount: '200',
      status: 'active',
      affectsPayroll: true,
      title: 'Quarterly Bonus',
      description: 'One-off bonus',
    };

    httpMocks.apiGet.mockImplementation(async (path: string) => {
      if (path === '/api/employee-events') {
        return { ok: true, data: [recurringEvent, bonusEvent] };
      }
      if (path === '/api/employees') {
        return { ok: true, data: [recurringEvent.employee] };
      }
      return { ok: true, data: [] };
    });

    queryClient.setQueryData(['/api/employee-events'], [recurringEvent, bonusEvent]);
    queryClient.setQueryData(['/api/employees'], [recurringEvent.employee]);

    render(
      <QueryClientProvider client={queryClient}>
        <EmployeeEvents />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Housing Allowance')).toBeInTheDocument();
    expect(screen.queryByText('Quarterly Bonus')).toBeNull();
    expect(screen.getByText('Monthly • Ends Mar 31, 2024')).toBeInTheDocument();

    const titleContainer = screen.getByText('Housing Allowance').closest('div');
    const eventRow = titleContainer?.parentElement?.parentElement?.parentElement as HTMLElement | null;
    expect(eventRow).not.toBeNull();
    const buttons = within(eventRow as HTMLElement).getAllByRole('button');
    const printButton = buttons.find(button => /Print/i.test(button.textContent ?? ''));
    expect(printButton).toBeDefined();
    const editButton = buttons[buttons.indexOf(printButton!) + 1];
    expect(editButton).toBeDefined();
    await user.click(editButton);

    expect(screen.getByText('Edit Employee Event')).toBeInTheDocument();

    const recurringSwitch = screen.getByLabelText('Recurring monthly');
    expect(recurringSwitch).toBeChecked();

    await user.click(recurringSwitch);
    expect(recurringSwitch).not.toBeChecked();
    expect(screen.queryByText(/End date \(optional\)/i)).not.toBeInTheDocument();

    await user.click(recurringSwitch);
    expect(screen.getByText('Select end date')).toBeInTheDocument();
    const clearButtons = screen.getAllByRole('button', { name: /Clear/i });
    const clearEndDateButton = clearButtons[clearButtons.length - 1];
    expect(clearEndDateButton).toBeDisabled();

    const calendars = screen.getAllByTestId('calendar');
    expect(calendars.length).toBeGreaterThan(0);
    await user.click(calendars[calendars.length - 1]);

    await waitFor(() => expect(clearEndDateButton).not.toBeDisabled());
  });

  it('allows creating new allowance types from the combobox', async () => {
    const user = userEvent.setup();

    locationState.value = '/employee-events?month=2024-02';

    const allowanceTypes = [
      {
        id: 'allow-type-1',
        name: 'Housing Allowance',
        normalizedName: 'housing_allowance',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    const allowanceEvent = {
      id: 'evt-allowance',
      employeeId: 'emp-1',
      employee: { id: 'emp-1', firstName: 'Sam', lastName: 'Taylor' },
      eventType: 'allowance',
      recurrenceType: 'none',
      recurrenceEndDate: null,
      eventDate: '2024-02-15',
      amount: '125',
      status: 'active',
      affectsPayroll: true,
      title: 'Housing Allowance',
      description: 'Monthly housing support',
    };

    httpMocks.apiGet.mockImplementation(async (path: string) => {
      if (path === '/api/employee-events') {
        return { ok: true, data: [allowanceEvent] };
      }
      if (path === '/api/employees') {
        return { ok: true, data: [allowanceEvent.employee] };
      }
      if (path === '/api/allowance-types') {
        return { ok: true, data: allowanceTypes.slice() };
      }
      return { ok: true, data: [] };
    });

    httpMocks.apiPost.mockImplementation(async (path: string, payload: any = undefined) => {
      if (path === '/api/allowance-types') {
        const newType = {
          id: 'allow-type-2',
          name: payload?.name,
          normalizedName: String(payload?.name ?? '')
            .toLowerCase()
            .replace(/\s+/g, '_'),
          createdAt: '2024-02-01T00:00:00.000Z',
        };
        allowanceTypes.push(newType);
        return { ok: true, data: newType };
      }
      return { ok: true, data: allowanceEvent };
    });

    queryClient.setQueryData(['/api/employee-events'], [allowanceEvent]);
    queryClient.setQueryData(['/api/employees'], [allowanceEvent.employee]);

    render(
      <QueryClientProvider client={queryClient}>
        <EmployeeEvents />
      </QueryClientProvider>,
    );

    const eventRowTitle = await screen.findByText('Housing Allowance');
    const rowContainer = eventRowTitle.closest('div');
    const eventRowElement = rowContainer?.parentElement?.parentElement?.parentElement as HTMLElement | null;
    expect(eventRowElement).not.toBeNull();
    const buttons = within(eventRowElement as HTMLElement).getAllByRole('button');
    const printButton = buttons.find(button => /Print/i.test(button.textContent ?? ''));
    expect(printButton).toBeDefined();
    const editButton = buttons[buttons.indexOf(printButton!) + 1];
    await user.click(editButton);

    const trigger = await screen.findByTestId('allowance-type-trigger');
    expect(trigger).toHaveTextContent('Housing Allowance');

    await user.click(trigger);

    const searchInput = screen.getByPlaceholderText('Search allowances...');
    await user.clear(searchInput);
    await user.type(searchInput, 'Transport Allowance');

    const createButton = screen.getByTestId('allowance-type-create');
    await user.click(createButton);

    await waitFor(() => {
      const allowanceCall = httpMocks.apiPost.mock.calls.find(([path]) => path === '/api/allowance-types');
      expect(allowanceCall).toBeTruthy();
      expect(allowanceCall?.[1]).toEqual({ name: 'Transport Allowance' });
    });

    await waitFor(() => {
      const allowanceCalls = httpMocks.apiGet.mock.calls.filter(([path]) => path === '/api/allowance-types');
      expect(allowanceCalls.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByTestId('allowance-type-trigger')).toHaveTextContent('Transport Allowance');
    });
  });
});
