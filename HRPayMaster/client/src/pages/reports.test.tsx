import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryClient } from '@/lib/queryClient';
import { toLocalYMD } from '@/lib/date';
import Reports from './reports';
import '@testing-library/jest-dom';
import '@/lib/i18n';
import { formatCurrency, setCurrencyConfigForTests } from '@/lib/utils';

type GlobalWithResize = typeof globalThis & { ResizeObserver?: any };

const originalFetch: typeof fetch | undefined = global.fetch;
const originalResizeObserver = (globalThis as GlobalWithResize).ResizeObserver;

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as GlobalWithResize).ResizeObserver = ResizeObserverMock;
});

afterAll(() => {
  if (originalFetch) {
    global.fetch = originalFetch;
  }
  if (originalResizeObserver) {
    (globalThis as GlobalWithResize).ResizeObserver = originalResizeObserver;
  } else {
    delete (globalThis as GlobalWithResize).ResizeObserver;
  }
});

beforeEach(() => {
  queryClient.clear();
  setCurrencyConfigForTests({ currency: 'USD', locale: 'en-US' });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [],
    headers: { get: () => null },
  } as any);
});

afterEach(() => {
  setCurrencyConfigForTests(null);
  if (originalFetch) {
    global.fetch = originalFetch;
  }
});

function seedReportsData() {
  const currentYear = new Date().getFullYear();
  const start = toLocalYMD(new Date(currentYear, 0, 1));
  const end = toLocalYMD(new Date(currentYear, 11, 31));

  const employees: any[] = [
    {
      id: 'emp-1',
      employeeCode: 'E-100',
      firstName: 'Jane',
      lastName: 'Doe',
      position: 'Engineer',
      role: 'employee',
      salary: '0',
      workLocation: 'Office',
      startDate: `${currentYear}-01-01`,
      status: 'active',
    },
    {
      id: 'emp-2',
      employeeCode: 'E-200',
      firstName: 'John',
      lastName: 'Smith',
      position: 'Designer',
      role: 'employee',
      salary: '0',
      workLocation: 'Office',
      startDate: `${currentYear}-01-01`,
      status: 'active',
    },
    {
      id: 'emp-3',
      employeeCode: 'E-300',
      firstName: 'Alice',
      lastName: 'Jones',
      position: 'Analyst',
      role: 'employee',
      salary: '0',
      workLocation: 'Office',
      startDate: `${currentYear}-01-01`,
      status: 'inactive',
    },
  ];

  const assetAssignments: any[] = [
    {
      id: 'asset-asg-1',
      assetId: 'asset-1',
      employeeId: 'emp-1',
      assignedDate: `${currentYear}-02-10`,
      returnDate: `${currentYear}-02-20`,
      status: 'active',
      notes: 'Assigned for project',
      asset: {
        id: 'asset-1',
        name: 'Laptop Pro',
        type: 'hardware',
        status: 'assigned',
        details: 'Dell XPS 15',
      },
      employee: {
        id: 'emp-1',
        firstName: 'Jane',
        lastName: 'Doe',
        employeeCode: 'E-100',
      },
    },
    {
      id: 'asset-asg-2',
      assetId: 'asset-2',
      employeeId: 'emp-2',
      assignedDate: `${currentYear - 1}-12-15`,
      returnDate: null,
      status: 'active',
      notes: null,
      asset: {
        id: 'asset-2',
        name: 'Carry Case',
        type: 'accessory',
        status: 'assigned',
        details: null,
      },
      employee: {
        id: 'emp-2',
        firstName: 'John',
        lastName: 'Smith',
        employeeCode: 'E-200',
      },
    },
    {
      id: 'asset-asg-3',
      assetId: 'asset-3',
      employeeId: 'emp-3',
      assignedDate: `${currentYear - 1}-01-05`,
      returnDate: `${currentYear - 1}-03-01`,
      status: 'completed',
      notes: 'Historical assignment',
      asset: {
        id: 'asset-3',
        name: 'Legacy Laptop',
        type: 'hardware',
        status: 'available',
        details: 'Old stock',
      },
      employee: {
        id: 'emp-3',
        firstName: 'Alice',
        lastName: 'Jones',
        employeeCode: 'E-300',
      },
    },
  ];

  const carAssignments: any[] = [
    {
      id: 'car-asg-1',
      carId: 'car-1',
      employeeId: 'emp-1',
      assignedDate: `${currentYear}-03-01`,
      returnDate: `${currentYear}-03-10`,
      status: 'active',
      notes: 'Client visits',
      car: {
        id: 'car-1',
        make: 'Toyota',
        model: 'Camry',
        year: 2024,
        plateNumber: 'ABC123',
        vin: 'VIN123',
        serial: 'SER123',
      },
      employee: {
        id: 'emp-1',
        firstName: 'Jane',
        lastName: 'Doe',
        employeeCode: 'E-100',
      },
    },
    {
      id: 'car-asg-2',
      carId: 'car-2',
      employeeId: 'emp-2',
      assignedDate: `${currentYear - 1}-12-01`,
      returnDate: null,
      status: 'active',
      notes: null,
      car: {
        id: 'car-2',
        make: 'Honda',
        model: 'Civic',
        year: 2023,
        plateNumber: 'XYZ789',
        vin: null,
        serial: null,
      },
      employee: {
        id: 'emp-2',
        firstName: 'John',
        lastName: 'Smith',
        employeeCode: 'E-200',
      },
    },
    {
      id: 'car-asg-3',
      carId: 'car-3',
      employeeId: 'emp-3',
      assignedDate: `${currentYear - 2}-05-01`,
      returnDate: `${currentYear - 2}-06-01`,
      status: 'completed',
      notes: 'Old trip',
      car: {
        id: 'car-3',
        make: 'Ford',
        model: 'Fiesta',
        year: 2022,
        plateNumber: 'OLD111',
        vin: 'VINOLD',
        serial: 'SEROLD',
      },
      employee: {
        id: 'emp-3',
        firstName: 'Alice',
        lastName: 'Jones',
        employeeCode: 'E-300',
      },
    },
  ];

  queryClient.setQueryData(['/api/employees'], employees);
  queryClient.setQueryData(['/api/departments'], []);
  queryClient.setQueryData(['/api/employee-events'], []);
  queryClient.setQueryData(['/api/payroll'], []);
  const payrollSummary = [
    {
      period: `${currentYear}-Q1`,
      totals: {
        grossPay: 10000,
        netPay: 8200,
        allowances: 1200,
        bonuses: 500,
      },
    },
  ];

  queryClient.setQueryData(['/api/reports/payroll', start, end], payrollSummary);
  queryClient.setQueryData(['/api/reports/loan-balances', start, end], []);
  queryClient.setQueryData(['/api/asset-assignments', start, end], assetAssignments);
  queryClient.setQueryData(['/api/car-assignments', start, end], carAssignments);
  queryClient.setQueryData(['/api/reports/payroll-by-department', start, end], []);

  return {
    includedAssets: ['Laptop Pro', 'Carry Case'],
    excludedAsset: 'Legacy Laptop',
    includedVehicles: ['Toyota Camry 2024', 'Honda Civic 2023'],
    excludedVehicle: 'Ford Fiesta 2022',
    payrollSummary,
  };
}

