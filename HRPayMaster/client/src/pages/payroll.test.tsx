import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import '@testing-library/jest-dom';

const navigate = vi.fn();
vi.mock('wouter', () => ({
  useSearch: () => '',
  useLocation: () => ['', navigate],
}));

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
const mutationMocks: any[] = [];

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useMutation: (options: any) => {
      const mock = {
        shouldError: false,
        error: undefined as any,
        isPending: false,
        reset: vi.fn(),
        mutate: async (vars: any) => {
          if (mock.shouldError) {
            await options.onError?.(mock.error ?? { ok: false, status: 500, error: { message: 'error' } }, vars, null);
          } else {
            await options.onSuccess?.('success', vars, null);
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

vi.mock('@/components/payroll/payroll-form', () => ({
  default: () => <div>PayrollForm</div>,
}));

vi.mock('@/components/payroll/payroll-details-view', () => ({
  default: ({ onRegisterPrint }: any) => {
    onRegisterPrint?.(() => {});
    return <div>PayrollDetailsView</div>;
  },
}));

vi.mock('@/components/payroll/payroll-edit-view-simple', () => ({
  default: () => <div>PayrollEditView</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
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

import Payroll from './payroll';

beforeEach(() => {
  queryClient.clear();
  toast.mockReset();
  mutationMocks.length = 0;
  navigate.mockReset();
});

describe('Payroll page', () => {
  it('renders payroll runs and handles generate/delete with error handling', async () => {
    const payrollRuns = [
      {
        id: '1',
        period: 'Jan 2024',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        grossAmount: '1000',
        netAmount: '800',
        status: 'completed',
      },
    ];
    queryClient.setQueryData(['/api/payroll'], payrollRuns);
    queryClient.setQueryData(['/api/me'], { role: 'admin' });

    render(
      <QueryClientProvider client={queryClient}>
        <Payroll />
      </QueryClientProvider>
    );

    expect(screen.getByText('Jan 2024')).toBeInTheDocument();

    expect(screen.queryByText('PayrollDetailsView')).not.toBeInTheDocument();

    const printButton = screen.getByRole('button', { name: /print/i });
    expect(printButton).toBeInTheDocument();

    // generate payroll success
    await mutationMocks[0].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Success', description: 'Payroll generated successfully' });
    toast.mockReset();

    mutationMocks[0].shouldError = true;

    // generate payroll 409 error
    mutationMocks[0].error = { ok: false, status: 409, error: 'Period exists' } as any;
    await mutationMocks[0].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Duplicate period', description: 'Period exists', variant: 'destructive' });
    toast.mockReset();

    // generate payroll 401 error
    mutationMocks[0].error = { ok: false, status: 401, error: {} } as any;
    await mutationMocks[0].mutate({});
    expect(navigate).toHaveBeenCalledWith('/login');
    navigate.mockReset();
    toast.mockReset();

    // generate payroll server error message
    mutationMocks[0].error = { ok: false, status: 500, error: { message: 'Server failure' } } as any;
    await mutationMocks[0].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Error', description: 'Server failure', variant: 'destructive' });
    toast.mockReset();

    // generate payroll generic error
    mutationMocks[0].error = { ok: false, status: 500, error: {} } as any;
    await mutationMocks[0].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Error', description: 'Failed to generate payroll', variant: 'destructive' });
    mutationMocks[0].shouldError = false;
    toast.mockReset();

    // delete payroll success
    await mutationMocks[1].mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Success', description: 'Payroll run deleted successfully' });
    toast.mockReset();
    // delete payroll error
    mutationMocks[1].shouldError = true;
    mutationMocks[1].error = { ok: false, status: 500, error: { message: 'Failed to delete payroll run' } } as any;
    await mutationMocks[1].mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Error', description: 'Failed to delete payroll run', variant: 'destructive' });
  });

  it('shows duplicate period message from nested API error without throwing', async () => {
    queryClient.setQueryData(['/api/payroll'], []);
    queryClient.setQueryData(['/api/me'], { role: 'admin' });

    render(
      <QueryClientProvider client={queryClient}>
        <Payroll />
      </QueryClientProvider>
    );

    const mutation = mutationMocks[0];
    mutation.shouldError = true;
    mutation.error = {
      ok: false,
      status: 409,
      error: { error: { message: 'Payroll run already exists for this period' } },
    } as any;

    await expect(mutation.mutate({})).resolves.toBeUndefined();

    expect(toast).toHaveBeenCalledWith({
      title: 'Duplicate period',
      description: 'Payroll run already exists for this period',
      variant: 'destructive',
    });
  });
});

