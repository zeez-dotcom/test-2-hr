
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ConfirmDialog from "@/components/ui/confirm-dialog";

import { queryClient } from "@/lib/queryClient";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/http";
import { toastApiError } from "@/lib/toastError";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

import type {
  AllowanceReportResponse,
  AllowanceView,
  Employee,
} from "@shared/schema";

type RecurrenceFilter = "all" | "monthly" | "none";

const recurrenceOptions: { value: RecurrenceFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "monthly", label: "Recurring" },
  { value: "none", label: "One-time" },
];

const allowanceFormSchema = z
  .object({
    employeeId: z.string().min(1, "Employee is required"),
    title: z.string().trim().min(1, "Title is required"),
    description: z.string().trim().optional(),
    amount: z.coerce.number().min(0, "Amount must be zero or greater"),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid date"),
    recurrenceType: z.enum(["none", "monthly"]),
    recurrenceEndDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid date")
      .nullable()
      .optional(),
    affectsPayroll: z.boolean().default(true),
  })
  .superRefine((values, ctx) => {
    if (values.recurrenceType === "monthly" && values.recurrenceEndDate) {
      if (values.recurrenceEndDate < values.eventDate) {
        ctx.addIssue({
          path: ["recurrenceEndDate"],
          code: z.ZodIssueCode.custom,
          message: "End date must be on or after the start date",
        });
      }
    }
  });

type AllowanceFormValues = z.infer<typeof allowanceFormSchema>;

interface AllowanceFilters {
  startDate: string;
  endDate: string;
  recurrenceType: RecurrenceFilter;
  search: string;
}

const isoDate = (date: Date) => date.toISOString().split("T")[0];

const today = new Date();
const defaultStartDate = isoDate(new Date(today.getFullYear(), 0, 1));
const defaultEndDate = isoDate(today);

function buildEmployeeName(employee?: Employee | null) {
  if (!employee) return "";
  const parts = [employee.firstName, employee.lastName].filter(Boolean);
  if (parts.length === 0) {
    return employee.firstName ?? employee.lastName ?? "";
  }
  return parts.join(" ");
}

const recurrenceLabels: Record<RecurrenceFilter, string> = {
  all: "All types",
  monthly: "Recurring",
  none: "One-time",
};

const recurrenceBadges: Record<"monthly" | "none", { label: string; variant: "secondary" | "outline" }> = {
  monthly: { label: "Recurring", variant: "secondary" },
  none: { label: "One-time", variant: "outline" },
};

