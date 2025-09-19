import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Users,
  DollarSign,
  Building,
  Clock,
  Plus,
  ArrowRight,
  User,
  Calculator,
  Info
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { EmployeeWithDepartment, PayrollRun } from "@shared/schema";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import React from "react";

interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  departments: number;
  forecastPayroll: { gross: number; net: number; breakdown?: { salaries: number; additions: number; deductions: number; deductionsByType?: Record<string, number>; loanReturns: number } };
  forecastDeductions: number;
  forecastLoanReturns: number;
  onVacation: number;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [netOnly, setNetOnly] = React.useState(false);
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const {
    data: employees,
    isLoading: employeesLoading,
    error: employeesError,
  } = useQuery<EmployeeWithDepartment[]>({
    queryKey: ["/api/employees"],
  });

  const {
    data: payrollRuns,
    isLoading: payrollLoading,
    error: payrollError,
  } = useQuery<PayrollRun[]>({
    queryKey: ["/api/payroll"],
  });

  const recentEmployees = employees?.slice(0, 3) || [];
  const recentPayrolls = payrollRuns?.slice(0, 3) || [];
  const latestPayroll = payrollRuns?.[0];
  const now = new Date();
  const monthYYYYMM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;


  if (statsLoading || employeesLoading || payrollLoading) {
    return (
      <div className="space-y-8">
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t('dashboard.title')}</h1>
          <p className="text-gray-600 mt-2">{t('dashboard.overview')}</p>
        </div>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (statsError || employeesError || payrollError) {
    return <div>Error loading dashboard data</div>;
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t('dashboard.title')}</h1>
        <p className="text-gray-600 mt-2">{t('dashboard.overview')}</p>
      </div>
      
      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Users className="text-blue-700" size={24} />
                </div>
              </div>
              <div className="ml-4">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.totalEmployees','Total Employees')}</p>
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={14} className="text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('dashboard.tooltip.totalEmployees','All employees regardless of status')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-end space-x-4">
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.totalEmployees || 0}</p>
                  <Link href={`/employees`}>
                    <Button variant="link" className="p-0 text-primary">{t('common.view','View')}</Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="text-blue-600" size={24} />
                </div>
              </div>
              <div className="ml-4">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.activeEmployees','Active Employees')}</p>
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={14} className="text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('dashboard.tooltip.activeEmployees','Employees with status set to active')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-end space-x-4">
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.activeEmployees || 0}</p>
                  <Link href={`/employees?status=active`}>
                    <Button variant="link" className="p-0 text-primary">{t('common.view','View')}</Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="text-green-600" size={24} />
                  </div>
                </div>
                <div className="ml-4">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.forecastedPayroll','Forecasted Payroll')}</p>
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info size={14} className="text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('dashboard.tooltip.forecastedPayroll','Gross = sum of salary + additions for active employees. Net = Gross − forecasted deductions − forecasted loan returns.')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  {!netOnly ? (
                    <>
                      <div className="mt-1">
                        <div className="text-xs text-gray-500">{t('dashboard.gross','Gross')}</div>
                        <div className="text-lg font-semibold text-gray-900">{formatCurrency(stats?.forecastPayroll?.gross || 0)}</div>
                      </div>
                      <div className="mt-2">
                        <div className="text-xs text-gray-500">{t('dashboard.net','Net')}</div>
                        <div className="text-lg font-semibold text-gray-900">{formatCurrency(stats?.forecastPayroll?.net || 0)}</div>
                      </div>
                    </>
                  ) : (
                    <div className="mt-1">
                      <div className="text-xs text-gray-500">{t('dashboard.net','Net')}</div>
                      <div className="text-2xl font-semibold text-gray-900">{formatCurrency(stats?.forecastPayroll?.net || 0)}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="ml-4 text-right">
                <label htmlFor="net-only" className="block text-xs text-gray-500 mb-1">{t('dashboard.netOnly','Net only')}</label>
                <Switch id="net-only" checked={netOnly} onCheckedChange={setNetOnly} />
                <div className="mt-3">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="link" className="p-0 text-primary">{t('common.viewDetails','View details')}</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t('dashboard.forecastedPayroll','Forecasted Payroll')}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span>{t('dashboard.gross','Gross')}:</span><span className="font-medium">{formatCurrency(stats?.forecastPayroll?.gross || 0)}</span></div>
                        <div className="flex justify-between"><span>{t('dashboard.net','Net')}:</span><span className="font-medium">{formatCurrency(stats?.forecastPayroll?.net || 0)}</span></div>
                      <div className="pt-2 text-gray-700">{t('dashboard.breakdown','Breakdown')}</div>
                      <div className="flex justify-between"><span>{t('dashboard.salaries','Salaries')}:</span><span>{formatCurrency(stats?.forecastPayroll?.breakdown?.salaries || 0)}</span></div>
                      <div className="flex justify-between"><span>{t('dashboard.additions','Additions')}:</span><span>{formatCurrency(stats?.forecastPayroll?.breakdown?.additions || 0)}</span></div>
                      <div className="flex justify-between"><span>{t('dashboard.forecastedDeductions','Forecasted Deductions (This Month)')}:</span><span>{formatCurrency(stats?.forecastPayroll?.breakdown?.deductions || 0)}</span></div>
                      <div className="flex justify-between"><span>{t('dashboard.forecastedLoanReturns','Forecasted Loan Returns (This Month)')}:</span><span>{formatCurrency(stats?.forecastPayroll?.breakdown?.loanReturns || 0)}</span></div>
                      {stats?.forecastPayroll?.breakdown?.deductionsByType && (
                        <div className="mt-3">
                          <div className="text-xs text-gray-500 mb-1">{t('dashboard.deductionsByType','Deductions by type')}</div>
                          {Object.entries(stats.forecastPayroll.breakdown.deductionsByType).map(([k,v]) => (
                            <div key={k} className="flex justify-between"><span>{k.charAt(0).toUpperCase()+k.slice(1)}:</span><span>{formatCurrency(v || 0)}</span></div>
                          ))}
                        </div>
                      )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Building className="text-orange-600" size={24} />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('nav.departments')}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.departments || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Clock className="text-purple-600" size={24} />
                </div>
              </div>
              <div className="ml-4">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.onVacation','On Vacation (This Month)')}</p>
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={14} className="text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('dashboard.tooltip.onVacation','Unique employees with approved vacations overlapping this month')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.onVacation || 0}</p>
                <div>
                  <Link href={`/vacations?month=${monthYYYYMM}&status=approved`}>
                    <Button variant="link" className="p-0 text-primary">{t('common.view','View')}</Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Forecast Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-red-600" size={24} />
                </div>
              </div>
              <div className="ml-4">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.forecastedDeductions','Forecasted Deductions (This Month)')}</p>
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={14} className="text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('dashboard.tooltip.forecastedDeductions','Sum of current-month payroll events of type deduction/penalty that affect payroll')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(stats?.forecastDeductions || 0)}</p>
                <div>
                  <Link href={`/employee-events?month=${monthYYYYMM}&types=deduction,penalty`}>
                    <Button variant="link" className="p-0 text-primary">{t('common.view','View')}</Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-yellow-600" size={24} />
                </div>
              </div>
              <div className="ml-4">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('dashboard.forecastedLoanReturns','Forecasted Loan Returns (This Month)')}</p>
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={14} className="text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('dashboard.tooltip.forecastedLoanReturns','Sum of monthlyDeduction on active loans overlapping this month')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(stats?.forecastLoanReturns || 0)}</p>
                <div>
                  <Link href={`/loans?month=${monthYYYYMM}`}>
                    <Button variant="link" className="p-0 text-primary">{t('common.view','View')}</Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Recent Employees */}
        <Card className="shadow-sm border-0">
          <CardHeader className="pb-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold text-gray-900">{t('dashboard.recentEmployees','Recent Employees')}</CardTitle>
              <Link href="/employees">
                <Button className="bg-blue-600 text-white hover:bg-blue-700 shadow-sm">
                  <Plus className="mr-2" size={16} />
                  {t('employeesPage.addEmployee','Add Employee')}
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {recentEmployees.length === 0 ? (
              <div className="text-center py-6">
                <User className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">{t('dashboard.noEmployees','No employees found')}</p>
                <Link href="/employees">
                  <Button variant="outline" className="mt-4">
                    Add your first employee
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                {recentEmployees.map((employee) => (
                  <div key={employee.id} className="flex items-center space-x-4 py-3 border-b border-gray-100 last:border-b-0">
                    <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                      <User className="text-gray-600" size={16} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {employee.firstName} {employee.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{employee.position}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">{employee.department?.name || 'No Department'}</p>
                      <p className="text-xs text-gray-500">{formatDate(employee.startDate)}</p>
                    </div>
                  </div>
                ))}
                <div className="pt-4 border-t border-gray-200">
                  <Link href="/employees">
                    <Button variant="link" className="text-primary hover:text-blue-700 p-0">
                      View all employees <ArrowRight className="ml-1" size={16} />
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Payroll Overview */}
        <Card className="shadow-sm border-0">
          <CardHeader className="pb-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold text-gray-900">Payroll Overview</CardTitle>
              <Button
                onClick={() => navigate("/payroll?generate=1")}
                className="bg-green-600 text-white hover:bg-green-700 shadow-sm"
              >
                <Calculator className="mr-2" size={16} />
                Generate Payroll
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {latestPayroll ? (
              <>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-600">Current Period</span>
                    <span className="text-sm font-medium text-gray-900">{latestPayroll.period}</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-600">Gross Payroll</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatCurrency(latestPayroll.grossAmount)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-600">Total Deductions</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatCurrency(latestPayroll.totalDeductions)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-t border-gray-200 pt-4">
                    <span className="text-base font-medium text-gray-900">Net Payroll</span>
                    <span className="text-base font-semibold text-gray-900">
                      {formatCurrency(latestPayroll.netAmount)}
                    </span>
                  </div>
                </div>

                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Recent Payroll Runs</h4>
                  <div className="space-y-2">
                    {recentPayrolls.map((payroll) => (
                      <div key={payroll.id} className="flex justify-between items-center py-2 text-sm">
                        <span className="text-gray-600">{payroll.period}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-900">{formatCurrency(payroll.grossAmount)}</span>
                          <Badge 
                            variant={payroll.status === 'completed' ? 'default' : 'secondary'}
                            className={payroll.status === 'completed' ? 'bg-success text-white' : ''}
                          >
                            {payroll.status === 'completed' ? 'Completed' : payroll.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <Calculator className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">No payroll runs found</p>
                <Link href="/payroll">
                  <Button variant="outline" className="mt-4">
                    Generate your first payroll
                  </Button>
                </Link>
              </div>
            )}
            
            <div className="pt-4 border-t border-gray-200">
              <Link href="/payroll">
                <Button variant="link" className="text-primary hover:text-blue-700 p-0">
                  View payroll history <ArrowRight className="ml-1" size={16} />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
