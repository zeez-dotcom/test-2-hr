import { apiGet, apiPut } from "@/lib/http";

interface LoanRecord {
  id?: string;
  employeeId?: string;
  startDate?: string;
}

type LoanUpdateResult = {
  loanId: string;
};

export async function updateLatestLoanMonthlyDeduction(
  employeeId: string,
  monthlyDeduction: number,
): Promise<LoanUpdateResult> {
  const loansResponse = await apiGet("/api/loans");
  if (!loansResponse.ok) {
    throw new Error("FAILED_TO_FETCH_LOANS");
  }

  const loans = Array.isArray(loansResponse.data)
    ? (loansResponse.data as LoanRecord[])
    : [];

  const target = loans
    .filter((loan) => loan?.employeeId === employeeId)
    .sort((a, b) => {
      const aDate = a?.startDate ? new Date(a.startDate).getTime() : 0;
      const bDate = b?.startDate ? new Date(b.startDate).getTime() : 0;
      return bDate - aDate;
    })[0];

  if (!target?.id) {
    throw new Error("NO_LOAN");
  }

  const updateResponse = await apiPut(`/api/loans/${target.id}`, {
    monthlyDeduction,
  });

  if (!updateResponse.ok) {
    throw new Error("FAILED_TO_UPDATE_LOAN");
  }

  return { loanId: target.id };
}

export async function updateEmployeeFieldValue(
  employeeId: string,
  field: string,
  value: string,
) {
  const payload: Record<string, unknown> = { [field]: value };
  const response = await apiPut(`/api/employees/${employeeId}`, payload);
  if (!response.ok) {
    throw new Error("FAILED_TO_UPDATE_EMPLOYEE");
  }
  return response.data;
}
