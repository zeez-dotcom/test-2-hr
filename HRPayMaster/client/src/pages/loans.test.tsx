import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import Loans from './loans';
import '@testing-library/jest-dom';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
const mutationMocks: any[] = [];

const getMutationMocksByType = (offset: number) =>
  mutationMocks.filter((_: any, index: number) => index % 3 === offset);

const getLatestMutationMock = (offset: number) => {
  const mocks = getMutationMocksByType(offset);
  return mocks[mocks.length - 1];
};

const getLastCalledMutationMock = (offset: number) => {
  const mocks = getMutationMocksByType(offset);
  for (let i = mocks.length - 1; i >= 0; i -= 1) {
    if (mocks[i]?.lastVars !== undefined) {
      return mocks[i];
    }
  }
  return undefined;
};

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
        lastVars: undefined as any,
        mutate: (vars: any) => {
          mock.lastVars = vars;
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

    const createMutationMock = getLatestMutationMock(0)!;
    createMutationMock.successPayload = {
      loan: { id: '1' },
      policy: { warnings: ['Check documentation'] },
    };
    createMutationMock.mutate({});
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Loan created successfully', description: 'Check documentation' }),
    );
    toast.mockReset();

    createMutationMock.shouldError = true;
    createMutationMock.mutate({});
    await Promise.resolve();
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to create loan', variant: 'destructive' });
    createMutationMock.shouldError = false;
    toast.mockReset();

    const updateMutationMock = getLatestMutationMock(1)!;
    updateMutationMock.successPayload = {
      response: { loan: { id: '1' }, policy: { warnings: [] } },
    };
    updateMutationMock.mutate({ id: '1', data: {} });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Loan updated successfully', description: '' })
    );
    toast.mockReset();

    updateMutationMock.shouldError = true;
    updateMutationMock.mutate({ id: '1', data: {} });
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to update loan', variant: 'destructive' });
    updateMutationMock.shouldError = false;
    toast.mockReset();

    const deleteMutationMock = getLatestMutationMock(2)!;
    deleteMutationMock.mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Loan deleted successfully' });
    toast.mockReset();

    deleteMutationMock.shouldError = true;
    deleteMutationMock.mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to delete loan', variant: 'destructive' });
  });

  it('approving a loan updates status and approval stages', async () => {
    const user = userEvent.setup();
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
        approvalStages: [
          { id: 'stage-1', status: 'pending' },
          { id: 'stage-2', status: 'approved' },
          { id: 'stage-3', status: 'delegated' },
          { status: 'pending' },
        ],
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

    await screen.findByText('Alice Smith');
    await user.click(screen.getByRole('button', { name: /approve/i }));

    const updateMutationMock = getLastCalledMutationMock(1);
    expect(updateMutationMock).toBeDefined();
    const lastVars = updateMutationMock!.lastVars;
    expect(lastVars).toBeDefined();
    expect(lastVars.id).toBe('1');
    expect(lastVars.data.status).toBe('active');
    const { stageUpdates } = lastVars.data;
    expect(stageUpdates).toHaveLength(2);
    expect(stageUpdates).toEqual([
      expect.objectContaining({ id: 'stage-1', status: 'approved', actedAt: expect.any(String) }),
      expect.objectContaining({ id: 'stage-3', status: 'approved', actedAt: expect.any(String) }),
    ]);
    expect(stageUpdates.every((update: any) => !Number.isNaN(Date.parse(update.actedAt)))).toBe(true);
  });
});

