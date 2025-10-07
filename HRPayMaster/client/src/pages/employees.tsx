import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";

import EmployeeTable from "@/components/employees/employee-table";
import EmployeeForm from "@/components/employees/employee-form";
import EmployeeImport from "@/components/employees/employee-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiPost, apiPut } from "@/lib/http";
import { buildBilingualActionReceipt, buildAndEncodePdf } from "@/lib/pdf";
import { useToast } from "@/hooks/use-toast";
import { toastApiError } from "@/lib/toastError";
import type { EmployeeWithDepartment, Department, InsertEmployee, Company } from "@shared/schema";
import { useLocation } from "wouter";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface EmployeesProps {
  defaultStatus?: string;
}

export default function Employees({ defaultStatus = "active" }: EmployeesProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeWithDepartment | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [employeeToTerminate, setEmployeeToTerminate] = useState<string | null>(null);
  const { toast } = useToast();

  const {
    data: employees,
    isLoading: employeesLoading,
    error: employeesError,
    refetch: refetchEmployees,
  } = useQuery<EmployeeWithDepartment[]>({
    queryKey: ["/api/employees"],
  });
  const [location] = useLocation();
  const params = useMemo(() => new URLSearchParams(location.split('?')[1] || ''), [location]);
  const statusFilterParam = params.get('status')?.toLowerCase() || defaultStatus?.toLowerCase();

  const {
    data: departments,
    error: departmentsError,
    refetch: refetchDepartments,
  } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const {
    data: companies,
    error: companiesError,
    refetch: refetchCompanies,
  } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const terminateEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await apiPost(`/api/employees/${employeeId}/terminate`, {});
      if (!res.ok) throw res;
      return employeeId;
    },
    onSuccess: (_, employeeId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Success",
        description: "Employee terminated successfully",
      });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to terminate employee");
    },
  });

  const addEmployeeMutation = useMutation({
    mutationFn: async (employee: InsertEmployee) => {
      const res = await apiPost("/api/employees", employee);
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/employees", data.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsAddDialogOpen(false);
      toast({
        title: "Success",
        description: "Employee added successfully",
      });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to add employee");
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, employee }: { id: string; employee: Partial<InsertEmployee> }) => {
      const res = await apiPut(`/api/employees/${id}`, employee);
      if (!res.ok) throw res;
      return id;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsEditDialogOpen(false);
      setEditingEmployee(null);
      toast({
        title: "Success",
        description: "Employee updated successfully",
      });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to update employee");
    },
  });

  if (employeesError || departmentsError || companiesError) {
    return (
      <div>
        <p>{t('errors.general')}</p>
        <Button
          onClick={() => {
            refetchEmployees();
            refetchDepartments();
            refetchCompanies();
          }}
        >
          {t('actions.save')}
        </Button>
      </div>
    );
  }

  // Filter employees based on search query and department
  const filteredEmployees = employees?.filter((employee) => {
    const matchesSearch = searchQuery === "" || 
      `${employee.firstName} ${employee.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.position.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDepartment = departmentFilter === "" || departmentFilter === "all" || employee.departmentId === departmentFilter;
    const matchesStatus = statusFilterParam && statusFilterParam !== "all"
      ? (employee.status || '').toLowerCase() === statusFilterParam
      : true;
    
    return matchesSearch && matchesDepartment && matchesStatus;
  }) || [];

  const handleDeleteEmployee = (employeeId: string) => {
    setEmployeeToTerminate(employeeId);
    setIsConfirmOpen(true);
  };

  const confirmDeleteEmployee = () => {
    if (employeeToTerminate) {
      terminateEmployeeMutation.mutate(employeeToTerminate);
    }
    setIsConfirmOpen(false);
    setEmployeeToTerminate(null);
  };

  const handleConfirmOpenChange = (open: boolean) => {
    setIsConfirmOpen(open);
    if (!open) {
      setEmployeeToTerminate(null);
    }
  };

  const handleAddEmployee = (employee: InsertEmployee) => {
    addEmployeeMutation.mutate(employee);
  };

  const handleEditEmployee = (employee: EmployeeWithDepartment) => {
    setEditingEmployee(employee);
    setIsEditDialogOpen(true);
  };

  const handleUpdateEmployee = (employee: InsertEmployee) => {
    if (editingEmployee) {
      const { employeeCode, ...updates } = employee;
      updateEmployeeMutation.mutate({
        id: editingEmployee.id,
        employee: updates,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('nav.employees')}</h1>
        <p className="text-muted-foreground">{t('employeesPage.subtitle', 'Manage your team members and their information')}</p>
      </div>

      <div className="rounded-lg shadow-sm border border-gray-200 bg-card text-card-foreground">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <h3 className="text-lg font-medium text-gray-900">{t('employeesPage.directoryTitle', 'Employee Directory')}</h3>
            
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
              <div className="relative">
                <Input
                  type="text"
                  placeholder={t('employeesPage.searchPlaceholder', 'Search employees...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 pl-10"
                />
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              </div>
              
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder={t('employeesPage.allDepartments', 'All Departments')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('employeesPage.allDepartments', 'All Departments')}</SelectItem>
                  {departments?.filter(dept => dept.id && dept.id.trim() !== "").map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-white hover:bg-blue-700">
                    <Plus className="mr-2" size={16} />
                    {t('employeesPage.addEmployee', 'Add Employee')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t('employeesPage.addEmployee', 'Add New Employee')}</DialogTitle>
                  </DialogHeader>
                  <EmployeeForm
                    departments={departments || []}
                    companies={companies || []}
                    onSubmit={handleAddEmployee}
                    isSubmitting={addEmployeeMutation.isPending}
                  />
                </DialogContent>
                </Dialog>
              <EmployeeImport />
            </div>
          </div>
        </div>
        
        <EmployeeTable
          employees={filteredEmployees}
          isLoading={employeesLoading}
          onTerminateEmployee={handleDeleteEmployee}
          onEditEmployee={handleEditEmployee}
          isMutating={terminateEmployeeMutation.isPending}
          initialStatusFilter={statusFilterParam || undefined}
        />

        {/* Edit Employee Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('actions.edit')} {t('nav.employees')}</DialogTitle>
            </DialogHeader>
              {editingEmployee && (() => {
                const { department, company, ...rest } = editingEmployee;
                const cleaned: any = { ...rest };
                for (const key in cleaned) {
                  if (cleaned[key] === null) cleaned[key] = undefined;
                }
                const initialData: Partial<InsertEmployee> = {
                  ...cleaned,
                  salary: Number(editingEmployee.salary),
                  additions: editingEmployee.additions
                    ? Number(editingEmployee.additions)
                    : undefined,
                };
                return (
                  <EmployeeForm
                    key={editingEmployee.id}
                    departments={departments || []}
                    companies={companies || []}
                    onSubmit={handleUpdateEmployee}
                    isSubmitting={updateEmployeeMutation.isPending}
                    initialData={initialData}
                    employeeId={editingEmployee.id}
                  />
                );
              })()}
              {editingEmployee && (
                <div className="flex justify-end mt-4">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      
                    const employeeFullName = [editingEmployee.firstName, editingEmployee.lastName].filter(Boolean).join(' ').trim() || editingEmployee.employeeCode || editingEmployee.id;
                    const phoneText = editingEmployee.phone?.trim() || 'N/A';
                    const doc = buildBilingualActionReceipt({
                      titleEn: 'Employee Update',
                      titleAr: 'Employee Update',
                      subheadingEn: employeeFullName,
                      subheadingAr: employeeFullName,
                      bodyEn: `This document confirms that ${employeeFullName} (Phone: ${phoneText}) has updated employment records.`,
                      bodyAr: `This document confirms that ${employeeFullName} (Phone: ${phoneText}) has updated employment records.`,
                      detailsEn: [
                        `Position: ${editingEmployee.position || 'N/A'}`,
                        `Department: ${editingEmployee.department?.name || 'N/A'}`,
                      ],
                      detailsAr: [
                        `Position: ${editingEmployee.position || 'N/A'}`,
                        `Department: ${editingEmployee.department?.name || 'N/A'}`,
                      ],
                      employee: {
                        id: editingEmployee.id,
                        firstName: editingEmployee.firstName || employeeFullName,
                        lastName: editingEmployee.lastName || '',
                        position: editingEmployee.position || null,
                        phone: editingEmployee.phone || null,
                        employeeCode: editingEmployee.employeeCode || null,
                        profileImage: editingEmployee.profileImage || null,
                      },
                    });
                    const pdfDataUrl = await buildAndEncodePdf(doc);
                    await apiPost(`/api/employees/${editingEmployee.id}/documents`, { title: 'Employee Update', description: 'Employee update receipt', pdfDataUrl });
                    }}
                  >
                    {t('employeesPage.saveUpdateDoc', 'Save Update Document')}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        <ConfirmDialog
          open={isConfirmOpen}
          onOpenChange={handleConfirmOpenChange}
          title={t('employeesPage.terminateEmployee', 'Terminate Employee')}
          description={t('employeesPage.terminateDesc', 'Are you sure you want to terminate this employee?')}
          confirmText={t('actions.delete', 'Terminate')}
          onConfirm={confirmDeleteEmployee}
        />
      </div>
    </div>
  );
}



