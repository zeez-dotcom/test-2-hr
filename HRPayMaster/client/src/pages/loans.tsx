import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addMonths } from "date-fns";
import { DollarSign, Calendar, CheckCircle, XCircle, Plus, Trash2, Edit, TrendingUp, PauseCircle, HelpCircle } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "@/components/ui/image-upload";

import { insertLoanSchema, type LoanStatement, type LoanWithEmployee } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { apiPost, apiPut, apiDelete, apiGet } from "@/lib/http";
import { toastApiError } from "@/lib/toastError";
import { formatCurrency } from "@/lib/utils";

const schema = insertLoanSchema
  .omit({ remainingAmount: true })
  .extend({
    amount: z.coerce.number().positive(),
    monthlyDeduction: z.coerce.number().positive(),
  })
  .refine((d) => d.monthlyDeduction <= d.amount, {
    path: ["monthlyDeduction"],
    message: "Monthly deduction must be ≤ amount",
  });

const formatMoney = (value: number) => formatCurrency(value);

type StageStatus = "pending" | "approved" | "rejected" | "delegated" | "skipped";

const stageStatusLabels: Record<StageStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  delegated: "Delegated",
  skipped: "Skipped",
};

const stageStatusClasses: Record<StageStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  delegated: "bg-blue-100 text-blue-800",
  skipped: "bg-slate-200 text-slate-800",
};

const getStageStatusLabel = (status: string) =>
  stageStatusLabels[(status?.toLowerCase?.() ?? "pending") as StageStatus] ?? status;

const getStageStatusClass = (status: string) =>
  stageStatusClasses[(status?.toLowerCase?.() ?? "pending") as StageStatus] ??
  "bg-slate-200 text-slate-800";

const createTempId = () => Math.random().toString(36).slice(2, 10);

type LoanDocumentDraft = {
  tempId: string;
  title: string;
  fileUrl?: string;
};

type LoanDocumentStateEntry = {
  newDocuments: LoanDocumentDraft[];
  removedDocumentIds: string[];
};

const buildLoanDocumentPayload = (
  loan: LoanWithEmployee,
  state?: LoanDocumentStateEntry,
) => {
  if (!state) return [];
  const existingDocs = loan.documents ?? [];
  const additions = state.newDocuments
    .filter((doc) => doc.title.trim() && doc.fileUrl)
    .map((doc) => ({
      title: doc.title.trim(),
      fileUrl: doc.fileUrl!,
    }));
  const removals = state.removedDocumentIds
    .map((id) => {
      const doc = existingDocs.find((existing) => existing.id === id);
      if (!doc) return null;
      return {
        id,
        title: doc.title || doc.documentType || "Supporting document",
        fileUrl: doc.fileUrl,
        remove: true as const,
      };
    })
    .filter((value): value is { id: string; title: string; fileUrl: string; remove: true } => Boolean(value));
  return [...additions, ...removals];
};

const countLoanDocumentsAfterChanges = (
  loan: LoanWithEmployee,
  state?: LoanDocumentStateEntry,
) => {
  const existingDocs = loan.documents ?? [];
  if (!state) {
    return existingDocs.length;
  }
  const removed = new Set(state.removedDocumentIds);
  const remainingExisting = existingDocs.filter((doc) => {
    const id = doc.id ?? "";
    return !removed.has(id);
  }).length;
  const newDocs = state.newDocuments.filter((doc) => doc.title.trim() && doc.fileUrl).length;
  return remainingExisting + newDocs;
};

