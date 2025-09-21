import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
          },
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
        React.isValidElement(child)
          ? React.cloneElement(child, { onValueChange })
          : child
      )}
    </div>
  ),
  SelectContent: ({ children }: any) => (
    <div>
      {React.Children.map(children, child =>
        React.isValidElement(child)
          ? React.cloneElement(child, { onValueChange: (child as any).props?.onValueChange })
          : child
      )}
    </div>
  ),
  SelectItem: ({ children, value, onValueChange }: any) => (
    <div data-value={value} onClick={() => onValueChange?.(value)}>
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
});
