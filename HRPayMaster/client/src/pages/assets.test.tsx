import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import Assets from './assets';
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
        const mutateImpl = async (vars: any) => {
          mock.variables = vars;
          mock.isPending = true;
          if (mock.shouldError) {
            await optionsRef.current.onError?.('error', vars, null);
          } else {
            await optionsRef.current.onSuccess?.('success', vars, null);
          }
          mock.isPending = false;
          return 'success';
        };
        const mock: any = {
          shouldError: false,
          isPending: false,
          variables: undefined as any,
          mutate: mutateImpl,
          mutateAsync: mutateImpl,
        };
        stateRef.current = mock;
        mutationMocks.push(mock);
      }
      return stateRef.current;
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

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

vi.mock('@/components/ui/form', () => {
  const React = require('react');
  const { Controller } = require('react-hook-form');
  return {
    Form: ({ children }: any) => <div>{children}</div>,
    FormControl: ({ children }: any) => <div>{children}</div>,
    FormField: ({ control, name, render, rules }: any) => (
      <Controller control={control} name={name} rules={rules} render={render} />
    ),
    FormItem: ({ children }: any) => <div>{children}</div>,
    FormLabel: ({ children }: any) => <label>{children}</label>,
    FormMessage: () => <div />,
  };
});

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange }: any) => (
    <div>
      {React.Children.map(children, child =>
        React.isValidElement(child)
          ? React.cloneElement(child as any, { onValueChange })
          : child
      )}
    </div>
  ),
  SelectContent: ({ children }: any) => (
    <div>
      {React.Children.map(children, child =>
        React.isValidElement(child)
          ? React.cloneElement(child as any, { onValueChange: (child as any).props?.onValueChange })
          : child
      )}
    </div>
  ),
  SelectItem: ({ children, value, onValueChange }: any) => (
    <div data-value={value} onClick={() => (onValueChange as ((value: any) => void) | undefined)?.(value)}>
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
  TabsTrigger: ({ children, value, onClick }: any) => (
    <button type="button" onClick={onClick} data-value={value}>
      {children}
    </button>
  ),
}));

const originalFetch = global.fetch;