export default function Loans() {
  const { t } = useTranslation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isStatementDialogOpen, setIsStatementDialogOpen] = useState(false);
  const [statementLoanId, setStatementLoanId] = useState<string | null>(null);
  const { toast } = useToast();

  const {
    data: loans = [],
    isLoading,
    error: loansError,
  } = useQuery<LoanWithEmployee[]>({
    queryKey: ["/api/loans"]
  });
  const [location] = useLocation();
  const params = new URLSearchParams(location.split('?')[1] || '');
  const monthParam = params.get('month');
  const filteredLoans = (loans || []).filter((l) => {
    if (!monthParam) return true;
    const [y, m] = monthParam.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    const loanStart = new Date(l.startDate);
    const loanEnd = l.endDate ? new Date(l.endDate) : null;
    return loanStart <= end && (!loanEnd || loanEnd >= start);
  });

  const { data: employees = [], error: employeesError } = useQuery({
    queryKey: ["/api/employees"]
  });

  const { data: vacations = [] } = useQuery<any[]>({
    queryKey: ["/api/vacations"],
  });

  const { data: loanStatement, isLoading: isStatementLoading } = useQuery<LoanStatement | null>({
    queryKey: ["/api/loans", statementLoanId, "statement"],
    queryFn: async () => {
      if (!statementLoanId) return null;
      const res = await apiGet(`/api/loans/${statementLoanId}/statement`);
      if (!res.ok) throw res;
      return res.data;
    },
    enabled: Boolean(statementLoanId && isStatementDialogOpen),
    staleTime: 1000 * 60,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPost("/api/loans", data);
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      const loanId = data?.loan?.id ?? data?.id;
      if (loanId) {
        queryClient.invalidateQueries({ queryKey: ["/api/loans", loanId] });
      }
      setIsCreateDialogOpen(false);
      setCreateDocuments([]);
      const warningText = data?.policy?.warnings?.join?.(" \u2022 ");
      toast({
        title: "Loan created successfully",
        description: warningText,
      });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to create loan");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiPut(`/api/loans/${id}`, data);
      if (!res.ok) throw res;
      return { response: res.data, id };
    },
    onSuccess: (payload, { id }) => {
      const data = payload?.response;
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      const loanId = data?.loan?.id ?? id;
      queryClient.invalidateQueries({ queryKey: ["/api/loans", loanId] });
      const warningText = data?.policy?.warnings?.join?.(" \u2022 ");
      toast({ title: "Loan updated successfully", description: warningText });
    },
    onError: () => {
      // For update errors, show a generic failure title per tests
      toast({ title: "Failed to update loan", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/loans/${id}`);
      if (!res.ok) throw res;
      return id;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loans", id] });
      toast({ title: "Loan deleted successfully" });
    },
    onError: () => {
      // For delete errors, show a generic failure title per tests
      toast({ title: "Failed to delete loan", variant: "destructive" });
    }
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeId: "",
      amount: undefined,
      monthlyDeduction: undefined,
      startDate: new Date().toISOString().split('T')[0],
      status: "pending",
      interestRate: undefined,
      reason: "",
    },
    mode: "onChange"
  });
  form.register("employeeId", { required: true });
  form.register("amount", { required: true });
  form.register("monthlyDeduction", { required: true });
  form.register("startDate", { required: true });

  // Edit dialog state + form
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<LoanWithEmployee | null>(null);
  const [createDocuments, setCreateDocuments] = useState<LoanDocumentDraft[]>([]);
  const [loanDocumentState, setLoanDocumentState] = useState<Record<string, LoanDocumentStateEntry>>({});
  const editForm = useForm<any>({
    defaultValues: {
      amount: undefined,
      monthlyDeduction: undefined,
      remainingAmount: undefined,
      startDate: '',
      endDate: '',
      interestRate: undefined,
      reason: '',
      status: 'pending',
    },
    mode: 'onChange'
  });
  const onEditSubmit = (data: any) => {
    if (!editingLoan) return;
    const docState = loanDocumentState[editingLoan.id];
    const documentsPayload = buildLoanDocumentPayload(editingLoan, docState);
    const payload = documentsPayload.length > 0 ? { ...data, documents: documentsPayload } : data;
    updateMutation.mutate({ id: editingLoan.id, data: payload });
    setIsEditDialogOpen(false);
  };

  useEffect(() => {
    if (isCreateDialogOpen) {
      setCreateDocuments((prev) => (prev.length > 0 ? prev : [{ tempId: createTempId(), title: "", fileUrl: undefined }]));
    } else {
      setCreateDocuments([]);
    }
  }, [isCreateDialogOpen]);

  const addCreateDocument = () => {
    setCreateDocuments((prev) => [...prev, { tempId: createTempId(), title: "", fileUrl: undefined }]);
  };

  const updateCreateDocument = (tempId: string, patch: Partial<LoanDocumentDraft>) => {
    setCreateDocuments((prev) => prev.map((doc) => (doc.tempId === tempId ? { ...doc, ...patch } : doc)));
  };

  const removeCreateDocument = (tempId: string) => {
    setCreateDocuments((prev) => prev.filter((doc) => doc.tempId !== tempId));
  };

  const updateLoanDocState = (
    loanId: string,
    updater: (state: LoanDocumentStateEntry) => LoanDocumentStateEntry,
  ) => {
    setLoanDocumentState((prev) => {
      const current = prev[loanId] ?? { newDocuments: [], removedDocumentIds: [] };
      return { ...prev, [loanId]: updater(current) };
    });
  };

  const handleAddLoanDocument = (loanId: string) => {
    updateLoanDocState(loanId, (state) => ({
      ...state,
      newDocuments: [...state.newDocuments, { tempId: createTempId(), title: "", fileUrl: undefined }],
    }));
  };

  const handleRemoveNewLoanDocument = (loanId: string, tempId: string) => {
    updateLoanDocState(loanId, (state) => ({
      ...state,
      newDocuments: state.newDocuments.filter((doc) => doc.tempId !== tempId),
    }));
  };

  const handleUpdateNewLoanDocument = (
    loanId: string,
    tempId: string,
    patch: Partial<LoanDocumentDraft>,
  ) => {
    updateLoanDocState(loanId, (state) => ({
      ...state,
      newDocuments: state.newDocuments.map((doc) =>
        doc.tempId === tempId ? { ...doc, ...patch } : doc,
      ),
    }));
  };

  const handleToggleLoanDocumentRemoval = (loanId: string, documentId: string) => {
    updateLoanDocState(loanId, (state) => {
      const removed = new Set(state.removedDocumentIds);
      if (removed.has(documentId)) {
        removed.delete(documentId);
      } else {
        removed.add(documentId);
      }
      return { ...state, removedDocumentIds: Array.from(removed) };
    });
  };

  if (loansError || employeesError) {
    return <div>Error loading loans</div>;
  }

  const editingDocState = editingLoan ? loanDocumentState[editingLoan.id] : undefined;
  const editingRemovedIds = editingDocState ? new Set(editingDocState.removedDocumentIds) : new Set<string>();
  const editingExistingDocs = editingLoan
    ? (editingLoan.documents ?? []).filter(
        (doc): doc is NonNullable<(typeof editingLoan.documents)[number]> & { id: string } =>
          Boolean(doc?.id),
      )
    : [];
  const editingVisibleDocs = editingExistingDocs.filter((doc) => !editingRemovedIds.has(doc.id));
  const editingRemovedDocs = editingExistingDocs.filter((doc) => editingRemovedIds.has(doc.id));
  const editingNewDocs = editingDocState?.newDocuments ?? [];

  const onSubmit = (data: any) => {
    const documentsPayload = createDocuments
      .filter((doc) => doc.title.trim() && doc.fileUrl)
      .map((doc) => ({
        title: doc.title.trim(),
        fileUrl: doc.fileUrl!,
      }));
    const payload = { ...data };
    if (documentsPayload.length > 0) {
      payload.documents = documentsPayload;
    }
    createMutation.mutate(payload);
  };

  const handleApprove = (loan: LoanWithEmployee) => {
    const docState = loanDocumentState[loan.id];
    if (countLoanDocumentsAfterChanges(loan, docState) === 0) {
      toast({
        title: "Supporting documents required",
        description: "Upload at least one document before approving this loan.",
        variant: "destructive",
      });
      return;
    }
    const documentsPayload = buildLoanDocumentPayload(loan, docState);
    const stageUpdates = (loan.approvalStages ?? [])
      .filter((stage) => stage?.id && stage.status?.toLowerCase?.() !== "approved")
      .map((stage) => ({
        id: stage.id,
        status: "approved" as const,
        actedAt: new Date().toISOString(),
      }));

    // Use "active" to align with server-side payroll deduction logic
    const updateData: any = { status: "active", stageUpdates };
    if (documentsPayload.length > 0) {
      updateData.documents = documentsPayload;
    }
    updateMutation.mutate({
      id: loan.id,
      data: updateData
    });
  };

  const handleReject = (id: string) => {
    updateMutation.mutate({
      id,
      data: { status: "rejected" }
    });
  };

  const openStatementDialog = (loanId: string) => {
    setStatementLoanId(loanId);
    setIsStatementDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "approved": // support legacy value
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case "completed":
        return <Badge className="bg-blue-100 text-blue-800"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary"><Calendar className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const calculateMonthsRemaining = (remainingAmount: string, monthlyDeduction: string) => {
    const remaining = Math.max(0, parseFloat(remainingAmount || '0'));
    const monthly = Math.max(0, parseFloat(monthlyDeduction || '0'));
    if (monthly <= 0) return 0;
    return Math.ceil(remaining / monthly);
  };

  const forecastPayoffDate = (loan: any) => {
    const status = (loan.status || '').toLowerCase();
    if (status === 'paused') return 'Paused';
    if (!(status === 'active' || status === 'approved')) return 'N/A';
    const months = calculateMonthsRemaining(loan.remainingAmount ?? loan.amount, loan.monthlyDeduction);
    if (months === 0) return format(new Date(), 'MMM yyyy');
    // Count months to skip due to approved vacations that requested pause
    const now = new Date();
    const myVac = (vacations as any[]).filter(v => v.employeeId === loan.employeeId && v.status === 'approved');
    const skipMonths = new Set<string>();
    for (const v of myVac) {
      const wantsPause = String(v.reason || '').includes('[pause-loans]');
      if (!wantsPause) continue;
      const s = new Date(v.startDate);
      const e = new Date(v.endDate);
      // only consider future/ongoing vacations
      if (e < now) continue;
      const start = new Date(Math.max(s.getTime(), now.getTime()));
      const yearMonth = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const end = new Date(e.getFullYear(), e.getMonth(), 1);
      while (cur <= end) {
        skipMonths.add(yearMonth(cur));
        cur.setMonth(cur.getMonth() + 1);
      }
    }
    const totalMonths = months + skipMonths.size;
    const endDate = addMonths(new Date(), totalMonths);
    return format(endDate, 'MMM yyyy');
  };

  const loanForecastMeta = (loan: any) => {
    const status = (loan.status || '').toLowerCase();
    const now = new Date();
    const monthsRemaining = calculateMonthsRemaining(loan.remainingAmount ?? loan.amount, loan.monthlyDeduction);
    const baselineEnd = addMonths(now, monthsRemaining);
    // paused months via approved vacations with pause marker (future/ongoing)
    const myVac = (vacations as any[]).filter(v => v.employeeId === loan.employeeId && v.status === 'approved');
    const yearMonth = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
    const skipMonths = new Set<string>();
    for (const v of myVac) {
      const wantsPause = String(v.reason || '').includes('[pause-loans]');
      if (!wantsPause) continue;
      const s = new Date(v.startDate);
      const e = new Date(v.endDate);
      if (e < now) continue;
      const start = new Date(Math.max(s.getTime(), now.getTime()));
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const end = new Date(e.getFullYear(), e.getMonth(), 1);
      while (cur <= end) {
        skipMonths.add(yearMonth(cur));
        cur.setMonth(cur.getMonth() + 1);
      }
    }
    const pausedMonths = skipMonths.size;
    const adjustedEnd = addMonths(now, monthsRemaining + pausedMonths);
    const baselineLabel = format(baselineEnd, 'MMM yyyy');
    const adjustedLabel = format(adjustedEnd, 'MMM yyyy');
    const willCompleteThisMonth = adjustedEnd.getFullYear() === now.getFullYear() && adjustedEnd.getMonth() === now.getMonth();
    return { status, monthsRemaining, pausedMonths, baselineLabel, adjustedLabel, willCompleteThisMonth };
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('nav.loans')}</h1>
          <p className="text-muted-foreground">{t('loansPage.subtitle', 'Manage employee loan requests and track payroll deductions')}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              {t('loansPage.newLoan', 'New Loan')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('loansPage.newLoan', 'Create Employee Loan')}</DialogTitle>
              <DialogDescription>{t('loansPage.subtitle', 'Create a new loan for an employee with automatic payroll deductions.')}</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <input type="hidden" value="pending" {...form.register("status")} />
                <FormField
                  control={form.control}
                  name="employeeId"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <FormItem>
                        <FormLabel>{t('docgen.employee')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Employee" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(employees as any[]).filter(emp => emp.id && emp.id.trim() !== "").map((employee: any) => (
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
                    name="amount"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('loansPage.loanAmount', 'Loan Amount')}</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="5000" required {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="monthlyDeduction"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('loansPage.monthlyDeduction', 'Monthly Deduction')}</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="500" required {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('loansPage.startDate', 'Start Date')}</FormLabel>
                        <FormControl>
                          <Input type="date" required {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="interestRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('loansPage.interestRate', 'Interest Rate (%)')}</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('loansPage.purpose', 'Purpose')}</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Loan purpose or reason..."
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Supporting documents</span>
                    <Button type="button" variant="outline" size="sm" onClick={addCreateDocument}>
                      Add document
                    </Button>
                  </div>
                  {createDocuments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No documents added yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {createDocuments.map((doc) => (
                        <div key={doc.tempId} className="space-y-2 rounded-md border p-3">
                          <Input
                            placeholder="Document title"
                            value={doc.title}
                            onChange={(event) => updateCreateDocument(doc.tempId, { title: event.target.value })}
                          />
                          <ImageUpload
                            label="Upload supporting document"
                            value={doc.fileUrl}
                            onChange={(value) => updateCreateDocument(doc.tempId, { fileUrl: value })}
                          />
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeCreateDocument(doc.tempId)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Supporting documents are optional for creation but required before approval.
                  </p>
                </div>

                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={
                      createMutation.isPending ||
                      !form.formState.isValid
                    }
                  >
                    {createMutation.isPending ? t('loansPage.creating','Creating...') : t('loansPage.newLoan','Create Loan')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLoans.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <DollarSign className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No loans</h3>
                <p className="text-gray-500">Create the first employee loan to get started.</p>
              </CardContent>
            </Card>
          ) : (
            filteredLoans.map((loan) => {
              const dueAmount = Number(loan.dueAmountForPeriod ?? 0);
              const scheduleRaw = Array.isArray((loan as any).scheduleDueThisPeriod)
                ? ((loan as any).scheduleDueThisPeriod as Array<Record<string, any>>)
                : [];
              const dueEntries = scheduleRaw.filter(Boolean);
              const pendingCount = dueEntries.filter(
                (entry) => String(entry.status || "").toLowerCase() === "pending",
              ).length;
              const pausedCount = dueEntries.filter(
                (entry) => String(entry.status || "").toLowerCase() === "paused",
              ).length;
              const dueSummaryParts: string[] = [];
              if (pendingCount > 0) {
                dueSummaryParts.push(
                  `${pendingCount} ${pendingCount === 1 ? "installment due" : "installments due"}`,
                );
              }
              if (pausedCount > 0) {
                dueSummaryParts.push(
                  `${pausedCount} ${pausedCount === 1 ? "installment paused" : "installments paused"}`,
                );
              }
              const dueSummary = dueSummaryParts.join(" • ");
              const warnings = Array.isArray((loan as any)?.policyMetadata?.warnings)
                ? ((loan as any).policyMetadata.warnings as string[]).filter(Boolean)
                : [];
              const violations = Array.isArray((loan as any)?.policyMetadata?.violations)
                ? ((loan as any).policyMetadata.violations as string[]).filter(Boolean)
                : [];
              const parseNumber = (value: unknown) => {
                const parsed = Number.parseFloat(String(value ?? 0));
                return Number.isFinite(parsed) ? parsed : 0;
              };
              const amountValue = parseNumber(loan.amount);
              const monthlyDeductionValue = parseNumber(loan.monthlyDeduction);
              const interestRateValue = parseNumber(loan.interestRate);
              const startDateLabel = loan.startDate
                ? (() => {
                    const parsed = new Date(loan.startDate);
                    return Number.isNaN(parsed.getTime()) ? undefined : format(parsed, "MMM d, yyyy");
                  })()
                : undefined;
              const nextPendingEntry = dueEntries.find(
                (entry) => String(entry.status || "").toLowerCase() === "pending",
              );
              const nextDueDateLabel = nextPendingEntry?.dueDate
                ? (() => {
                    const parsed = new Date(nextPendingEntry.dueDate as string);
                    return Number.isNaN(parsed.getTime()) ? undefined : format(parsed, "MMM d, yyyy");
                  })()
                : undefined;
              const monthsRemainingValue =
                loan.status === "active" || loan.status === "approved"
                  ? calculateMonthsRemaining(
                      loan.remainingAmount ?? loan.amount,
                      loan.monthlyDeduction,
                    )
                  : null;
              const totalPayments = monthlyDeductionValue > 0
                ? Math.ceil(amountValue / monthlyDeductionValue)
                : null;
              const forecastMeta = loanForecastMeta(loan);
              const dueDetails = (() => {
                if (nextDueDateLabel && dueSummary) {
                  return `${t('loansPage.nextDue', 'Next due')}: ${nextDueDateLabel} • ${dueSummary}`;
                }
                if (nextDueDateLabel) {
                  return `${t('loansPage.nextDue', 'Next due')}: ${nextDueDateLabel}`;
                }
                if (dueSummary) {
                  return dueSummary;
                }
                return null;
              })();
              const docState = loanDocumentState[loan.id];
              const removedIds = new Set(docState?.removedDocumentIds ?? []);
              const allExistingDocs = (loan.documents ?? []).filter(
                (doc): doc is NonNullable<(typeof loan.documents)[number]> & { id: string } =>
                  Boolean(doc?.id),
              );
              const visibleExistingDocs = allExistingDocs.filter((doc) => !removedIds.has(doc.id));
              const removedDocs = allExistingDocs.filter((doc) => removedIds.has(doc.id));
              const newDocs = docState?.newDocuments ?? [];
              return (
                <Card key={loan.id}>
                  <CardHeader className="pb-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-3">
                        <DollarSign className="w-5 h-5 text-green-600" />
                        <div>
                          <CardTitle className="text-lg">
                            {loan.employee?.firstName} {loan.employee?.lastName}
                          </CardTitle>
                          <CardDescription>
                          {formatMoney(amountValue)} • {formatMoney(monthlyDeductionValue)} /{t('loansPage.perMonth', 'month')}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {getStatusBadge(loan.status)}
                        {loan.status === "paused" && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <PauseCircle className="w-3 h-3" />
                            {t('loansPage.paused', 'Paused')}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openStatementDialog(loan.id)}
                          className="flex items-center gap-1"
                        >
                          <TrendingUp className="w-3 h-3" />
                          {t('loansPage.statement', 'Statement')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingLoan(loan as any);
                            editForm.reset({
                              employeeId: loan.employeeId,
                              amount: Number(loan.amount),
                              monthlyDeduction: Number(loan.monthlyDeduction),
                              remainingAmount: loan.remainingAmount
                                ? Number(loan.remainingAmount)
                                : undefined,
                              startDate: loan.startDate,
                              endDate: loan.endDate || "",
                              interestRate: loan.interestRate
                                ? Number(loan.interestRate)
                                : undefined,
                              reason: loan.reason || "",
                              status: loan.status,
                            } as any);
                            setIsEditDialogOpen(true);
                          }}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        {loan.status === "pending" && (
                          <div className="flex space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprove(loan)}
                              disabled={
                                updateMutation.isPending ||
                                countLoanDocumentsAfterChanges(loan, loanDocumentState[loan.id]) === 0
                              }
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              {t('common.approve', 'Approve')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReject(loan.id)}
                              disabled={updateMutation.isPending}
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              {t('common.reject', 'Reject')}
                            </Button>
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(loan.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" />
                          {t('loansPage.dueThisPeriod', 'Due this period')}
                        </span>
                        <p className="font-medium">
                          {dueAmount > 0
                            ? formatMoney(dueAmount)
                            : t('loansPage.noDeduction', 'No deduction scheduled this period')}
                        </p>
                        {dueDetails && (
                          <p className="text-xs text-muted-foreground">{dueDetails}</p>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('loansPage.startDate', 'Start Date')}</span>
                        <p className="font-medium">{startDateLabel ?? '—'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('loansPage.interestRate', 'Interest Rate')}</span>
                        <p className="font-medium">{interestRateValue.toFixed(2)}%</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('loansPage.totalPayments', 'Total payments')}</span>
                        <p className="font-medium">
                          {totalPayments !== null
                            ? `${totalPayments} ${t('loansPage.months', 'months')}`
                            : t('common.notApplicable', 'N/A')}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t('loansPage.monthsRemaining', 'Months remaining')}</span>
                        <p className="font-medium">
                          {monthsRemainingValue !== null
                            ? monthsRemainingValue
                            : t('common.notApplicable', 'N/A')}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground flex items-center gap-1">
                          {t('loansPage.forecastPayoff', 'Forecast payoff')}
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="max-w-xs space-y-1">
                                  <div><strong>{t('loansPage.forecastNow', 'Now')}:</strong> {forecastMeta.adjustedLabel} {forecastMeta.willCompleteThisMonth ? `(${t('loansPage.thisMonth', 'this month')})` : ''}</div>
                                  <div><strong>{t('loansPage.forecastBaseline', 'Baseline')}:</strong> {forecastMeta.baselineLabel}</div>
                                  <div><strong>{t('loansPage.forecastMonthsRemaining', 'Months remaining')}:</strong> {forecastMeta.monthsRemaining} {forecastMeta.pausedMonths > 0 ? `(+${forecastMeta.pausedMonths} ${t('loansPage.pausedShort', 'paused')})` : ''}</div>
                                  <div className="text-xs text-muted-foreground">{t('loansPage.forecastTooltip', 'Adds one month for each approved vacation that requested loan pause.')}</div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </span>
                        <p className="font-medium">{forecastMeta.adjustedLabel}</p>
                        <p className="text-xs text-muted-foreground">
                          {forecastMeta.monthsRemaining} {t('loansPage.months', 'months')} {forecastMeta.pausedMonths > 0 ? `(+${forecastMeta.pausedMonths} ${t('loansPage.pausedShort', 'paused')})` : ''}
                        </p>
                      </div>
                    </div>
                    {loan.reason && (
                      <div className="mt-4 pt-4 border-t">
                        <span className="text-muted-foreground text-sm">{t('loansPage.purpose', 'Purpose')}</span>
                        <p className="text-sm mt-1">{loan.reason}</p>
                      </div>
                    )}
                    <div className="mt-4 pt-4 border-t space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">{t('loansPage.documents', 'Documents')}</h4>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddLoanDocument(loan.id)}
                        >
                          {t('loansPage.addDocument', 'Add document')}
                        </Button>
                      </div>
                      {visibleExistingDocs.length === 0 && newDocs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {t('loansPage.noDocuments', 'No documents uploaded yet.')}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {visibleExistingDocs.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm"
                            >
                              <div className="flex-1 pr-2">
                                <p className="font-medium">
                                  {doc.title || doc.documentType || t('loansPage.supportingDocument', 'Supporting document')}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleLoanDocumentRemoval(loan.id, doc.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                {t('common.remove', 'Remove')}
                              </Button>
                            </div>
                          ))}
                          {newDocs.map((doc) => (
                            <div key={doc.tempId} className="space-y-2 rounded-md border p-3">
                              <Input
                                placeholder="Document title"
                                value={doc.title}
                                onChange={(event) =>
                                  handleUpdateNewLoanDocument(loan.id, doc.tempId, { title: event.target.value })
                                }
                              />
                              <ImageUpload
                                label="Upload supporting document"
                                value={doc.fileUrl}
                                onChange={(value) =>
                                  handleUpdateNewLoanDocument(loan.id, doc.tempId, { fileUrl: value })
                                }
                              />
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveNewLoanDocument(loan.id, doc.tempId)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  {t('common.remove', 'Remove')}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {removedDocs.length > 0 && (
                        <div className="space-y-1 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          {removedDocs.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between gap-2">
                              <span>
                                {doc.title || doc.documentType || t('loansPage.supportingDocument', 'Supporting document')}{' '}
                                • {t('loansPage.markedForRemoval', 'Marked for removal')}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleLoanDocumentRemoval(loan.id, doc.id)}
                              >
                                {t('common.undo', 'Undo')}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t('loansPage.documentsRequirement', 'Upload at least one document before approving the loan.')}
                      </p>
                    </div>
                    {(violations.length > 0 || warnings.length > 0) && (
                      <div className={`${loan.reason ? 'pt-4 border-t mt-4' : 'mt-4'} space-y-3`}>
                        {violations.length > 0 && (
                          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                            <p className="font-semibold">{t('loansPage.policyViolations', 'Policy violations')}</p>
                            <ul className="mt-2 list-disc space-y-1 pl-4">
                              {violations.map((item, index) => (
                                <li key={`${loan.id}-violation-${index}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {warnings.length > 0 && (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            <p className="font-semibold">{t('loansPage.policyWarnings', 'Policy warnings')}</p>
                            <ul className="mt-2 list-disc space-y-1 pl-4">
                              {warnings.map((item, index) => (
                                <li key={`${loan.id}-warning-${index}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {loan.approvalStages && loan.approvalStages.length > 0 && (
                      <div className="mt-4 pt-4 border-t space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          {t('loansPage.approvalProgress', 'Approval progress')}
                        </h4>
                        <ul className="space-y-3">
                          {loan.approvalStages.map((stage) => {
                            const key = stage.id ?? `${loan.id}-${stage.stageOrder ?? stage.stageName}`;
                            return (
                              <li key={key} className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <p className="font-medium leading-tight">{stage.stageName}</p>
                                  {stage.approver && (
                                    <p className="text-xs text-muted-foreground">
                                      {t('loansPage.approver', 'Approver')}: {stage.approver.firstName} {stage.approver.lastName}
                                    </p>
                                  )}
                                  {stage.notes && (
                                    <p className="text-xs text-muted-foreground">{stage.notes}</p>
                                  )}
                                </div>
                                <Badge className={`${getStageStatusClass(stage.status)} whitespace-nowrap`}>
                                  {getStageStatusLabel(stage.status)}
                                </Badge>
                              </li>
                            );
                          })}
                        </ul>
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

    {/* Edit Loan Dialog */}
    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Loan</DialogTitle>
          <DialogDescription>Update loan details for {editingLoan?.employee?.firstName} {editingLoan?.employee?.lastName}</DialogDescription>
        </DialogHeader>
        <Form {...editForm}>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={editForm.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan Amount</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="monthlyDeduction" render={({ field }) => (
                <FormItem>
                  <FormLabel>Monthly Deduction</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={editForm.control} name="remainingAmount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Remaining Amount</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="interestRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Interest Rate (%)</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={editForm.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl><Input type="date" {...field} value={field.value || ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="endDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>End Date</FormLabel>
                  <FormControl><Input type="date" {...field} value={field.value || ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={editForm.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value as any}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={editForm.control} name="reason" render={({ field }) => (
              <FormItem>
                <FormLabel>Purpose / Notes</FormLabel>
                <FormControl><Textarea placeholder="Notes..." {...field} value={field.value || ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {editingLoan && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Supporting documents</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddLoanDocument(editingLoan.id)}
                  >
                    {t('loansPage.addDocument', 'Add document')}
                  </Button>
                </div>
                {editingVisibleDocs.length === 0 && editingNewDocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t('loansPage.noDocuments', 'No documents uploaded yet.')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {editingVisibleDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm"
                      >
                        <div className="flex-1 pr-2">
                          <p className="font-medium">
                            {doc.title || doc.documentType || t('loansPage.supportingDocument', 'Supporting document')}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleLoanDocumentRemoval(editingLoan.id, doc.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          {t('common.remove', 'Remove')}
                        </Button>
                      </div>
                    ))}
                    {editingNewDocs.map((doc) => (
                      <div key={doc.tempId} className="space-y-2 rounded-md border p-3">
                        <Input
                          placeholder="Document title"
                          value={doc.title}
                          onChange={(event) =>
                            handleUpdateNewLoanDocument(editingLoan.id, doc.tempId, { title: event.target.value })
                          }
                        />
                        <ImageUpload
                          label="Upload supporting document"
                          value={doc.fileUrl}
                          onChange={(value) =>
                            handleUpdateNewLoanDocument(editingLoan.id, doc.tempId, { fileUrl: value })
                          }
                        />
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveNewLoanDocument(editingLoan.id, doc.tempId)}
                            className="text-red-600 hover:text-red-700"
                          >
                            {t('common.remove', 'Remove')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {editingRemovedDocs.length > 0 && (
                  <div className="space-y-1 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    {editingRemovedDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between gap-2">
                        <span>
                          {doc.title || doc.documentType || t('loansPage.supportingDocument', 'Supporting document')} •{' '}
                          {t('loansPage.markedForRemoval', 'Marked for removal')}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleLoanDocumentRemoval(editingLoan.id, doc.id)}
                        >
                          {t('common.undo', 'Undo')}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('loansPage.documentsRequirement', 'Upload at least one document before approving the loan.')}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={()=> setIsEditDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending || !editForm.formState.isValid}>Save</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    <LoanStatementDialog
      open={isStatementDialogOpen}
      onOpenChange={(open) => {
        setIsStatementDialogOpen(open);
        if (!open) {
          setStatementLoanId(null);
        }
      }}
      statement={loanStatement ?? null}
      isLoading={isStatementLoading}
    />
    </>
  );
}

interface LoanStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statement: LoanStatement | null;
  isLoading: boolean;
}

function LoanStatementDialog({
  open,
  onOpenChange,
  statement,
  isLoading,
}: LoanStatementDialogProps) {
  const { t } = useTranslation();

  const handleDownload = () => {
    if (!statement || typeof window === "undefined") {
      return;
    }
    const rows = [
      ["Installment", "Due Date", "Principal", "Interest", "Payment", "Remaining", "Status"],
      ...statement.schedule.map((entry) => [
        entry.installmentNumber,
        entry.dueDate,
        formatMoney(Number(entry.principalAmount)),
        formatMoney(Number(entry.interestAmount)),
        formatMoney(Number(entry.paymentAmount)),
        formatMoney(Number(entry.remainingBalance)),
        entry.status,
      ]),
    ];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `loan-${statement.loan.id}-statement.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totals = statement?.totals;
  const nextDueLabel = statement?.nextDue
    ? (() => {
        const parsed = new Date(statement.nextDue.dueDate);
        return Number.isNaN(parsed.getTime()) ? undefined : format(parsed, "MMM d, yyyy");
      })()
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('loansPage.statement', 'Loan statement')}</DialogTitle>
          <DialogDescription>
            {statement
              ? t('loansPage.statementSubtitle', 'Schedule and payment summary for the selected loan')
              : t('loansPage.statementDescription', 'Review amortization schedule and payments.')}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('common.loading', 'Loading...')}
          </div>
        ) : statement ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-muted-foreground">{t('loansPage.totalPrincipal', 'Total principal')}</p>
                <p className="text-base font-semibold">{formatMoney(totals?.scheduledPrincipal ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">{t('loansPage.totalInterest', 'Total interest')}</p>
                <p className="text-base font-semibold">{formatMoney(totals?.scheduledInterest ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">{t('loansPage.totalPaid', 'Total paid')}</p>
                <p className="text-base font-semibold">{formatMoney(totals?.totalPaid ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">{t('loansPage.outstandingBalance', 'Outstanding balance')}</p>
                <p className="text-base font-semibold">{formatMoney(totals?.outstandingBalance ?? 0)}</p>
                {nextDueLabel && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('loansPage.nextDue', 'Next due')}: {nextDueLabel}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">{t('loansPage.schedule', 'Amortization schedule')}</h4>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                {t('loansPage.downloadStatement', 'Download CSV')}
              </Button>
            </div>

            <div className="rounded-md border">
              <div className="max-h-64 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">{t('loansPage.installment', 'Inst.')}</th>
                      <th className="px-3 py-2">{t('loansPage.dueDate', 'Due date')}</th>
                      <th className="px-3 py-2">{t('loansPage.principal', 'Principal')}</th>
                      <th className="px-3 py-2">{t('loansPage.interest', 'Interest')}</th>
                      <th className="px-3 py-2">{t('loansPage.payment', 'Payment')}</th>
                      <th className="px-3 py-2">{t('loansPage.remaining', 'Remaining')}</th>
                      <th className="px-3 py-2">{t('loansPage.status', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.schedule.map((entry) => (
                      <tr key={`${entry.installmentNumber}-${entry.dueDate}`} className="border-t">
                        <td className="px-3 py-2">{entry.installmentNumber}</td>
                        <td className="px-3 py-2">{format(new Date(entry.dueDate), 'MMM d, yyyy')}</td>
                        <td className="px-3 py-2">{formatMoney(Number(entry.principalAmount))}</td>
                        <td className="px-3 py-2">{formatMoney(Number(entry.interestAmount))}</td>
                        <td className="px-3 py-2">{formatMoney(Number(entry.paymentAmount))}</td>
                        <td className="px-3 py-2">{formatMoney(Number(entry.remainingBalance))}</td>
                        <td className="px-3 py-2 capitalize">{entry.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h5 className="text-sm font-medium">{t('loansPage.payments', 'Payments')}</h5>
                <p className="text-sm text-muted-foreground">
                  {t('loansPage.paymentsSummary', '{{count}} recorded payroll payments', {
                    count: statement.payments.length,
                  })}
                </p>
              </div>
              {statement.documents.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium">{t('loansPage.documents', 'Documents')}</h5>
                  <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                    {statement.documents.map((doc) => (
                      <li key={doc.id}>
                        {doc.title || doc.documentType || doc.fileUrl}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('loansPage.noStatementData', 'No statement data available')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
