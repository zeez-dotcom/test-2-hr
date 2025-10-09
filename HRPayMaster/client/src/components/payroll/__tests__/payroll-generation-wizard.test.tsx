import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom";
import PayrollGenerationWizard, {
  type PayrollGenerationPayload,
} from "../payroll-generation-wizard";

const previewResponse = {
  period: "Jan 2024",
  startDate: "2024-01-01",
  endDate: "2024-01-31",
  employees: [
    {
      employeeId: "emp-1",
      employeeCode: "E1",
      employeeName: "John Doe",
      position: "Developer",
      vacations: [
        {
          id: "vac-1",
          startDate: "2024-01-05",
          endDate: "2024-01-06",
          daysInPeriod: 2,
        },
      ],
      loans: [
        {
          id: "loan-1",
          reason: null,
          monthlyDeduction: 75,
          remainingAmount: 200,
        },
      ],
      events: [
        {
          id: "evt-bonus",
          title: "Project Bonus",
          amount: 150,
          eventType: "bonus",
          eventDate: "2024-01-10",
          effect: "bonus",
        },
        {
          id: "evt-deduction",
          title: "Penalty",
          amount: 60,
          eventType: "deduction",
          eventDate: "2024-01-12",
          effect: "deduction",
        },
      ],
      allowances: [
        {
          id: "evt-allowance",
          title: "Housing",
          amount: 100,
          source: "period",
        },
        {
          id: "evt-allowance-recurring",
          title: "Transport",
          amount: 50,
          source: "recurring",
        },
      ],
    },
  ],
};

const apiPost = vi.fn();

vi.mock("@/lib/http", () => ({
  apiPost: (...args: any[]) => apiPost(...args),
}));

vi.mock("../payroll-form", () => ({
  __esModule: true,
  default: ({ onSubmit }: { onSubmit: (values: PayrollGenerationPayload) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSubmit({ period: "Jan 2024", startDate: "2024-01-01", endDate: "2024-01-31" })
      }
    >
      Continue
    </button>
  ),
}));

describe("PayrollGenerationWizard", () => {
  beforeEach(() => {
    apiPost.mockReset();
    apiPost.mockResolvedValue({ ok: true, data: previewResponse });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("collects overrides across steps before submitting", async () => {
    const handleSubmit = vi.fn();

    render(
      <PayrollGenerationWizard
        onSubmit={handleSubmit}
        isSubmitting={false}
        canGenerate={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/api/payroll/preview", {
        period: "Jan 2024",
        startDate: "2024-01-01",
        endDate: "2024-01-31",
      });
    });

    const vacationSwitch = screen.getByLabelText(/Apply vacation from 2024-01-05/i);
    fireEvent.click(vacationSwitch);

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const loanSwitch = screen.getByLabelText(/Deduct .* for loan repayment/i);
    fireEvent.click(loanSwitch);

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const bonusSwitch = screen.getByLabelText(/Project Bonus/);
    fireEvent.click(bonusSwitch);
    const deductionSwitch = screen.getByLabelText(/Penalty/);
    fireEvent.click(deductionSwitch);

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const allowanceSwitch = screen.getByLabelText(/Housing \(period\)/i);
    fireEvent.click(allowanceSwitch);
    const recurringSwitch = screen.getByLabelText(/Transport \(recurring\)/i);
    fireEvent.click(recurringSwitch);

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByText(/Vacations applied: 0 of 1/)).toBeInTheDocument();
    expect(screen.getByText(/Loans deducted: 0 of 1/)).toBeInTheDocument();
    expect(screen.getByText(/Bonuses and deductions applied: 0 of 2/)).toBeInTheDocument();
    expect(screen.getByText(/Allowances confirmed: 0 of 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /generate payroll/i }));

    expect(handleSubmit).toHaveBeenCalledWith({
      period: "Jan 2024",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      overrides: {
        skippedVacationIds: ["vac-1"],
        skippedLoanIds: ["loan-1"],
        skippedEventIds: [
          "evt-bonus",
          "evt-deduction",
          "evt-allowance",
          "evt-allowance-recurring",
        ],
      },
    });
  });
});