describe('Assets page', () => {
  beforeEach(() => {
    queryClient.clear();
    toast.mockReset();
    mutationMocks.length = 0;
    // @ts-ignore
    global.fetch = vi.fn().mockImplementation(async (url: any, init?: any) => {
      if (typeof url === 'string' && url.startsWith('/api/assets') && (!init || init.method === undefined || init.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => queryClient.getQueryData(['/api/assets']) ?? [],
          headers: { get: () => null },
        } as any;
      }
      if (typeof url === 'string' && url.startsWith('/api/asset-assignments') && (!init || init.method === undefined || init.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => queryClient.getQueryData(['/api/asset-assignments']) ?? [],
          headers: { get: () => null },
        } as any;
      }
      if (typeof url === 'string' && url.startsWith('/api/employees') && (!init || init.method === undefined || init.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => queryClient.getQueryData(['/api/employees']) ?? [],
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

  it('removes the asset from active assignments when marked for maintenance', async () => {
    const assets = [
      {
        id: 'asset-1',
        name: 'Laptop',
        type: 'Hardware',
        status: 'assigned',
        currentAssignment: {
          id: 'assign-1',
          assetId: 'asset-1',
          employeeId: 'emp-1',
          status: 'active',
          returnDate: null,
          employee: { firstName: 'Jane', lastName: 'Doe' },
        },
      },
    ];
    const assignments = [
      {
        id: 'assign-1',
        assetId: 'asset-1',
        employeeId: 'emp-1',
        assignedDate: '2024-01-01',
        returnDate: null,
        status: 'active',
        notes: null,
        asset: { name: 'Laptop' },
        employee: { firstName: 'Jane', lastName: 'Doe' },
      },
    ];

    queryClient.setQueryData(['/api/assets'], assets);
    queryClient.setQueryData(['/api/asset-assignments'], assignments);
    queryClient.setQueryData(['/api/employees'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Assets />
      </QueryClientProvider>
    );

    expect(screen.getByText('No assets are currently marked for maintenance.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Active Assignments')[0]);
    expect(screen.queryByText('No active assignments.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Mark as Maintenance'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: 'Asset marked for maintenance' })
    );
    const assignmentMutation = mutationMocks.find(
      mock => mock.variables?.assignmentId === 'assign-1'
    );
    expect(assignmentMutation).toBeDefined();
    expect(assignmentMutation?.variables).toMatchObject({
      assignmentId: 'assign-1',
      assetId: 'asset-1',
      status: 'maintenance',
    });
    expect(assignmentMutation?.variables.returnDate).toMatch(/\d{4}-\d{2}-\d{2}/);

    const statusMutation = mutationMocks.find(
      mock => mock.variables?.assetId === 'asset-1' && mock.variables?.status === 'maintenance'
    );
    expect(statusMutation).toBeDefined();
    expect(statusMutation?.variables).toMatchObject({ assetId: 'asset-1', status: 'maintenance' });

    toast.mockReset();

    await act(async () => {
      queryClient.setQueryData(['/api/assets'], assets.map(asset => ({
        ...asset,
        status: asset.id === 'asset-1' ? 'maintenance' : asset.status,
      })));
      queryClient.setQueryData(['/api/asset-assignments'], assignments.map(a => ({
        ...a,
        status: a.id === 'assign-1' ? 'maintenance' : a.status,
      })));
    });

    await waitFor(() =>
      expect(screen.getByText('No active assignments.')).toBeInTheDocument()
    );
    const formattedAssigned = new Date('2024-01-01').toLocaleDateString();
    await waitFor(() =>
      expect(screen.getByText(`Assigned: ${formattedAssigned}`)).toBeInTheDocument()
    );
    expect(screen.queryByText('No assets are currently marked for maintenance.')).not.toBeInTheDocument();
  });

  it('allows returning an asset from the active assignments table', async () => {
    const assets = [
      {
        id: 'asset-1',
        name: 'Projector',
        type: 'Equipment',
        status: 'assigned',
        currentAssignment: {
          id: 'assign-1',
          assetId: 'asset-1',
          employeeId: 'emp-1',
          status: 'active',
          returnDate: null,
          employee: { firstName: 'Sam', lastName: 'Carter' },
        },
      },
    ];
    const assignments = [
      {
        id: 'assign-1',
        assetId: 'asset-1',
        employeeId: 'emp-1',
        assignedDate: '2024-01-01',
        returnDate: null,
        status: 'active',
        notes: 'Handle with care',
        asset: { name: 'Projector' },
        employee: { firstName: 'Sam', lastName: 'Carter' },
      },
    ];

    queryClient.setQueryData(['/api/assets'], assets);
    queryClient.setQueryData(['/api/asset-assignments'], assignments);
    queryClient.setQueryData(['/api/employees'], []);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <QueryClientProvider client={queryClient}>
        <Assets />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getAllByText('Active Assignments')[0]);

    const returnButton = screen.getByRole('button', { name: 'Return Asset' });
    const today = new Date().toISOString().split('T')[0];

    fireEvent.click(returnButton);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: 'Asset returned successfully' })
    );

    const assignmentMutation = mutationMocks.find(
      mock => mock.variables?.assignmentId === 'assign-1'
    );
    expect(assignmentMutation).toBeDefined();
    expect(assignmentMutation?.variables).toMatchObject({
      assignmentId: 'assign-1',
      assetId: 'asset-1',
      status: 'completed',
      assetStatus: 'available',
    });
    expect(assignmentMutation?.variables.returnDate).toBe(today);
    expect(assignmentMutation?.variables.notes).toBe('Handle with care');

    const statusMutation = mutationMocks.find(
      mock => mock.variables?.assetId === 'asset-1' && mock.variables?.status === 'available'
    );
    expect(statusMutation).toBeDefined();
    expect(statusMutation?.variables.toastMessage).toBe('Asset returned successfully');

    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('moves maintenance assignments to history with updated notes when returned', async () => {
    const assets = [
      {
        id: 'asset-3',
        name: '3D Printer',
        type: 'Equipment',
        status: 'maintenance',
        currentAssignment: {
          id: 'assign-3',
          assetId: 'asset-3',
          employeeId: 'emp-3',
          status: 'maintenance',
          returnDate: null,
          employee: { firstName: 'Alex', lastName: 'Johnson' },
        },
      },
    ];
    const assignments = [
      {
        id: 'assign-3',
        assetId: 'asset-3',
        employeeId: 'emp-3',
        assignedDate: '2024-02-01',
        returnDate: null,
        status: 'maintenance',
        notes: 'Awaiting spare part',
        asset: { name: '3D Printer', type: 'Equipment' },
        employee: { firstName: 'Alex', lastName: 'Johnson' },
      },
    ];

    queryClient.setQueryData(['/api/assets'], assets);
    queryClient.setQueryData(['/api/asset-assignments'], assignments);
    queryClient.setQueryData(['/api/employees'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Assets />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getAllByText('Maintenance')[0]);

    const [openDialogButton] = await screen.findAllByRole('button', {
      name: 'Return to Service',
    });
    fireEvent.click(openDialogButton);

    const descriptionField = await screen.findByPlaceholderText('What was repaired?');
    fireEvent.change(descriptionField, { target: { value: 'Final calibration performed' } });

    const notesField = screen.getByPlaceholderText('Update assignment notes...');
    fireEvent.change(notesField, { target: { value: '  Ready for deployment  ' } });

    const allReturnButtons = await screen.findAllByRole('button', {
      name: 'Return to Service',
    });
    const submitButton = allReturnButtons[allReturnButtons.length - 1];

    await act(async () => {
      fireEvent.click(submitButton);
    });

    const today = new Date().toISOString().split('T')[0];

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: 'Asset returned successfully' })
    );

    const assignmentMutation = mutationMocks.find(
      mock => mock.variables?.assignmentId === 'assign-3'
    );
    expect(assignmentMutation).toBeDefined();
    expect(assignmentMutation?.variables).toMatchObject({
      assignmentId: 'assign-3',
      assetId: 'asset-3',
      status: 'completed',
      assetStatus: 'available',
      notes: 'Ready for deployment',
    });
    expect(assignmentMutation?.variables.returnDate).toBe(today);

    const assetStatusUpdate = mutationMocks.find(
      mock =>
        mock.variables?.assetId === 'asset-3' &&
        mock.variables?.status === 'available' &&
        mock.variables?.toastMessage === 'Asset returned successfully'
    );
    expect(assetStatusUpdate).toBeDefined();

    await act(async () => {
      queryClient.setQueryData(
        ['/api/assets'],
        assets.map(asset =>
          asset.id === 'asset-3'
            ? { ...asset, status: 'available', currentAssignment: null }
            : asset
        ),
      );
      queryClient.setQueryData(
        ['/api/asset-assignments'],
        assignments.map(assignment =>
          assignment.id === 'assign-3'
            ? {
                ...assignment,
                status: 'completed',
                returnDate: today,
                notes: 'Ready for deployment',
              }
            : assignment
        ),
      );
    });

    fireEvent.click(screen.getAllByText('Assignment History')[0]);

    await waitFor(() =>
      expect(screen.getByText('Ready for deployment')).toBeInTheDocument()
    );
    expect(screen.queryByText('Awaiting spare part')).not.toBeInTheDocument();
  });

  it('shows the maintenance label in history for maintenance assignments', async () => {
    const assets = [
      {
        id: 'asset-4',
        name: 'Laser Cutter',
        type: 'Equipment',
        status: 'maintenance',
        currentAssignment: null,
      },
    ];
    const assignments = [
      {
        id: 'history-maintenance',
        assetId: 'asset-4',
        employeeId: 'emp-4',
        assignedDate: '2024-03-01',
        returnDate: null,
        status: 'maintenance',
        notes: null,
        asset: { name: 'Laser Cutter', type: 'Equipment' },
        employee: { firstName: 'Taylor', lastName: 'Smith', phone: '555-1234' },
      },
    ];

    queryClient.setQueryData(['/api/assets'], assets);
    queryClient.setQueryData(['/api/asset-assignments'], assignments);
    queryClient.setQueryData(['/api/employees'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Assets />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getAllByText('Assignment History')[0]);

    const assignedDate = new Date('2024-03-01').toLocaleDateString();
    const periodText = `${assignedDate} – Present`;

    await waitFor(() => expect(screen.getByText(periodText)).toBeInTheDocument());

    const tableHeader = screen.getByText('Assignment Period');
    const historyTable = tableHeader.closest('table');
    expect(historyTable).not.toBeNull();

    const rows = within(historyTable as HTMLTableElement).getAllByRole('row');
    expect(rows).toHaveLength(2);

    const historyRow = rows[1];
    expect(within(historyRow).getByText('Maintenance')).toBeInTheDocument();
    expect(within(historyRow).queryByText('Taylor Smith')).not.toBeInTheDocument();
    expect(within(historyRow).queryByText('555-1234')).not.toBeInTheDocument();
  });

  it('renders assignment history for completed asset assignments', async () => {
    const assets = [
      {
        id: 'asset-2',
        name: 'High-End Laptop',
        type: 'Electronics',
        status: 'available',
        currentAssignment: null,
      },
    ];
    const assignments = [
      {
        id: 'history-1',
        assetId: 'asset-2',
        employeeId: 'emp-2',
        assignedDate: '2024-01-10',
        returnDate: '2024-02-05',
        status: 'returned',
        notes: 'Returned in good condition.',
        asset: { name: 'High-End Laptop', type: 'Electronics' },
        employee: { firstName: 'John', lastName: 'Doe' },
      },
    ];

    queryClient.setQueryData(['/api/assets'], assets);
    queryClient.setQueryData(['/api/asset-assignments'], assignments);
    queryClient.setQueryData(['/api/employees'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Assets />
      </QueryClientProvider>
    );

    const assignedDate = new Date('2024-01-10').toLocaleDateString();
    const returnedDate = new Date('2024-02-05').toLocaleDateString();

    await waitFor(() =>
      expect(screen.getAllByText('Assignment History').length).toBeGreaterThan(0)
    );

    const periodCellText = `${assignedDate} – ${returnedDate}`;
    expect(screen.getByText(periodCellText)).toBeInTheDocument();

    const tableHeader = screen.getByText('Assignment Period');
    const historyTable = tableHeader.closest('table');
    expect(historyTable).not.toBeNull();

    const rows = within(historyTable as HTMLTableElement).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getByText('High-End Laptop')).toBeInTheDocument();
    expect(within(rows[1]).getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Returned in good condition.')).toBeInTheDocument();
  });

  it('shows an empty history state when no completed assignments exist', async () => {
    queryClient.setQueryData(['/api/assets'], []);
    queryClient.setQueryData(['/api/asset-assignments'], []);
    queryClient.setQueryData(['/api/employees'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Assets />
      </QueryClientProvider>
    );

    await waitFor(() =>
      expect(screen.getAllByText('Assignment History').length).toBeGreaterThan(0)
    );

    expect(screen.getByText('No past assignments found.')).toBeInTheDocument();
    expect(
      screen.getByText('Completed assignments will appear here once available.')
    ).toBeInTheDocument();
  });

  it('requires logging a repair before returning an asset to service', async () => {
    const assets = [
      {
        id: 'asset-1',
        name: '3D Printer',
        type: 'Equipment',
        status: 'maintenance',
        currentAssignment: null,
      },
    ];

    queryClient.setQueryData(['/api/assets'], assets);
    queryClient.setQueryData(['/api/asset-assignments'], []);
    queryClient.setQueryData(['/api/employees'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Assets />
      </QueryClientProvider>
    );

    const [returnButton] = screen.getAllByRole('button', { name: 'Return to Service' });
    fireEvent.click(returnButton);

    expect(screen.getByText('Return Asset to Service')).toBeInTheDocument();

    const notesField = screen.getByLabelText('Maintenance Notes');
    expect(notesField).toBeInTheDocument();

    const submitButtons = screen.getAllByRole('button', { name: 'Return to Service' });
    const submitButton = submitButtons[submitButtons.length - 1] as HTMLButtonElement;
    expect(submitButton).toBeDisabled();

    const descriptionField = screen.getByPlaceholderText('What was repaired?');
    fireEvent.change(descriptionField, { target: { value: 'Maintenance complete' } });

    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: 'Asset returned to service' })
    );

    const repairCall = mutationMocks.find(
      mock =>
        mock.variables?.assetId === 'asset-1' &&
        mock.variables?.form?.description === 'Maintenance complete'
    );
    expect(repairCall).toBeDefined();
    expect(repairCall?.variables.form.cost).toBe('');
    expect(repairCall?.variables.form.vendor).toBe('');

    const statusCall = mutationMocks.find(
      mock => mock.variables?.assetId === 'asset-1' && mock.variables?.status === 'available'
    );
    expect(statusCall).toBeDefined();
    expect(statusCall?.variables).toMatchObject({ assetId: 'asset-1', status: 'available' });
  });

  it('updates maintenance assignment notes when returning an asset to service', async () => {
    const today = new Date().toISOString().split('T')[0];

    const assets = [
      {
        id: 'asset-1',
        name: '3D Printer',
        type: 'Equipment',
        status: 'maintenance',
        currentAssignment: {
          id: 'assignment-1',
          assetId: 'asset-1',
          employeeId: 'employee-1',
          status: 'maintenance',
          assignedDate: '2024-01-01',
          returnDate: null,
          notes: 'Needs calibration',
          employee: { id: 'employee-1', firstName: 'Jamie', lastName: 'Lee' },
        },
      },
    ];

    const assignments = [
      {
        id: 'assignment-1',
        assetId: 'asset-1',
        employeeId: 'employee-1',
        status: 'maintenance',
        assignedDate: '2024-01-01',
        returnDate: null,
        notes: 'Needs calibration',
        asset: { id: 'asset-1', name: '3D Printer', type: 'Equipment' },
        employee: { id: 'employee-1', firstName: 'Jamie', lastName: 'Lee' },
      },
    ];

    queryClient.setQueryData(['/api/assets'], assets);
    queryClient.setQueryData(['/api/asset-assignments'], assignments);
    queryClient.setQueryData(['/api/employees'], [
      { id: 'employee-1', firstName: 'Jamie', lastName: 'Lee' },
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <Assets />
      </QueryClientProvider>
    );

    const maintenanceRow = screen
      .getAllByRole('row')
      .find(row => within(row).queryByText('3D Printer'));
    expect(maintenanceRow).toBeTruthy();

    const maintenanceButton = within(maintenanceRow!)
      .getByRole('button', { name: 'Return to Service' });
    expect(maintenanceButton).toBeInTheDocument();

    fireEvent.click(maintenanceButton);

    const descriptionField = screen.getByPlaceholderText('What was repaired?');
    fireEvent.change(descriptionField, { target: { value: 'Completed tune-up' } });

    const notesField = screen.getByLabelText('Maintenance Notes') as HTMLTextAreaElement;
    expect(notesField.value).toBe('Needs calibration');
    fireEvent.change(notesField, { target: { value: 'Ready for production' } });

    const submitButtons = screen.getAllByRole('button', { name: 'Return to Service' });
    const submitButton = submitButtons[submitButtons.length - 1] as HTMLButtonElement;
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: 'Asset returned successfully' })
    );

    const repairCall = mutationMocks.find(
      mock =>
        mock.variables?.assetId === 'asset-1' &&
        mock.variables?.form?.description === 'Completed tune-up'
    );
    expect(repairCall).toBeDefined();

    const assignmentUpdateCall = mutationMocks.find(
      mock => mock.variables?.assignmentId === 'assignment-1'
    );
    expect(assignmentUpdateCall).toBeDefined();
    expect(assignmentUpdateCall?.variables).toMatchObject({
      assignmentId: 'assignment-1',
      assetId: 'asset-1',
      status: 'completed',
      assetStatus: 'available',
      notes: 'Ready for production',
    });
    expect(assignmentUpdateCall?.variables.returnDate).toBe(today);

    const statusCall = mutationMocks.find(
      mock => mock.variables?.toastMessage === 'Asset returned successfully'
    );
    expect(statusCall).toBeDefined();
    expect(statusCall?.variables).toMatchObject({
      assetId: 'asset-1',
      status: 'available',
      toastMessage: 'Asset returned successfully',
    });
  });

  it('creates a maintenance assignment for unassigned assets and reuses it when returning to service', async () => {
    const maintenanceId = 'assign-cycle';
    const today = new Date().toISOString().split('T')[0];
    const assets = [
      {
        id: 'asset-cycle',
        name: 'Spare Monitor',
        type: 'Equipment',
        status: 'available',
        currentAssignment: null,
      },
    ];

    queryClient.setQueryData(['/api/assets'], assets);
    queryClient.setQueryData(['/api/asset-assignments'], []);
    queryClient.setQueryData(['/api/employees'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Assets />
      </QueryClientProvider>
    );

    const maintenanceButton = screen.getByRole('button', { name: 'Mark as Maintenance' });
    fireEvent.click(maintenanceButton);

    await waitFor(() => {
      const mutation = mutationMocks.find(
        mock => mock.variables?.assetId === 'asset-cycle' && mock.variables?.status === 'maintenance'
      );
      expect(mutation).toBeDefined();
    });

    toast.mockReset();

    await act(async () => {
      queryClient.setQueryData(
        ['/api/assets'],
        assets.map(asset =>
          asset.id === 'asset-cycle'
            ? { ...asset, status: 'maintenance' as const }
            : asset
        )
      );
      queryClient.setQueryData(['/api/asset-assignments'], [
        {
          id: maintenanceId,
          assetId: 'asset-cycle',
          employeeId: null,
          assignedDate: today,
          returnDate: null,
          status: 'maintenance',
          notes: '',
          asset: { name: 'Spare Monitor', type: 'Equipment' },
          employee: null,
        },
      ]);
    });

    fireEvent.click(screen.getAllByText('Maintenance')[0]);
    await screen.findByText('Not currently assigned');

    const [openDialogButton] = await screen.findAllByRole('button', {
      name: 'Return to Service',
    });
    fireEvent.click(openDialogButton);

    const descriptionField = await screen.findByPlaceholderText('What was repaired?');
    fireEvent.change(descriptionField, { target: { value: 'Routine inspection' } });
    const notesField = screen.getByPlaceholderText('Update assignment notes...');
    fireEvent.change(notesField, { target: { value: 'Back in rotation' } });

    const returnButtons = await screen.findAllByRole('button', {
      name: 'Return to Service',
    });
    const submitButton = returnButtons[returnButtons.length - 1];

    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      const mutation = mutationMocks.find(
        mock => mock.variables?.assignmentId === maintenanceId
      );
      expect(mutation).toBeDefined();
    });
    const maintenanceAssignmentMutation = mutationMocks.find(
      mock => mock.variables?.assignmentId === maintenanceId
    );
    expect(maintenanceAssignmentMutation?.variables).toMatchObject({
      assignmentId: maintenanceId,
      assetId: 'asset-cycle',
      status: 'completed',
      assetStatus: 'available',
      notes: 'Back in rotation',
    });

    await waitFor(() => {
      const statusMutation = mutationMocks.find(
        mock => mock.variables?.assetId === 'asset-cycle' && mock.variables?.status === 'available'
      );
      expect(statusMutation).toBeDefined();
    });

    await act(async () => {
      queryClient.setQueryData(
        ['/api/assets'],
        assets.map(asset =>
          asset.id === 'asset-cycle'
            ? { ...asset, status: 'available' as const, currentAssignment: null }
            : asset
        )
      );
      queryClient.setQueryData(['/api/asset-assignments'], [
        {
          id: maintenanceId,
          assetId: 'asset-cycle',
          employeeId: null,
          assignedDate: today,
          returnDate: today,
          status: 'completed',
          notes: 'Back in rotation',
          asset: { name: 'Spare Monitor', type: 'Equipment' },
          employee: null,
        },
      ]);
    });

    fireEvent.click(screen.getAllByText('Assignment History')[0]);

    const localizedToday = new Date(today).toLocaleDateString();
    const tables = await screen.findAllByRole('table');
    const historyTable = tables.find(table =>
      within(table).queryByText('Assignment Period')
    );
    expect(historyTable).toBeTruthy();

    await waitFor(() =>
      expect(within(historyTable!).getByText('Maintenance')).toBeInTheDocument()
    );
    expect(
      within(historyTable!).getByText(`${localizedToday} – ${localizedToday}`)
    ).toBeInTheDocument();
    expect(within(historyTable!).getByText('Back in rotation')).toBeInTheDocument();
  });
});
