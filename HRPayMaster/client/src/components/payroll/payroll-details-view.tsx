import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, User, FileText, Printer } from "lucide-react";
import type { PayrollRunWithEntries } from "@shared/schema";
import { formatCurrency, formatDate, calculateWorkingDaysAdjustment } from "@/lib/utils";

type PayrollEntryWithEmployee = NonNullable<PayrollRunWithEntries["entries"]>[number];

const getEmployeeDisplayName = (entry: PayrollEntryWithEmployee) => {
  const employee = entry.employee;
  if (employee) {
    const fullName = [employee.firstName, employee.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (fullName) {
      return fullName;
    }

    const alternateName = employee.arabicName || employee.nickname;
    if (alternateName) {
      return alternateName;
    }
  }

  return `Employee ${entry.employeeId}`;
};

const getEmployeeIdentifier = (entry: PayrollEntryWithEmployee) => {
  const code = entry.employee?.employeeCode?.trim();
  if (code) {
    return `Code: ${code}`;
  }

  return `ID: ${entry.employeeId}`;
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
    switch (status) {
      case 'completed':
        return 'bg-success text-white';
      case 'pending':
        return 'bg-warning text-white';
      case 'cancelled':
        return 'bg-destructive text-white';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  if (isLoading) {
    return <div className="animate-pulse">Loading payroll details...</div>;
  }

  if (!payrollRun) {
    return <div className="text-center text-gray-500">Payroll run not found</div>;
  }

  return (
    <div ref={printContentRef} className="space-y-6 print:bg-white print:text-black">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{payrollRun.period}</h2>
          <p className="text-gray-600">
            {formatDate(payrollRun.startDate)} - {formatDate(payrollRun.endDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="print:hidden"
          >
            <Printer className="mr-2" size={16} />
            Print
          </Button>
          <Badge className={getStatusColor(payrollRun.status)}>
            {payrollRun.status}
          </Badge>
        </div>
      </div>

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

                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {getEmployeeDisplayName(entry)}
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
