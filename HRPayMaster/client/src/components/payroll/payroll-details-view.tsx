import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DollarSign, User, FileText, Printer } from "lucide-react";
import type { PayrollRunWithEntries } from "@shared/schema";
import {
  formatCurrency,
  formatDate,
  calculateWorkingDaysAdjustment,
  summarizeAllowances,
} from "@/lib/utils";
import { getBrand } from "@/lib/brand";

type PayrollEntryWithEmployee = NonNullable<PayrollRunWithEntries["entries"]>[number];
export type { PayrollEntryWithEmployee };

export const getEmployeeNames = (entry: PayrollEntryWithEmployee) => {
  const employee = entry.employee;

  if (!employee) {
    return {
      englishName: `Employee ${entry.employeeId}`,
      arabicName: "",
    };
  }

  const englishNameParts = [employee.firstName, employee.lastName]
    .map((part) => part?.trim())
    .filter(Boolean) as string[];

  const englishName =
    englishNameParts.join(" ") ||
    employee.nickname?.trim() ||
    `Employee ${entry.employeeId}`;

  const arabicName = employee.arabicName?.trim() || "";

  return {
    englishName,
    arabicName,
  };
};

const getEmployeeIdentifier = (entry: PayrollEntryWithEmployee) => {
  const code = entry.employee?.employeeCode?.trim();
  if (code) {
    return `Code: ${code}`;
  }

  return `ID: ${entry.employeeId}`;
};

