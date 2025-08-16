import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import Cars from './cars';
import '@testing-library/jest-dom';

const toast = vi.fn();
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

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <div>{children}</div>,
}));

beforeEach(() => {
  queryClient.clear();
  toast.mockReset();
  mutationMocks.length = 0;
});

describe('Cars page', () => {
  it('renders cars and handles mutations with error handling', () => {
    const cars = [
      {
        id: '1',
        make: 'Toyota',
        model: 'Corolla',
        year: '2024',
        plateNumber: 'ABC123',
        status: 'available',
        mileage: 1000,
        currentAssignment: null,
      },
    ];
    queryClient.setQueryData(['/api/cars'], cars);
    queryClient.setQueryData(['/api/car-assignments'], []);
    queryClient.setQueryData(['/api/employees'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Cars />
      </QueryClientProvider>
    );

    expect(screen.getByText('2024 Toyota Corolla')).toBeInTheDocument();

    // create car success
    mutationMocks[0].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Car added successfully' });
    toast.mockReset();
    // create car error
    mutationMocks[0].shouldError = true;
    mutationMocks[0].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to add car', variant: 'destructive' });
    mutationMocks[0].shouldError = false;
    toast.mockReset();

    // assign car success
    mutationMocks[1].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Car assigned successfully' });
    toast.mockReset();
    // assign car error
    mutationMocks[1].shouldError = true;
    mutationMocks[1].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to assign car', variant: 'destructive' });
    mutationMocks[1].shouldError = false;
    toast.mockReset();

    // update assignment success
    mutationMocks[2].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Assignment updated successfully' });
    toast.mockReset();
    // update assignment error
    mutationMocks[2].shouldError = true;
    mutationMocks[2].mutate({});
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to update assignment', variant: 'destructive' });
    mutationMocks[2].shouldError = false;
    toast.mockReset();

    // delete car success
    mutationMocks[3].mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Car deleted successfully' });
    toast.mockReset();
    // delete car error
    mutationMocks[3].shouldError = true;
    mutationMocks[3].mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to delete car', variant: 'destructive' });
  });
});

