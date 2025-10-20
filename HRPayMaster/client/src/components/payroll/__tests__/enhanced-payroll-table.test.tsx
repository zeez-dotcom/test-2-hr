import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";
import { EnhancedPayrollTable } from "../enhanced-payroll-table";
import { setCurrencyConfigForTests } from "@/lib/utils";
import { apiPut } from "@/lib/http";

const mutateMock = vi.fn();
const apiPutMock = apiPut as ReturnType<typeof vi.fn>;

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
    mutateMock.mockReset();
    apiPutMock.mockClear();
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

  it("supports undoing and redoing edits", async () => {
    const entries = [
      {
        id: "entry-1",
        employeeId: "1",
        employee: { firstName: "John", lastName: "Doe", salary: 1000 },
        baseSalary: 1000,
        grossPay: 1200,
        allowances: {},
        workingDays: 30,
        actualWorkingDays: 30,
        vacationDays: 0,
        taxDeduction: 0,
        socialSecurityDeduction: 0,
        healthInsuranceDeduction: 0,
        loanDeduction: 0,
        otherDeductions: 0,
      },
    ];

    const user = userEvent.setup();
    render(<EnhancedPayrollTable entries={entries} payrollId="payroll-1" />);

    const editableCells = screen.getAllByTitle("Click to edit");
    await user.click(editableCells[0]);

    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input).toHaveValue(1000);
    fireEvent.change(input, { target: { value: "2000" } });
    await user.keyboard("{Enter}");
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Undo").closest("button")).not.toBeDisabled();
    });

    const undoButton = screen.getByText("Undo").closest("button");

    await user.click(undoButton!);

    await waitFor(() => {
      expect(apiPutMock).toHaveBeenCalledWith("/api/payroll/entries/entry-1", {
        baseSalary: "1000",
      });
    });

    await waitFor(() => {
      expect(undoButton).toBeDisabled();
    });

    const redoButton = screen.getByText("Redo").closest("button");
    await waitFor(() => {
      expect(redoButton).not.toBeDisabled();
    });

    apiPutMock.mockClear();
    await user.click(redoButton!);

    await waitFor(() => {
      expect(apiPutMock).toHaveBeenCalledWith("/api/payroll/entries/entry-1", {
        baseSalary: "2000",
      });
    });

    await waitFor(() => {
      expect(redoButton).toBeDisabled();
    });
  });
});
