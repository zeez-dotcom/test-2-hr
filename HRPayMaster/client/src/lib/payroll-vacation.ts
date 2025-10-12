import type { PayrollEntry, VacationRequest } from "@shared/schema";
import { apiPost } from "./http";

export interface PayrollVacationOverrideInput {
  startDate: string;
  endDate: string;
  leaveType: "annual" | "sick" | "emergency" | "unpaid";
  deductFromSalary?: boolean;
  reason: string;
}

export interface PayrollVacationOverrideResponse {
  payrollEntry: PayrollEntry;
  vacationRequest: VacationRequest;
}

export async function submitPayrollVacationOverride(
  payrollEntryId: string,
  payload: PayrollVacationOverrideInput,
): Promise<PayrollVacationOverrideResponse> {
  const res = await apiPost(`/api/payroll/entries/${payrollEntryId}/vacation`, payload);
  if (!res.ok) {
    throw res;
  }
  return res.data as PayrollVacationOverrideResponse;
}
