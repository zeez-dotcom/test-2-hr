import { useState } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

import type { VacationRequestWithEmployee } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { apiPost, apiPut, apiDelete, apiGet } from "@/lib/http";
import { toastApiError } from "@/lib/toastError";
import { Card as UICard } from "@/components/ui/card";

const schema = z
  .object({
    employeeId: z.string().min(1),
    start: z.string(),
    end: z.string(),
    leaveType: z.enum(["vacation", "sick", "personal", "other"]),
    reason: z.string().optional(),
    pauseLoans: z.boolean().optional(),
  })
  .refine(({ end, start }) => new Date(end) >= new Date(start), {
    message: "End date must be on or after start date",
    path: ["end"],
  });

const calcDays = (start: string, end: string) =>
  Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1;

export default function Vacations() {
  const { t } = useTranslation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const {
    data: vacationRequests = [],
    isLoading,
    error: vacationError,
  } = useQuery<VacationRequestWithEmployee[]>({
    queryKey: ["/api/vacations"]
  });
  const [location] = useLocation();
  const params = new URLSearchParams(location.split('?')[1] || '');
  const monthParam = params.get('month');
  const statusParam = params.get('status');
  const filteredVacations = vacationRequests.filter((v) => {
    const statusOk = statusParam ? (v.status || '').toLowerCase() === statusParam.toLowerCase() : true;
    if (!monthParam) return statusOk;
    const [y, m] = monthParam.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    const vs = new Date(v.startDate);
    const ve = new Date(v.endDate);
    return statusOk && vs <= end && ve >= start;
  });

  const { data: employees = [], error: employeesError } = useQuery({
    queryKey: ["/api/employees"]
  });

  // Coverage: upcoming 30 days
  const { data: coverage } = useQuery<any>({
    queryKey: ["/api/vacations/coverage"],
    queryFn: async () => {
      const start = new Date().toISOString().split('T')[0];
      const end = new Date(Date.now() + 30*86400000).toISOString().split('T')[0];
      const res = await apiGet(`/api/vacations/coverage?startDate=${start}&endDate=${end}`);
      if (!res.ok) throw res;
      return res.data;
    }
  });

  // Monthly coverage calendar for current month
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  const monthStartStr = monthStart.toISOString().split('T')[0];
  const monthEndStr = monthEnd.toISOString().split('T')[0];
  const { data: monthCoverage } = useQuery<any>({
    queryKey: ["/api/vacations/coverage", monthStartStr, monthEndStr],
    queryFn: async () => {
      const res = await apiGet(`/api/vacations/coverage?startDate=${monthStartStr}&endDate=${monthEndStr}`);
      if (!res.ok) throw res;
      return res.data;
    }
  });

  // Pull car assignments to warn on conflicts
  const { data: carAssignments = [] } = useQuery<any[]>({
    queryKey: ["/api/car-assignments"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPost("/api/vacations", data);
      if (!res.ok) {
        toastApiError(res, "Failed to submit vacation request");
        throw res;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Vacation request submitted successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiPut(`/api/vacations/${id}`, data);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations"] });
      toast({ title: "Vacation request updated successfully" });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to update vacation request");
    }
  });

  const markReturnedMutation = useMutation({
    mutationFn: async ({ id, employeeId }: { id: string; employeeId?: string }) => {
      const res = await apiPut(`/api/vacations/${id}`, { status: "completed" });
      if (!res.ok) throw res;
      if (employeeId) {
        await apiPut(`/api/employees/${employeeId}`, { status: "active" });
        // Resume paused loans if any
        try {
          const resp = await apiGet('/api/loans');
          if (resp.ok) {
            const pausedLoans = (resp.data as any[]).filter(l => l.employeeId === employeeId && l.status === 'paused' && Number(l.remainingAmount) > 0);
            if (pausedLoans.length > 0) {
              const shouldResume = window.confirm('Resume paused loan deductions for this employee?');
              if (shouldResume) {
                for (const loan of pausedLoans) {
                  await apiPut(`/api/loans/${loan.id}`, { status: 'active' });
                }
                queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
              }
            }
          }
        } catch {}
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "Vacation marked as returned" });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to mark as returned");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/vacations/${id}`);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations"] });
      toast({ title: "Vacation request deleted successfully" });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to delete vacation request");
    }
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeId: "",
      start: new Date().toISOString().split("T")[0],
      end: new Date().toISOString().split("T")[0],
      leaveType: "vacation",
      reason: "",
      pauseLoans: false,
    },
  });

  if (vacationError || employeesError) {
    return <div>Error loading vacations</div>;
  }

  const onSubmit = async (data: z.infer<typeof schema>) => {
    const payload = {
      employeeId: data.employeeId,
      startDate: data.start,
      endDate: data.end,
      days: calcDays(data.start, data.end),
      leaveType: data.leaveType,
      // encode pause-loans preference into reason (minimal change, no DB migration)
      reason: `${data.reason || ""}${data.pauseLoans ? (data.reason ? " " : "") + "[pause-loans]" : ""}`,
      status: "pending",
    };
    // Check for active car assignment overlapping the vacation period
    const start = new Date(data.start);
    const end = new Date(data.end);
    const activeAssignment = (carAssignments as any[]).find(a =>
      a.employeeId === data.employeeId &&
      a.status === 'active' &&
      new Date(a.assignedDate) <= end &&
      (!a.returnDate || new Date(a.returnDate) >= start)
    );

    if (activeAssignment) {
      const confirmEnd = window.confirm('This employee currently has an active car assignment overlapping this vacation. End the assignment the day before vacation starts?');
      if (confirmEnd) {
        const dayBefore = new Date(start);
        dayBefore.setDate(dayBefore.getDate() - 1);
        await apiPut(`/api/car-assignments/${activeAssignment.id}`, {
          status: 'completed',
          returnDate: dayBefore.toISOString().split('T')[0],
        });
        queryClient.invalidateQueries({ queryKey: ["/api/car-assignments"] });
      }
    }
    createMutation.mutate(payload);
  };

  const handleApprove = async (request: any) => {
    // Pause loans during approved vacation if chosen
    try {
      const res = await apiGet('/api/loans');
      if (res.ok) {
        const activeLoans = (res.data as any[]).filter(l => l.employeeId === request.employeeId && (l.status === 'active' || l.status === 'approved') && Number(l.remainingAmount) > 0);
        if (activeLoans.length > 0) {
          const requestedPause = String(request.reason || '').includes('[pause-loans]');
          const shouldPause = requestedPause || window.confirm('This employee has active loan(s). Pause loan deductions during this vacation?');
          if (shouldPause) {
            for (const loan of activeLoans) {
              await apiPut(`/api/loans/${loan.id}`, { status: 'paused' });
            }
            queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
          }
        }
      }
    } catch {}
    // Set employee status to on_leave for the period
    try {
      if (request?.employeeId) {
        await apiPut(`/api/employees/${request.employeeId}`, { status: 'on_leave' });
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      }
    } catch {}
    updateMutation.mutate({ id: request.id, data: { status: 'approved' } });
  };

  const handleReject = (id: string) => {
    updateMutation.mutate({ 
      id, 
      data: { status: "rejected" }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('nav.vacations')}</h1>
          <p className="text-muted-foreground">{t('vacationsPage.subtitle', 'Manage employee vacation and time-off requests')}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              {t('vacationsPage.newRequest', 'New Request')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('vacationsPage.newRequest', 'Submit Vacation Request')}</DialogTitle>
              <DialogDescription>{t('vacationsPage.subtitle', 'Submit a new vacation or time-off request for review.')}</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('docgen.employee')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('docgen.employee')} />
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
                    name="start"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vacationsPage.startDate','Start Date')}</FormLabel>
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
                        <FormLabel>{t('vacationsPage.endDate','End Date')}</FormLabel>
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
                      <FormLabel>{t('vacationsPage.type','Type')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('vacationsPage.type','Type')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="vacation">Vacation</SelectItem>
                          <SelectItem value="sick">Sick Leave</SelectItem>
                          <SelectItem value="personal">Personal</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
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
                      <FormLabel>{t('vacationsPage.reasonOptional','Reason (Optional)')}</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Brief explanation..."
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
                        <Checkbox
                          checked={!!field.value}
                          onCheckedChange={(v) => field.onChange(Boolean(v))}
                        />
                      </FormControl>
                      <FormLabel className="!m-0">Pause loan deductions during this vacation</FormLabel>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? t('actions.save') : t('vacationsPage.newRequest','Submit Request')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Coverage alerts */}
      {coverage && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold mb-2">Upcoming Coverage Alerts</h2>
            <p className="text-sm text-muted-foreground mb-3">Showing next 30 days where department vacations exceed threshold ({coverage.threshold}).</p>
            <div className="space-y-2 text-sm">
              {Object.entries(coverage.coverage).flatMap(([date, byDept]: any) => (
                Object.entries(byDept as any).filter(([, count]: any) => (count as number) >= coverage.threshold).map(([deptId, count]: any) => (
                  <div key={`${date}-${deptId}`} className="flex justify-between border rounded p-2">
                    <div>{new Date(date).toLocaleDateString()}</div>
                    <div>
                      Dept: {coverage.departments?.[deptId] ?? deptId}
                      <a className="ml-2 text-blue-600 underline" href={`/people?tab=departments&deptId=${encodeURIComponent(String(deptId))}`}>View</a>
                    </div>
                    <div className="font-medium">On leave: {count}</div>
                  </div>
                ))
              ))}
              {Object.entries(coverage.coverage).every(([_, byDept]: any) => Object.values(byDept as any).every((c: any) => (c as number) < coverage.threshold)) && (
                <div className="text-muted-foreground">No coverage alerts</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Coverage Calendar */}
      {monthCoverage && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold mb-2">{monthStart.toLocaleString(undefined, { month: 'long', year: 'numeric' })} Coverage</h2>
            <div className="grid grid-cols-7 gap-2 text-center text-sm">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                <div key={d} className="text-muted-foreground">{d}</div>
              ))}
              {Array(monthStart.getDay()).fill(null).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: monthEnd.getDate() }, (_, i) => i + 1).map(day => {
                const dateStr = new Date(monthStart.getFullYear(), monthStart.getMonth(), day).toISOString().split('T')[0];
                const byDept = monthCoverage.coverage?.[dateStr] || {} as any;
                const total: number = Object.values(byDept as any).reduce((a: number, b: any) => a + (b as number), 0);
                const over = total >= monthCoverage.threshold;
                return (
                  <div key={dateStr} className={`border rounded p-2 h-20 flex flex-col items-center justify-between ${over ? 'bg-red-50 border-red-200' : 'bg-card'}`}>
                    <div className="text-xs font-medium">{day}</div>
                    <div className={`text-xs ${over ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>{total} on leave</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
          {filteredVacations.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Calendar className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No vacation requests</h3>
                <p className="text-gray-500">Submit your first vacation request to get started.</p>
              </CardContent>
            </Card>
          ) : (
            filteredVacations.map((request) => (
              <Card key={request.id}>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getTypeIcon(request.leaveType || "vacation")}
                      <div>
                        <CardTitle className="text-lg">
                          {request.employee?.firstName} {request.employee?.lastName}
                        </CardTitle>
                        <CardDescription>
                          {format(new Date(request.startDate), "MMM d")} - {format(new Date(request.endDate), "MMM d, yyyy")}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(request.status)}
                      {request.status === "pending" && (
                        <div className="flex space-x-1">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleApprove(request)}
                            disabled={updateMutation.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleReject(request.id)}
                            disabled={updateMutation.isPending}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                      {request.status === "approved" && (
                        <div className="flex space-x-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markReturnedMutation.mutate({ id: request.id, employeeId: request.employeeId })}
                            disabled={markReturnedMutation.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Mark Returned
                          </Button>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(request.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {request.reason && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{request.reason}</p>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
