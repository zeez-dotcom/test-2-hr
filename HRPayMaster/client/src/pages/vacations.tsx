import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Calendar, CalendarDays, Clock, CheckCircle, XCircle, Plus, Trash2 } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

import {
  type VacationRequestWithEmployee,
  type VacationApprovalStep,
  type VacationAuditLogEntry,
  type LeaveAccrualPolicy,
  type EmployeeLeavePolicy,
  type LeaveBalance,
} from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { apiPost, apiPut, apiDelete, apiGet } from "@/lib/http";
import { toastApiError } from "@/lib/toastError";

const vacationRequestSchema = z
  .object({
    employeeId: z.string().min(1),
    start: z.string(),
    end: z.string(),
    leaveType: z.enum(["vacation", "sick", "personal", "other"]),
    reason: z.string().optional(),
    pauseLoans: z.boolean().optional(),
    appliesPolicyId: z.string().optional(),
    autoPauseAllowances: z.boolean().optional(),
  })
  .refine(({ end, start }) => new Date(end) >= new Date(start), {
    message: "End date must be on or after start date",
    path: ["end"],
  });

const policySchema = z.object({
  name: z.string().min(1),
  leaveType: z.string().min(1),
  accrualRatePerMonth: z.coerce.number().nonnegative(),
  maxBalanceDays: z.coerce.number().nonnegative().optional(),
  carryoverLimitDays: z.coerce.number().nonnegative().optional(),
  allowNegativeBalance: z.boolean().optional(),
  effectiveFrom: z.string().min(1),
  expiresOn: z.string().optional(),
});

const policyAssignmentSchema = z.object({
  employeeId: z.string().min(1),
  policyId: z.string().min(1),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional(),
  customAccrualRatePerMonth: z.coerce.number().nonnegative().optional(),
});

const calcDays = (start: string, end: string) =>
  Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1;

const omitUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== "")) as T;

const NO_POLICY_SENTINEL = "__no_policy__";

