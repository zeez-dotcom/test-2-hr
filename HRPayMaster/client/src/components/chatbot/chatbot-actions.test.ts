import { describe, it, expect, beforeEach, vi } from "vitest";
import { updateLatestLoanMonthlyDeduction, updateEmployeeFieldValue } from "./chatbot-actions";
import { apiGet, apiPut } from "@/lib/http";

vi.mock("@/lib/http", () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
}));

describe("chatbot action helpers", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPut).mockReset();
  });

  it("updates the most recent loan for an employee", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({
      ok: true,
      data: [
        { id: "loan-old", employeeId: "1", startDate: "2023-01-01" },
        { id: "loan-new", employeeId: "1", startDate: "2024-03-15" },
        { id: "loan-other", employeeId: "2", startDate: "2024-04-01" },
      ],
    } as any);
    vi.mocked(apiPut).mockResolvedValueOnce({ ok: true, data: { id: "loan-new" } } as any);

    const result = await updateLatestLoanMonthlyDeduction("1", 125);

    expect(result).toEqual({ loanId: "loan-new" });
    expect(apiGet).toHaveBeenCalledWith("/api/loans");
    expect(apiPut).toHaveBeenCalledWith("/api/loans/loan-new", { monthlyDeduction: 125 });
  });

  it("throws NO_LOAN when employee has no loans", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({ ok: true, data: [] } as any);

    await expect(updateLatestLoanMonthlyDeduction("1", 200)).rejects.toThrow("NO_LOAN");
    expect(apiPut).not.toHaveBeenCalled();
  });

  it("propagates loan update failures", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({
      ok: true,
      data: [{ id: "loan-1", employeeId: "1", startDate: "2024-01-01" }],
    } as any);
    vi.mocked(apiPut).mockResolvedValueOnce({ ok: false, error: "bad" } as any);

    await expect(updateLatestLoanMonthlyDeduction("1", 90)).rejects.toThrow("FAILED_TO_UPDATE_LOAN");
  });

  it("updates employee fields via apiPut", async () => {
    vi.mocked(apiPut).mockResolvedValueOnce({ ok: true, data: { id: "1" } } as any);

    await expect(updateEmployeeFieldValue("1", "phone", "555-0000")).resolves.toEqual({ id: "1" });
    expect(apiPut).toHaveBeenCalledWith("/api/employees/1", { phone: "555-0000" });
  });
});
