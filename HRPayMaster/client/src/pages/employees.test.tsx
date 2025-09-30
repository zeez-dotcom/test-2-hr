import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import Employees from './employees';
import '@testing-library/jest-dom';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
  toast,
}));

vi.mock('@/components/employees/employee-table', () => ({
  default: ({ employees }: { employees: any[] }) => (
    <ul>
      {employees.map(e => (
        <li key={e.id}>{e.firstName} {e.lastName}</li>
      ))}
    </ul>
  )
}));

vi.mock('@/components/employees/employee-form', () => ({
  default: () => <div>EmployeeForm</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
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

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogTrigger: ({ children }: any) => <div>{children}</div>,
}));

beforeEach(() => {
  queryClient.clear();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => [],
  } as any);
});

describe('Employees page', () => {
  it('filters employees based on search input', async () => {
    const user = userEvent.setup();
    const employees = [
      {
        id: '1',
        employeeCode: 'E1',
        firstName: 'Alice',
        lastName: 'Smith',
        position: 'Dev',
        salary: '0',
        workLocation: 'Office',
        startDate: '2024-01-01',
        status: 'active',
      },
      {
        id: '2',
        employeeCode: 'E2',
        firstName: 'Bob',
        lastName: 'Jones',
        position: 'Dev',
        salary: '0',
        workLocation: 'Office',
        startDate: '2024-01-01',
        status: 'active',
      },
    ];
    queryClient.setQueryData(['/api/employees'], employees);
    queryClient.setQueryData(['/api/departments'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <Employees />
      </QueryClientProvider>
    );

    // Both employees are shown
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search employees...'), 'Alice');

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).toBeNull();
  });
});
