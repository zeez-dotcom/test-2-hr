import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

import PayrollGenerationWizard, {
  type PayrollGenerationPayload,
} from "@/components/payroll/payroll-generation-wizard";
import PayrollDetailsView from "@/components/payroll/payroll-details-view";
import PayrollEditView from "@/components/payroll/payroll-edit-view-simple";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Calculator,
  DollarSign,
  FileText,
  Trash2,
  Eye,
  Edit,
  RefreshCcw,
  Printer,
  Download,
  Loader2,
  CheckCircle2,
  Ban,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiPost, apiDelete, apiGet, apiPut } from "@/lib/http";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import type {
  Company,
  PayrollExportArtifact,
  PayrollRun,
  PayrollRunWithEntries,
  User,
} from "@shared/schema";
import { useSearch, useLocation } from "wouter";
import { toastApiError } from "@/lib/toastError";
import { useTranslation } from "react-i18next";
import { openPayrollRunReport } from "@/lib/payroll-run-report";

type PayrollGenerateRequest = PayrollGenerationPayload;

const getErrorMessage = (error: unknown): string | undefined => {
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
    const nestedError = (error as { error?: unknown }).error;
    if (nestedError) {
      return getErrorMessage(nestedError);
    }
  }
  return undefined;
};

function useSearchParams() {
  const search = useSearch();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function Payroll() {
  const { t } = useTranslation();
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [selectedPayrollId, setSelectedPayrollId] = useState<string | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [payrollToDelete, setPayrollToDelete] = useState<string | null>(null);
  const [requiresLoanUndo, setRequiresLoanUndo] = useState(false);
  const [loanUndoComplete, setLoanUndoComplete] = useState(false);
  const [loanBlockMessage, setLoanBlockMessage] = useState<string | null>(null);
  const [isCheckingLoanStatus, setIsCheckingLoanStatus] = useState(false);
  const [printHandler, setPrintHandler] = useState<(() => void) | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [reportLoadingId, setReportLoadingId] = useState<string | null>(null);
  const { toast } = useToast();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("generate") === "1") {
      setIsGenerateDialogOpen(true);
    }
  }, [searchParams]);

  const user = queryClient.getQueryData<User>(["/api/me"]);
  const [, navigate] = useLocation();
  const canGenerate = user?.role === "admin" || user?.role === "hr";

  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [user, navigate]);

  const {
    data: payrollRuns,
    isLoading,
    error,
    refetch,
  } = useQuery<PayrollRun[]>({
    queryKey: ["/api/payroll"],
    enabled: canGenerate,
  });

  const { data: companyConfig } = useQuery<Company>({
    queryKey: ["/api/company"],
    enabled: canGenerate,
  });

  const generatePayrollMutation = useMutation<string, unknown, PayrollGenerateRequest>({
    mutationFn: async (data: PayrollGenerateRequest) => {
      const res = await apiPost("/api/payroll/generate", data);
      if (!res.ok) throw res;
      return data.status ?? "completed";
    },
    onSuccess: (runStatus) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsGenerateDialogOpen(false);
      toast({
        title: t('common.success','Success'),
        description:
          runStatus === "draft"
            ? t('payroll.draftSaved','Payroll draft saved')
            : t('payroll.generated','Payroll generated successfully'),
      });
    },
    onError: (res: any) => {
      const status = res?.status;
      if (status === 409) {
        const description =
          getErrorMessage(res?.error) ??
          getErrorMessage(res) ??
          t(
            'payroll.exists',
            'Payroll run already exists for this period',
          );
        toast({ title: t('payroll.duplicatePeriod','Duplicate period'), description, variant: "destructive" });
        return;
      }
      if (status === 401) {
        navigate("/login");
        return;
      }
      // Tests expect generic errors to use title 'Error' and a descriptive message
      const serverMessage =
        (res?.error && typeof res.error === "object" && (res.error as any)?.message)
          ? (res.error as any).message
          : (typeof res?.error === "string" ? res.error : undefined);
      if (serverMessage) {
        toast({ title: t('errors.errorTitle','Error'), description: serverMessage, variant: "destructive" });
      } else {
        toast({ title: t('errors.errorTitle','Error'), description: t('payroll.generateFailed','Failed to generate payroll'), variant: "destructive" });
      }
    },
  });

  const deletePayrollMutation = useMutation({
    mutationFn: async (payrollId: string) => {
      const res = await apiDelete(`/api/payroll/${payrollId}`);
      if (!res.ok) throw res;
      return payrollId;
    },
    onSuccess: (_, payrollId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: t('common.success','Success'),
        description: t('payroll.deleted','Payroll run deleted successfully'),
      });
      handleConfirmOpenChange(false);
    },
    onError: (err, payrollId) => {
      const status = (err as any)?.status;
      if (status === 409 || status === 422) {
        const message =
          getErrorMessage((err as any)?.error) ??
          t(
            'payroll.loanDeletionBlocked',
            'Loan deductions were applied to this payroll run. Undo them before deleting to keep loan balances accurate.',
          );
        setLoanBlockMessage(message);
        setRequiresLoanUndo(true);
        setLoanUndoComplete(false);
        setPayrollToDelete(payrollId ?? payrollToDelete);
        setIsConfirmOpen(true);
        setIsCheckingLoanStatus(false);
        return;
      }
      toastApiError(err as any, t('payroll.deleteFailed','Failed to delete payroll run'));
    },
  });

  const undoLoanDeductionsMutation = useMutation({
    mutationFn: async (payrollId: string) => {
      const res = await apiPost(`/api/payroll/${payrollId}/undo-loan-deductions`);
      if (!res.ok) throw res;
      return payrollId;
    },
    onSuccess: (_, payrollId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      if (payrollId) {
        queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] });
      }
      setLoanUndoComplete(true);
      setLoanBlockMessage(
        t(
          'payroll.loanUndoComplete',
          'Loan deductions have been undone. You can now safely delete this payroll run.',
        ),
      );
      toast({
        title: t('common.success','Success'),
        description: t('payroll.loanUndoSuccess','Loan deductions were returned to their original balances.'),
      });
    },
    onError: (err) => {
      toastApiError(err as any, t('payroll.loanUndoFailed','Failed to undo loan deductions'));
    },
  });

  const recalcMutation = useMutation({
    mutationFn: async (payrollId: string) => {
      const res = await apiPost(`/api/payroll/${payrollId}/recalculate`);
      if (!res.ok) throw res;
      return payrollId;
    },
    onSuccess: (_, payrollId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] });
      toast({ title: t('common.success','Success'), description: t('payroll.recalcOk','Totals recalculated') });
    },
    onError: (err) => {
      toastApiError(err as any, t('payroll.recalcFailed','Failed to recalculate totals'));
    },
  });

  const updatePayrollStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PayrollRun["status"] }) => {
      const res = await apiPut(`/api/payroll/${id}`, { status });
      if (!res.ok) throw res;
      const data = res.data as PayrollRun | undefined;
      return { id, status, data };
    },
    onSuccess: ({ id, status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      const description =
        status === "completed"
          ? t('payroll.publishSuccess','Payroll run published successfully')
          : status === "cancelled"
          ? t('payroll.cancelSuccess','Payroll run cancelled')
          : t('payroll.statusUpdated','Payroll status updated');
      toast({ title: t('common.success','Success'), description });
    },
    onError: (err) => {
      toastApiError(err as any, t('payroll.statusUpdateFailed','Failed to update payroll status'));
    },
  });

  const handleGeneratePayroll = (data: PayrollGenerateRequest) => {
    const calendarKey = data.calendarId ?? "default";
    const exists = payrollRuns?.some(
      run => run.period === data.period && (run.calendarId ?? "default") === calendarKey,
    );
    if (exists) {
      toast({
        title: t('errors.errorTitle','Error'),
        description: t('payroll.exists','Payroll run already exists for this period'),
        variant: "destructive",
      });
      return;
    }
    generatePayrollMutation.mutate(data);
  };

  const handleGenerateReport = async (payrollId: string) => {
    try {
      setReportLoadingId(payrollId);
      const res = await apiGet(`/api/payroll/${payrollId}`);
      if (!res.ok) {
        throw res;
      }
      const payrollRun = res.data as PayrollRunWithEntries;
      openPayrollRunReport(payrollRun);
      toast({
        title: t("common.success", "Success"),
        description: t("payroll.reportSuccess", "Payroll report generated"),
      });
    } catch (error) {
      toastApiError(error as any, t("payroll.reportFailed", "Failed to generate payroll report"));
    } finally {
      setReportLoadingId(current => (current === payrollId ? null : current));
    }
  };

  const handleUpdatePayrollStatus = (id: string, status: PayrollRun["status"]) => {
    updatePayrollStatusMutation.mutate({ id, status });
  };

  const handleDeletePayroll = useCallback(
    async (payrollId: string) => {
      setPayrollToDelete(payrollId);
      setRequiresLoanUndo(false);
      setLoanUndoComplete(false);
      setLoanBlockMessage(null);
      setIsCheckingLoanStatus(true);
      setIsConfirmOpen(true);

      const res = await apiGet(`/api/payroll/${payrollId}`);
      if (!res.ok) {
        setIsConfirmOpen(false);
        setPayrollToDelete(null);
        setIsCheckingLoanStatus(false);
        if (res.status === 401) {
          navigate("/login");
          return;
        }
        toastApiError(res as any, t('payroll.loadFailed','Failed to load payroll run'));
        return;
      }

      const entries = Array.isArray((res.data as any)?.entries)
        ? ((res.data as any).entries as Array<{ loanDeduction?: unknown }>)
        : [];
      const hasLoanDeductions = entries.some(entry => {
        const value = entry?.loanDeduction;
        if (value === null || value === undefined) return false;
        const numericValue = Number.parseFloat(
          typeof value === "string" ? value : value?.toString?.() ?? String(value),
        );
        return Number.isFinite(numericValue) && numericValue > 0;
      });

      if (hasLoanDeductions) {
        setRequiresLoanUndo(true);
        setLoanBlockMessage(
          t(
            'payroll.loanDeletionWarning',
            'Loan deductions were applied to this payroll run. Undo them before deleting to keep loan balances accurate.',
          ),
        );
      }

      setIsCheckingLoanStatus(false);
    },
    [navigate, t, toastApiError],
  );

  const confirmDeletePayroll = () => {
    if (!payrollToDelete) return;
    if (requiresLoanUndo && !loanUndoComplete) {
      return;
    }
    deletePayrollMutation.mutate(payrollToDelete);
  };

  const handleConfirmOpenChange = (open: boolean) => {
    setIsConfirmOpen(open);
    if (!open) {
      setPayrollToDelete(null);
      setRequiresLoanUndo(false);
      setLoanUndoComplete(false);
      setLoanBlockMessage(null);
      setIsCheckingLoanStatus(false);
      undoLoanDeductionsMutation.reset();
    }
  };

  const handleViewPayroll = (payrollId: string) => {
    setSelectedPayrollId(payrollId);
    setIsViewDialogOpen(true);
  };

  const handleEditPayroll = (payrollId: string) => {
    setSelectedPayrollId(payrollId);
    setIsEditDialogOpen(true);
  };

  const handleRegisterPrint = useCallback((handler: (() => void) | null) => {
    setPrintHandler(() => handler ?? null);
  }, []);

  const handleQuickPrint = (payrollId: string) => {
    setSelectedPayrollId(payrollId);
    setIsViewDialogOpen(true);
    setPendingPrint(true);
  };

  const handleDownloadArtifact = useCallback(
    (artifact: PayrollExportArtifact) => {
      try {
        const binary = atob(artifact.data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) {
          bytes[index] = binary.charCodeAt(index);
        }
        const blob = new Blob([bytes], { type: artifact.mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = artifact.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Failed to download export artifact", error);
        toast({
          title: t('errors.errorTitle','Error'),
          description: t('payroll.downloadFailed','Unable to download export file'),
          variant: "destructive",
        });
      }
    },
    [toast, t],
  );

  useEffect(() => {
    if (pendingPrint && printHandler) {
      printHandler();
      setPendingPrint(false);
    }
  }, [pendingPrint, printHandler]);

  useEffect(() => {
    if (!isViewDialogOpen) {
      setPendingPrint(false);
      setPrintHandler(null);
    }
  }, [isViewDialogOpen]);

  if (error) {
    return (
      <div>
        <p>{t('payroll.errorLoading','Error loading payroll data')}</p>
        <Button onClick={() => refetch()}>{t('common.retry','Retry')}</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('nav.payroll','Payroll')}</h1>
          <p className="text-muted-foreground">{t('payroll.subtitle','Manage employee payroll and compensation')}</p>
        </div>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <div className="mb-2 h-4 w-3/4 rounded bg-muted"></div>
                <div className="h-8 w-1/2 rounded bg-muted"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success text-white';
      case 'draft':
        return 'bg-blue-200 text-blue-900 dark:bg-blue-900/60 dark:text-blue-100';
      case 'pending':
        return 'bg-warning text-white';
      case 'cancelled':
        return 'bg-destructive text-white';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

    const totalPayroll = payrollRuns?.reduce((sum, run) => sum + parseFloat(run.grossAmount), 0) || 0;
  const completedRuns = payrollRuns?.filter(run => run.status === 'completed').length || 0;
  const pendingRuns = payrollRuns?.filter(run => run.status === 'pending').length || 0;

  const deleteDialogDescription = isCheckingLoanStatus
    ? t('payroll.checkingLoanDeductions','Checking payroll for loan deductions...')
    : requiresLoanUndo
      ? loanUndoComplete
        ? loanBlockMessage ?? t('payroll.loanUndoComplete','Loan deductions have been undone. You can now safely delete this payroll run.')
        : loanBlockMessage ?? t('payroll.loanDeletionWarning','Loan deductions were applied to this payroll run. Undo them before deleting to keep loan balances accurate.')
      : loanBlockMessage ?? t('payroll.deleteDesc','Are you sure you want to delete this payroll run?');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Payroll</h1>
        <p className="text-muted-foreground">Manage employee payroll and compensation</p>
        {!canGenerate && (
          <p className="text-sm text-muted-foreground mt-2">
            You do not have permission to generate payroll.
          </p>
        )}
      </div>
            {/* Payroll Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="text-success" size={20} />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-muted-foreground">{t('payroll.total','Total Payroll')}</p>
                      <p className="text-2xl font-semibold text-foreground">
                        {formatCurrency(totalPayroll)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <FileText className="text-primary" size={20} />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-muted-foreground">{t('payroll.completedRuns','Completed Runs')}</p>
                      <p className="text-2xl font-semibold text-foreground">{completedRuns}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        <Calculator className="text-warning" size={20} />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-muted-foreground">{t('payroll.pendingRuns','Pending Runs')}</p>
                      <p className="text-2xl font-semibold text-foreground">{pendingRuns}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Payroll History */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-medium text-foreground">{t('payroll.history','Payroll History')}</CardTitle>
                  
                  <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="success" disabled={!canGenerate}>
                        <Calculator className="mr-2" size={16} />
                        {t('payroll.generate','Generate Payroll')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{t('payroll.generateNew','Generate New Payroll')}</DialogTitle>
                      </DialogHeader>
                      <PayrollGenerationWizard
                        onSubmit={handleGeneratePayroll}
                        isSubmitting={generatePayrollMutation.isPending}
                        canGenerate={canGenerate}
                        calendars={companyConfig?.payrollCalendars ?? []}
                        frequencies={companyConfig?.payrollFrequencies ?? []}
                        exportFormats={companyConfig?.payrollExportFormats ?? []}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {!payrollRuns || payrollRuns.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Calculator className="mx-auto h-12 w-12 text-muted-foreground/60" />
                    <h3 className="mt-2 text-sm font-medium text-foreground">No payroll runs</h3>
                    <p className="mt-1 text-sm">Get started by generating your first payroll.</p>
                    <div className="mt-6">
                      <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="success" disabled={!canGenerate}>
                            <Calculator className="mr-2" size={16} />
                            Generate Payroll
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Generate New Payroll</DialogTitle>
                          </DialogHeader>
                          <PayrollGenerationWizard
                            onSubmit={handleGeneratePayroll}
                            isSubmitting={generatePayrollMutation.isPending}
                            canGenerate={canGenerate}
                            calendars={companyConfig?.payrollCalendars ?? []}
                            frequencies={companyConfig?.payrollFrequencies ?? []}
                            exportFormats={companyConfig?.payrollExportFormats ?? []}
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Period
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Date Range
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Gross Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Net Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Status
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-card">
                        {payrollRuns.map((payroll) => (
                          <tr key={payroll.id} className="hover:bg-accent/40">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              <div className="font-medium">{payroll.period}</div>
                              <div className="text-xs text-muted-foreground">
                                {(payroll.cycleLabel ?? t('payroll.defaultCycle','Default cycle'))} ·{' '}
                                {payroll.scenarioKey ?? 'baseline'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              {formatDate(payroll.startDate)} - {formatDate(payroll.endDate)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              {formatCurrency(payroll.grossAmount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                              {formatCurrency(payroll.netAmount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge className={getStatusColor(payroll.status)}>
                                {payroll.status}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {payroll.status === "draft" && (
                                  <>
                                    <Button
                                      variant="success"
                                      size="sm"
                                      onClick={() => handleUpdatePayrollStatus(payroll.id, "completed")}
                                      disabled={
                                        updatePayrollStatusMutation.isPending &&
                                        updatePayrollStatusMutation.variables?.id === payroll.id
                                      }
                                    >
                                      <CheckCircle2 className="mr-1" size={14} />
                                      {t('payroll.publish','Publish')}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-destructive hover:text-destructive focus-visible:ring-destructive"
                                      onClick={() => handleUpdatePayrollStatus(payroll.id, "cancelled")}
                                      disabled={
                                        updatePayrollStatusMutation.isPending &&
                                        updatePayrollStatusMutation.variables?.id === payroll.id
                                      }
                                    >
                                      <Ban className="mr-1" size={14} />
                                      {t('payroll.cancelRun','Cancel')}
                                    </Button>
                              </>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateReport(payroll.id)}
                              disabled={reportLoadingId === payroll.id}
                            >
                              {reportLoadingId === payroll.id ? (
                                <>
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                  <span>{t('payroll.reportGenerating','Generating report…')}</span>
                                </>
                              ) : (
                                <>
                                  <FileText className="mr-1" size={14} />
                                  <span>{t('payroll.reportShort','Report')}</span>
                                </>
                              )}
                            </Button>
                            {payroll.exportArtifacts && payroll.exportArtifacts.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Download className="mr-1" size={14} />
                                        {t('payroll.exports','Exports')}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {payroll.exportArtifacts.map(artifact => (
                                        <DropdownMenuItem
                                          key={artifact.id}
                                          onSelect={(event: Event) => {
                                            event.preventDefault();
                                            handleDownloadArtifact(artifact);
                                          }}
                                        >
                                          {artifact.filename}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewPayroll(payroll.id)}
                                >
                                  <Eye className="mr-1" size={14} />
                                  View
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleQuickPrint(payroll.id)}
                                >
                                  <Printer className="mr-1" size={14} />
                                  Print
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditPayroll(payroll.id)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <Edit className="mr-1" size={14} />
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => recalcMutation.mutate(payroll.id)}
                                  disabled={recalcMutation.isPending}
                                  className="text-emerald-700 hover:text-emerald-800"
                                >
                                  <RefreshCcw className="mr-1" size={14} />
                                  Recalc
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeletePayroll(payroll.id)}
                                  disabled={deletePayrollMutation.isPending}
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
                  </div>
                )}
              </CardContent>
            </Card>

            {/* View Payroll Dialog */}
            <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto print:static print:max-h-full print:overflow-visible print:border-0 print:p-0 print:shadow-none print:w-full">
                <DialogHeader>
                  <DialogTitle>{t('payroll.details','Payroll Details')}</DialogTitle>
                </DialogHeader>
                {selectedPayrollId && (
                  <PayrollDetailsView
                    payrollId={selectedPayrollId}
                    onRegisterPrint={handleRegisterPrint}
                  />
                )}
              </DialogContent>
            </Dialog>

            {/* Edit Payroll Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('payroll.edit','Edit Payroll (Excel-like)')}</DialogTitle>
                </DialogHeader>
                {selectedPayrollId && (
                  <PayrollEditView payrollId={selectedPayrollId} />
                )}
              </DialogContent>
            </Dialog>
            <Dialog open={isConfirmOpen} onOpenChange={handleConfirmOpenChange}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('payroll.deleteTitle','Delete Payroll Run')}</DialogTitle>
                  <DialogDescription>{deleteDialogDescription}</DialogDescription>
                </DialogHeader>
                {requiresLoanUndo && (
                  <div className="space-y-3">
                    {loanUndoComplete ? (
                      <Badge variant="outline" className="w-fit bg-success/10 text-success">
                        {t('payroll.loanUndoCompleteShort','Loan deductions undone')}
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => payrollToDelete && undoLoanDeductionsMutation.mutate(payrollToDelete)}
                        disabled={
                          !payrollToDelete ||
                          undoLoanDeductionsMutation.isPending ||
                          isCheckingLoanStatus
                        }
                        className="justify-start"
                      >
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        {undoLoanDeductionsMutation.isPending
                          ? t('payroll.undoingLoanDeductions','Undoing loan deductions...')
                          : t('payroll.undoLoanDeductions','Undo loan deductions')}
                      </Button>
                    )}
                  </div>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleConfirmOpenChange(false)}
                    disabled={deletePayrollMutation.isPending || undoLoanDeductionsMutation.isPending}
                  >
                    {t('common.cancel','Cancel')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={confirmDeletePayroll}
                    disabled={
                      deletePayrollMutation.isPending ||
                      isCheckingLoanStatus ||
                      (requiresLoanUndo && !loanUndoComplete)
                    }
                  >
                    {deletePayrollMutation.isPending
                      ? t('payroll.deleting','Deleting...')
                      : t('actions.delete','Delete')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
    </div>
  );
}
