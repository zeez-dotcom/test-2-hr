import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import Loans from './loans';
import '@testing-library/jest-dom';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
const mutationMocks: any[] = [];

vi.mock('@/lib/toastError', () => ({
  toastApiError: vi.fn((_: unknown, fallback?: string) => {
    toast({ title: fallback ?? 'Error', variant: 'destructive' });
  }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useMutation: (options: any) => {
      const mock = {
        shouldError: false,
        isPending: false,
        successPayload: undefined as any,
        mutate: (vars: any) => {
          if (mock.shouldError) {
            const err = {
              response: {
                json: () => ({ error: { fields: [{ message: 'Invalid loan data' }] } })
              }
            };
            options.onError?.(err, vars, null);
          } else {
            options.onSuccess?.(mock.successPayload ?? 'success', vars, null);
          }
        }
      };
      mutationMocks.push(mock);
      return mock;
    }
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
  toast,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogTrigger: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/form', () => ({
  Form: ({ children }: any) => <div>{children}</div>,
  FormControl: ({ children }: any) => <div>{children}</div>,
  FormField: ({ render }: any) => render({ field: { onChange: vi.fn(), value: '' } }),
  FormItem: ({ children }: any) => <div>{children}</div>,
  FormLabel: ({ children }: any) => <label>{children}</label>,
  FormMessage: () => <div />,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

beforeEach(() => {
  queryClient.clear();
  toast.mockReset();
  mutationMocks.length = 0;
});

describe('Loans page', () => {
  it('renders loans and handles create/update/delete with error handling', async () => {
    const loans = [
      {
        id: '1',
        employee: { firstName: 'Alice', lastName: 'Smith' },
        employeeId: 'emp-1',
        amount: '100',
        monthlyDeduction: '10',
        remainingAmount: '90',
        startDate: '2024-01-01',
        status: 'pending',
        interestRate: '0',
        reason: '',
        policyMetadata: { warnings: [], violations: [] },
        scheduleDueThisPeriod: [],
        approvalStages: [],
      },
    ];
    queryClient.setQueryData(['/api/loans'], loans);
    queryClient.setQueryData(['/api/employees'], []);
    queryClient.setQueryData(['/api/vacations'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Loans />
      </QueryClientProvider>
    );

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Loan statement')).toBeInTheDocument();

    mutationMocks[0].successPayload = {
      loan: { id: '1' },
      policy: { warnings: ['Check documentation'] },
    };
    mutationMocks[0].mutate({});
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Loan created successfully', description: 'Check documentation' }),
    );
    toast.mockReset();

    mutationMocks[0].shouldError = true;
    mutationMocks[0].mutate({});
    await Promise.resolve();
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to create loan', variant: 'destructive' });
    mutationMocks[0].shouldError = false;
    toast.mockReset();

    mutationMocks[1].successPayload = {
      response: { loan: { id: '1' }, policy: { warnings: [] } },
    };
    mutationMocks[1].mutate({ id: '1', data: {} });
    expect(toast).toHaveBeenCalledWith({ title: 'Loan updated successfully', description: undefined });
    toast.mockReset();

    mutationMocks[1].shouldError = true;
    mutationMocks[1].mutate({ id: '1', data: {} });
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to update loan', variant: 'destructive' });
    mutationMocks[1].shouldError = false;
    toast.mockReset();

    mutationMocks[2].mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Loan deleted successfully' });
    toast.mockReset();

    mutationMocks[2].shouldError = true;
    mutationMocks[2].mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to delete loan', variant: 'destructive' });
  });
});

