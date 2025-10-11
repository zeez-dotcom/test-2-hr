import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";

import EmployeeTable from "@/components/employees/employee-table";
import EmployeeForm from "@/components/employees/employee-form";
import EmployeeImport from "@/components/employees/employee-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  EmployeeCustomValueMap,
  EmployeeWorkflowWithSteps,
} from "@shared/schema";
import { useLocation } from "wouter";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface EmployeesProps {
  defaultStatus?: string;
}

type EmployeeMutationPayload = InsertEmployee & {
  customFieldValues?: EmployeeCustomValueMap;
};

type EmployeeMutationUpdatePayload = Partial<InsertEmployee> & {
  customFieldValues?: EmployeeCustomValueMap;
};

type WorkflowType = "onboarding" | "offboarding";

interface WorkflowDialogState {
  employee: EmployeeWithDepartment;
  type: WorkflowType;
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
  const [workflowState, setWorkflowState] = useState<WorkflowDialogState | null>(null);
  const [documentValues, setDocumentValues] = useState<Record<string, Record<string, string>>>({});
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
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

  const workflowQueryKey = workflowState
    ? [
        "/api/employees",
        workflowState.employee.id,
        "workflow",
        workflowState.type,
      ]
    : null;

  const {
    data: activeWorkflow,
    isLoading: workflowLoading,
    error: workflowError,
  } = useQuery<EmployeeWorkflowWithSteps | null>({
    queryKey: workflowQueryKey ?? ["/api/employees", "workflow", "idle"],
    enabled: Boolean(workflowState),
    queryFn: async () => {
      if (!workflowState) return null;
      const res = await apiGet(
        `/api/employees/${workflowState.employee.id}/workflows?type=${workflowState.type}`,
      );
      if (!res.ok) {
        throw res;
      }
      const body = res.data as {
        workflows?: EmployeeWorkflowWithSteps[];
        activeWorkflow?: EmployeeWorkflowWithSteps | null;
      };
      return body?.activeWorkflow ?? (body?.workflows?.[0] ?? null);
    },
  });

  useEffect(() => {
    if (!activeWorkflow) {
      setDocumentValues({});
      setTaskNotes({});
      return;
    }
    setDocumentValues({});
    setTaskNotes({});
  }, [activeWorkflow?.id]);

  const startWorkflowMutation = useMutation({
    mutationFn: async ({ employeeId, type }: { employeeId: string; type: WorkflowType }) => {
      const res = await apiPost(`/api/employees/${employeeId}/workflows/${type}/start`, {});
      if (!res.ok) {
        throw res;
      }
      return res.data.workflow as EmployeeWorkflowWithSteps;
    },
    onSuccess: (workflow, variables) => {
      queryClient.setQueryData(
        ["/api/employees", variables.employeeId, "workflow", variables.type],
        workflow,
      );
      toast({
        title: "Workflow started",
        description:
          variables.type === "offboarding"
            ? "Offboarding workflow created."
            : "Onboarding workflow created.",
      });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to start workflow");
      setWorkflowState(null);
    },
  });

  const progressWorkflowMutation = useMutation({
    mutationFn: async ({
      employeeId,
      workflowId,
      stepId,
      payload,
      type,
    }: {
      employeeId: string;
      workflowId: string;
      stepId: string;
      payload?: Record<string, unknown>;
      type: WorkflowType;
    }) => {
      const res = await apiPost(
        `/api/employees/${employeeId}/workflows/${workflowId}/steps/${stepId}/progress`,
        {
          status: "completed",
          ...(payload ? { payload } : {}),
        },
      );
      if (!res.ok) {
        throw res;
      }
      return res.data.workflow as EmployeeWorkflowWithSteps;
    },
    onSuccess: (workflow, variables) => {
      queryClient.setQueryData(
        ["/api/employees", variables.employeeId, "workflow", variables.type],
        workflow,
      );
      toast({
        title: "Step updated",
        description: "Workflow step completed.",
      });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to update workflow step");
    },
  });

