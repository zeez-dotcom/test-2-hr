import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";

import EmployeeTable from "@/components/employees/employee-table";
import EmployeeForm from "@/components/employees/employee-form";
import EmployeeImport from "@/components/employees/employee-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiGet, apiPost, apiPut } from "@/lib/http";
import { buildBilingualActionReceipt, buildAndEncodePdf } from "@/lib/pdf";
import { useToast } from "@/hooks/use-toast";
import { toastApiError } from "@/lib/toastError";
import type {
  EmployeeWithDepartment,
  Department,
  InsertEmployee,
  Company,
  EmployeeWorkflowWithSteps,
  EmployeeWorkflowStep,
  AssetWithAssignment,
  AssetAssignmentWithDetails,
  LoanWithEmployee,
} from "@shared/schema";
import { useLocation } from "wouter";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface EmployeesProps {
  defaultStatus?: string;
}

type WorkflowType = "onboarding" | "offboarding";

interface StepFormState {
  title?: string;
  description?: string;
  pdfDataUrl?: string;
  assetId?: string;
  assignedDate?: string;
  notes?: string;
  assignmentId?: string;
  loanId?: string;
  settlementAmount?: string;
}

const workflowTypeLabels: Record<WorkflowType, string> = {
  onboarding: "Onboarding",
  offboarding: "Offboarding",
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export default function Employees({ defaultStatus = "active" }: EmployeesProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeWithDepartment | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [employeeToTerminate, setEmployeeToTerminate] = useState<string | null>(null);
  const [isWorkflowDialogOpen, setIsWorkflowDialogOpen] = useState(false);
  const [workflowEmployee, setWorkflowEmployee] = useState<EmployeeWithDepartment | null>(null);
  const [workflowType, setWorkflowType] = useState<WorkflowType>("onboarding");
  const [workflowData, setWorkflowData] = useState<EmployeeWorkflowWithSteps | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowActionLoading, setWorkflowActionLoading] = useState(false);
  const [stepForms, setStepForms] = useState<Record<string, StepFormState>>({});
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

  const { data: assets } = useQuery<AssetWithAssignment[]>({
    queryKey: ["/api/assets"],
    enabled: isWorkflowDialogOpen,
    staleTime: 30_000,
  });

  const { data: assetAssignmentsData } = useQuery<AssetAssignmentWithDetails[]>({
    queryKey: ["/api/asset-assignments"],
    enabled: isWorkflowDialogOpen,
    staleTime: 15_000,
  });

  const { data: loansData } = useQuery<LoanWithEmployee[]>({
    queryKey: ["/api/loans"],
    enabled: isWorkflowDialogOpen,
    staleTime: 15_000,
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

  const availableAssetsForWorkflow = useMemo(() => {
    if (!assets) return [] as AssetWithAssignment[];
    return assets.filter(asset => (asset.status || "").toLowerCase() === "available");
  }, [assets]);

  const workflowAssignments = useMemo(() => {
    if (!assetAssignmentsData || !workflowEmployee) return [] as AssetAssignmentWithDetails[];
    return assetAssignmentsData.filter(assignment => {
      const belongsToEmployee = assignment.employeeId === workflowEmployee.id;
      const status = (assignment.status || "").toLowerCase();
      return belongsToEmployee && status !== "completed";
    });
  }, [assetAssignmentsData, workflowEmployee]);

  const workflowLoans = useMemo(() => {
    if (!loansData || !workflowEmployee) return [] as LoanWithEmployee[];
    return loansData.filter(loan => {
      const belongsToEmployee = loan.employeeId === workflowEmployee.id;
      const status = (loan.status || "").toLowerCase();
      return belongsToEmployee && status !== "completed" && status !== "cancelled";
    });
  }, [loansData, workflowEmployee]);

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

  const resetWorkflowState = () => {
    setWorkflowData(null);
    setStepForms({});
    setWorkflowLoading(false);
    setWorkflowActionLoading(false);
  };

  const loadWorkflow = async (employeeId: string, type: WorkflowType) => {
    setWorkflowLoading(true);
    try {
      const res = await apiGet(`/api/employees/${employeeId}/workflows/${type}`);
      if (res.ok) {
        setWorkflowData(res.data as EmployeeWorkflowWithSteps);
      } else if (res.status === 404) {
        setWorkflowData(null);
      } else {
        toastApiError(res, "Failed to load workflow");
      }
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleWorkflowDialogChange = (open: boolean) => {
    setIsWorkflowDialogOpen(open);
    if (!open) {
      setWorkflowEmployee(null);
      resetWorkflowState();
    }
  };

  const handleOpenWorkflow = (employee: EmployeeWithDepartment) => {
    const normalizedStatus = employee.status?.toLowerCase() ?? "";
    const defaultType: WorkflowType = normalizedStatus === "terminated" ? "offboarding" : "onboarding";
    setWorkflowEmployee(employee);
    setWorkflowType(defaultType);
    resetWorkflowState();
    setIsWorkflowDialogOpen(true);
    void loadWorkflow(employee.id, defaultType);
  };

  const updateStepFormState = (stepId: string, updates: Partial<StepFormState>) => {
    setStepForms(prev => ({
      ...prev,
      [stepId]: {
        ...(prev[stepId] ?? {}),
        ...updates,
      },
    }));
  };

  const handleWorkflowTypeSelect = (value: WorkflowType) => {
    setWorkflowType(value);
    if (workflowEmployee) {
      resetWorkflowState();
      void loadWorkflow(workflowEmployee.id, value);
    }
  };

  const handleStartWorkflow = async () => {
    if (!workflowEmployee) return;
    setWorkflowActionLoading(true);
    try {
      const res = await apiPost(
        `/api/employees/${workflowEmployee.id}/workflows/${workflowType}/start`,
        {},
      );
      if (res.ok) {
        setWorkflowData(res.data as EmployeeWorkflowWithSteps);
        toast({
          title: "Workflow started",
          description: `${workflowTypeLabels[workflowType]} workflow initiated.`,
        });
      } else {
        toastApiError(res, "Failed to start workflow");
      }
    } finally {
      setWorkflowActionLoading(false);
    }
  };

  const handleProgressStep = async (step: EmployeeWorkflowStep) => {
    if (!workflowEmployee) return;
    const form = stepForms[step.id] ?? {};
    const payload: Record<string, any> = { status: "completed" };
    if (form.notes) {
      payload.notes = form.notes;
    }

    const missing = (message: string) => {
      toast({
        title: "Incomplete step",
        description: message,
        variant: "destructive",
      });
    };

    if (step.stepType === "document" || step.stepKey === "collect_documents") {
      const title = form.title?.trim() || step.title;
      if (!form.pdfDataUrl) {
        missing("Please attach a document before completing this step.");
        return;
      }
      payload.document = {
        title,
        description: form.description,
        pdfDataUrl: form.pdfDataUrl,
      };
    } else if (step.stepKey === "assign_assets") {
      if (!form.assetId) {
        missing("Select an asset to assign to the employee.");
        return;
      }
      payload.assetAssignment = {
        assetId: form.assetId,
        assignedDate: form.assignedDate,
        notes: form.notes,
      };
    } else if (step.stepKey === "collect_assets") {
      if (!form.assignmentId) {
        missing("Select which asset assignment was returned.");
        return;
      }
      payload.assetReturn = {
        assignmentId: form.assignmentId,
      };
    } else if (step.stepKey === "settle_loans") {
      if (!form.loanId) {
        missing("Select which loan was settled.");
        return;
      }
      payload.loanSettlement = {
        loanId: form.loanId,
      };
      if (form.settlementAmount) {
        const numeric = Number(form.settlementAmount);
        if (Number.isNaN(numeric)) {
          missing("Settlement amount must be a valid number.");
          return;
        }
        payload.loanSettlement.settlementAmount = numeric;
      }
    }

    setWorkflowActionLoading(true);
    try {
      const res = await apiPost(
        `/api/employees/${workflowEmployee.id}/workflows/${workflowType}/steps/${step.id}/progress`,
        payload,
      );
      if (res.ok) {
        setWorkflowData(res.data as EmployeeWorkflowWithSteps);
        toast({
          title: "Step completed",
          description: `${step.title} marked as complete.`,
        });
        setStepForms(prev => ({ ...prev, [step.id]: {} }));
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
        queryClient.invalidateQueries({ queryKey: ["/api/asset-assignments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      } else {
        toastApiError(res, "Failed to update workflow step");
      }
    } finally {
      setWorkflowActionLoading(false);
    }
  };

  const handleCompleteWorkflow = async () => {
    if (!workflowEmployee) return;
    setWorkflowActionLoading(true);
    try {
      const res = await apiPost(
        `/api/employees/${workflowEmployee.id}/workflows/${workflowType}/complete`,
        {},
      );
      if (res.ok) {
        setWorkflowData(res.data as EmployeeWorkflowWithSteps);
        toast({
          title: `${workflowTypeLabels[workflowType]} workflow completed`,
          description: "All tasks logged successfully.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      } else {
        toastApiError(res, "Failed to complete workflow");
      }
    } finally {
      setWorkflowActionLoading(false);
    }
  };

  const renderStepFields = (step: EmployeeWorkflowStep) => {
    const form = stepForms[step.id] ?? {};
    const sections: JSX.Element[] = [];

    if (step.stepType === "document" || step.stepKey === "collect_documents") {
      sections.push(
        <div className="space-y-2" key={`${step.id}-doc-title`}>
          <label className="text-sm font-medium" htmlFor={`workflow-${step.id}-title`}>
            Document title
          </label>
          <Input
            id={`workflow-${step.id}-title`}
            placeholder="Employment contract"
            value={form.title ?? ""}
            onChange={(event) => updateStepFormState(step.id, { title: event.target.value })}
          />
        </div>,
      );
      sections.push(
        <div className="space-y-2" key={`${step.id}-doc-description`}>
          <label className="text-sm font-medium" htmlFor={`workflow-${step.id}-description`}>
            Description
          </label>
          <Textarea
            id={`workflow-${step.id}-description`}
            rows={3}
            placeholder="Summary or control number"
            value={form.description ?? ""}
            onChange={(event) => updateStepFormState(step.id, { description: event.target.value })}
          />
        </div>,
      );
      sections.push(
        <div className="space-y-2" key={`${step.id}-doc-file`}>
          <label className="text-sm font-medium" htmlFor={`workflow-${step.id}-file`}>
            Upload document
          </label>
          <Input
            id={`workflow-${step.id}-file`}
            type="file"
            accept=".pdf,image/*"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const dataUrl = await readFileAsDataUrl(file);
                updateStepFormState(step.id, { pdfDataUrl: dataUrl });
                toast({
                  title: "Document attached",
                  description: `${file.name} ready to submit.`,
                });
              } catch (error) {
                toast({
                  title: "File error",
                  description: "Unable to read the selected file.",
                  variant: "destructive",
                });
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            {form.pdfDataUrl ? "Document attached." : "Accepted PDF or image files."}
          </p>
        </div>,
      );
    }

    if (step.stepKey === "assign_assets") {
      sections.push(
        <div className="space-y-2" key={`${step.id}-asset-select`}>
          <label className="text-sm font-medium">Asset</label>
          <Select
            value={form.assetId ?? ""}
            onValueChange={(value) => updateStepFormState(step.id, { assetId: value })}
          >
            <SelectTrigger aria-label="Asset selection">
              <SelectValue placeholder={availableAssetsForWorkflow.length ? "Select asset" : "No assets available"} />
            </SelectTrigger>
            <SelectContent>
              {availableAssetsForWorkflow.length ? (
                availableAssetsForWorkflow.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.name}
                    {asset.serialNumber ? ` (${asset.serialNumber})` : ""}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="" disabled>
                  No available assets
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>,
      );
      sections.push(
        <div className="space-y-2" key={`${step.id}-asset-date`}>
          <label className="text-sm font-medium" htmlFor={`workflow-${step.id}-date`}>
            Assignment date
          </label>
          <Input
            id={`workflow-${step.id}-date`}
            type="date"
            value={form.assignedDate ?? ""}
            onChange={(event) => updateStepFormState(step.id, { assignedDate: event.target.value })}
          />
        </div>,
      );
    }

    if (step.stepKey === "collect_assets") {
      sections.push(
        <div className="space-y-2" key={`${step.id}-assignment-select`}>
          <label className="text-sm font-medium">Assignment</label>
          <Select
            value={form.assignmentId ?? ""}
            onValueChange={(value) => updateStepFormState(step.id, { assignmentId: value })}
          >
            <SelectTrigger aria-label="Assignment selection">
              <SelectValue placeholder={workflowAssignments.length ? "Select assignment" : "No active assignments"} />
            </SelectTrigger>
            <SelectContent>
              {workflowAssignments.length ? (
                workflowAssignments.map((assignment) => (
                  <SelectItem key={assignment.id} value={assignment.id}>
                    {assignment.asset?.name ?? "Asset"} — {assignment.status}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="" disabled>
                  No active assignments
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>,
      );
    }

    if (step.stepKey === "settle_loans") {
      sections.push(
        <div className="space-y-2" key={`${step.id}-loan-select`}>
          <label className="text-sm font-medium">Outstanding loan</label>
          <Select
            value={form.loanId ?? ""}
            onValueChange={(value) => updateStepFormState(step.id, { loanId: value })}
          >
            <SelectTrigger aria-label="Loan selection">
              <SelectValue placeholder={workflowLoans.length ? "Select loan" : "No active loans"} />
            </SelectTrigger>
            <SelectContent>
              {workflowLoans.length ? (
                workflowLoans.map((loan) => (
                  <SelectItem key={loan.id} value={loan.id}>
                    {loan.reason ?? "Loan"} — Remaining {Number(loan.remainingAmount ?? 0).toLocaleString()}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="" disabled>
                  No active loans
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>,
      );
      sections.push(
        <div className="space-y-2" key={`${step.id}-loan-amount`}>
          <label className="text-sm font-medium" htmlFor={`workflow-${step.id}-settlement`}>
            Settlement amount (optional)
          </label>
          <Input
            id={`workflow-${step.id}-settlement`}
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.settlementAmount ?? ""}
            onChange={(event) => updateStepFormState(step.id, { settlementAmount: event.target.value })}
          />
        </div>,
      );
    }

    sections.push(
      <div className="space-y-2" key={`${step.id}-notes`}>
        <label className="text-sm font-medium" htmlFor={`workflow-${step.id}-notes`}>
          Notes
        </label>
        <Textarea
          id={`workflow-${step.id}-notes`}
          rows={2}
          placeholder="Optional internal notes"
          value={form.notes ?? ""}
          onChange={(event) => updateStepFormState(step.id, { notes: event.target.value })}
        />
      </div>,
    );

    return <div className="space-y-4">{sections}</div>;
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
          onManageWorkflow={handleOpenWorkflow}
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
        <Dialog open={isWorkflowDialogOpen} onOpenChange={handleWorkflowDialogChange}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {workflowEmployee
                  ? `${workflowTypeLabels[workflowType]} workflow • ${[
                      workflowEmployee.firstName,
                      workflowEmployee.lastName,
                    ]
                      .filter(Boolean)
                      .join(" ") || workflowEmployee.employeeCode || workflowEmployee.id}`
                  : "Employee workflow"}
              </DialogTitle>
            </DialogHeader>
            {workflowEmployee ? (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Select
                    value={workflowType}
                    onValueChange={(value) => handleWorkflowTypeSelect(value as WorkflowType)}
                  >
                    <SelectTrigger className="sm:w-56" aria-label="Select workflow">
                      <SelectValue placeholder="Select workflow" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="onboarding">Onboarding</SelectItem>
                      <SelectItem value="offboarding">Offboarding</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={handleStartWorkflow}
                    disabled={
                      workflowActionLoading ||
                      workflowLoading ||
                      (workflowData && workflowData.status !== "completed")
                    }
                  >
                    {workflowData && workflowData.status === "completed"
                      ? `Restart ${workflowTypeLabels[workflowType].toLowerCase()} workflow`
                      : `Start ${workflowTypeLabels[workflowType].toLowerCase()} workflow`}
                  </Button>
                </div>
                {workflowData ? (
                  <Badge
                    variant={
                      workflowData.status === "completed"
                        ? "secondary"
                        : workflowData.status === "in_progress"
                        ? "default"
                        : "outline"
                    }
                  >
                    {workflowData.status.replace(/_/g, " ")}
                  </Badge>
                ) : null}
                {workflowLoading ? (
                  <p className="text-sm text-muted-foreground">Loading workflow…</p>
                ) : workflowData ? (
                  <>
                    <div className="space-y-4">
                      {workflowData.steps.map((step) => {
                        const status = step.status || "pending";
                        const normalized = status.replace(/_/g, " ");
                        const isCompleted = status === "completed";
                        return (
                          <div key={step.id} className="space-y-4 rounded-lg border p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="text-sm font-semibold">{step.title}</h3>
                                <p className="text-sm text-muted-foreground">{step.description}</p>
                              </div>
                              <Badge
                                variant={
                                  isCompleted
                                    ? "secondary"
                                    : status === "in_progress"
                                    ? "default"
                                    : "outline"
                                }
                              >
                                {normalized}
                              </Badge>
                            </div>
                            {renderStepFields(step)}
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleProgressStep(step)}
                                disabled={workflowActionLoading || isCompleted}
                              >
                                {isCompleted ? "Completed" : "Mark complete"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={handleCompleteWorkflow}
                        disabled={
                          workflowActionLoading ||
                          workflowData.status === "completed" ||
                          !workflowData.steps.every((step) => step.status === "completed")
                        }
                      >
                        {workflowData.status === "completed"
                          ? "Workflow complete"
                          : `Complete ${workflowTypeLabels[workflowType].toLowerCase()} workflow`}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    <p>
                      No active {workflowTypeLabels[workflowType].toLowerCase()} workflow yet. Start one to
                      track required steps.
                    </p>
                    <Button
                      onClick={handleStartWorkflow}
                      disabled={workflowActionLoading || workflowLoading}
                    >
                      Start {workflowTypeLabels[workflowType].toLowerCase()} workflow
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
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



