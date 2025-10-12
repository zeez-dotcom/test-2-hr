import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { EnhancedPayrollTable } from "../enhanced-payroll-table";
import { setCurrencyConfigForTests } from "@/lib/utils";

const mutateMock = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useMutation: () => ({ mutate: mutateMock }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({ ...props }: any) => <input {...props} />,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/http", () => ({
  apiPut: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));

vi.mock("@/lib/toastError", () => ({
  toastApiError: vi.fn(),
}));

vi.mock("@/components/payroll/smart-vacation-form", () => ({
  SmartVacationForm: () => null,
}));

vi.mock("@/components/payroll/smart-deduction-form", () => ({
  SmartDeductionForm: () => null,
}));

vi.mock("lucide-react", () => {
  const Icon = ({ children }: any) => <span>{children}</span>;
  return {
    Calculator: Icon,
    TrendingUp: Icon,
    AlertCircle: Icon,
    CheckCircle: Icon,
    Calendar: Icon,
    DollarSign: Icon,
    User: Icon,
    FileText: Icon,
    Undo: Icon,
    Redo: Icon,
    Save: Icon,
    Copy: Icon,
    ClipboardPaste: Icon,
  };
});

describe("EnhancedPayrollTable allowances", () => {
  beforeEach(() => {
    setCurrencyConfigForTests({ currency: "KWD", locale: "en-KW" });
  });

  afterEach(() => {
    setCurrencyConfigForTests(null);
  });

  it("displays aggregated allowances with a breakdown and handles empty allowances", () => {
    const entries = [
      {
        id: "entry-1",
        employeeId: "1",
        employee: { firstName: "John", lastName: "Doe", salary: 1000 },
        baseSalary: 1000,
        grossPay: 1200,
        allowances: {
          housing: 200,
          transport_stipend: 100,
        },
        workingDays: 30,
        actualWorkingDays: 30,
        vacationDays: 0,
        taxDeduction: 0,
        socialSecurityDeduction: 0,
        healthInsuranceDeduction: 0,
        loanDeduction: 0,
        otherDeductions: 0,
      },
      {
        id: "entry-2",
        employeeId: "2",
        employee: { firstName: "Jane", lastName: "Smith", salary: 900 },
        baseSalary: 900,
        grossPay: 900,
        allowances: {},
        workingDays: 30,
        actualWorkingDays: 28,
        vacationDays: 2,
        taxDeduction: 0,
        socialSecurityDeduction: 0,
        healthInsuranceDeduction: 0,
        loanDeduction: 0,
        otherDeductions: 0,
      },
    ];

    render(<EnhancedPayrollTable entries={entries} payrollId="payroll-1" />);

    expect(screen.getByText("Allowances")).toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    const firstDataRow = rows[1];
    expect(within(firstDataRow).getByText(/\+KWD\s*300\.000/)).toBeInTheDocument();
    expect(
      within(firstDataRow).getByText(/Housing Allowance:\s*\+KWD\s*200\.000/),
    ).toBeInTheDocument();
    expect(
      within(firstDataRow).getByText(/Transport Stipend Allowance:\s*\+KWD\s*100\.000/),
    ).toBeInTheDocument();

    const secondDataRow = rows[2];
    expect(within(secondDataRow).getByText("—")).toBeInTheDocument();
  });
});
