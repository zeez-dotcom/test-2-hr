import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Eye, Edit, UserX, User, ArrowUpDown, ChevronDown, ChevronUp, Printer } from "lucide-react";
import type { EmployeeWithDepartment, Department } from "@shared/schema";
import { formatCurrency, formatDate } from "@/lib/utils";
import { apiGet } from "@/lib/http";

interface EmployeesResponse {
  data: EmployeeWithDepartment[];
  total: number;
}

interface EmployeeTableProps {
  employees?: EmployeeWithDepartment[]; // retained for backwards compatibility but unused
  isLoading?: boolean;
  onTerminateEmployee: (employeeId: string) => void;
  onEditEmployee: (employee: EmployeeWithDepartment) => void;
  isMutating: boolean;
  initialStatusFilter?: string;
  onStartWorkflow: (employee: EmployeeWithDepartment, type: "onboarding" | "offboarding") => void;
}

export default function EmployeeTable({
  onTerminateEmployee,
  onEditEmployee,
  isMutating,
  initialStatusFilter,
  onStartWorkflow,
}: EmployeeTableProps) {
  const normalizedInitialStatus = (initialStatusFilter || "all").toLowerCase();
  const [nameFilter, setNameFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(normalizedInitialStatus);
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [viewEmployee, setViewEmployee] = useState<EmployeeWithDepartment | null>(null);
  const [reportEmployee, setReportEmployee] = useState<EmployeeWithDepartment | null>(null);
  const [reportOptions, setReportOptions] = useState({
    documents: true,
    loans: true,
    assets: true,
    breakdown: true,
    start: "",
    end: "",
    language: "en" as "en" | "ar",
  });

  function getStatusColor(status: string) {
    switch (status) {
      case "active":
        return "bg-success text-white";
      case "on_leave":
        return "bg-warning text-white";
      case "inactive":
        return "bg-gray-500 text-white";
      case "resigned":
        return "bg-orange-500 text-white";
      case "terminated":
        return "bg-destructive text-white";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case "active":
        return "Active";
      case "on_leave":
        return "On Leave";
      case "inactive":
        return "Inactive";
      case "terminated":
        return "Terminated";
      case "resigned":
        return "Resigned";
      default:
        return status;
    }
  }

  const employeeSections = useMemo(() => {
    if (!viewEmployee) return [] as { title: string; fields: { label: string; value: string | null }[] }[];

    const formatFieldValue = (
      value: unknown,
      options: { type?: "date" | "currency" } = {},
    ): string | null => {
      if (value === null || value === undefined) {
        return null;
      }

      if (options.type === "date") {
        if (value instanceof Date) {
          return formatDate(value);
        }

        if (typeof value === "string") {
          const trimmed = value.trim();
          if (!trimmed) {
            return null;
          }
          return formatDate(trimmed);
        }

        return null;
      }

      if (options.type === "currency") {
        if (typeof value === "number") {
          return formatCurrency(value);
        }

        if (typeof value === "string") {
          const trimmed = value.trim();
          if (!trimmed) {
            return null;
          }
          const numericValue = Number(trimmed);
          if (Number.isNaN(numericValue)) {
            return null;
          }
          return formatCurrency(numericValue);
        }

        return null;
      }

      if (typeof value === "number") {
        return value.toString();
      }

      const stringValue = String(value);
      return stringValue.trim() === "" ? null : stringValue;
    };

    return [
      {
        title: "Identity",
        fields: [
          { label: "First Name", value: formatFieldValue(viewEmployee.firstName) },
          { label: "Last Name", value: formatFieldValue(viewEmployee.lastName) },
          { label: "Employee Code", value: formatFieldValue(viewEmployee.employeeCode) },
          { label: "Arabic Name", value: formatFieldValue(viewEmployee.arabicName) },
          { label: "Nickname", value: formatFieldValue(viewEmployee.nickname) },
          { label: "Date of Birth", value: formatFieldValue(viewEmployee.dateOfBirth, { type: "date" }) },
          { label: "Nationality", value: formatFieldValue(viewEmployee.nationality) },
        ],
      },
      {
        title: "Contact",
        fields: [
          { label: "Email", value: formatFieldValue(viewEmployee.email) },
          { label: "Phone", value: formatFieldValue(viewEmployee.phone) },
          { label: "Emergency Contact", value: formatFieldValue(viewEmployee.emergencyContact) },
          { label: "Emergency Phone", value: formatFieldValue(viewEmployee.emergencyPhone) },
          { label: "Address", value: formatFieldValue(viewEmployee.address) },
        ],
      },
      {
        title: "Employment",
        fields: [
          { label: "Position", value: formatFieldValue(viewEmployee.position) },
          { label: "Role", value: formatFieldValue(viewEmployee.role) },
          { label: "Department", value: formatFieldValue(viewEmployee.department?.name) },
          { label: "Company", value: formatFieldValue(viewEmployee.company?.name) },
          { label: "Start Date", value: formatFieldValue(viewEmployee.startDate, { type: "date" }) },
          { label: "Status", value: formatFieldValue(getStatusLabel(viewEmployee.status)) },
          { label: "Work Location", value: formatFieldValue(viewEmployee.workLocation) },
          {
            label: "Standard Working Days",
            value: formatFieldValue(viewEmployee.standardWorkingDays),
          },
          {
            label: "Additions",
            value: formatFieldValue(viewEmployee.additions, { type: "currency" }),
          },
          { label: "Salary", value: formatFieldValue(viewEmployee.salary, { type: "currency" }) },
          { label: "Payment Method", value: formatFieldValue(viewEmployee.paymentMethod) },
          { label: "Profession", value: formatFieldValue(viewEmployee.profession) },
          { label: "Profession Category", value: formatFieldValue(viewEmployee.professionCategory) },
          { label: "Bank IBAN", value: formatFieldValue(viewEmployee.bankIban) },
          {
            label: "Transferable",
            value:
              viewEmployee.transferable === undefined
                ? null
                : viewEmployee.transferable
                  ? "Yes"
                  : "No",
          },
        ],
      },
      {
        title: "Banking",
        fields: [
          { label: "Bank Name", value: formatFieldValue(viewEmployee.bankName) },
          { label: "SWIFT Code", value: formatFieldValue(viewEmployee.swiftCode) },
        ],
      },
      {
        title: "Government IDs",
        fields: [
          { label: "National ID", value: formatFieldValue(viewEmployee.nationalId) },
          { label: "Profession Code", value: formatFieldValue(viewEmployee.professionCode) },
          { label: "Profession Category", value: formatFieldValue(viewEmployee.professionCategory) },
        ],
      },
      {
        title: "Residency",
        fields: [
          {
            label: "Residency On Company",
            value:
              viewEmployee.residencyOnCompany === undefined
                ? null
                : viewEmployee.residencyOnCompany
                  ? "Yes"
                  : "No",
          },
          { label: "Residency Name", value: formatFieldValue(viewEmployee.residencyName) },
        ],
      },
      {
        title: "Visa Details",
        fields: [
          { label: "Visa Number", value: formatFieldValue(viewEmployee.visaNumber) },
          { label: "Visa Type", value: formatFieldValue(viewEmployee.visaType) },
          { label: "Visa Issue Date", value: formatFieldValue(viewEmployee.visaIssueDate, { type: "date" }) },
          { label: "Visa Expiry Date", value: formatFieldValue(viewEmployee.visaExpiryDate, { type: "date" }) },
          { label: "Visa Alert Days", value: formatFieldValue(viewEmployee.visaAlertDays) },
        ],
      },
      {
        title: "Civil ID Details",
        fields: [
          { label: "Civil ID Number", value: formatFieldValue(viewEmployee.civilId) },
          { label: "Civil ID Issue Date", value: formatFieldValue(viewEmployee.civilIdIssueDate, { type: "date" }) },
          { label: "Civil ID Expiry Date", value: formatFieldValue(viewEmployee.civilIdExpiryDate, { type: "date" }) },
          { label: "Civil ID Alert Days", value: formatFieldValue(viewEmployee.civilIdAlertDays) },
        ],
      },
      {
        title: "Passport Details",
        fields: [
          { label: "Passport Number", value: formatFieldValue(viewEmployee.passportNumber) },
          { label: "Passport Issue Date", value: formatFieldValue(viewEmployee.passportIssueDate, { type: "date" }) },
          { label: "Passport Expiry Date", value: formatFieldValue(viewEmployee.passportExpiryDate, { type: "date" }) },
          { label: "Passport Alert Days", value: formatFieldValue(viewEmployee.passportAlertDays) },
        ],
      },
      {
        title: "Licensing",
        fields: [
          { label: "Driving License Number", value: formatFieldValue(viewEmployee.drivingLicenseNumber) },
          {
            label: "Driving License Issue Date",
            value: formatFieldValue(viewEmployee.drivingLicenseIssueDate, { type: "date" }),
          },
          {
            label: "Driving License Expiry Date",
            value: formatFieldValue(viewEmployee.drivingLicenseExpiryDate, { type: "date" }),
          },
        ],
      },
    ];
  }, [viewEmployee]);

  // keep status in sync with prop changes
  useEffect(() => {
    const next = (initialStatusFilter || "all").toLowerCase();
    setStatusFilter((prev) => (prev === next ? prev : next));
  }, [initialStatusFilter]);

  // initialize default report date range once (no state updates during render)
  useEffect(() => {
    if (!reportOptions.start || !reportOptions.end) {
      const today = new Date();
      const defaultStart = new Date(today.getFullYear(), 0, 1).toISOString().split("T")[0];
      const defaultEnd = today.toISOString().split("T")[0];
      setReportOptions((r) => ({
        ...r,
        start: r.start || defaultStart,
        end: r.end || defaultEnd,
      }));
    }
  }, [reportOptions.start, reportOptions.end]);

  async function exportEmployeeReportCSV(empId: string) {
    const params = new URLSearchParams();
    if (reportOptions.start) params.set("startDate", reportOptions.start);
    if (reportOptions.end) params.set("endDate", reportOptions.end);
    const res = await apiGet(`/api/reports/employees/${empId}?${params.toString()}`);
    if (!res.ok) return;

    const periods = res.data as any[];
    const rows: string[] = [];
    const header = [
      "Period",
      "Gross Pay",
      "Net Pay",
      "Bonuses",
      "Commissions",
      "Allowances",
      "Overtime",
      "Penalties",
      "Deductions",
      "Loan Deduction",
      "Other Deductions",
      "Tax",
      "Social",
      "Health",
      "Working Days",
      "Actual Working Days",
    ];
    rows.push(header.join(","));

    for (const p of periods) {
      const gross = (p.payrollEntries || []).reduce((s: number, e: any) => s + Number(e.grossPay || 0), 0);
      const net = (p.payrollEntries || []).reduce((s: number, e: any) => s + Number(e.netPay || 0), 0);
      const tax = (p.payrollEntries || []).reduce((s: number, e: any) => s + Number(e.taxDeduction || 0), 0);
      const social = (p.payrollEntries || []).reduce((s: number, e: any) => s + Number(e.socialSecurityDeduction || 0), 0);
      const health = (p.payrollEntries || []).reduce((s: number, e: any) => s + Number(e.healthInsuranceDeduction || 0), 0);
      const loanDed = (p.payrollEntries || []).reduce((s: number, e: any) => s + Number(e.loanDeduction || 0), 0);
      const other = (p.payrollEntries || []).reduce((s: number, e: any) => s + Number(e.otherDeductions || 0), 0);

      const evs = (p.employeeEvents || []) as any[];
      const sumEv = (t: string) => evs.filter((e) => e.eventType === t).reduce((s, e) => s + Number(e.amount || 0), 0);
      const bonuses = sumEv("bonus");
      const commissions = sumEv("commission");
      const allowances = sumEv("allowance");
      const overtime = sumEv("overtime");
      const penalties = sumEv("penalty");

      const deductions = Number(p.totals?.deductions || 0);
      const workingDays = (p.payrollEntries || []).reduce((s: number, e: any) => s + Number(e.workingDays || 0), 0);
      const actualWorkingDays = (p.payrollEntries || []).reduce((s: number, e: any) => s + Number(e.actualWorkingDays || 0), 0);

      const vals = [
        p.period,
        gross,
        net,
        bonuses,
        commissions,
        allowances,
        overtime,
        penalties,
        deductions,
        loanDed,
        other,
        tax,
        social,
        health,
        workingDays,
        actualWorkingDays,
      ].map((v) => (typeof v === "number" ? v.toFixed(2) : String(v)));
      rows.push(vals.join(","));
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `employee-report-${empId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
    // If you don't have a default queryFn set up, uncomment:
    // queryFn: async () => (await apiGet("/api/departments")).data,
  });

  const { data, isLoading, error, refetch } = useQuery<EmployeesResponse>({
    queryKey: ["/api/employees", { page, nameFilter, departmentFilter, statusFilter, sortBy, sortOrder }],
    placeholderData: keepPreviousData,
    queryFn: async ({ queryKey }): Promise<EmployeesResponse> => {
      const [_key, params] = queryKey as [
        string,
        {
          page: number;
          nameFilter: string;
          departmentFilter: string;
          statusFilter: string;
          sortBy: string;
          sortOrder: string;
        },
      ];
      const searchParams = new URLSearchParams();
      searchParams.set("page", params.page.toString());
      searchParams.set("limit", pageSize.toString());
      if (params.nameFilter) searchParams.set("name", params.nameFilter);
      if (params.departmentFilter !== "all") searchParams.set("department", params.departmentFilter);
      if (params.statusFilter) searchParams.set("status", params.statusFilter);
      if (params.sortBy) searchParams.set("sort", params.sortBy);
      searchParams.set("order", params.sortOrder);

      const res = await apiGet(`/api/employees?${searchParams.toString()}`);
      if (!res.ok) throw new Error(res.error || "Failed to load employees");
      const total = Number(res.headers?.get("X-Total-Count")) || 0;
      const employees = res.data;
      return { data: employees, total };
    },
  });

  if (error) {
    return (
      <div className="p-4">
        <p className="mb-2">Failed to load employees.</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const employees: EmployeeWithDepartment[] = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  const renderDocument = (
    value: string | null | undefined,
    label: string,
    key?: string
  ) => {
    if (!value) return null;
    const trimmedValue = value.trim();
    const isPDF =
      /^data:application\/pdf/i.test(trimmedValue) ||
      trimmedValue.toLowerCase().endsWith(".pdf");

    return (
      <article
        key={key}
        className="flex h-full flex-col overflow-hidden rounded-lg border bg-background text-sm shadow-sm transition hover:shadow-md"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {isPDF ? (
            <object data={trimmedValue} type="application/pdf" className="h-full w-full">
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-xs text-muted-foreground">
                <span>PDF preview unavailable.</span>
                <span>Use the link below to open the document.</span>
              </div>
            </object>
          ) : (
            <img src={trimmedValue} alt={label} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div>
            <h4 className="font-medium text-foreground">{label}</h4>
            <p className="text-xs text-muted-foreground">Preview of the uploaded document.</p>
          </div>
          <div className="mt-auto pt-2">
            <a
              href={trimmedValue}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              Open document
            </a>
          </div>
        </div>
      </article>
    );
  };

  const printEmployeeFile = async (employeeId: string) => {
    window.open(`/employee-file?id=${encodeURIComponent(employeeId)}`, "_blank");
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salary</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="ml-4">
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap"><Skeleton className="h-4 w-24" /></td>
                <td className="px-6 py-4 whitespace-nowrap"><Skeleton className="h-4 w-20" /></td>
                <td className="px-6 py-4 whitespace-nowrap"><Skeleton className="h-4 w-16" /></td>
                <td className="px-6 py-4 whitespace-nowrap"><Skeleton className="h-6 w-16 rounded-full" /></td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex justify-end space-x-2">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="text-center py-12">
        <User className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No employees found</h3>
        <p className="mt-1 text-sm text-gray-500">No employees match your current search criteria.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-4 sm:space-y-0 mb-4">
        <Input
          placeholder="Search by name"
          value={nameFilter}
          onChange={(e) => {
            setNameFilter(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-64"
        />
        <Select
          value={departmentFilter}
          onValueChange={(v) => {
            setDepartmentFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments?.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_leave">On Leave</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="resigned">Resigned</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            {[
              { key: "name", label: "Employee" },
              { key: "position", label: "Position" },
              { key: "department", label: "Department" },
              { key: "salary", label: "Salary" },
              { key: "status", label: "Status" },
            ].map((col) => (
              <th key={col.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button type="button" onClick={() => handleSort(col.key)} className="flex items-center">
                  {col.label}
                  {sortBy === col.key ? (
                    sortOrder === "asc" ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
                  ) : (
                    <ArrowUpDown className="ml-1 h-4 w-4" />
                  )}
                </button>
              </th>
            ))}
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>

        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
          {employees.map((employee) => (
            <tr key={employee.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
                    {employee.profileImage ? (
                      <img
                        src={employee.profileImage}
                        alt={`${employee.firstName} ${employee.lastName}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="text-gray-600" size={16} aria-hidden="true" />
                    )}
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">
                      {employee.firstName} {employee.lastName}
                    </div>
                    <div className="text-sm text-gray-500">{employee.email}</div>
                  </div>
                </div>
              </td>

              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{employee.position}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {employee.department?.name || "No Department"}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(employee.salary)}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Badge className={getStatusColor(employee.status)}>{getStatusLabel(employee.status)}</Badge>
              </td>

              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReportEmployee(employee)}
                    className="text-gray-600 hover:text-gray-900"
                  >
                    Print
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary hover:text-blue-700"
                    onClick={() => setViewEmployee(employee)}
                  >
                    <Eye size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onStartWorkflow(employee, "onboarding")}
                    className="text-emerald-600 hover:text-emerald-700"
                    aria-label="Start onboarding workflow"
                  >
                    Onboard
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onStartWorkflow(employee, "offboarding")}
                    className="text-amber-600 hover:text-amber-700"
                    aria-label="Start offboarding workflow"
                  >
                    Offboard
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditEmployee(employee)}
                    className="text-gray-600 hover:text-gray-900"
                  >
                    <Edit size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onTerminateEmployee(employee.id)}
                    disabled={isMutating}
                    className="text-red-600 hover:text-red-700"
                    aria-label="Terminate employee"
                  >
                    <UserX size={16} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center justify-between py-4">
        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page === 1}>
          Previous
        </Button>
        <span className="text-sm text-gray-700">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
          Next
        </Button>
      </div>

      <Dialog open={!!viewEmployee} onOpenChange={(open) => !open && setViewEmployee(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewEmployee?.firstName} {viewEmployee?.lastName}
            </DialogTitle>
          </DialogHeader>

          {viewEmployee && (
            <>
              <DialogFooter className="justify-start">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => printEmployeeFile(viewEmployee.id)}
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  Print
                </Button>
              </DialogFooter>
              <div className="space-y-8">
                <div className="rounded-xl bg-muted/40 p-6 shadow-sm">
                  {employeeSections.map((section) => (
                    <section key={section.title} className="space-y-4">
                      <div className="flex items-center gap-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {section.title}
                        </h3>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                        {section.fields.map((field) => (
                          <div key={field.label} className="space-y-1">
                            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {field.label}
                            </dt>
                            <dd className="text-sm text-foreground">
                              {field.value !== null && field.value !== undefined && field.value !== "" ? field.value : "-"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
              </div>

              {(() => {
                const documents = [
                  { key: "profileImage", label: "Profile Image" },
                  { key: "drivingLicenseImage", label: "Driving License" },
                  { key: "visaImage", label: "Visa Document" },
                  { key: "civilIdImage", label: "Civil ID" },
                  { key: "passportImage", label: "Passport" },
                  { key: "additionalDocs", label: "Additional Documents" },
                  { key: "otherDocs", label: "Other Documents" },
                ]
                  .map(({ key, label }) => ({
                    key,
                    label,
                    value: viewEmployee[key as keyof EmployeeWithDepartment] as string | null | undefined,
                  }))
                  .filter((doc) => !!doc.value);

                if (!documents.length) return null;

                return (
                  <section className="space-y-4">
                    <div className="flex items-center gap-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documents</h3>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {documents.map((doc) => renderDocument(doc.value, doc.label, doc.key))}
                    </div>
                  </section>
                );
              })()}
            </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Report Options Dialog */}
      <Dialog open={!!reportEmployee} onOpenChange={(o) => !o && setReportEmployee(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Generate Report</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={reportOptions.documents}
                  onChange={(e) => setReportOptions((r) => ({ ...r, documents: e.target.checked }))}
                />
                Include Documents
              </label>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={reportOptions.loans}
                  onChange={(e) => setReportOptions((r) => ({ ...r, loans: e.target.checked }))}
                />
                Include Loans
              </label>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={reportOptions.assets}
                  onChange={(e) => setReportOptions((r) => ({ ...r, assets: e.target.checked }))}
                />
                Include Asset Assignments
              </label>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={reportOptions.breakdown}
                  onChange={(e) => setReportOptions((r) => ({ ...r, breakdown: e.target.checked }))}
                />
                Include Breakdown (bonuses, deductions, commissions)
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground mb-1">Start</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1 w-full"
                  value={reportOptions.start}
                  onChange={(e) => setReportOptions((r) => ({ ...r, start: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-muted-foreground mb-1">End</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1 w-full"
                  value={reportOptions.end}
                  onChange={(e) => setReportOptions((r) => ({ ...r, end: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-muted-foreground mb-1">Language</label>
              <RadioGroup
                className="flex flex-wrap gap-4"
                value={reportOptions.language}
                onValueChange={(value) => setReportOptions((r) => ({ ...r, language: value === "ar" ? "ar" : "en" }))}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="employee-report-language-en" value="en" />
                  <label htmlFor="employee-report-language-en" className="text-sm font-medium leading-none">
                    English
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="employee-report-language-ar" value="ar" />
                  <label htmlFor="employee-report-language-ar" className="text-sm font-medium leading-none">
                    العربية
                  </label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setReportEmployee(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!reportEmployee) return;
                await exportEmployeeReportCSV(reportEmployee.id);
              }}
            >
              Export CSV
            </Button>
            <Button
              onClick={() => {
                if (!reportEmployee) return;
                const sections = [
                  reportOptions.documents ? "documents" : null,
                  reportOptions.loans ? "loans" : null,
                  reportOptions.assets ? "assets" : null,
                  reportOptions.breakdown ? "breakdown" : null,
                ]
                  .filter(Boolean)
                  .join(",");
                const qs: string[] = [];
                if (sections) qs.push(`sections=${encodeURIComponent(sections)}`);
                if (reportOptions.start) qs.push(`startDate=${encodeURIComponent(reportOptions.start)}`);
                if (reportOptions.end) qs.push(`endDate=${encodeURIComponent(reportOptions.end)}`);
                if (reportOptions.language) qs.push(`lang=${encodeURIComponent(reportOptions.language)}`);
                const url = `/employee-file?id=${encodeURIComponent(reportEmployee.id)}${qs.length ? `&${qs.join("&")}` : ""}`;
                window.open(url, "_blank");
                setReportEmployee(null);
              }}
            >
              Generate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
