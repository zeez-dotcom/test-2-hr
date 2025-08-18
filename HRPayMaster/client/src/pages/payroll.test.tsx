import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import Payroll from './payroll';
import '@testing-library/jest-dom';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
const mutationMocks: any[] = [];

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useMutation: (options: any) => {
      const mock = {
        shouldError: false,
        isPending: false,
        mutate: (vars: any) => {
          if (mock.shouldError) {
            options.onError?.('error', vars, null);
          } else {
            options.onSuccess?.('success', vars, null);
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
  default: () => <div>PayrollDetailsView</div>,
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
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogTrigger: ({ children }: any) => <div>{children}</div>,
}));

beforeEach(() => {
  queryClient.clear();
  toast.mockReset();
  mutationMocks.length = 0;
});

describe('Payroll page', () => {
  it('renders payroll runs and handles generate/delete with error handling', () => {
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

    render(
      <QueryClientProvider client={queryClient}>
        <Payroll />
      </QueryClientProvider>
    );

    expect(screen.getByText('Jan 2024')).toBeInTheDocument();

    // generate payroll success
    mutationMocks[0].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Success', description: 'Payroll generated successfully' });
    toast.mockReset();
    // generate payroll error
    mutationMocks[0].shouldError = true;
    mutationMocks[0].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Error', description: 'Failed to generate payroll', variant: 'destructive' });
    mutationMocks[0].shouldError = false;
    toast.mockReset();

    // delete payroll success
    mutationMocks[1].mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Success', description: 'Payroll run deleted successfully' });
    toast.mockReset();
    // delete payroll error
    mutationMocks[1].shouldError = true;
    mutationMocks[1].mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Error', description: 'Failed to delete payroll run', variant: 'destructive' });
  });
});

