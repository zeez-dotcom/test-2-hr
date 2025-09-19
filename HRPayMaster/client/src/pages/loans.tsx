import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addMonths } from "date-fns";
import { DollarSign, Calendar, CheckCircle, XCircle, Plus, Trash2, Edit, TrendingUp, PauseCircle, HelpCircle } from "lucide-react";

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

import { insertLoanSchema, type LoanWithEmployee } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { apiPost, apiPut, apiDelete } from "@/lib/http";
import { toastApiError } from "@/lib/toastError";

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

export default function Loans() {
  const { t } = useTranslation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const {
    data: loans = [],
    isLoading,
    error: loansError,
  } = useQuery<LoanWithEmployee[]>({
    queryKey: ["/api/loans"]
  });

  const { data: employees = [], error: employeesError } = useQuery({
    queryKey: ["/api/employees"]
  });

  const { data: vacations = [] } = useQuery<any[]>({
    queryKey: ["/api/vacations"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPost("/api/loans", data);
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/loans", data.id] });
      }
      setIsCreateDialogOpen(false);
      toast({ title: "Loan created successfully" });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to create loan");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiPut(`/api/loans/${id}`, data);
      if (!res.ok) throw res;
      return id;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loans", id] });
      toast({ title: "Loan updated successfully" });
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

  if (loansError || employeesError) {
    return <div>Error loading loans</div>;
  }

  const onSubmit = (data: any) => {
    createMutation.mutate(data);
  };

  const handleApprove = (id: string) => {
    // Use "active" to align with server-side payroll deduction logic
    updateMutation.mutate({ 
      id, 
      data: { status: "active" }
    });
  };

  const handleReject = (id: string) => {
    updateMutation.mutate({ 
      id, 
      data: { status: "rejected" }
    });
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

                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending || !form.formState.isValid}>
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
          {loans.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <DollarSign className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No loans</h3>
                <p className="text-gray-500">Create the first employee loan to get started.</p>
              </CardContent>
            </Card>
          ) : (
            loans.map((loan) => (
              <Card key={loan.id}>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <div>
                        <CardTitle className="text-lg">
                          {loan.employee?.firstName} {loan.employee?.lastName}
                        </CardTitle>
                        <CardDescription>
                          ${parseFloat(loan.amount).toLocaleString()} loan • ${parseFloat(loan.monthlyDeduction).toLocaleString()}/month
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(loan.status)}
                      {loan.status === 'paused' && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <PauseCircle className="w-3 h-3" /> Paused
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingLoan(loan as any);
                          editForm.reset({
                            employeeId: loan.employeeId,
                            amount: Number(loan.amount),
                            monthlyDeduction: Number(loan.monthlyDeduction),
                            remainingAmount: loan.remainingAmount ? Number(loan.remainingAmount) : undefined,
                            startDate: loan.startDate,
                            endDate: loan.endDate || '',
                            interestRate: loan.interestRate ? Number(loan.interestRate) : undefined,
                            reason: loan.reason || '',
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
                            onClick={() => handleApprove(loan.id)}
                            disabled={updateMutation.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleReject(loan.id)}
                            disabled={updateMutation.isPending}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Reject
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Start Date</span>
                      <p className="font-medium">{format(new Date(loan.startDate), "MMM d, yyyy")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Interest Rate</span>
                      <p className="font-medium">{parseFloat(loan.interestRate || "0")}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Months Remaining</span>
                      <p className="font-medium">
                        {(loan.status === "active" || loan.status === "approved") 
                          ? calculateMonthsRemaining(loan.remainingAmount ?? loan.amount, loan.monthlyDeduction)
                          : "N/A"
                        }
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total Payments</span>
                      <p className="font-medium">
                        {Math.ceil(parseFloat(loan.amount) / parseFloat(loan.monthlyDeduction))} months
                      </p>
                    </div>
                    {(() => {
                      const meta = loanForecastMeta(loan);
                      return (
                        <div>
                          <span className="text-muted-foreground flex items-center gap-1">
                            Forecast Payoff
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="max-w-xs space-y-1">
                                    <div><strong>Now:</strong> {meta.adjustedLabel} {meta.willCompleteThisMonth ? '(this month)' : ''}</div>
                                    <div><strong>Before:</strong> {meta.baselineLabel}</div>
                                    <div><strong>Months remaining:</strong> {meta.monthsRemaining} {meta.pausedMonths > 0 ? `(+${meta.pausedMonths} paused)` : ''}</div>
                                    <div className="text-xs text-muted-foreground">Adds one month for each approved vacation that requested loan pause.</div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </span>
                          <p className="font-medium">
                            {meta.adjustedLabel}
                          </p>
                          <p className="text-xs text-muted-foreground">{meta.monthsRemaining} months {meta.pausedMonths > 0 ? `(+${meta.pausedMonths} paused)` : ''}</p>
                        </div>
                      );
                    })()}
                  </div>
                  {loan.reason && (
                    <div className="mt-4 pt-4 border-t">
                      <span className="text-muted-foreground text-sm">Purpose:</span>
                      <p className="text-sm mt-1">{loan.reason}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
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
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={()=> setIsEditDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending || !editForm.formState.isValid}>Save</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    </>
  );
}