describe('Reports page - assignment usage filtering', () => {
  it('shows only asset assignments overlapping the selected date range', async () => {
    const { includedAssets, excludedAsset } = seedReportsData();

    render(
      <QueryClientProvider client={queryClient}>
        <Reports />
      </QueryClientProvider>
    );

    const assetTab = await screen.findByRole('tab', { name: /Asset Usage/i });
    const user = userEvent.setup();
    await user.click(assetTab);
    await screen.findByText(includedAssets[0]);
    includedAssets.forEach(assetName => {
      expect(screen.getByText(assetName)).toBeInTheDocument();
    });
    expect(screen.queryByText(excludedAsset)).not.toBeInTheDocument();
  });

  it('shows only fleet assignments overlapping the selected date range', async () => {
    const { includedVehicles, excludedVehicle } = seedReportsData();

    render(
      <QueryClientProvider client={queryClient}>
        <Reports />
      </QueryClientProvider>
    );

    const fleetTab = await screen.findByRole('tab', { name: /Fleet Usage/i });
    const user = userEvent.setup();
    await user.click(fleetTab);
    await screen.findByText(includedVehicles[0]);
    includedVehicles.forEach(vehicle => {
      expect(screen.getByText(vehicle)).toBeInTheDocument();
    });
    expect(screen.queryByText(excludedVehicle)).not.toBeInTheDocument();
  });
});

describe('Reports page - payroll summary totals', () => {
  it('renders allowances and bonuses totals in the payroll summary table', async () => {
    const { payrollSummary } = seedReportsData();

    render(
      <QueryClientProvider client={queryClient}>
        <Reports />
      </QueryClientProvider>
    );

    const payrollTab = await screen.findByRole('tab', { name: /Payroll Summary/i });
    const user = userEvent.setup();
    await user.click(payrollTab);

    expect(await screen.findByText(/Allowances/i)).toBeInTheDocument();

    const [summary] = payrollSummary;
    expect(await screen.findByText(formatCurrency(summary.totals.allowances))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(summary.totals.bonuses))).toBeInTheDocument();
  });
});
