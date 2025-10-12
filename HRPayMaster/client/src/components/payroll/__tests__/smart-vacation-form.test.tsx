import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const toastSpy = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

const submitVacationMock = vi.fn().mockResolvedValue({
  payrollEntry: { id: "entry-1" },
  vacationRequest: { id: "vac-1" },
});

vi.mock("@/lib/payroll-vacation", () => ({
  submitPayrollVacationOverride: submitVacationMock,
}));

const apiPostMock = vi.fn().mockResolvedValue({ ok: true, data: { id: "event-1" } });

vi.mock("@/lib/http", () => ({
  apiPost: apiPostMock,
}));

const receiptMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/event-receipts", () => ({
  generateEventReceipt: receiptMock,
}));

vi.mock("@/lib/toastError", () => ({
  toastApiError: vi.fn(),
}));

describe("SmartVacationForm", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.resetModules();
    queryClient = new QueryClient();
    queryClient.setQueryData(["/api/employees"], [
      { id: "emp-1", firstName: "Ada", lastName: "Lovelace" },
    ]);
    submitVacationMock.mockClear();
    apiPostMock.mockClear();
    receiptMock.mockClear();
    toastSpy.mockClear();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("submits a vacation override and generates a receipt", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    vi.unmock("@/components/payroll/smart-vacation-form");
    const { SmartVacationForm } = await import("@/components/payroll/smart-vacation-form");

    render(
      <QueryClientProvider client={queryClient}>
        <SmartVacationForm
          isOpen
          onClose={onClose}
          onSuccess={onSuccess}
          payrollEntryId="entry-1"
          employeeId="emp-1"
          currentVacationDays={1}
          payrollId="run-1"
        />
      </QueryClientProvider>,
    );

    const startInput = screen.getByLabelText("Start Date") as HTMLInputElement;
    const endInput = screen.getByLabelText("End Date") as HTMLInputElement;

    fireEvent.change(startInput, { target: { value: "2024-01-05" } });
    fireEvent.change(endInput, { target: { value: "2024-01-07" } });

    const submitButton = screen.getByRole("button", { name: /apply vacation days/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submitVacationMock).toHaveBeenCalledWith("entry-1", {
        startDate: "2024-01-05",
        endDate: "2024-01-07",
        leaveType: "annual",
        deductFromSalary: false,
        reason: "annual leave: 3 days (2024-01-05 → 2024-01-07)",
      });
    });

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/api/employee-events", expect.objectContaining({
        employeeId: "emp-1",
        eventType: "vacation",
        eventDate: "2024-01-05",
      }));
    });

    await waitFor(() => {
      expect(receiptMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
