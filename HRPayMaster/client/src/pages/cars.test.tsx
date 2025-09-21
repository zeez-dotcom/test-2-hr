import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
      const optionsRef = React.useRef(options);
      optionsRef.current = options;
      const stateRef = React.useRef<any>();
      if (!stateRef.current) {
        const mock = {
          shouldError: false,
          isPending: false,
          variables: undefined as any,
          mutate: async (vars: any) => {
            mock.variables = vars;
            mock.isPending = true;
            if (mock.shouldError) {
              await optionsRef.current.onError?.('error', vars, null);
            } else {
              await optionsRef.current.onSuccess?.('success', vars, null);
            }
            mock.isPending = false;
          }
        };
        stateRef.current = mock;
        mutationMocks.push(mock);
      }
      return stateRef.current;
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

vi.mock('@/components/ui/table', () => ({
  Table: ({ children }: any) => <table>{children}</table>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableCell: ({ children }: any) => <td>{children}</td>,
  TableHead: ({ children }: any) => <th>{children}</th>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableRow: ({ children }: any) => <tr>{children}</tr>,
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
  global.fetch = vi.fn().mockImplementation(async (url: any, init?: any) => {
    if (typeof url === 'string' && url.startsWith('/api/cars') && (!init || init.method === undefined || init.method === 'GET')) {
      return {
        ok: true,
        status: 200,
        json: async () => queryClient.getQueryData(['/api/cars']) ?? [],
        headers: { get: () => null },
      } as any;
    }
    if (
      typeof url === 'string' &&
      url.startsWith('/api/car-assignments') &&
      (!init || init.method === undefined || init.method === 'GET')
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => queryClient.getQueryData(['/api/car-assignments']) ?? [],
        headers: { get: () => null },
      } as any;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      headers: { get: () => null },
    } as any;
  });
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
    queryClient.setQueryData(['/api/vacations'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Cars />
      </QueryClientProvider>
    );

    expect(screen.getByText('2024 Toyota Corolla')).toBeInTheDocument();
    expect(screen.getByText('No vehicles are currently marked for maintenance.')).toBeInTheDocument();

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
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Failed to add car', variant: 'destructive' })
    );
    mutationMocks[0].shouldError = false;
    toast.mockReset();

    // assign car success
    await mutationMocks[1].mutate({ carId: '1' });
    expect(global.fetch).toHaveBeenCalledWith('/api/cars/1/status', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ status: 'assigned' }),
    }));
    expect(toast).toHaveBeenCalledWith({ title: 'Car assigned successfully' });
    (global.fetch as Mock).mockClear();
    toast.mockReset();
    // assign car error
    mutationMocks[1].shouldError = true;
    await mutationMocks[1].mutate({ carId: '1' });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Failed to assign car', variant: 'destructive' })
    );
    mutationMocks[1].shouldError = false;
    toast.mockReset();

    // update assignment success
    await mutationMocks[2].mutate({ carId: '1' });
    expect(global.fetch).toHaveBeenCalledWith('/api/cars/1/status', expect.objectContaining({
      method: 'POST',
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
    mutationMocks[3].shouldError = false;
    toast.mockReset();

    // update car success
    await mutationMocks[4].mutate({ id: '1' });
    expect(toast).toHaveBeenCalledWith({ title: 'Car updated successfully' });
    toast.mockReset();
    // update car error
    mutationMocks[4].shouldError = true;
    await mutationMocks[4].mutate({ id: '1' });
    expect(toast).toHaveBeenCalledWith({ title: 'Failed to update car', variant: 'destructive' });

    toast.mockReset();
    await act(async () => {
      queryClient.setQueryData(['/api/cars'], [
        {
          ...cars[0],
          status: 'assigned',
          currentAssignment: {
            id: 'car-asg-1',
            carId: '1',
            employeeId: 'emp-assign',
            status: 'active',
            assignedDate: '2024-01-01',
            returnDate: null,
          },
        },
      ]);
      queryClient.setQueryData(['/api/car-assignments'], [
        {
          id: 'car-asg-1',
          carId: '1',
          employeeId: 'emp-assign',
          assignedDate: '2024-01-01',
          returnDate: null,
          status: 'active',
          notes: null,
          car: {
            id: '1',
            make: 'Toyota',
            model: 'Corolla',
            year: '2024',
            plateNumber: 'ABC123',
          },
          employee: {
            id: 'emp-assign',
            firstName: 'Alex',
            lastName: 'Driver',
            phone: '555-0000',
          },
          assigner: null,
        },
      ]);
    });

    await waitFor(() =>
      expect(screen.getByText('Assigned to')).toBeInTheDocument()
    );

    const statusButton = screen.getByText('Mark as Maintenance');
    fireEvent.click(statusButton);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: 'Car marked for maintenance' })
    );
    const maintenanceCall = mutationMocks.find(
      mock => mock.variables?.assignmentId === 'car-asg-1'
    );
    expect(maintenanceCall).toBeDefined();
    expect(maintenanceCall?.variables).toMatchObject({
      assignmentId: 'car-asg-1',
      carId: '1',
      status: 'maintenance',
    });
    expect(maintenanceCall?.variables?.returnDate).toMatch(/\d{4}-\d{2}-\d{2}/);

    const maintenanceStatus = mutationMocks.find(
      mock => mock.variables?.carId === '1' && mock.variables?.status === 'maintenance'
    );
    expect(maintenanceStatus).toBeDefined();
    expect(maintenanceStatus?.variables).toMatchObject({ carId: '1', status: 'maintenance' });

    toast.mockReset();
    fireEvent.click(screen.getByText('Active Assignments'));

    await act(async () => {
      queryClient.setQueryData(['/api/cars'], [
        {
          ...cars[0],
          status: 'maintenance',
          currentAssignment: {
            id: 'car-asg-1',
            carId: '1',
            employeeId: 'emp-assign',
            status: 'maintenance',
            assignedDate: '2024-01-01',
            returnDate: new Date().toISOString().split('T')[0],
            notes: 'Engine check',
            employee: {
              id: 'emp-assign',
              firstName: 'Alex',
              lastName: 'Driver',
              phone: '555-0000',
            },
          },
        },
      ]);
      queryClient.setQueryData(['/api/car-assignments'], [
        {
          id: 'car-asg-1',
          carId: '1',
          employeeId: 'emp-assign',
          assignedDate: '2024-01-01',
          returnDate: new Date().toISOString().split('T')[0],
          status: 'maintenance',
          notes: 'Engine check',
          car: {
            id: '1',
            make: 'Toyota',
            model: 'Corolla',
            year: '2024',
            plateNumber: 'ABC123',
          },
          employee: {
            id: 'emp-assign',
            firstName: 'Alex',
            lastName: 'Driver',
            phone: '555-0000',
          },
          assigner: null,
        },
      ]);
    });

    await waitFor(() => expect(screen.getByText('Back to Service')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('No active assignments')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Assigned: Jan 1, 2024')).toBeInTheDocument());
    expect(screen.queryByText('No vehicles are currently marked for maintenance.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Back to Service'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: 'Car returned to service' })
    );
    const statusCall = [...mutationMocks]
      .reverse()
      .find(mock => mock.variables?.carId === '1' && mock.variables?.status === 'available');
    expect(statusCall).toBeDefined();
    expect(statusCall?.variables).toEqual({ carId: '1', status: 'available' });
  });

  it('renders registration document image when provided', () => {
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
        registrationDocumentImage: 'data:image/png;base64,AAAA',
      },
    ];
    queryClient.setQueryData(['/api/cars'], cars);
    queryClient.setQueryData(['/api/car-assignments'], []);
    queryClient.setQueryData(['/api/employees'], []);
    queryClient.setQueryData(['/api/vacations'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Cars />
      </QueryClientProvider>
    );

    const img = screen.getByAltText('Registration document');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', cars[0].registrationDocumentImage);
  });

  it('shows historical assignments when searching by plate, VIN, or serial', async () => {
    const cars = [
      {
        id: 'car-1',
        make: 'Toyota',
        model: 'Corolla',
        year: '2020',
        plateNumber: 'ABC123',
        status: 'available',
        mileage: 1000,
        currentAssignment: null,
      },
    ];
    const assignments = [
      {
        id: 'assign-1',
        carId: 'car-1',
        employeeId: 'emp-1',
        assignedDate: '2024-01-01',
        returnDate: '2024-01-10',
        status: 'completed',
        notes: null,
        car: {
          id: 'car-1',
          plateNumber: 'ABC123',
          vin: 'VINABC',
          serial: 'SER123',
          make: 'Toyota',
          model: 'Corolla',
          year: '2020',
        },
        employee: {
          id: 'emp-1',
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '555-1234',
        },
        assigner: null,
      },
    ];

    queryClient.setQueryData(['/api/cars'], cars);
    queryClient.setQueryData(['/api/car-assignments'], assignments);
    queryClient.setQueryData(['/api/employees'], []);
    queryClient.setQueryData(['/api/vacations'], []);

    const fetchMock = global.fetch as Mock;
    fetchMock.mockImplementation(async (url: any, init?: any) => {
      if (typeof url === 'string' && url.startsWith('/api/car-assignments?')) {
        return {
          ok: true,
          status: 200,
          json: async () => assignments,
          headers: { get: () => null },
        } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        headers: { get: () => null },
      } as any;
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Cars />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getAllByText('Assignment History')[0]);
    const input = screen.getByPlaceholderText('Search by plate, VIN, or serial');

    fetchMock.mockClear();
    fireEvent.change(input, { target: { value: 'ABC123' } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = (fetchMock as Mock).mock.calls[0];
    expect(url).toContain('plateNumber=ABC123');
    expect(url).toContain('vin=ABC123');
    expect(url).toContain('serial=ABC123');

    await screen.findByText('ABC123');
    expect(screen.getByText('Jan 1, 2024 – Jan 10, 2024')).toBeInTheDocument();
    expect(screen.getAllByText('Completed')[0]).toBeInTheDocument();
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
