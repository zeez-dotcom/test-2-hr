import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  DollarSign,
  Building,
  Clock,
  Plus,
  ArrowRight,
  User,
  Calculator
} from "lucide-react";
import { Link } from "wouter";
import type { EmployeeWithDepartment, PayrollRun } from "@shared/schema";
import { formatCurrency, formatDate } from "@/lib/utils";

interface DashboardStats {
  totalEmployees: number;
  monthlyPayroll: number;
  departments: number;
  pendingReviews: number;
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: employees, isLoading: employeesLoading } = useQuery<EmployeeWithDepartment[]>({
    queryKey: ["/api/employees"],
  });

  const { data: payrollRuns, isLoading: payrollLoading } = useQuery<PayrollRun[]>({
    queryKey: ["/api/payroll"],
  });

  const recentEmployees = employees?.slice(0, 3) || [];
  const recentPayrolls = payrollRuns?.slice(0, 3) || [];
  const latestPayroll = payrollRuns?.[0];


  if (statsLoading || employeesLoading || payrollLoading) {
    return (
      <div className="space-y-8">
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Overview of your HR management system</p>
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

  return (
    <div className="space-y-8">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Overview of your HR management system</p>
      </div>
      
      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Users className="text-blue-600" size={24} />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Employees</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.totalEmployees || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-green-600" size={24} />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Monthly Payroll</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(stats?.monthlyPayroll || 0)}
                </p>
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
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Departments</p>
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
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Pending Reviews</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.pendingReviews || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Recent Employees */}
        <Card className="shadow-sm border-0 bg-white">
          <CardHeader className="pb-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold text-gray-900">Recent Employees</CardTitle>
              <Link href="/employees">
                <Button className="bg-blue-600 text-white hover:bg-blue-700 shadow-sm">
                  <Plus className="mr-2" size={16} />
                  Add Employee
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {recentEmployees.length === 0 ? (
              <div className="text-center py-6">
                <User className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">No employees found</p>
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
        <Card className="shadow-sm border-0 bg-white">
          <CardHeader className="pb-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold text-gray-900">Payroll Overview</CardTitle>
              <Link href="/payroll">
                <Button className="bg-green-600 text-white hover:bg-green-700 shadow-sm">
                  <Calculator className="mr-2" size={16} />
                  Generate Payroll
                </Button>
              </Link>
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