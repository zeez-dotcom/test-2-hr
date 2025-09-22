import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  Car,
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
import { apiGet } from "@/lib/http";
import { toLocalYMD } from "@/lib/date";
import type {
  Employee,
  EmployeeEvent,
  PayrollRun,
  Department,
  AssetAssignmentWithDetails,
  CarAssignmentWithDetails,
} from "@shared/schema";
// Types for company-level reports
type PayrollSummary = { period: string; totals: { grossPay: number; netPay: number } };
type LoanReportDetail = {
  loanId: string;
  employeeId: string;
  employee?: Employee;
  originalAmount: number;
  remainingAmount: number;
  totalRepaid: number;
  deductionInRange: number;
  status: string;
  pausedByVacation: boolean;
  pauseNote: string | null;
  startDate: string;
  endDate: string | null;
};
type AssetUsage = {
  assignmentId: string;
  assetId: string;
  assetName: string;
  assetType: string;
  assetStatus: string;
  assetDetails: string | null;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  assignedDate: string;
  returnDate: string | null;
  status: string;
  notes: string | null;
};
type FleetUsage = {
  assignmentId: string;
  carId: string;
  vehicle: string;
  plateNumber: string;
  vin: string | null;
  serial: string | null;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  assignedDate: string;
  returnDate: string | null;
  status: string;
  notes: string | null;
};
type SalaryTrend = { period: string; netPay: number; change: number };
import { openPdf, buildEmployeeReport, buildEmployeeHistoryReport } from "@/lib/pdf";
type PayrollByDepartment = { period: string; departmentId: string | null; departmentName?: string | null; totals: { grossPay: number; netPay: number } };
import { sanitizeImageSrc } from "@/lib/sanitizeImageSrc";

// Accept any base64 encoded image MIME type
const dataUrlPattern = /^data:image\/[^;]+;base64,/;