export default function Allowances() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filters, setFilters] = useState<AllowanceFilters>({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    recurrenceType: "all",
    search: "",
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAllowance, setEditingAllowance] = useState<AllowanceView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AllowanceView | null>(null);

  const form = useForm<AllowanceFormValues>({
    resolver: zodResolver(allowanceFormSchema),
    defaultValues: {
      employeeId: "",
      title: "",
      description: "",
      amount: 0,
      eventDate: defaultStartDate,
      recurrenceType: "none",
      recurrenceEndDate: null,
      affectsPayroll: true,
    },
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const employeeOptions = useMemo(() => {
    return [...employees].sort((a, b) => buildEmployeeName(a).localeCompare(buildEmployeeName(b)));
  }, [employees]);


  const allowancesQuery = useQuery<AllowanceView[]>({
    queryKey: [
      "/api/allowances",
      filters.startDate,
      filters.endDate,
      filters.recurrenceType,
    ],
    queryFn: async ({ queryKey }) => {
      const [, startDate, endDate, recurrenceType] = queryKey as [
        string,
        string | undefined,
        string | undefined,
        RecurrenceFilter,
      ];
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (recurrenceType && recurrenceType !== "all") {
        params.set("recurrenceType", recurrenceType);
      }
      const query = params.toString();
      const res = await apiGet(`/api/allowances${query ? `?${query}` : ""}`);
      if (!res.ok) {
        throw res;
      }
      return res.data as AllowanceView[];
    },
  });


  const reportQuery = useQuery<AllowanceReportResponse>({
    queryKey: ["/api/reports/allowances", filters.startDate, filters.endDate],
    queryFn: async ({ queryKey }) => {
      const [, startDate, endDate] = queryKey as [string, string, string];
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("groupBy", "month");
      const res = await apiGet(`/api/reports/allowances?${params.toString()}`);
      if (!res.ok) {
        throw res;
      }
      return res.data as AllowanceReportResponse;
    },
    enabled: Boolean(filters.startDate && filters.endDate),
  });


  const createMutation = useMutation({
    mutationFn: async (values: AllowanceFormValues) => {
      const payload: Record<string, unknown> = {
        employeeId: values.employeeId,
        title: values.title,
        amount: values.amount,
        eventDate: values.eventDate,
        recurrenceType: values.recurrenceType,
        affectsPayroll: values.affectsPayroll,
      };
      if (values.description) {
        payload.description = values.description.trim();
      }
      if (values.recurrenceType === "monthly") {
        payload.recurrenceEndDate = values.recurrenceEndDate ?? undefined;
      } else {
        payload.recurrenceEndDate = null;
      }
      const res = await apiPost("/api/allowances", payload);
      if (!res.ok) {
        throw res;
      }
      return res.data as AllowanceView;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/allowances"] });
      toast({
        title: t("allowances.toastSaved", "Allowance saved"),
      });
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toastApiError(error as any, t("allowances.toastSaveError", "Failed to save allowance"));
    },
  });


  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: AllowanceFormValues }) => {
      const payload: Record<string, unknown> = {
        employeeId: values.employeeId,
        title: values.title,
        amount: values.amount,
        eventDate: values.eventDate,
        recurrenceType: values.recurrenceType,
        affectsPayroll: values.affectsPayroll,
      };
      payload.description = values.description?.trim() || undefined;
      if (values.recurrenceType === "monthly") {
        payload.recurrenceEndDate = values.recurrenceEndDate ?? undefined;
      } else {
        payload.recurrenceEndDate = null;
      }
      const res = await apiPut(`/api/allowances/${id}`, payload);
      if (!res.ok) {
        throw res;
      }
      return res.data as AllowanceView;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/allowances"] });
      toast({
        title: t("allowances.toastUpdated", "Allowance updated"),
      });
      setIsDialogOpen(false);
      setEditingAllowance(null);
    },
    onError: (error) => {
      toastApiError(error as any, t("allowances.toastSaveError", "Failed to save allowance"));
    },
  });


  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/allowances/${id}`);
      if (!res.ok) {
        throw res;
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/allowances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/allowances"] });
      toast({
        title: t("allowances.toastDeleted", "Allowance deleted"),
      });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toastApiError(error as any, t("allowances.toastDeleteError", "Failed to delete allowance"));
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;

  const allowances = allowancesQuery.data ?? [];

  const filteredAllowances = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    if (!query) {
      return allowances;
    }
    return allowances.filter((allowance) => {
      const employeeName = allowance.employee.fullName?.toLowerCase() ?? "";
      const employeeCode = allowance.employee.employeeCode?.toLowerCase() ?? "";
      return (
        allowance.title.toLowerCase().includes(query) ||
        employeeName.includes(query) ||
        employeeCode.includes(query)
      );
    });
  }, [allowances, filters.search]);

  const sortedAllowances = useMemo(() => {
    return [...filteredAllowances].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }, [filteredAllowances]);


  const handleOpenDialog = useCallback(
    (allowance?: AllowanceView) => {
      if (allowance) {
        setEditingAllowance(allowance);
        form.reset({
          employeeId: allowance.employee.id,
          title: allowance.title,
          description: allowance.description ?? "",
          amount: allowance.amount,
          eventDate: allowance.eventDate,
          recurrenceType: allowance.recurrenceType,
          recurrenceEndDate: allowance.recurrenceEndDate,
          affectsPayroll: allowance.affectsPayroll,
        });
      } else {
        setEditingAllowance(null);
        form.reset({
          employeeId: "",
          title: "",
          description: "",
          amount: 0,
          eventDate: filters.startDate,
          recurrenceType: "none",
          recurrenceEndDate: null,
          affectsPayroll: true,
        });
      }
      setIsDialogOpen(true);
    },
    [filters.startDate, form],
  );

  const handleDeleteRequest = useCallback((allowance: AllowanceView) => {
    setDeleteTarget(allowance);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  }, [deleteMutation, deleteTarget]);

  const handleSubmit = form.handleSubmit((values) => {
    if (editingAllowance) {
      updateMutation.mutate({ id: editingAllowance.id, values });
    } else {
      createMutation.mutate(values);
    }
  });

  const allowanceTotals = reportQuery.data?.totals;
  const topEmployees = reportQuery.data?.topEmployees.slice(0, 5) ?? [];
  const allowanceTypes = reportQuery.data?.allowanceTypes.slice(0, 5) ?? [];


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("allowances.titleHeading", "Allowances")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "allowances.subtitle",
              "Track employee allowances, manage recurring entries, and review allowance trends.",
            )}
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="md:self-start">
          <Plus className="mr-2 h-4 w-4" />
          {t("allowances.add", "Add allowance")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("allowances.filters.title", "Filters")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-2">
              <FormLabel>{t("allowances.filters.startDate", "Start date")}</FormLabel>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, startDate: event.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <FormLabel>{t("allowances.filters.endDate", "End date")}</FormLabel>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, endDate: event.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <FormLabel>{t("allowances.filters.recurrence", "Type")}</FormLabel>
              <Select
                value={filters.recurrenceType}
                onValueChange={(value: RecurrenceFilter) =>
                  setFilters((prev) => ({ ...prev, recurrenceType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("allowances.filters.recurrence", "Type")} />
                </SelectTrigger>
                <SelectContent>
                  {recurrenceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(`allowances.recurrence.${option.value}`, recurrenceLabels[option.value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <FormLabel>{t("allowances.filters.search", "Search")}</FormLabel>
              <Input
                placeholder={t(
                  "allowances.searchPlaceholder",
                  "Search by employee or title",
                )}
                value={filters.search}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, search: event.target.value }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("allowances.totalAllowances", "Total allowances")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {allowanceTotals ? formatCurrency(allowanceTotals.totalAmount) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("allowances.totalRecurring", "Recurring total")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {allowanceTotals ? formatCurrency(allowanceTotals.recurringAmount) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("allowances.totalOneTime", "One-time total")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {allowanceTotals ? formatCurrency(allowanceTotals.oneTimeAmount) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {allowancesQuery.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {t("allowances.loadError", "Failed to load allowances.")}
          </AlertDescription>
        </Alert>
      )}


      <Card>
        <CardHeader>
          <CardTitle>{t("allowances.listTitle", "Allowance entries")}</CardTitle>
        </CardHeader>
        <CardContent>
          {allowancesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("allowances.loading", "Loading allowances...")}
            </p>
          ) : sortedAllowances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("allowances.noResults", "No allowances found for the selected period.")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("allowances.employeeColumn", "Employee")}</TableHead>
                    <TableHead>{t("allowances.titleColumn", "Title")}</TableHead>
                    <TableHead className="text-right">
                      {t("allowances.amountColumn", "Amount")}
                    </TableHead>
                    <TableHead>{t("allowances.typeColumn", "Type")}</TableHead>
                    <TableHead>{t("allowances.eventDateColumn", "Effective date")}</TableHead>
                    <TableHead>{t("allowances.recurrenceEndColumn", "Recurs until")}</TableHead>
                    <TableHead>{t("allowances.statusColumn", "Status")}</TableHead>
                    <TableHead className="text-right">
                      {t("allowances.actionsColumn", "Actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAllowances.map((allowance) => {
                    const badge = recurrenceBadges[allowance.recurrenceType];
                    return (
                      <TableRow key={`${allowance.id}-${allowance.eventDate}`}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {allowance.employee.fullName || t("allowances.unknownEmployee", "Unknown employee")}
                            </span>
                            {allowance.employee.employeeCode && (
                              <span className="text-xs text-muted-foreground">
                                {allowance.employee.employeeCode}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{allowance.title}</span>
                            {allowance.description && (
                              <span className="text-xs text-muted-foreground">
                                {allowance.description}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(allowance.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>
                            {t(
                              `allowances.recurrence.${allowance.recurrenceType}`,
                              badge.label,
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(allowance.eventDate)}</TableCell>
                        <TableCell>
                          {allowance.recurrenceEndDate
                            ? formatDate(allowance.recurrenceEndDate)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{allowance.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("allowances.edit", "Edit allowance")}
                              onClick={() => handleOpenDialog(allowance)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("allowances.delete", "Delete allowance")}
                              onClick={() => handleDeleteRequest(allowance)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>


      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("allowances.topEmployees", "Top employees")}</CardTitle>
          </CardHeader>
          <CardContent>
            {reportQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("allowances.loadingReport", "Loading report...")}
              </p>
            ) : topEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("allowances.noReportData", "No allowance data for this period.")}
              </p>
            ) : (
              <ul className="space-y-2">
                {topEmployees.map((employee) => (
                  <li key={employee.employeeId} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {employee.employeeName || t("allowances.unknownEmployee", "Unknown employee")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("allowances.entries", "{{count}} entries", {
                          count: employee.allowanceCount,
                        })}
                      </p>
                    </div>
                    <span className="font-semibold">
                      {formatCurrency(employee.totalAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("allowances.typesBreakdown", "Allowance types")}</CardTitle>
          </CardHeader>
          <CardContent>
            {reportQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("allowances.loadingReport", "Loading report...")}
              </p>
            ) : allowanceTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("allowances.noReportData", "No allowance data for this period.")}
              </p>
            ) : (
              <ul className="space-y-2">
                {allowanceTypes.map((type) => (
                  <li key={type.title} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{type.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("allowances.entries", "{{count}} entries", {
                          count: type.allowanceCount,
                        })}
                      </p>
                    </div>
                    <span className="font-semibold">
                      {formatCurrency(type.totalAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>


      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAllowance
                ? t("allowances.editDialogTitle", "Edit allowance")
                : t("allowances.createDialogTitle", "New allowance")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <FormField
                control={form.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("allowances.form.employee", "Employee")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("allowances.form.employeePlaceholder", "Select employee")} />
                      </SelectTrigger>
                      <SelectContent>
                        {employeeOptions.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {buildEmployeeName(employee)} {employee.employeeCode ? `(${employee.employeeCode})` : ""}
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
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("allowances.form.title", "Title")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("allowances.form.titlePlaceholder", "Allowance name")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("allowances.form.description", "Description")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("allowances.form.descriptionPlaceholder", "Optional description")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("allowances.form.amount", "Amount")}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="eventDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("allowances.form.eventDate", "Effective date")}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="recurrenceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("allowances.form.recurrenceType", "Recurrence")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("allowances.form.recurrenceType", "Recurrence")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            {t("allowances.recurrence.none", "One-time")}
                          </SelectItem>
                          <SelectItem value="monthly">
                            {t("allowances.recurrence.monthly", "Recurring")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="recurrenceEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("allowances.form.recurrenceEndDate", "Recurs until")}</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          disabled={form.watch("recurrenceType") !== "monthly"}
                          value={field.value ?? ""}
                          onChange={(event) =>
                            field.onChange(event.target.value ? event.target.value : null)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="affectsPayroll"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>{t("allowances.form.affectsPayroll", "Affects payroll totals")}</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("allowances.form.affectsPayrollHelp", "Toggle off if this allowance should be excluded from payroll calculations.")}
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsDialogOpen(false)}
                >
                  {t("allowances.cancel", "Cancel")}
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving
                    ? t("allowances.saving", "Saving...")
                    : editingAllowance
                    ? t("allowances.update", "Update allowance")
                    : t("allowances.create", "Create allowance")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>


      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title={t("allowances.deleteTitle", "Delete allowance")}
        description={t(
          "allowances.deleteDescription",
          "This allowance entry will be removed from future payroll calculations.",
        )}
        confirmText={isDeleting ? t("allowances.deleting", "Deleting...") : t("allowances.delete", "Delete allowance")}
        cancelText={t("allowances.cancel", "Cancel")}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

