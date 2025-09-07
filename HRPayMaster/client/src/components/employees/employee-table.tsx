import { useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Eye,
  Edit,
  Trash2,
  User,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { EmployeeWithDepartment, Department } from "@shared/schema";
import { formatCurrency, formatDate } from "@/lib/utils";
import { apiGet } from "@/lib/http";

interface EmployeesResponse {
  data: EmployeeWithDepartment[];
  total: number;
}

interface EmployeeTableProps {
  // retained for backwards compatibility but unused
  employees?: EmployeeWithDepartment[];
  isLoading?: boolean;
  onDeleteEmployee: (employeeId: string) => void;
  onEditEmployee: (employee: EmployeeWithDepartment) => void;
  isDeleting: boolean;
}

export default function EmployeeTable({
  onDeleteEmployee,
  onEditEmployee,
  isDeleting,
}: EmployeeTableProps) {
  const [nameFilter, setNameFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [viewEmployee, setViewEmployee] = useState<EmployeeWithDepartment | null>(null);

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data, isLoading, error, refetch } = useQuery<EmployeesResponse>({
    queryKey: [
      "/api/employees",
      { page, nameFilter, departmentFilter, statusFilter, sortBy, sortOrder },
    ],
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
      if (params.departmentFilter !== "all")
        searchParams.set("department", params.departmentFilter);
      if (params.statusFilter !== "all")
        searchParams.set("status", params.statusFilter);
      if (params.sortBy) searchParams.set("sort", params.sortBy);
      searchParams.set("order", params.sortOrder);

      const res = await apiGet(
        `/api/employees?${searchParams.toString()}`,
      );
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


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-success text-white';
      case 'on_leave':
        return 'bg-warning text-white';
      case 'inactive':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'on_leave':
        return 'On Leave';
      case 'inactive':
        return 'Inactive';
      default:
        return status;
    }
  };

  const renderDocument = (value: string, alt: string) => {
    const isPDF = value.startsWith("data:application/pdf");
    return isPDF ? (
      <object
        data={value}
        type="application/pdf"
        className="mt-4 max-w-xs w-full h-64"
      >
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          View PDF
        </a>
      </object>
    ) : (
      <img src={value} alt={alt} className="mt-4 max-w-xs" />
    );
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
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salary</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
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
        <p className="mt-1 text-sm text-gray-500">
          No employees match your current search criteria.
        </p>
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
          </SelectContent>
        </Select>
      </div>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <button
                type="button"
                onClick={() => handleSort("name")}
                className="flex items-center"
              >
                Employee
                {sortBy === "name" ? (
                  sortOrder === "asc" ? (
                    <ChevronUp className="ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="ml-1 h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="ml-1 h-4 w-4" />
                )}
              </button>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <button
                type="button"
                onClick={() => handleSort("position")}
                className="flex items-center"
              >
                Position
                {sortBy === "position" ? (
                  sortOrder === "asc" ? (
                    <ChevronUp className="ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="ml-1 h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="ml-1 h-4 w-4" />
                )}
              </button>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <button
                type="button"
                onClick={() => handleSort("department")}
                className="flex items-center"
              >
                Department
                {sortBy === "department" ? (
                  sortOrder === "asc" ? (
                    <ChevronUp className="ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="ml-1 h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="ml-1 h-4 w-4" />
                )}
              </button>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <button
                type="button"
                onClick={() => handleSort("salary")}
                className="flex items-center"
              >
                Salary
                {sortBy === "salary" ? (
                  sortOrder === "asc" ? (
                    <ChevronUp className="ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="ml-1 h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="ml-1 h-4 w-4" />
                )}
              </button>
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <button
                type="button"
                onClick={() => handleSort("status")}
                className="flex items-center"
              >
                Status
                {sortBy === "status" ? (
                  sortOrder === "asc" ? (
                    <ChevronUp className="ml-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="ml-1 h-4 w-4" />
                  )
                ) : (
                  <ArrowUpDown className="ml-1 h-4 w-4" />
                )}
              </button>
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {employees.map((employee) => (
            <tr key={employee.id} className="hover:bg-gray-50">
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
                      <User className="text-gray-600" size={16} />
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
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {employee.position}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {employee.department?.name || 'No Department'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {formatCurrency(employee.salary)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Badge className={getStatusColor(employee.status)}>
                  {getStatusLabel(employee.status)}
                </Badge>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex justify-end space-x-2">
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
                    onClick={() => onEditEmployee(employee)}
                    className="text-gray-600 hover:text-gray-900"
                  >
                    <Edit size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteEmployee(employee.id)}
                    disabled={isDeleting}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(p - 1, 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <span className="text-sm text-gray-700">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= totalPages}
        >
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <span className="font-medium">Nationality</span>
              <span>{viewEmployee.nationality || "-"}</span>
              <span className="font-medium">Profession Code</span>
              <span>{viewEmployee.professionCode || "-"}</span>
              <span className="font-medium">Profession</span>
              <span>{viewEmployee.profession || "-"}</span>
              <span className="font-medium">Payment Method</span>
              <span>{viewEmployee.paymentMethod || "-"}</span>
              <span className="font-medium">Transferable</span>
              <span>{viewEmployee.transferable ? "Yes" : "No"}</span>
              <span className="font-medium">Driving License Number</span>
              <span>{viewEmployee.drivingLicenseNumber || "-"}</span>
              <span className="font-medium">Driving License Issue Date</span>
              <span>{viewEmployee.drivingLicenseIssueDate ? formatDate(viewEmployee.drivingLicenseIssueDate) : "-"}</span>
              <span className="font-medium">Driving License Expiry Date</span>
              <span>{viewEmployee.drivingLicenseExpiryDate ? formatDate(viewEmployee.drivingLicenseExpiryDate) : "-"}</span>
              <span className="font-medium">IBAN</span>
              <span>{viewEmployee.iban || "-"}</span>
              <span className="font-medium">SWIFT Code</span>
              <span>{viewEmployee.swiftCode || "-"}</span>
              <span className="font-medium">Residency On Company</span>
              <span>{viewEmployee.residencyOnCompany ? "Yes" : "No"}</span>
              {!viewEmployee.residencyOnCompany && (
                <>
                  <span className="font-medium">Residency Name</span>
                  <span>{viewEmployee.residencyName || "-"}</span>
                </>
              )}
              <span className="font-medium">Profession Category</span>
              <span>{viewEmployee.professionCategory || "-"}</span>
            </div>
          )}
          {viewEmployee?.drivingLicenseImage &&
            renderDocument(viewEmployee.drivingLicenseImage, "Driving License")}
          {viewEmployee?.additionalDocs &&
            renderDocument(viewEmployee.additionalDocs, "Additional Documents")}
          {viewEmployee?.otherDocs &&
            renderDocument(viewEmployee.otherDocs, "Other Documents")}
        </DialogContent>
      </Dialog>
    </div>
  );
}