const formatSignedCurrency = (amount: number) => {
  const sign = amount >= 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(amount))}`;
};

interface PayrollDetailsViewProps {
  payrollId: string;
  onRegisterPrint?: (handler: (() => void) | null) => void;
}

export default function PayrollDetailsView({ payrollId, onRegisterPrint }: PayrollDetailsViewProps) {
  const { data: payrollRun, isLoading } = useQuery<PayrollRunWithEntries>({
    queryKey: ["/api/payroll", payrollId],
  });

  const printContentRef = useRef<HTMLDivElement>(null);
  const brand = getBrand();

  const brandInitials = brand.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "HR";

  const formatDateTime = (value?: string | Date | null) => {
    if (!value) {
      return "-";
    }

    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const handlePrint = useCallback(() => {
    if (!printContentRef.current) return;
    window.print();
  }, []);

  useEffect(() => {
    if (!onRegisterPrint || !payrollRun) {
      return;
    }

    onRegisterPrint(handlePrint);

    return () => {
      onRegisterPrint(null);
    };
  }, [handlePrint, onRegisterPrint, payrollRun]);


  const getStatusColor = (status: string) => {
    const printSafe = "print:bg-transparent print:text-black print:border-black";

    switch (status) {
      case "completed":
        return `bg-transparent text-success border-success ${printSafe}`;
      case "pending":
        return `bg-transparent text-warning border-warning ${printSafe}`;
      case "cancelled":
        return `bg-transparent text-destructive border-destructive ${printSafe}`;
      default:
        return `bg-transparent text-secondary-foreground border-muted ${printSafe}`;
    }
  };

  if (isLoading) {
    return <div className="animate-pulse">Loading payroll details...</div>;
  }

  if (!payrollRun) {
    return <div className="text-center text-gray-500">Payroll run not found</div>;
  }

  return (
    <div
      ref={printContentRef}
      className="payroll-print-area space-y-6 print:bg-white print:text-black"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 border border-muted-foreground/10 bg-white shadow-sm">
            {brand.logo ? (
              <AvatarImage src={brand.logo} alt={`${brand.name} logo`} className="object-contain" />
            ) : (
              <AvatarFallback className="text-lg font-semibold uppercase">
                {brandInitials}
              </AvatarFallback>
            )}
          </Avatar>
          <div>
            <p className="text-sm text-muted-foreground">Payroll Run</p>
            <h1 className="text-2xl font-bold text-gray-900">{brand.name}</h1>
            <p className="text-sm text-gray-600">
              {payrollRun.period} · {formatDate(payrollRun.startDate)} - {formatDate(payrollRun.endDate)}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Badge variant="outline" className={getStatusColor(payrollRun.status)}>
            {payrollRun.status}
          </Badge>
          <div className="flex items-center gap-2 print:hidden">
            <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2" size={16} />
              Print
            </Button>
          </div>
        </div>
      </div>

      {/* Payroll session overview */}
      <Card className="border-primary/20 bg-muted/30">
        <CardContent className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Payroll Session Overview</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Period</p>
              <p className="text-base font-medium text-gray-900">{payrollRun.period}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Date Range</p>
              <p className="text-base font-medium text-gray-900">
                {formatDate(payrollRun.startDate)} - {formatDate(payrollRun.endDate)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Created</p>
              <p className="text-base font-medium text-gray-900">
                {formatDateTime(payrollRun.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Gross Total</p>
              <p className="text-base font-semibold text-gray-900">
                {formatCurrency(payrollRun.grossAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Total Deductions</p>
              <p className="text-base font-semibold text-gray-900">
                {formatCurrency(payrollRun.totalDeductions)}
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-5">
              <p className="text-xs uppercase text-muted-foreground">Net Total</p>
              <p className="text-base font-semibold text-gray-900">
                {formatCurrency(payrollRun.netAmount)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-success" size={20} />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Gross Amount</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(payrollRun.grossAmount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-primary" size={20} />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Net Amount</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(payrollRun.netAmount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <User className="text-purple-600" size={20} />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Employees</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {payrollRun.entries?.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee Payroll Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="mr-2" size={20} />
            Employee Payroll Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!payrollRun.entries || payrollRun.entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No payroll entries found
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Base Salary
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Working Days Adjustment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Working Days
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vacation Days
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Allowances
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bonuses
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Deductions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Net Pay
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {payrollRun.entries.map((entry) => {
                    const workingDaysAdjustment = calculateWorkingDaysAdjustment(entry);
                    const adjustmentClass =
                      workingDaysAdjustment < 0
                        ? "text-red-600"
                        : workingDaysAdjustment > 0
                          ? "text-green-600"
                          : "text-gray-900";
                    const { englishName, arabicName } = getEmployeeNames(entry);
                    const allowanceSummary = summarizeAllowances(entry.allowances);
                    const hasAllowances = allowanceSummary.entries.length > 0;

                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{englishName}</div>
                          <div className="text-sm text-gray-900" dir="rtl">
                            {arabicName || "—"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {getEmployeeIdentifier(entry)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(entry.baseSalary || entry.grossPay)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`font-medium ${adjustmentClass}`}>
                            {formatCurrency(workingDaysAdjustment)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {entry.workingDays || 30}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {entry.vacationDays || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                          {hasAllowances ? (
                            <div className="space-y-1">
                              <div className="font-semibold">
                                {formatSignedCurrency(allowanceSummary.total)}
                              </div>
                              <div className="space-y-0.5 text-xs text-muted-foreground">
                                {allowanceSummary.entries.map((allowance) => (
                                  <div key={allowance.key}>
                                    {allowance.label}: {formatSignedCurrency(allowance.amount)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                          +{formatCurrency(parseFloat(entry.bonusAmount) || 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                          -{formatCurrency(
                            (parseFloat(entry.taxDeduction) || 0) +
                            (parseFloat(entry.socialSecurityDeduction) || 0) +
                            (parseFloat(entry.healthInsuranceDeduction) || 0) +
                            (parseFloat(entry.loanDeduction) || 0) +
                            (parseFloat(entry.otherDeductions) || 0)
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatCurrency(entry.netPay)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Information */}
      <Card>
        <CardHeader>
          <CardTitle>Payroll Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700">
            This payroll run includes {payrollRun.entries?.length || 0} employees 
            with a total gross amount of {formatCurrency(payrollRun.grossAmount)} 
            and net amount of {formatCurrency(payrollRun.netAmount)}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
