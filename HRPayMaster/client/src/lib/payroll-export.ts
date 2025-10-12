import { calculateWorkingDaysAdjustment, formatAllowanceSummaryForCsv, formatCurrency, formatDate, getCurrencyCode } from "@/lib/utils";
import type { Employee, PayrollEntry, PayrollRunWithEntries } from "@shared/schema";

export type PayrollEntryWithEmployee = PayrollEntry & { employee?: Employee | null };

interface BasePayrollExportOptions {
  entries: PayrollEntryWithEmployee[];
  payrollRun: PayrollRunWithEntries;
  scopeLabel: string;
}

interface FileDownloadResult {
  filename: string;
  entryCount: number;
}

interface BankFileDownloadResult extends FileDownloadResult {
  totalAmount: number;
}

const CSV_MIME_TYPE = "text/csv;charset=utf-8;";
const TEXT_MIME_TYPE = "text/plain;charset=utf-8;";

function triggerDownload(content: string, filename: string, mimeType: string) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const objectUrl = window.URL?.createObjectURL?.(blob);
  if (!objectUrl) {
    return;
  }

  const link = document.createElement("a");
  link.setAttribute("href", objectUrl);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.URL.revokeObjectURL(objectUrl);
}

function buildFileName(prefix: string, scopeLabel: string, payrollRun: PayrollRunWithEntries, extension: string) {
  const normalizedScope = scopeLabel.replace(/\s+/g, "_");
  const normalizedStartDate = formatDate(payrollRun.startDate).replace(/\s+/g, "_");
  return `${prefix}_${normalizedScope}_${normalizedStartDate}.${extension}`;
}

export function downloadPayrollCsv({ entries, payrollRun, scopeLabel }: BasePayrollExportOptions): FileDownloadResult {
  const headers = [
    "Employee ID", "Employee Name", "Position", "Work Location",
    "Base Salary", "Allowances", "Bonus", "Gross Pay", "Working Days", "Actual Working Days", "Working Days Adjustment", "Vacation Days",
    "Tax Deduction", "Social Security", "Health Insurance", "Loan Deduction", "Other Deductions",
    "Total Deductions", "Net Pay", "Adjustment Reason",
  ];

  const csvData = entries.map(entry => {
    const grossPay = parseFloat(entry.grossPay?.toString() || "0");
    const totalDeductions = (
      parseFloat(entry.taxDeduction?.toString() || "0") +
      parseFloat(entry.socialSecurityDeduction?.toString() || "0") +
      parseFloat(entry.healthInsuranceDeduction?.toString() || "0") +
      parseFloat(entry.loanDeduction?.toString() || "0") +
      parseFloat(entry.otherDeductions?.toString() || "0")
    );
    const netPay = grossPay - totalDeductions;
    const workingDaysAdjustment = calculateWorkingDaysAdjustment(entry);
    const allowanceCell = formatAllowanceSummaryForCsv(entry.allowances);

    return [
      entry.employeeId,
      `${entry.employee?.firstName ?? ""} ${entry.employee?.lastName ?? ""}`.trim(),
      entry.employee?.position ?? "N/A",
      entry.employee?.workLocation ?? "Office",
      entry.baseSalary ?? 0,
      allowanceCell,
      entry.bonusAmount ?? 0,
      grossPay,
      entry.workingDays ?? 0,
      entry.actualWorkingDays ?? 0,
      workingDaysAdjustment.toFixed(3),
      entry.vacationDays ?? 0,
      entry.taxDeduction ?? 0,
      entry.socialSecurityDeduction ?? 0,
      entry.healthInsuranceDeduction ?? 0,
      entry.loanDeduction ?? 0,
      entry.otherDeductions ?? 0,
      totalDeductions,
      netPay,
      entry.adjustmentReason ?? "",
    ];
  });

  const csvContent = [
    [`HR Pro Payroll Export - ${scopeLabel}`],
    [`Period: ${formatDate(payrollRun.startDate)} to ${formatDate(payrollRun.endDate)}`],
    [`Generated: ${formatDate(new Date())}`],
    [],
    headers,
    ...csvData,
  ]
    .map(row => row.join(","))
    .join("\n");

  const filename = buildFileName("payroll", scopeLabel, payrollRun, "csv");
  triggerDownload(csvContent, filename, CSV_MIME_TYPE);

  return { filename, entryCount: entries.length };
}

export function downloadPayrollBankFile({
  entries,
  payrollRun,
  scopeLabel,
}: BasePayrollExportOptions): BankFileDownloadResult {
  const currencyCode = getCurrencyCode();

  const bankData = entries
    .filter(entry => entry.employee?.bankIban)
    .map(entry => {
      const grossPay = parseFloat(entry.grossPay?.toString() || "0");
      const totalDeductions = (
        parseFloat(entry.taxDeduction?.toString() || "0") +
        parseFloat(entry.socialSecurityDeduction?.toString() || "0") +
        parseFloat(entry.healthInsuranceDeduction?.toString() || "0") +
        parseFloat(entry.loanDeduction?.toString() || "0") +
        parseFloat(entry.otherDeductions?.toString() || "0")
      );
      const netPay = grossPay - totalDeductions;

      return {
        employeeId: entry.employeeId,
        employeeName: `${entry.employee?.firstName ?? ""} ${entry.employee?.lastName ?? ""}`.trim(),
        iban: entry.employee?.bankIban,
        bankName: entry.employee?.bankName ?? "Unknown Bank",
        amount: netPay,
        reference: `Salary_${entry.employeeId}_${formatDate(payrollRun.startDate).replace(/\s+/g, "")}`,
      };
    });

  const totalAmount = bankData.reduce((sum, item) => sum + item.amount, 0);

  const bankFileContent = [
    `Bank Transfer File - ${scopeLabel}`,
    `Date: ${formatDate(new Date())}`,
    `Period: ${formatDate(payrollRun.startDate)} to ${formatDate(payrollRun.endDate)}`,
    `Total Transfers: ${bankData.length}`,
    `Total Amount: ${formatCurrency(totalAmount)}`,
    "",
    `Employee ID,Employee Name,IBAN,Bank Name,Amount (${currencyCode}),Reference`,
    ...bankData.map(item =>
      `${item.employeeId},"${item.employeeName}",${item.iban},"${item.bankName}",${item.amount.toFixed(3)},${item.reference}`,
    ),
  ].join("\n");

  const filename = buildFileName("bank_transfer", scopeLabel, payrollRun, "txt");
  triggerDownload(bankFileContent, filename, TEXT_MIME_TYPE);

  return { filename, entryCount: bankData.length, totalAmount };
}