  const completeWorkflowMutation = useMutation({
    mutationFn: async ({
      employeeId,
      workflowId,
      type,
    }: {
      employeeId: string;
      workflowId: string;
      type: WorkflowType;
    }) => {
      const res = await apiPost(
        `/api/employees/${employeeId}/workflows/${workflowId}/complete`,
        {},
      );
      if (!res.ok) {
        throw res;
      }
      return res.data.workflow as EmployeeWorkflowWithSteps;
    },
    onSuccess: (workflow, variables) => {
      queryClient.setQueryData(
        ["/api/employees", variables.employeeId, "workflow", variables.type],
        workflow,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({
        title: "Workflow completed",
        description:
          variables.type === "offboarding"
            ? "Offboarding workflow completed."
            : "Onboarding workflow completed.",
      });
      setWorkflowState(null);
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to complete workflow");
    },
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
    mutationFn: async (employee: EmployeeMutationPayload) => {
      const res = await apiPost("/api/employees", employee);
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/employees", data.id] });
        queryClient.invalidateQueries({ queryKey: ["/api/employees", data.id, "custom-fields"] });
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
    mutationFn: async ({ id, employee }: { id: string; employee: EmployeeMutationUpdatePayload }) => {
      const res = await apiPut(`/api/employees/${id}`, employee);
      if (!res.ok) throw res;
      return id;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", id, "custom-fields"] });
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

  const allWorkflowStepsCompleted = useMemo(
    () =>
      activeWorkflow?.steps?.every(
        (step) => step.status === "completed" || step.status === "skipped",
      ) ?? false,
    [activeWorkflow?.steps],
  );

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

  const handleAddEmployee = (employee: EmployeeMutationPayload) => {
    addEmployeeMutation.mutate(employee);
  };

  const handleStartWorkflow = useCallback(
    (employee: EmployeeWithDepartment, type: WorkflowType) => {
      setWorkflowState({ employee, type });
      startWorkflowMutation.mutate({ employeeId: employee.id, type });
    },
    [startWorkflowMutation],
  );

  const handleDocumentValueChange = useCallback((stepId: string, field: string, value: string) => {
    setDocumentValues(prev => ({
      ...prev,
      [stepId]: { ...(prev[stepId] ?? {}), [field]: value },
    }));
  }, []);

  const handleTaskNoteChange = useCallback((stepId: string, value: string) => {
    setTaskNotes(prev => ({
      ...prev,
      [stepId]: value,
    }));
  }, []);

  const formatWorkflowDate = useCallback((value: string | Date | null | undefined) => {
    if (!value) return "";
    const date = typeof value === "string" ? new Date(value) : value;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleDateString();
  }, []);

  const handleCompleteStep = useCallback(
    (stepId: string, payload?: Record<string, unknown>) => {
      if (!workflowState || !activeWorkflow) return;
      progressWorkflowMutation.mutate({
        employeeId: workflowState.employee.id,
        workflowId: activeWorkflow.id,
        stepId,
        payload,
        type: workflowState.type,
      });
    },
    [workflowState, activeWorkflow, progressWorkflowMutation],
  );

  const handleCompleteWorkflow = useCallback(() => {
    if (!workflowState || !activeWorkflow) return;
    completeWorkflowMutation.mutate({
      employeeId: workflowState.employee.id,
      workflowId: activeWorkflow.id,
      type: workflowState.type,
    });
  }, [workflowState, activeWorkflow, completeWorkflowMutation]);

  const handleEditEmployee = (employee: EmployeeWithDepartment) => {
    setEditingEmployee(employee);
    setIsEditDialogOpen(true);
  };

  const handleUpdateEmployee = (employee: EmployeeMutationPayload) => {
    if (editingEmployee) {
      const { employeeCode, ...updates } = employee;
      updateEmployeeMutation.mutate({
        id: editingEmployee.id,
        employee: updates as EmployeeMutationUpdatePayload,
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
          onStartWorkflow={handleStartWorkflow}
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
        <Dialog
          open={Boolean(workflowState)}
          onOpenChange={(open) => {
            if (!open) {
              setWorkflowState(null);
            }
          }}
        >
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {workflowState
                  ? `${workflowState.type === "offboarding" ? "Offboarding" : "Onboarding"} workflow · ${[
                      workflowState.employee.firstName,
                      workflowState.employee.lastName,
                    ]
                      .filter(Boolean)
                      .join(" ") || workflowState.employee.employeeCode || workflowState.employee.id}`
                  : "Employee workflow"}
              </DialogTitle>
            </DialogHeader>
            {workflowError ? (
              <p className="text-sm text-destructive">Failed to load workflow.</p>
            ) : workflowLoading && !activeWorkflow ? (
              <p className="text-sm text-muted-foreground">Preparing workflow…</p>
            ) : activeWorkflow ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="uppercase tracking-wide">
                      {activeWorkflow.status}
                    </Badge>
                    {activeWorkflow.startedAt && (
                      <span className="text-sm text-muted-foreground">
                        Started {formatWorkflowDate(activeWorkflow.startedAt)}
                      </span>
                    )}
                  </div>
                  {activeWorkflow.completedAt && (
                    <span className="text-sm text-muted-foreground">
                      Completed {formatWorkflowDate(activeWorkflow.completedAt)}
                    </span>
                  )}
                </div>
                <div className="space-y-4">
                  {activeWorkflow.steps.map((step) => {
                    const isCompleted = step.status === "completed";
                    const isSkipped = step.status === "skipped";
                    const disableActions =
                      isCompleted ||
                      isSkipped ||
                      progressWorkflowMutation.isPending ||
                      completeWorkflowMutation.isPending;
                    const requiredFields = Array.isArray((step.metadata as any)?.requiredFields)
                      ? ((step.metadata as any).requiredFields as string[])
                      : [];
                    const result = (step.metadata as any)?.result as
                      | Record<string, unknown>
                      | undefined;
                    const stepDocuments = documentValues[step.id] ?? {};
                    const noteValue = taskNotes[step.id] ?? "";

                    return (
                      <div key={step.id} className="rounded-lg border bg-background p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                            {step.description && (
                              <p className="text-sm text-muted-foreground">{step.description}</p>
                            )}
                          </div>
                          <Badge variant={isCompleted ? "default" : isSkipped ? "secondary" : "outline"}>
                            {step.status.replace("_", " ")}
                          </Badge>
                        </div>
                        {step.dueDate && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Due {formatWorkflowDate(step.dueDate)}
                          </p>
                        )}

                        {step.stepType === "document" && (
                          <div className="mt-4 space-y-3">
                            {requiredFields.length > 0 ? (
                              requiredFields.map((field) => (
                                <div key={field} className="space-y-1">
                                  <label
                                    htmlFor={`${step.id}-${field}`}
                                    className="text-sm font-medium text-foreground"
                                  >
                                    {field}
                                  </label>
                                  <Input
                                    id={`${step.id}-${field}`}
                                    placeholder={`Enter document value for ${field}`}
                                    value={stepDocuments[field] ?? ""}
                                    onChange={(event) =>
                                      handleDocumentValueChange(step.id, field, event.target.value)
                                    }
                                    disabled={disableActions}
                                  />
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No documents required for this step.
                              </p>
                            )}
                            <Button
                              onClick={() => {
                                const documentsPayload = documentValues[step.id] ?? {};
                                const missing = requiredFields.filter((field) =>
                                  !(documentsPayload[field] ?? "").toString().trim(),
                                );
                                if (missing.length) {
                                  toast({
                                    title: "Missing documents",
                                    description: `Provide values for: ${missing.join(", ")}.`,
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                handleCompleteStep(step.id, { documents: documentsPayload });
                              }}
                              disabled={disableActions}
                            >
                              {isCompleted ? "Documents recorded" : "Upload documents"}
                            </Button>
                          </div>
                        )}

                        {step.stepType === "task" && (
                          <div className="mt-4 space-y-3">
                            <div className="space-y-1">
                              <label
                                htmlFor={`${step.id}-notes`}
                                className="text-sm font-medium text-foreground"
                              >
                                Notes
                              </label>
                              <Textarea
                                id={`${step.id}-notes`}
                                value={noteValue}
                                onChange={(event) => handleTaskNoteChange(step.id, event.target.value)}
                                placeholder="Add any notes for this task"
                                disabled={disableActions}
                                rows={3}
                              />
                            </div>
                            <Button
                              onClick={() =>
                                handleCompleteStep(step.id, noteValue ? { notes: noteValue } : undefined)
                              }
                              disabled={disableActions}
                            >
                              {isCompleted ? "Task completed" : "Mark task complete"}
                            </Button>
                          </div>
                        )}

                        {step.stepType === "asset" && (
                          <div className="mt-4">
                            <Button onClick={() => handleCompleteStep(step.id)} disabled={disableActions}>
                              {isCompleted ? "Asset step completed" : "Complete asset step"}
                            </Button>
                          </div>
                        )}

                        {(step.stepType === "loan" || step.stepType === "vacation") && (
                          <div className="mt-4">
                            <Button onClick={() => handleCompleteStep(step.id)} disabled={disableActions}>
                              {isCompleted ? "Step completed" : "Run step"}
                            </Button>
                          </div>
                        )}

                        {result && Object.keys(result).length > 0 && (
                          <div className="mt-4 rounded-md bg-muted p-3 text-sm">
                            <p className="font-medium text-foreground">Last run summary</p>
                            <ul className="mt-2 space-y-1">
                              {Object.entries(result).map(([key, value]) => (
                                <li key={key} className="text-muted-foreground">
                                  <span className="font-medium text-foreground">{key}:</span>{" "}
                                  {Array.isArray(value)
                                    ? value.length
                                      ? value.join(", ")
                                      : "None"
                                    : typeof value === "object" && value !== null
                                      ? JSON.stringify(value)
                                      : String(value ?? "")}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {(step.completedAt || step.status === "completed") && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Completed {formatWorkflowDate(step.completedAt)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No workflow is currently active.</p>
            )}
            <DialogFooter className="mt-6 gap-2">
              <Button variant="outline" onClick={() => setWorkflowState(null)}>
                Close
              </Button>
              <Button
                onClick={handleCompleteWorkflow}
                disabled={
                  !activeWorkflow ||
                  !allWorkflowStepsCompleted ||
                  completeWorkflowMutation.isPending
                }
              >
                {completeWorkflowMutation.isPending ? "Completing..." : "Mark workflow complete"}
              </Button>
            </DialogFooter>
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



