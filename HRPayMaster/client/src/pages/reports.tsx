import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FileText,
  Download,
  Calendar as CalendarIcon,
  User,
  DollarSign,
  TrendingUp,
  Filter,
  BarChart3,
  PieChart,
  History,
  FileSpreadsheet,
  Search,
  Building,
  Users,
  Award,
  AlertTriangle,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type {
  Employee,
  EmployeeEvent,
  PayrollRun,
} from "@shared/schema";
// Types for company-level reports
type PayrollSummary = { period: string; totals: { grossPay: number; netPay: number } };
type LoanBalance = { employeeId: string; balance: number };
type AssetUsage = { assetId: string; name: string; assignments: number };
type SalaryTrend = { period: string; netPay: number; change: number };
import { openPdf, buildEmployeeReport, buildEmployeeHistoryReport } from "@/lib/pdf";
import { sanitizeImageSrc } from "@/lib/sanitizeImageSrc";

// Accept any base64 encoded image MIME type
const dataUrlPattern = /^data:image\/[^;]+;base64,/;

export default function Reports() {
  const currentYear = new Date().getFullYear();
  const initialRange = {
    from: new Date(currentYear, 0, 1),
    to: new Date(currentYear, 11, 31),
  };
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedWorkLocation, setSelectedWorkLocation] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>(initialRange);
  const [searchTerm, setSearchTerm] = useState("");
  const [salaryReport, setSalaryReport] = useState<SalaryTrend[] | null>(null);

  const startDate = dateRange.from?.toISOString().split("T")[0] ?? "";
  const endDate = dateRange.to?.toISOString().split("T")[0] ?? "";
  
  const { toast } = useToast();

  const { data: employees, error: employeesError } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: employeeEvents, error: employeeEventsError } = useQuery<EmployeeEvent[]>({
    queryKey: ["/api/employee-events"],
  });

  const { data: payrollRuns, error: payrollRunsError } = useQuery<PayrollRun[]>({
    queryKey: ["/api/payroll"],
  });

  // Fetch company-level report data
  const { data: payrollSummary, error: payrollSummaryError } = useQuery<PayrollSummary[]>({
    queryKey: ["/api/reports/payroll", startDate, endDate],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/reports/payroll?startDate=${startDate}&endDate=${endDate}`,
      );
      return res.json();
    },
    enabled: Boolean(startDate && endDate),
  });

  const { data: loanBalances, error: loanBalancesError } = useQuery<LoanBalance[]>({
    queryKey: ["/api/reports/loan-balances", startDate, endDate],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/reports/loan-balances?startDate=${startDate}&endDate=${endDate}`,
      );
      return res.json();
    },
    enabled: Boolean(startDate && endDate),
  });

  const { data: assetUsage, error: assetUsageError } = useQuery<AssetUsage[]>({
    queryKey: ["/api/reports/asset-usage", startDate, endDate],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/reports/asset-usage?startDate=${startDate}&endDate=${endDate}`,
      );
      return res.json();
    },
    enabled: Boolean(startDate && endDate),
  });

  if (
    employeesError ||
    employeeEventsError ||
    payrollRunsError ||
    payrollSummaryError ||
    loanBalancesError ||
    assetUsageError
  ) {
    return <div>Error loading reports data</div>;
  }

  // Generate year options (last 5 years)
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

    // Get unique work locations without using Set iteration
    const workLocations = employees
      ? employees.reduce<string[]>((acc, emp) => {
          const loc = emp.workLocation || "Office";
          if (loc && !acc.includes(loc)) acc.push(loc);
          return acc;
        }, [])
      : [];

  // Filter employee events based on selected criteria
  const filteredEvents = employeeEvents?.filter(event => {
    const eventDate = new Date(event.eventDate);
    const eventYear = eventDate.getFullYear();
    const eventMonth = eventDate.getMonth() + 1;

    // Employee filter
    if (selectedEmployee !== "all" && event.employeeId !== selectedEmployee) return false;
    
    // Year filter
    if (selectedYear !== "all" && eventYear.toString() !== selectedYear) return false;
    
    // Month filter
    if (selectedMonth !== "all" && eventMonth.toString() !== selectedMonth) return false;
    
    // Work location filter
    if (selectedWorkLocation !== "all") {
      const employee = employees?.find(emp => emp.id === event.employeeId);
      if ((employee?.workLocation || "Office") !== selectedWorkLocation) return false;
    }
    
    // Date range filter
    if (dateRange.from && eventDate < dateRange.from) return false;
    if (dateRange.to && eventDate > dateRange.to) return false;
    
    // Search term filter
    if (searchTerm) {
      const employee = employees?.find(emp => emp.id === event.employeeId);
      const searchLower = searchTerm.toLowerCase();
      const matchesEmployee = employee?.firstName?.toLowerCase().includes(searchLower) ||
                             employee?.lastName?.toLowerCase().includes(searchLower) ||
                             employee?.position?.toLowerCase().includes(searchLower);
      const matchesEvent = event.title?.toLowerCase().includes(searchLower) ||
                          event.description?.toLowerCase().includes(searchLower) ||
                          event.eventType?.toLowerCase().includes(searchLower);
      
      if (!matchesEmployee && !matchesEvent) return false;
    }
    
    return true;
  }) || [];

  // Generate individual employee comprehensive report
  const generateIndividualEmployeeReport = async (employeeId: string) => {
    const employee = employees?.find(emp => emp.id === employeeId);
    if (!employee) {
      toast({ title: "Error", description: "Employee not found", variant: "destructive" });
      return;
    }
    const employeeEvents = filteredEvents.filter(event => event.employeeId === employeeId);
    const profileImage =
      employee.profileImage && dataUrlPattern.test(employee.profileImage)
        ? sanitizeImageSrc(employee.profileImage)
        : undefined;
    const doc = buildEmployeeReport({
      employee: {
        firstName: employee.firstName || '',
        lastName: employee.lastName || '',
        id: employee.id,
        position: employee.position,
        profileImage,
      },
      events: employeeEvents.map(e => ({ title: e.title, eventDate: e.eventDate })),
    });
    openPdf(doc);
  };

  // Generate employee history report (for multiple employees)
  const generateEmployeeHistoryReport = () => {
    const filteredEmployees = selectedEmployee === "all"
      ? employees
      : employees?.filter(emp => emp.id === selectedEmployee);

    if (!filteredEmployees || filteredEmployees.length === 0) {
      toast({
        title: "No Data",
        description: "No employees found matching the selected criteria",
        variant: "destructive",
      });
      return;
    }

    const doc = buildEmployeeHistoryReport(
      filteredEmployees.map(emp => ({ firstName: emp.firstName || '', lastName: emp.lastName || '', id: emp.id }))
    );

    openPdf(doc);
  };

  // Generate salary trends report
  const generateSalaryReport = () => {
    if (!payrollRuns || payrollRuns.length === 0) {
      toast({
        title: "No Data",
        description: "No payroll data available for salary report",
        variant: "destructive",
      });
      return;
    }
    try {
      const sorted = [...payrollRuns].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      );
      const trends: SalaryTrend[] = sorted.map((run, index) => {
        const net = Number(run.netAmount);
        const prev = sorted[index - 1];
        const change = prev ? net - Number(prev.netAmount) : 0;
        return { period: run.period, netPay: net, change };
      });
      setSalaryReport(trends);
      toast({ title: "Success", description: "Salary report generated" });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to generate salary report",
        variant: "destructive",
      });
    }
  };

  // Prepare analytics data
  const payrollChartData =
    payrollRuns?.map(run => ({ period: run.period, net: Number(run.netAmount) })) ?? [];

  const eventSummary = (employeeEvents || []).reduce<Record<string, { count: number; total: number }>>(
    (acc, event) => {
      const type = event.eventType || "other";
      const amount = parseFloat(event.amount || "0");
      if (!acc[type]) acc[type] = { count: 0, total: 0 };
      acc[type].count += 1;
      acc[type].total += isNaN(amount) ? 0 : amount;
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive employee history and salary reports
          </p>
        </div>
      </div>

      <Tabs defaultValue="employee-history" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="employee-history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Employee History
          </TabsTrigger>
          <TabsTrigger value="salary-reports" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Salary Reports
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="payroll-summary" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Payroll Summary
          </TabsTrigger>
          <TabsTrigger value="loan-balances" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Loan Balances
          </TabsTrigger>
          <TabsTrigger value="asset-usage" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Asset Usage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employee-history" className="space-y-6">
          {/* Filter Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Report Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Employee</label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees?.map(employee => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.firstName} {employee.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Year</label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      {yearOptions.map(year => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Month</label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Months</SelectItem>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Work Location</label>
                  <Select value={selectedWorkLocation} onValueChange={setSelectedWorkLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locations</SelectItem>
                      {workLocations.map(location => (
                        <SelectItem key={location} value={location}>
                          {location}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search by employee name, position, or event..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center mt-6 pt-4 border-t">
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <span>Found {filteredEvents.length} events</span>
                  <span>•</span>
                  <span>{selectedEmployee === "all" ? employees?.length || 0 : 1} employees</span>
                </div>
                <Button onClick={generateEmployeeHistoryReport} className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Generate Report
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Users className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {selectedEmployee === "all" ? employees?.length || 0 : 1}
                    </p>
                    <p className="text-xs text-muted-foreground">Employees</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Award className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(
                        filteredEvents
                          .filter(event => event.eventType === "bonus")
                          .reduce((sum, event) => sum + parseFloat(event.amount || "0"), 0)
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Bonuses</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(
                        filteredEvents
                          .filter(event => event.eventType === "deduction")
                          .reduce((sum, event) => sum + parseFloat(event.amount || "0"), 0)
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Deductions</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <CalendarIcon className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {filteredEvents.filter(event => event.eventType === "vacation").length}
                    </p>
                    <p className="text-xs text-muted-foreground">Vacation Events</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Employee List for Individual Reports */}
          <Card>
            <CardHeader>
              <CardTitle>Individual Employee Reports</CardTitle>
              <p className="text-sm text-muted-foreground">
                Generate comprehensive individual employee profiles with all documents and event history
              </p>
            </CardHeader>
            <CardContent>
              {employees && employees.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {employees
                    .filter(employee => {
                      if (selectedWorkLocation !== "all" && (employee.workLocation || "Office") !== selectedWorkLocation) return false;
                      if (searchTerm) {
                        const searchLower = searchTerm.toLowerCase();
                        return employee.firstName?.toLowerCase().includes(searchLower) ||
                               employee.lastName?.toLowerCase().includes(searchLower) ||
                               employee.position?.toLowerCase().includes(searchLower);
                      }
                      return true;
                    })
                    .map(employee => {
                      const employeeEventCount = filteredEvents.filter(event => event.employeeId === employee.id).length;
                      const profileSrc =
                        employee.profileImage && dataUrlPattern.test(employee.profileImage)
                          ? sanitizeImageSrc(employee.profileImage)
                          : '';
                      return (
                        <div key={employee.id} className="p-4 bg-gray-50 rounded-lg border">
                          <div className="flex items-center space-x-3 mb-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center overflow-hidden">
                              {profileSrc ? (
                                <img src={profileSrc} alt={`${employee.firstName} ${employee.lastName}`} className="w-full h-full object-cover" />
                              ) : (
                                <User className="h-6 w-6 text-blue-600" />
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">
                                {employee.firstName} {employee.lastName}
                              </h4>
                              <p className="text-sm text-gray-600">{employee.position}</p>
                              <p className="text-xs text-gray-500">{employee.workLocation || 'Office'}</p>
                            </div>
                            <Badge variant={employee.status === 'active' ? 'default' : 'secondary'}>
                              {employee.status}
                            </Badge>
                          </div>
                          
                          <div className="flex justify-between items-center text-sm text-gray-600 mb-3">
                            <span>{employeeEventCount} events</span>
                            <span>{formatCurrency(employee.salary)}</span>
                          </div>
                          
                          <Button 
                            onClick={() => generateIndividualEmployeeReport(employee.id)}
                            size="sm" 
                            className="w-full flex items-center gap-2"
                          >
                            <FileText className="h-4 w-4" />
                            Generate Profile Report
                          </Button>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No employees found</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Events Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Events Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredEvents.length > 0 ? (
                <div className="space-y-3">
                  {filteredEvents.slice(0, 10).map(event => {
                    const employee = employees?.find(emp => emp.id === event.employeeId);
                    return (
                      <div key={event.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Badge variant={
                            event.eventType === "bonus" ? "default" :
                            event.eventType === "deduction" ? "destructive" :
                            event.eventType === "vacation" ? "secondary" : "outline"
                          }>
                            {event.eventType}
                          </Badge>
                          <div>
                            <p className="font-medium">
                              {employee?.firstName} {employee?.lastName}
                            </p>
                            <p className="text-sm text-gray-600">{event.title}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            {event.amount ? formatCurrency(event.amount) : 'N/A'}
                          </p>
                          <p className="text-sm text-gray-600">
                            {formatDate(event.eventDate)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No events found matching the selected criteria</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salary-reports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Salary Trends & Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button onClick={generateSalaryReport}>Generate Salary Report</Button>
                {salaryReport ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="py-2 pr-4">Period</th>
                          <th className="py-2 pr-4">Net Pay</th>
                          <th className="py-2">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salaryReport.map(trend => (
                          <tr key={trend.period} className="border-t">
                            <td className="py-2 pr-4">{trend.period}</td>
                            <td className="py-2 pr-4">{formatCurrency(trend.netPay)}</td>
                            <td
                              className={cn(
                                "py-2",
                                trend.change >= 0 ? "text-green-600" : "text-red-600",
                              )}
                            >
                              {trend.change === 0 ? "-" : formatCurrency(trend.change)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <TrendingUp className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>No salary report generated</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Payroll Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payrollChartData.length > 0 ? (
                <ChartContainer
                  className="h-72"
                  config={{ net: { label: "Net Pay", color: "hsl(217 91% 60%)" } }}
                >
                  <BarChart data={payrollChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="net" fill="var(--color-net)" />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-sm text-muted-foreground">No payroll data available</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Employee Events by Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(eventSummary).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">Event Type</th>
                        <th className="py-2 pr-4">Count</th>
                        <th className="py-2">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(eventSummary).map(([type, data]) => (
                        <tr key={type} className="border-t">
                          <td className="py-2 pr-4 capitalize">{type}</td>
                          <td className="py-2 pr-4">{data.count}</td>
                          <td className="py-2">{formatCurrency(data.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No employee event data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll-summary" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Payroll Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payrollSummary && payrollSummary.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">Period</th>
                        <th className="py-2 pr-4">Gross Pay</th>
                        <th className="py-2">Net Pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollSummary.map(summary => (
                        <tr key={summary.period} className="border-t">
                          <td className="py-2 pr-4">{summary.period}</td>
                          <td className="py-2 pr-4">{formatCurrency(summary.totals.grossPay)}</td>
                          <td className="py-2">{formatCurrency(summary.totals.netPay)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No payroll data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loan-balances" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Loan Balances
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loanBalances && loanBalances.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">Employee</th>
                        <th className="py-2">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanBalances.map(balance => {
                        const employee = employees?.find(emp => emp.id === balance.employeeId);
                        const name = employee
                          ? `${employee.firstName} ${employee.lastName}`
                          : balance.employeeId;
                        return (
                          <tr key={balance.employeeId} className="border-t">
                            <td className="py-2 pr-4">{name}</td>
                            <td className="py-2">{formatCurrency(balance.balance)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No loan data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="asset-usage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Asset Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assetUsage && assetUsage.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">Asset</th>
                        <th className="py-2">Assignments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assetUsage.map(asset => (
                        <tr key={asset.assetId} className="border-t">
                          <td className="py-2 pr-4">{asset.name}</td>
                          <td className="py-2">{asset.assignments}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No asset usage data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