export default function Reports() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const initialRange = {
    from: new Date(currentYear, 0, 1),
    to: new Date(currentYear, 11, 31),
  };
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedWorkLocation, setSelectedWorkLocation] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>(initialRange);
  const [searchTerm, setSearchTerm] = useState("");
  const [salaryReport, setSalaryReport] = useState<SalaryTrend[] | null>(null);

  const startDate = dateRange.from ? toLocalYMD(dateRange.from) : "";
  const endDate = dateRange.to ? toLocalYMD(dateRange.to) : "";
  
  const { toast } = useToast();

  const { data: employees, error: employeesError } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
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
      const res = await apiGet(
        `/api/reports/payroll?startDate=${startDate}&endDate=${endDate}`,
      );
      if (!res.ok) throw new Error(res.error || "Failed to fetch");
      return res.data;
    },
    enabled: Boolean(startDate && endDate),
  });

  const { data: loanDetails, error: loanDetailsError } = useQuery<LoanReportDetail[]>({
    queryKey: ["/api/reports/loan-balances", startDate, endDate],
    queryFn: async () => {
      const res = await apiGet(
        `/api/reports/loan-balances?startDate=${startDate}&endDate=${endDate}`,
      );
      if (!res.ok) throw new Error(res.error || "Failed to fetch");
      return res.data;
    },
    enabled: Boolean(startDate && endDate),
  });

  const {
    data: assetAssignments = [],
    error: assetAssignmentsError,
  } = useQuery<AssetAssignmentWithDetails[]>({
    queryKey: ["/api/asset-assignments", startDate, endDate],
    queryFn: async () => {
      const res = await apiGet("/api/asset-assignments");
      if (!res.ok) throw new Error(res.error || "Failed to fetch");
      return res.data;
    },
    enabled: Boolean(startDate && endDate),
  });

  const {
    data: carAssignments = [],
    error: carAssignmentsError,
  } = useQuery<CarAssignmentWithDetails[]>({
    queryKey: ["/api/car-assignments", startDate, endDate],
    queryFn: async () => {
      const res = await apiGet("/api/car-assignments");
      if (!res.ok) throw new Error(res.error || "Failed to fetch");
      return res.data;
    },
    enabled: Boolean(startDate && endDate),
  });

  const { data: payrollByDept, error: payrollByDeptError } = useQuery<PayrollByDepartment[]>({
    queryKey: ["/api/reports/payroll-by-department", startDate, endDate],
    queryFn: async () => {
      const res = await apiGet(`/api/reports/payroll-by-department?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error(res.error || "Failed to fetch");
      return res.data;
    },
    enabled: Boolean(startDate && endDate),
  });

  const toTimestamp = (value?: string | Date | null) => {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(value);
    const timestamp = date.getTime();
    return Number.isNaN(timestamp) ? undefined : timestamp;
  };

  const normalizeDateValue = (value?: string | Date | null) => {
    if (!value) return null;
    if (value instanceof Date) {
      return toLocalYMD(value);
    }
    return value;
  };

  const sortedAssetUsage = useMemo(() => {
    const rangeStart = toTimestamp(startDate) ?? Number.NEGATIVE_INFINITY;
    const rangeEnd = toTimestamp(endDate) ?? Number.POSITIVE_INFINITY;

    return assetAssignments
      .filter(assignment => {
        const assignmentStart = toTimestamp(assignment.assignedDate);
        if (assignmentStart === undefined) return false;
        const assignmentEnd = toTimestamp(assignment.returnDate) ?? Number.POSITIVE_INFINITY;
        return assignmentStart <= rangeEnd && assignmentEnd >= rangeStart;
      })
      .map<AssetUsage>(assignment => {
        const asset = assignment.asset;
        const employee = assignment.employee;
        const assignedDate = normalizeDateValue(assignment.assignedDate) ?? "";
        const returnDate = normalizeDateValue(assignment.returnDate);
        const employeeName = [employee?.firstName, employee?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();

        return {
          assignmentId: assignment.id,
          assetId: assignment.assetId,
          assetName: asset?.name ?? assignment.assetId,
          assetType: asset?.type ?? "",
          assetStatus: asset?.status ?? "",
          assetDetails: asset?.details ?? null,
          employeeId: assignment.employeeId,
          employeeCode: employee?.employeeCode ?? null,
          employeeName:
            employeeName ||
            employee?.firstName ||
            employee?.lastName ||
            assignment.employeeId,
          assignedDate,
          returnDate,
          status: assignment.status,
          notes: assignment.notes ?? null,
        };
      })
      .sort((a, b) => {
        const assetCompare = a.assetName.localeCompare(b.assetName);
        if (assetCompare !== 0) return assetCompare;
        const dateA = toTimestamp(a.assignedDate) ?? 0;
        const dateB = toTimestamp(b.assignedDate) ?? 0;
        return dateA - dateB;
      });
  }, [assetAssignments, startDate, endDate]);

  const sortedFleetUsage = useMemo(() => {
    const rangeStart = toTimestamp(startDate) ?? Number.NEGATIVE_INFINITY;
    const rangeEnd = toTimestamp(endDate) ?? Number.POSITIVE_INFINITY;

    return carAssignments
      .filter(assignment => {
        const assignmentStart = toTimestamp(assignment.assignedDate);
        if (assignmentStart === undefined) return false;
        const assignmentEnd = toTimestamp(assignment.returnDate) ?? Number.POSITIVE_INFINITY;
        return assignmentStart <= rangeEnd && assignmentEnd >= rangeStart;
      })
      .map<FleetUsage>(assignment => {
        const car = assignment.car;
        const employee = assignment.employee;
        const assignedDate = normalizeDateValue(assignment.assignedDate) ?? "";
        const returnDate = normalizeDateValue(assignment.returnDate);
        const vehicleParts = [car?.make, car?.model, car?.year ? String(car.year) : null].filter(Boolean);
        const vehicleName = vehicleParts.join(" ") || car?.plateNumber || assignment.carId;
        const employeeName = [employee?.firstName, employee?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();

        return {
          assignmentId: assignment.id,
          carId: assignment.carId,
          vehicle: vehicleName,
          plateNumber: car?.plateNumber ?? "",
          vin: car?.vin ?? null,
          serial: car?.serial ?? null,
          employeeId: assignment.employeeId,
          employeeCode: employee?.employeeCode ?? null,
          employeeName:
            employeeName ||
            employee?.firstName ||
            employee?.lastName ||
            assignment.employeeId,
          assignedDate,
          returnDate,
          status: assignment.status,
          notes: assignment.notes ?? null,
        };
      })
      .sort((a, b) => {
        const vehicleCompare = a.vehicle.localeCompare(b.vehicle);
        if (vehicleCompare !== 0) return vehicleCompare;
        const dateA = toTimestamp(a.assignedDate) ?? 0;
        const dateB = toTimestamp(b.assignedDate) ?? 0;
        return dateA - dateB;
      });
  }, [carAssignments, startDate, endDate]);

  if (
    employeesError ||
    employeeEventsError ||
    payrollRunsError ||
    payrollSummaryError ||
    loanDetailsError ||
    assetAssignmentsError ||
    carAssignmentsError ||
    payrollByDeptError
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

    // Department filter
    if (selectedDepartment !== "all") {
      const employee = employees?.find(emp => emp.id === event.employeeId);
      if (employee?.departmentId !== selectedDepartment) return false;
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
    const filteredEmployees = (selectedEmployee === "all"
      ? employees
      : employees?.filter(emp => emp.id === selectedEmployee))
      ?.filter(emp => selectedDepartment === 'all' || emp.departmentId === selectedDepartment)
      ?.filter(emp => selectedWorkLocation === 'all' || (emp.workLocation || 'Office') === selectedWorkLocation);

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
          <h1 className="text-3xl font-bold tracking-tight">{t('nav.reports')}</h1>
          <p className="text-muted-foreground">{t('reportsPage.subtitle','Comprehensive employee history and salary reports')}</p>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">{t('reportsPage.workLocation','Work Location')}</label>
          <Select value={selectedWorkLocation} onValueChange={setSelectedWorkLocation}>
            <SelectTrigger>
              <SelectValue placeholder={t('reportsPage.allLocations','All locations')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('reportsPage.all','All')}</SelectItem>
              {Array.from(new Set((employees || []).map(emp => emp.workLocation || 'Office'))).map((loc) => (
                <SelectItem key={loc || 'Office'} value={loc || 'Office'}>
                  {loc || 'Office'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">{t('nav.departments')}</label>
          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger>
              <SelectValue placeholder={t('employeesPage.allDepartments','All Departments')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('reportsPage.all','All')}</SelectItem>
              {(departments || []).map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="employee-history" className="space-y-6">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="employee-history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t('reportsPage.employeeHistory','Employee History')}
          </TabsTrigger>
          <TabsTrigger value="salary-reports" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('reports.salaryReports','Salary Reports')}
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            {t('reports.analytics','Analytics')}
          </TabsTrigger>
          <TabsTrigger value="payroll-summary" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            {t('reports.payrollSummary','Payroll Summary')}
          </TabsTrigger>
          <TabsTrigger value="loan-balances" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {t('reports.loanBalances','Loan Balances')}
          </TabsTrigger>
          <TabsTrigger value="dept-summary" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('reports.byDepartment','By Department')}
          </TabsTrigger>
          <TabsTrigger value="asset-usage" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('reports.assetUsage','Asset Usage')}
          </TabsTrigger>
          <TabsTrigger value="fleet-usage" className="flex items-center gap-2">
            <Car className="h-4 w-4" />
            {t('reports.fleetUsage','Fleet Usage')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employee-history" className="space-y-6">
          {/* Filter Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                {t('reports.filters','Report Filters')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('reports.employee','Employee')}</label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('reports.selectEmployee','Select employee')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reports.allEmployees','All Employees')}</SelectItem>
                      {employees?.map(employee => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.firstName} {employee.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">{t('reports.year','Year')}</label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('reports.selectYear','Select year')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reports.allYears','All Years')}</SelectItem>
                      {yearOptions.map(year => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">{t('reports.month','Month')}</label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('reports.selectMonth','Select month')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reports.allMonths','All Months')}</SelectItem>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">{t('reportsPage.workLocation','Work Location')}</label>
                  <Select value={selectedWorkLocation} onValueChange={setSelectedWorkLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('reports.selectLocation','Select location')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('reportsPage.allLocations','All locations')}</SelectItem>
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
                <label className="block text-sm font-medium mb-2">{t('reports.search','Search')}</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder={t('reports.searchPlaceholder','Search by employee name, position, or event...')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center mt-6 pt-4 border-t">
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <span>{t('reports.foundEvents','Found')} {filteredEvents.length} {t('reports.events','events')}</span>
                  <span>•</span>
                  <span>{selectedEmployee === "all" ? employees?.length || 0 : 1} {t('reports.employees','employees')}</span>
                </div>
                <Button onClick={generateEmployeeHistoryReport} className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t('reports.generateReport','Generate Report')}
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
                  <p>{t('reports.noEventsForCriteria','No events found matching the selected criteria')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dept-summary" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('reports.payrollByDepartment','Payroll by Department')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payrollByDept && payrollByDept.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">{t('reports.period','Period')}</th>
                        <th className="py-2 pr-4">{t('reports.department','Department')}</th>
                        <th className="py-2 pr-4">{t('reports.grossPay','Gross Pay')}</th>
                        <th className="py-2">{t('reports.netPay','Net Pay')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollByDept.map((row, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="py-2 pr-4">{row.period}</td>
                          <td className="py-2 pr-4">{row.departmentName || t('reports.unassigned','Unassigned')}</td>
                          <td className="py-2 pr-4">{formatCurrency(row.totals.grossPay)}</td>
                          <td className="py-2">{formatCurrency(row.totals.netPay)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('reports.noDeptPayrollData','No department payroll data available')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salary-reports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {t('reports.salaryTrends','Salary Trends & Analysis')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button onClick={generateSalaryReport}>{t('reports.generateSalaryReport','Generate Salary Report')}</Button>
                {salaryReport ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="py-2 pr-4">{t('reports.period','Period')}</th>
                          <th className="py-2 pr-4">{t('reports.netPay','Net Pay')}</th>
                          <th className="py-2">{t('reports.change','Change')}</th>
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
                    <p>{t('reports.noSalaryReport','No salary report generated')}</p>
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
                {t('reports.payrollOverview','Payroll Overview')}
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
                <p className="text-sm text-muted-foreground">{t('reports.noPayrollData','No payroll data available')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                {t('reports.employeeEventsByType','Employee Events by Type')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(eventSummary).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">{t('reports.eventType','Event Type')}</th>
                        <th className="py-2 pr-4">{t('reports.count','Count')}</th>
                        <th className="py-2">{t('reports.totalAmount','Total Amount')}</th>
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
                <p className="text-sm text-muted-foreground">{t('reports.noEventData','No employee event data available')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll-summary" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                {t('reports.payrollSummary','Payroll Summary')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payrollSummary && payrollSummary.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">{t('reports.period','Period')}</th>
                        <th className="py-2 pr-4">{t('reports.grossPay','Gross Pay')}</th>
                        <th className="py-2">{t('reports.netPay','Net Pay')}</th>
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
                <p className="text-sm text-muted-foreground">{t('reports.noPayrollData','No payroll data available')}</p>
              )}
            </CardContent>
          </Card>

          {/* Department Breakdown (latest period) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {t('reports.departmentBreakdownLatest','Department Breakdown (latest period)')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payrollByDept && payrollByDept.length > 0 ? (
                (() => {
                  const latestPeriod = payrollByDept[payrollByDept.length - 1]?.period;
                  const rows = payrollByDept.filter(r => r.period === latestPeriod);
                  const data = rows.map(r => ({ name: r.departmentName || t('reports.unassigned','Unassigned'), net: r.totals.netPay }));
                  return (
                    <ChartContainer
                      config={{}}
                      className="min-h-[240px] w-full"
                    >
                      <BarChart data={data}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
                        <YAxis tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="net" fill="#34d399" radius={[4,4,0,0]} />
                      </BarChart>
                    </ChartContainer>
                  );
                })()
              ) : (
                <p className="text-sm text-muted-foreground">{t('reports.noDeptData','No department data')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loan-balances" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                {t('reports.loanBalances','Loan Balances')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loanDetails && loanDetails.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">{t('reports.loanId','Loan ID')}</th>
                        <th className="py-2 pr-4">{t('reports.employee','Employee')}</th>
                        <th className="py-2 pr-4">{t('reports.originalAmount','Original Amount')}</th>
                        <th className="py-2 pr-4">{t('reports.remainingBalance','Remaining Balance')}</th>
                        <th className="py-2 pr-4">{t('reports.totalRepaid','Total Repaid')}</th>
                        <th className="py-2 pr-4">{t('reports.rangeDeduction','Deduction (Selected Range)')}</th>
                        <th className="py-2 pr-4">{t('reports.status','Status')}</th>
                        <th className="py-2">{t('reports.pauseNote','Pause Note')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanDetails.map(detail => {
                        const employee = detail.employee ?? employees?.find(emp => emp.id === detail.employeeId);
                        const rawName = employee
                          ? `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim()
                          : "";
                        const name = rawName || employee?.employeeCode || detail.employeeId;
                        const pauseNote = detail.pauseNote
                          ?? (detail.pausedByVacation
                            ? t('reports.pauseViaVacation','Paused via approved vacation')
                            : "—");
                        const statusLabel = detail.status
                          ? detail.status.replace(/_/g, ' ')
                          : t('reports.unknown','Unknown');
                        const statusVariant = detail.status === 'completed'
                          ? ('secondary' as const)
                          : detail.status === 'cancelled'
                          ? ('destructive' as const)
                          : detail.status === 'active'
                          ? ('default' as const)
                          : ('outline' as const);
                        return (
                          <tr key={detail.loanId} className="border-t align-top">
                            <td className="py-2 pr-4 font-mono text-xs">{detail.loanId}</td>
                            <td className="py-2 pr-4">{name}</td>
                            <td className="py-2 pr-4">{formatCurrency(detail.originalAmount)}</td>
                            <td className="py-2 pr-4">{formatCurrency(detail.remainingAmount)}</td>
                            <td className="py-2 pr-4">{formatCurrency(detail.totalRepaid)}</td>
                            <td className="py-2 pr-4">{formatCurrency(detail.deductionInRange)}</td>
                            <td className="py-2 pr-4">
                              <Badge variant={statusVariant}>{statusLabel}</Badge>
                            </td>
                            <td className="py-2 max-w-[16rem] whitespace-pre-wrap">{pauseNote}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('reports.noLoanData','No loan data available')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="asset-usage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('reports.assetUsage','Asset Usage')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sortedAssetUsage.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">{t('reports.asset','Asset')}</th>
                        <th className="py-2 pr-4">{t('reports.assignedTo','Assigned To')}</th>
                        <th className="py-2 pr-4">{t('reports.assignmentPeriod','Assignment Period')}</th>
                        <th className="py-2 pr-4">{t('reports.status','Status')}</th>
                        <th className="py-2">{t('reports.notes','Notes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAssetUsage.map(assignment => {
                        const assignmentEnd = assignment.returnDate
                          ? formatDate(assignment.returnDate)
                          : t('reports.ongoing', 'Ongoing');
                        const assetTypeLabel = assignment.assetType
                          ? t('reports.assetTypeLabel', { type: assignment.assetType })
                          : t('reports.assetTypeLabel', { type: t('reports.unknown', 'Unknown') });
                        const assetStatusLabel = assignment.assetStatus
                          ? t('reports.assetStatusLabel', { status: assignment.assetStatus })
                          : t('reports.assetStatusLabel', { status: t('reports.unknown', 'Unknown') });

                        return (
                          <tr key={assignment.assignmentId} className="border-t align-top">
                            <td className="py-3 pr-4">
                              <div className="font-medium">{assignment.assetName}</div>
                              <div className="text-xs text-muted-foreground">{assetTypeLabel}</div>
                              <div className="text-xs text-muted-foreground">{assetStatusLabel}</div>
                              {assignment.assetDetails ? (
                                <div className="text-xs text-muted-foreground">{assignment.assetDetails}</div>
                              ) : null}
                            </td>
                            <td className="py-3 pr-4">
                              <div className="font-medium">{assignment.employeeName}</div>
                              {assignment.employeeCode ? (
                                <div className="text-xs text-muted-foreground">
                                  {t('reports.employeeCodeLabel', { code: assignment.employeeCode })}
                                </div>
                              ) : null}
                              <div className="text-xs text-muted-foreground">
                                {t('reports.employeeIdLabel', { id: assignment.employeeId })}
                              </div>
                            </td>
                            <td className="py-3 pr-4 whitespace-nowrap">
                              {formatDate(assignment.assignedDate)} – {assignmentEnd}
                            </td>
                            <td className="py-3 pr-4">
                              <Badge variant={assignment.status === 'active' ? 'default' : 'secondary'}>
                                {assignment.status}
                              </Badge>
                            </td>
                            <td className="py-3 max-w-[18rem] whitespace-pre-wrap">
                              {assignment.notes ? (
                                assignment.notes
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {t('reports.noNotes', 'No notes')}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('reports.noAssetData','No asset usage data available')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fleet-usage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5" />
                {t('reports.fleetUsage','Fleet Usage')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sortedFleetUsage.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-4">{t('reports.vehicle','Vehicle')}</th>
                        <th className="py-2 pr-4">{t('reports.identifiers','Identifiers')}</th>
                        <th className="py-2 pr-4">{t('reports.assignee','Assignee')}</th>
                        <th className="py-2 pr-4">{t('reports.assignmentWindow','Assignment Window')}</th>
                        <th className="py-2 pr-4">{t('reports.status','Status')}</th>
                        <th className="py-2">{t('reports.remarks','Remarks')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFleetUsage.map(assignment => {
                        const assignmentEnd = assignment.returnDate
                          ? formatDate(assignment.returnDate)
                          : t('reports.ongoing', 'Ongoing');
                        return (
                          <tr key={assignment.assignmentId} className="border-t align-top">
                            <td className="py-3 pr-4">
                              <div className="font-medium">{assignment.vehicle}</div>
                            </td>
                            <td className="py-3 pr-4">
                              <div className="font-medium">
                                {assignment.plateNumber
                                  ? t('reports.plateLabel', { plate: assignment.plateNumber })
                                  : t('reports.unknown', 'Unknown')}
                              </div>
                              {assignment.vin ? (
                                <div className="text-xs text-muted-foreground">
                                  {t('reports.vinLabel', { vin: assignment.vin })}
                                </div>
                              ) : null}
                              {assignment.serial ? (
                                <div className="text-xs text-muted-foreground">
                                  {t('reports.serialLabel', { serial: assignment.serial })}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-3 pr-4">
                              <div className="font-medium">{assignment.employeeName}</div>
                              {assignment.employeeCode ? (
                                <div className="text-xs text-muted-foreground">
                                  {t('reports.employeeCodeLabel', { code: assignment.employeeCode })}
                                </div>
                              ) : null}
                              <div className="text-xs text-muted-foreground">
                                {t('reports.employeeIdLabel', { id: assignment.employeeId })}
                              </div>
                            </td>
                            <td className="py-3 pr-4 whitespace-nowrap">
                              {formatDate(assignment.assignedDate)} – {assignmentEnd}
                            </td>
                            <td className="py-3 pr-4">
                              <Badge variant={assignment.status === 'active' ? 'default' : 'secondary'}>
                                {assignment.status}
                              </Badge>
                            </td>
                            <td className="py-3 max-w-[18rem] whitespace-pre-wrap">
                              {assignment.notes ? (
                                assignment.notes
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {t('reports.noNotes', 'No notes')}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('reports.noFleetData','No fleet usage data available')}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
