import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, Calculator, TrendingDown, TrendingUp, AlertCircle } from "lucide-react";

interface PayrollEntry {
  id: string;
  employeeId: string;
  grossPay: string;
  workingDays: number;
  actualWorkingDays: number;
  vacationDays: number;
  taxDeduction: string;
  socialSecurityDeduction: string;
  healthInsuranceDeduction: string;
  loanDeduction: string;
  otherDeductions: string;
  netPay: string;
  adjustmentReason?: string;
  employee?: {
    firstName: string;
    lastName: string;
  };
}

interface PayrollSummaryProps {
  entries: PayrollEntry[];
  period: string;
  totalGross: number;
  totalNet: number;
  totalDeductions: number;
}

export default function PayrollSummary({ 
  entries, 
  period, 
  totalGross, 
  totalNet, 
  totalDeductions 
}: PayrollSummaryProps) {
  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-KW', {
      style: 'currency',
      currency: 'KWD',
    }).format(num);
  };

  const employeesWithAdjustments = entries.filter(entry => 
    entry.adjustmentReason || entry.vacationDays > 0 || parseFloat(entry.loanDeduction) > 0
  );

  const totalVacationDays = entries.reduce((sum, entry) => sum + entry.vacationDays, 0);
  const totalLoanDeductions = entries.reduce((sum, entry) => sum + parseFloat(entry.loanDeduction), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{entries.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Payroll</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalGross)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deductions</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalDeductions)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Payroll</CardTitle>
            <Calculator className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(totalNet)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Smart Insights */}
      {(totalVacationDays > 0 || totalLoanDeductions > 0 || employeesWithAdjustments.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertCircle className="mr-2 h-5 w-5 text-orange-500" />
              Payroll Insights for {period}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {totalVacationDays > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center">
                  <Calendar className="mr-2 h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium">Vacation Impact</span>
                </div>
                <div className="text-right">
                  <div className="text-sm text-blue-600 font-medium">
                    {totalVacationDays} days across {entries.filter(e => e.vacationDays > 0).length} employees
                  </div>
                  <div className="text-xs text-gray-500">Pro-rated salaries applied</div>
                </div>
              </div>
            )}
            
            {totalLoanDeductions > 0 && (
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center">
                  <TrendingDown className="mr-2 h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Loan Repayments</span>
                </div>
                <div className="text-right">
                  <div className="text-sm text-green-600 font-medium">
                    {formatCurrency(totalLoanDeductions)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {entries.filter(e => parseFloat(e.loanDeduction) > 0).length} employees
                  </div>
                </div>
              </div>
            )}

            {employeesWithAdjustments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-900">Employee Adjustments</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {employeesWithAdjustments.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">
                          {entry.employee?.firstName} {entry.employee?.lastName}
                        </span>
                        {entry.vacationDays > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {entry.vacationDays}d vacation
                          </Badge>
                        )}
                        {parseFloat(entry.loanDeduction) > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {formatCurrency(parseFloat(entry.loanDeduction))} loan
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {entry.actualWorkingDays}/{entry.workingDays} days
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detailed Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Payroll Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Working Days
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gross Pay
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deductions
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Net Pay
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {entries.map((entry) => {
                  const totalEmployeeDeductions = 
                    parseFloat(entry.taxDeduction) + 
                    parseFloat(entry.socialSecurityDeduction) + 
                    parseFloat(entry.healthInsuranceDeduction) + 
                    parseFloat(entry.loanDeduction) + 
                    parseFloat(entry.otherDeductions);

                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {entry.employee?.firstName} {entry.employee?.lastName}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {entry.actualWorkingDays}/{entry.workingDays}
                        </div>
                        {entry.vacationDays > 0 && (
                          <div className="text-xs text-orange-600">
                            -{entry.vacationDays} vacation
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(parseFloat(entry.grossPay))}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>{formatCurrency(totalEmployeeDeductions)}</div>
                        {parseFloat(entry.loanDeduction) > 0 && (
                          <div className="text-xs text-green-600">
                            Loan: {formatCurrency(parseFloat(entry.loanDeduction))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(parseFloat(entry.netPay))}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {entry.adjustmentReason || "Standard calculation"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}