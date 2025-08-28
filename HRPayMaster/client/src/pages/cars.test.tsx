import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import Cars from './cars';
import CarImport from '@/components/cars/car-import';
import '@testing-library/jest-dom';
import React from 'react';

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
        mutate: async (vars: any) => {
          if (mock.shouldError) {
            await options.onError?.('error', vars, null);
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

vi.mock('@/lib/pdf', () => ({
  openPdf: vi.fn(),
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
  Select: ({ children, onValueChange }: any) => (
    <div>
      {React.Children.map(children, child =>
        React.cloneElement(child, { onValueChange })
      )}
    </div>
  ),
  SelectContent: ({ children, onValueChange }: any) => (
    <div>
      {React.Children.map(children, child =>
        React.cloneElement(child, { onValueChange })
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

const originalFetch = global.fetch;

beforeEach(() => {
  queryClient.clear();
  toast.mockReset();
  mutationMocks.length = 0;
  // @ts-ignore
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterEach(() => {
  // @ts-ignore
  global.fetch = originalFetch;
});

describe('Cars page', () => {
  it('renders cars and handles mutations with error handling', async () => {
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
    await mutationMocks[0].mutate({
      make: 'Toyota',
      model: 'Corolla',
      year: '2024',
      plateNumber: 'ABC123'
    });
    expect(toast).toHaveBeenCalledWith({ title: 'Car added successfully' });
    toast.mockReset();
    // create car error
    mutationMocks[0].shouldError = true;
    await mutationMocks[0].mutate({
      make: 'Toyota',
      model: 'Corolla',
      year: '2024',
      plateNumber: 'ABC123'
    });
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to add car', variant: 'destructive' });
    mutationMocks[0].shouldError = false;
    toast.mockReset();

    // assign car success
    await mutationMocks[1].mutate({ carId: '1' });
    expect(global.fetch).toHaveBeenCalledWith('/api/cars/1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ status: 'assigned' }),
    }));
    expect(toast).toHaveBeenCalledWith({ title: 'Car assigned successfully' });
    (global.fetch as Mock).mockClear();
    toast.mockReset();
    // assign car error
    mutationMocks[1].shouldError = true;
    await mutationMocks[1].mutate({ carId: '1' });
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to assign car', variant: 'destructive' });
    mutationMocks[1].shouldError = false;
    toast.mockReset();

    // update assignment success
    await mutationMocks[2].mutate({ carId: '1' });
    expect(global.fetch).toHaveBeenCalledWith('/api/cars/1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ status: 'available' }),
    }));
    expect(toast).toHaveBeenCalledWith({ title: 'Assignment updated successfully' });
    (global.fetch as Mock).mockClear();
    toast.mockReset();
    // update assignment error
    mutationMocks[2].shouldError = true;
    await mutationMocks[2].mutate({ carId: '1' });
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to update assignment', variant: 'destructive' });
    mutationMocks[2].shouldError = false;
    toast.mockReset();

    // delete car success
    await mutationMocks[3].mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Car deleted successfully' });
    toast.mockReset();
    // delete car error
    mutationMocks[3].shouldError = true;
    await mutationMocks[3].mutate('1');
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to delete car', variant: 'destructive' });
  });
});

describe('Car import', () => {
  it('detects headers and imports cars', async () => {
    const file = new File(['test'], 'cars.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ headers: ['Model', 'Plate'] }),
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: 1, failed: 0 }),
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <CarImport />
      </QueryClientProvider>
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByText('Next'));

    await screen.findByText('Plate');

    fireEvent.click(screen.getAllByText('Model', { selector: 'div[data-value="model"]' })[0]);
    fireEvent.click(screen.getAllByText('Plate Number', { selector: 'div[data-value="plateNumber"]' })[1]);

    fireEvent.click(screen.getByText('Import'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Import complete',
        description: '1 imported, 0 failed',
        variant: 'default',
      })
    );
    expect(screen.getByText('Imported 1, failed 0')).toBeInTheDocument();
  });

  it('shows error when import fails', async () => {
    const file = new File(['test'], 'cars.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ headers: ['Model', 'Plate'] }),
    });
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Import failed' } }),
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <CarImport />
      </QueryClientProvider>
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByText('Next'));

    await screen.findByText('Plate');

    fireEvent.click(screen.getAllByText('Model', { selector: 'div[data-value="model"]' })[0]);
    fireEvent.click(screen.getAllByText('Plate Number', { selector: 'div[data-value="plateNumber"]' })[1]);

    fireEvent.click(screen.getByText('Import'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Import failed',
        variant: 'destructive',
      })
    );
  });
});