export default function Vacations() {
  const { t, i18n } = useTranslation();
  const leaveTypeLabels = useMemo(
    () => ({
      vacation: t("vacationsPage.form.leaveTypes.vacation"),
      sick: t("vacationsPage.form.leaveTypes.sick"),
      personal: t("vacationsPage.form.leaveTypes.personal"),
      other: t("vacationsPage.form.leaveTypes.other"),
    }),
    [t],
  );
  const weekDays = useMemo(
    () => t("vacationsPage.calendar.weekDays", { returnObjects: true }) as string[],
    [t],
  );
  const locale = i18n.language || undefined;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const monthParam = params.get("month");
  const statusParam = params.get("status");

  const {
    data: vacationRequests = [],
    isLoading,
    error: vacationError,
  } = useQuery<VacationRequestWithEmployee[]>({ queryKey: ["/api/vacations"] });

  const { data: employees = [], error: employeesError } = useQuery<any[]>({
    queryKey: ["/api/employees"],
  });

  const { data: policyBundle, error: policyError } = useQuery<{
    policies: LeaveAccrualPolicy[];
    assignments: EmployeeLeavePolicy[];
    balances: LeaveBalance[];
  }>({
    queryKey: ["/api/vacations/policies"],
  });

  const { data: coverage } = useQuery<any>({
    queryKey: ["/api/vacations/coverage"],
    queryFn: async () => {
      const start = new Date().toISOString().split("T")[0];
      const end = new Date(Date.now() + 30 * 86_400_000).toISOString().split("T")[0];
      const res = await apiGet(`/api/vacations/coverage?startDate=${start}&endDate=${end}`);
      if (!res.ok) throw res;
      return res.data;
    },
  });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  const monthStartStr = monthStart.toISOString().split("T")[0];
  const monthEndStr = monthEnd.toISOString().split("T")[0];

  const { data: monthCoverage } = useQuery<any>({
    queryKey: ["/api/vacations/coverage", monthStartStr, monthEndStr],
    queryFn: async () => {
      const res = await apiGet(`/api/vacations/coverage?startDate=${monthStartStr}&endDate=${monthEndStr}`);
      if (!res.ok) throw res;
      return res.data;
    },
  });

  const { data: carAssignments = [] } = useQuery<any[]>({
    queryKey: ["/api/car-assignments"],
  });

  const policies = policyBundle?.policies ?? [];
  const policyAssignments = policyBundle?.assignments ?? [];
  const leaveBalances = policyBundle?.balances ?? [];

  const employeeMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const employee of employees ?? []) {
      if (employee?.id) {
        map.set(employee.id, employee);
      }
    }
    return map;
  }, [employees]);

  const policyMap = useMemo(() => {
    const map = new Map<string, LeaveAccrualPolicy>();
    for (const policy of policies) {
      map.set(policy.id, policy);
    }
    return map;
  }, [policies]);

  const filteredVacations = vacationRequests.filter(request => {
    const statusMatches = statusParam
      ? (request.status || "").toLowerCase() === statusParam.toLowerCase()
      : true;
    if (!monthParam) return statusMatches;
    const [year, month] = monthParam.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    const reqStart = new Date(request.startDate);
    const reqEnd = new Date(request.endDate);
    return statusMatches && reqStart <= end && reqEnd >= start;
  });

  const form = useForm<z.infer<typeof vacationRequestSchema>>({
    resolver: zodResolver(vacationRequestSchema),
    defaultValues: {
      employeeId: "",
      start: new Date().toISOString().split("T")[0],
      end: new Date().toISOString().split("T")[0],
      leaveType: "vacation",
      reason: "",
      pauseLoans: false,
      appliesPolicyId: NO_POLICY_SENTINEL,
      autoPauseAllowances: false,
    },
  });

  const policyForm = useForm<z.infer<typeof policySchema>>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      name: "",
      leaveType: "vacation",
      accrualRatePerMonth: 1,
      maxBalanceDays: undefined,
      carryoverLimitDays: undefined,
      allowNegativeBalance: false,
      effectiveFrom: new Date().toISOString().split("T")[0],
      expiresOn: "",
    },
  });

  const assignmentForm = useForm<z.infer<typeof policyAssignmentSchema>>({
    resolver: zodResolver(policyAssignmentSchema),
    defaultValues: {
      employeeId: "",
      policyId: "",
      effectiveFrom: new Date().toISOString().split("T")[0],
      effectiveTo: "",
      customAccrualRatePerMonth: undefined,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiPost("/api/vacations", payload);
      if (!res.ok) {
        toastApiError(res, t("vacationsPage.errors.submitRequest"));
        throw res;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations"] });
      setIsCreateDialogOpen(false);
      toast({ title: t("vacationsPage.toasts.requestSubmitted") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiPut(`/api/vacations/${id}`, data);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations"] });
      toast({ title: t("vacationsPage.toasts.requestUpdated") });
    },
    onError: err => toastApiError(err as any, t("vacationsPage.errors.updateRequest")),
  });

  const approvalMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiPut(`/api/vacations/${id}`, data);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations"] });
      toast({ title: t("vacationsPage.toasts.approvalUpdated") });
    },
    onError: err => toastApiError(err as any, t("vacationsPage.errors.processApproval")),
  });

  const markReturnedMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await apiPut(`/api/vacations/${id}`, { status: "completed" });
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations"] });
      toast({ title: t("vacationsPage.toasts.markedCompleted") });
    },
    onError: err => toastApiError(err as any, t("vacationsPage.errors.markCompleted")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/vacations/${id}`);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations"] });
      toast({ title: t("vacationsPage.toasts.requestDeleted") });
    },
    onError: err => toastApiError(err as any, t("vacationsPage.errors.deleteRequest")),
  });

  const createPolicyMutation = useMutation({
    mutationFn: async (values: z.infer<typeof policySchema>) => {
      const payload = omitUndefined({
        ...values,
        allowNegativeBalance: values.allowNegativeBalance ?? false,
        expiresOn: values.expiresOn || undefined,
        maxBalanceDays: values.maxBalanceDays ?? undefined,
        carryoverLimitDays: values.carryoverLimitDays ?? undefined,
      });
      const res = await apiPost("/api/vacations/policies", payload);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations/policies"] });
      toast({ title: t("vacationsPage.toasts.policySaved") });
      policyForm.reset({
        name: "",
        leaveType: "vacation",
        accrualRatePerMonth: 1,
        maxBalanceDays: undefined,
        carryoverLimitDays: undefined,
        allowNegativeBalance: false,
        effectiveFrom: new Date().toISOString().split("T")[0],
        expiresOn: "",
      });
    },
    onError: err => toastApiError(err as any, t("vacationsPage.errors.savePolicy")),
  });

  const assignPolicyMutation = useMutation({
    mutationFn: async (values: z.infer<typeof policyAssignmentSchema>) => {
      const res = await apiPost(`/api/vacations/policies/${values.policyId}/assignments`, omitUndefined({
        ...values,
        customAccrualRatePerMonth: values.customAccrualRatePerMonth ?? undefined,
        effectiveTo: values.effectiveTo || undefined,
      }));
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations/policies"] });
      toast({ title: t("vacationsPage.toasts.policyAssigned") });
      assignmentForm.reset({
        employeeId: "",
        policyId: "",
        effectiveFrom: new Date().toISOString().split("T")[0],
        effectiveTo: "",
        customAccrualRatePerMonth: undefined,
      });
    },
    onError: err => toastApiError(err as any, t("vacationsPage.errors.assignPolicy")),
  });

  const onSubmit = async (data: z.infer<typeof vacationRequestSchema>) => {
    const appliesPolicyId =
      data.appliesPolicyId === NO_POLICY_SENTINEL ? "" : data.appliesPolicyId;

    const payload = {
      employeeId: data.employeeId,
      startDate: data.start,
      endDate: data.end,
      days: calcDays(data.start, data.end),
      leaveType: data.leaveType,
      reason: `${data.reason || ""}${data.pauseLoans ? (data.reason ? " " : "") + "[pause-loans]" : ""}`,
      status: "pending",
      appliesPolicyId: appliesPolicyId || undefined,
      autoPauseAllowances: data.autoPauseAllowances ?? false,
    };

    const start = new Date(data.start);
    const end = new Date(data.end);
    const activeAssignment = (carAssignments as any[]).find(assignment =>
      assignment.employeeId === data.employeeId &&
      assignment.status === "active" &&
      new Date(assignment.assignedDate) <= end &&
      (!assignment.returnDate || new Date(assignment.returnDate) >= start),
    );

    if (activeAssignment) {
      const confirmEnd = window.confirm(t("vacationsPage.prompts.carAssignmentOverlap"));
      if (confirmEnd) {
        const dayBefore = new Date(start);
        dayBefore.setDate(dayBefore.getDate() - 1);
        await apiPut(`/api/car-assignments/${activeAssignment.id}`, {
          status: "completed",
          returnDate: dayBefore.toISOString().split("T")[0],
        });
        queryClient.invalidateQueries({ queryKey: ["/api/car-assignments"] });
      }
    }

    createMutation.mutate(payload);
  };

  const findBalanceForRequest = (request: VacationRequestWithEmployee) => {
    const year = new Date(request.startDate).getFullYear();
    return leaveBalances.find(
      balance =>
        balance.employeeId === request.employeeId &&
        balance.leaveType === request.leaveType &&
        Number(balance.year) === year,
    );
  };

  const handleApprovalAction = (
    request: VacationRequestWithEmployee,
    step: VacationApprovalStep,
    action: "approve" | "reject" | "delegate",
  ) => {
    const actingId = step.delegatedToId ?? step.approverId;
    if (!actingId) {
      toast({ title: t("vacationsPage.errors.approverMissing"), variant: "destructive" });
      return;
    }

    let delegateToId: string | undefined;
    if (action === "delegate") {
      delegateToId = window.prompt(t("vacationsPage.prompts.enterDelegate")) ?? undefined;
      if (!delegateToId) {
        return;
      }
    }

    const note = window.prompt(t("vacationsPage.prompts.approvalNote")) ?? undefined;
    approvalMutation.mutate({
      id: request.id!,
      data: omitUndefined({
        approvalAction: action,
        actingApproverId: actingId,
        delegateToId,
        approvalNote: note,
      }),
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" /> {t("vacationsPage.status.approved")}
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-blue-100 text-blue-800">
            <CheckCircle className="w-3 h-3 mr-1" /> {t("vacationsPage.status.completed")}
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" /> {t("vacationsPage.status.rejected")}
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" /> {t("vacationsPage.status.pending")}
          </Badge>
        );
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "sick":
        return <Calendar className="w-4 h-4" />;
      case "personal":
        return <CalendarDays className="w-4 h-4" />;
      default:
        return <Calendar className="w-4 h-4" />;
    }
  };

  if (vacationError || employeesError || policyError) {
    return <div className="p-4 text-destructive">{t("vacationsPage.errors.loadData")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("nav.vacations")}</h1>
          <p className="text-muted-foreground">{t("vacationsPage.header.subtitle")}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              {t("vacationsPage.actions.newRequest")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("vacationsPage.dialog.title")}</DialogTitle>
              <DialogDescription>{t("vacationsPage.dialog.description")}</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("docgen.employee")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("docgen.employee")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(employees as any[])
                            .filter(emp => emp.id)
                            .map(employee => (
                              <SelectItem key={employee.id} value={employee.id}>
                                {employee.firstName} {employee.lastName}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="start"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("vacationsPage.form.startDate")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="end"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("vacationsPage.form.endDate")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="leaveType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("vacationsPage.form.type")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("vacationsPage.form.typePlaceholder")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="vacation">{leaveTypeLabels.vacation}</SelectItem>
                          <SelectItem value="sick">{leaveTypeLabels.sick}</SelectItem>
                          <SelectItem value="personal">{leaveTypeLabels.personal}</SelectItem>
                          <SelectItem value="other">{leaveTypeLabels.other}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="appliesPolicyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("vacationsPage.form.accrualPolicy")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("vacationsPage.form.policyPlaceholder")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_POLICY_SENTINEL}>{t("vacationsPage.form.noPolicy")}</SelectItem>
                          {policies.map(policy => (
                            <SelectItem key={policy.id} value={policy.id}>
                              {policy.name} · {leaveTypeLabels[policy.leaveType as keyof typeof leaveTypeLabels] ?? policy.leaveType}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("vacationsPage.form.reasonOptional")}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t("vacationsPage.form.reasonPlaceholder")}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pauseLoans"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox checked={!!field.value} onCheckedChange={value => field.onChange(Boolean(value))} />
                      </FormControl>
                      <FormLabel className="!m-0">{t("vacationsPage.form.pauseLoans")}</FormLabel>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="autoPauseAllowances"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox checked={!!field.value} onCheckedChange={value => field.onChange(Boolean(value))} />
                      </FormControl>
                      <FormLabel className="!m-0">{t("vacationsPage.form.pauseAllowances")}</FormLabel>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? t("actions.save") : t("vacationsPage.actions.submitRequest")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("vacationsPage.balances.title")}</CardTitle>
            <CardDescription>{t("vacationsPage.balances.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {leaveBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("vacationsPage.balances.empty")}</p>
            ) : (
              <div className="space-y-2 text-sm">
                {leaveBalances.map(balance => {
                  const employee = employeeMap.get(balance.employeeId);
                  return (
                    <div
                      key={`${balance.employeeId}-${balance.leaveType}-${balance.year}`}
                      className="flex items-center justify-between rounded border p-2"
                    >
                      <div>
                        <div className="font-medium">
                          {employee?.firstName} {employee?.lastName}
                        </div>
                        <div className="text-muted-foreground">
                          {`${leaveTypeLabels[balance.leaveType as keyof typeof leaveTypeLabels] ?? balance.leaveType} · ${balance.year}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {t("vacationsPage.balances.daysLabel", {
                            value: Number(balance.balanceDays).toFixed(2),
                          })}
                        </div>
                        {balance.policyId && (
                          <div className="text-xs text-muted-foreground">
                            {t("vacationsPage.balances.policyLabel", {
                              name: policyMap.get(balance.policyId)?.name ?? balance.policyId,
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("vacationsPage.policies.title")}</CardTitle>
            <CardDescription>{t("vacationsPage.policies.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Form {...policyForm}>
              <form
                onSubmit={policyForm.handleSubmit(values => createPolicyMutation.mutate(values))}
                className="grid gap-3"
              >
                <FormField
                  control={policyForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("vacationsPage.policies.form.nameLabel")}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={t("vacationsPage.policies.form.namePlaceholder")} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={policyForm.control}
                    name="leaveType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("vacationsPage.policies.form.leaveTypeLabel")}</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder={t("vacationsPage.policies.form.leaveTypePlaceholder")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={policyForm.control}
                    name="accrualRatePerMonth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("vacationsPage.policies.form.accrualLabel")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={policyForm.control}
                    name="maxBalanceDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("vacationsPage.policies.form.maxBalanceLabel")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={policyForm.control}
                    name="carryoverLimitDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("vacationsPage.policies.form.carryoverLabel")}</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={policyForm.control}
                    name="effectiveFrom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("vacationsPage.policies.form.effectiveFromLabel")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={policyForm.control}
                    name="expiresOn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("vacationsPage.policies.form.expiresOnLabel")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={policyForm.control}
                  name="allowNegativeBalance"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox checked={!!field.value} onCheckedChange={value => field.onChange(Boolean(value))} />
                      </FormControl>
                      <FormLabel className="!m-0">{t("vacationsPage.policies.form.allowNegative")}</FormLabel>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={createPolicyMutation.isPending}>
                    {t("vacationsPage.policies.form.submit")}
                  </Button>
                </div>
              </form>
            </Form>

            <Form {...assignmentForm}>
              <form
                onSubmit={assignmentForm.handleSubmit(values => assignPolicyMutation.mutate(values))}
                className="grid gap-3"
              >
                <FormField
                  control={assignmentForm.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("vacationsPage.policies.assignment.employeeLabel")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("vacationsPage.policies.assignment.employeePlaceholder")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(employees as any[])
                            .filter(emp => emp.id)
                            .map(employee => (
                              <SelectItem key={employee.id} value={employee.id}>
                                {employee.firstName} {employee.lastName}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={assignmentForm.control}
                  name="policyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("vacationsPage.policies.assignment.policyLabel")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("vacationsPage.policies.assignment.policyPlaceholder")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {policies.map(policy => (
                            <SelectItem key={policy.id} value={policy.id}>
                              {policy.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={assignmentForm.control}
                    name="effectiveFrom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("vacationsPage.policies.assignment.effectiveFromLabel")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={assignmentForm.control}
                    name="effectiveTo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("vacationsPage.policies.assignment.effectiveToLabel")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={assignmentForm.control}
                  name="customAccrualRatePerMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("vacationsPage.policies.assignment.customAccrualLabel")}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={assignPolicyMutation.isPending}>
                    {t("vacationsPage.policies.assignment.submit")}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      {coverage && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold mb-2">{t("vacationsPage.coverage.title")}</h2>
            <p className="text-sm text-muted-foreground mb-3">
              {t("vacationsPage.coverage.description", { threshold: coverage.threshold })}
            </p>
            <div className="space-y-2 text-sm">
              {Object.entries(coverage.coverage).flatMap(([date, byDept]: any) =>
                Object.entries(byDept as any)
                  .filter(([, count]: any) => (count as number) >= coverage.threshold)
                  .map(([deptId, count]: any) => (
                    <div key={`${date}-${deptId}`} className="flex justify-between border rounded p-2">
                      <div>{new Date(date).toLocaleDateString(locale)}</div>
                      <div>
                        {t("vacationsPage.coverage.departmentLabel", {
                          department: coverage.departments?.[deptId] ?? deptId,
                        })}
                        <a
                          className="ml-2 text-blue-600 underline"
                          href={`/people?tab=departments&deptId=${encodeURIComponent(String(deptId))}`}
                        >
                          {t("vacationsPage.coverage.viewLink")}
                        </a>
                      </div>
                      <div className="font-medium">
                        {t("vacationsPage.coverage.onLeave", { count })}
                      </div>
                    </div>
                  )),
              )}
              {Object.entries(coverage.coverage).every(([_, byDept]: any) =>
                Object.values(byDept as any).every((count: any) => (count as number) < coverage.threshold),
              ) && <div className="text-muted-foreground">{t("vacationsPage.coverage.empty")}</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {monthCoverage && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold mb-2">
              {t("vacationsPage.calendar.monthCoverageTitle", {
                period: monthStart.toLocaleString(locale, { month: "long", year: "numeric" }),
              })}
            </h2>
            <div className="grid grid-cols-7 gap-2 text-center text-sm">
              {weekDays.map(day => (
                <div key={day} className="text-muted-foreground">
                  {day}
                </div>
              ))}
              {Array(monthStart.getDay())
                .fill(null)
                .map((_, index) => (
                  <div key={`empty-${index}`} />
                ))}
              {Array.from({ length: monthEnd.getDate() }, (_, index) => index + 1).map(day => {
                const dateStr = new Date(monthStart.getFullYear(), monthStart.getMonth(), day)
                  .toISOString()
                  .split("T")[0];
                const byDept = monthCoverage.coverage?.[dateStr] || {};
                const total = Object.values(byDept as Record<string, number>).reduce(
                  (sum, value) => sum + Number(value),
                  0,
                );
                const over = total >= monthCoverage.threshold;
                return (
                  <div
                    key={dateStr}
                    className={`border rounded p-2 h-20 flex flex-col items-center justify-between ${
                      over ? "bg-red-50 border-red-200" : "bg-card"
                    }`}
                  >
                    <div className="text-xs font-medium">{day}</div>
                    <div className={`text-xs ${over ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                      {t("vacationsPage.calendar.onLeave", { count: total })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVacations.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center space-y-2">
                <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-medium">{t("vacationsPage.empty.title")}</h3>
                <p className="text-muted-foreground">{t("vacationsPage.empty.description")}</p>
              </CardContent>
            </Card>
          ) : (
            filteredVacations.map(request => {
              const balance = findBalanceForRequest(request);
              const assignmentsForEmployee = policyAssignments.filter(
                assignment => assignment.employeeId === request.employeeId,
              );
              return (
                <Card key={request.id}>
                  <CardHeader className="pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center space-x-3">
                        {getTypeIcon(request.leaveType || "vacation")}
                        <div>
                          <CardTitle className="text-lg">
                            {request.employee?.firstName} {request.employee?.lastName}
                          </CardTitle>
                          <CardDescription>
                            {format(new Date(request.startDate), "MMM d")} – {format(new Date(request.endDate), "MMM d, yyyy")}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getStatusBadge(request.status)}
                        {request.status === "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markReturnedMutation.mutate({ id: request.id! })}
                            disabled={markReturnedMutation.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> {t("vacationsPage.requests.markCompleted")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(request.id!)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {request.reason && (
                      <p className="text-sm text-muted-foreground">{request.reason}</p>
                    )}

                    {request.policy && (
                      <div className="text-sm text-muted-foreground">
                        {t("vacationsPage.requests.policyDetail", {
                          name: request.policy.name,
                          type: leaveTypeLabels[request.policy.leaveType as keyof typeof leaveTypeLabels] ??
                            request.policy.leaveType,
                          rate: request.policy.accrualRatePerMonth,
                        })}
                      </div>
                    )}

                    {balance && (
                      <div className="text-sm">
                        <span className="font-medium">{t("vacationsPage.requests.currentBalance")}</span>{" "}
                        {t("vacationsPage.requests.daysLabel", {
                          value: Number(balance.balanceDays).toFixed(2),
                        })}
                      </div>
                    )}

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center space-x-2">
                        <span>{t("vacationsPage.requests.approvalChain")}</span>
                      </h4>
                      <div className="space-y-2">
                        {(request.approvalChain as VacationApprovalStep[] | undefined)?.length ? (
                          (request.approvalChain as VacationApprovalStep[]).map((step, index) => (
                            <div
                              key={`${request.id}-step-${index}`}
                              className="flex items-center justify-between rounded border p-2"
                            >
                              <div>
                                <div className="font-medium">
                                  {t("vacationsPage.requests.approver", {
                                    approver: step.approverId || t("vacationsPage.requests.unassigned"),
                                  })}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {t("vacationsPage.requests.status", {
                                    status: t(`vacationsPage.status.${step.status as "approved"}`, {
                                      defaultValue: step.status,
                                    }),
                                  })}
                                  {step.delegatedToId
                                    ? ` ${t("vacationsPage.requests.delegatedTo", { delegateId: step.delegatedToId })}`
                                    : ""}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {step.status !== "approved" && step.status !== "rejected" && request.status !== "rejected" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleApprovalAction(request, step, "approve")}
                                      disabled={approvalMutation.isPending}
                                    >
                                      {t("vacationsPage.requests.approve")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleApprovalAction(request, step, "reject")}
                                      disabled={approvalMutation.isPending}
                                    >
                                      {t("vacationsPage.requests.reject")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleApprovalAction(request, step, "delegate")}
                                      disabled={approvalMutation.isPending}
                                    >
                                      {t("vacationsPage.requests.delegate")}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">{t("vacationsPage.requests.noApprovalChain")}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">{t("vacationsPage.requests.auditTrail")}</h4>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {(request.auditLog as VacationAuditLogEntry[] | undefined)?.length ? (
                          (request.auditLog as VacationAuditLogEntry[]).map(entry => (
                            <div key={entry.id} className="flex justify-between">
                              <div>
                                <span className="font-medium">{entry.action}</span> by {entry.actorId}
                                {entry.notes ? ` · ${entry.notes}` : ""}
                              </div>
                              <div>{format(new Date(entry.actionAt), "MMM d, yyyy HH:mm")}</div>
                            </div>
                          ))
                        ) : (
                          <p>{t("vacationsPage.requests.noAudit")}</p>
                        )}
                      </div>
                    </div>

                    {assignmentsForEmployee.length > 0 && (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="font-semibold text-sm">{t("vacationsPage.requests.activeAssignments")}</div>
                        {assignmentsForEmployee.map(assignment => (
                          <div key={assignment.id}>
                            {t("vacationsPage.requests.assignmentDetail", {
                              name: policyMap.get(assignment.policyId)?.name ?? assignment.policyId,
                              start: assignment.effectiveFrom,
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
