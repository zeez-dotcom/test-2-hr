import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiGet, apiPost, apiDelete, apiUpload } from "@/lib/http";

const schema = z.object({
  employeeId: z.string().min(1),
  date: z.string().min(1),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  hours: z.preprocess(
    value => (value === "" || value === undefined ? undefined : Number(value)),
    z.number().nonnegative().optional(),
  ),
  source: z.string().optional(),
  notes: z.string().optional(),
});

const DEFAULT_OVERTIME_LIMIT_MINUTES = 120;

const toDateKey = (date: Date) => date.toISOString().split("T")[0];
const fromDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};
const minutesToHours = (minutes: number | undefined) => {
  if (!Number.isFinite(minutes) || minutes === undefined) {
    return "0.00";
  }
  return (minutes / 60).toFixed(2);
};
const formatVariance = (minutes: number) => {
  if (!Number.isFinite(minutes)) {
    return "0.00h";
  }
  const hours = minutes / 60;
  const sign = hours > 0 ? "+" : hours < 0 ? "-" : "";
  return `${sign}${Math.abs(hours).toFixed(2)}h`;
};
const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "—";
const shortTime = (value?: string | null) =>
  value ? value.slice(0, 5) : "—";

export default function Attendance() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [approvalDialog, setApprovalDialog] = useState<null | {
    type: "late" | "absence" | "overtime";
  }>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalHours, setApprovalHours] = useState("");
  const [range, setRange] = useState(() => {
    const d = new Date();
    const startDate = new Date(d.getFullYear(), d.getMonth(), 1);
    const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: toDateKey(startDate), end: toDateKey(endDate) };
  });

  useEffect(() => {
    const start = new Date(range.start);
    const end = new Date(range.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return;
    }
    if (selectedDate < start || selectedDate > end) {
      setSelectedDate(start);
    }
  }, [range.start, range.end, selectedDate]);

  const { data: employees = [] } = useQuery<any[]>({ queryKey: ["/api/employees"] });

  useEffect(() => {
    if (!selectedEmployeeId && employees.length > 0) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  useEffect(() => {
    if (selectedEmployeeId) {
      const start = new Date(range.start);
      if (!Number.isNaN(start.getTime())) {
        setSelectedDate(start);
      }
    }
  }, [selectedEmployeeId, range.start]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, any>();
    employees.forEach(emp => map.set(emp.id, emp));
    return map;
  }, [employees]);

  const scheduleQueryKey = useMemo(
    () => ["/api/attendance/schedules", range.start, range.end, selectedEmployeeId ?? "none"],
    [range.start, range.end, selectedEmployeeId],
  );

  const { data: schedules = [], isFetching: schedulesLoading } = useQuery<any[]>({
    queryKey: scheduleQueryKey,
    enabled: Boolean(selectedEmployeeId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("start", range.start);
      params.set("end", range.end);
      if (selectedEmployeeId) {
        params.set("employeeId", selectedEmployeeId);
      }
      const res = await apiGet(`/api/attendance/schedules?${params.toString()}`);
      if (!res.ok) throw new Error(res.error || "Failed");
      return res.data as any[];
    },
  });

  const scheduleMap = useMemo(() => {
    const map = new Map<string, any>();
    (schedules ?? []).forEach(schedule => {
      map.set(schedule.scheduleDate, schedule);
    });
    return map;
  }, [schedules]);

  const selectedDateKey = selectedDate ? toDateKey(selectedDate) : null;
  const selectedSchedule = selectedDateKey ? scheduleMap.get(selectedDateKey) : undefined;

  useEffect(() => {
    if (approvalDialog && selectedSchedule) {
      setApprovalNotes(selectedSchedule.notes ?? "");
      if (approvalDialog.type === "overtime") {
        const fallback = selectedSchedule.overtimeMinutes ?? Math.max(0, selectedSchedule.varianceMinutes ?? 0);
        setApprovalHours(fallback > 0 ? (fallback / 60).toFixed(2) : "");
      } else {
        setApprovalHours("");
      }
    }
    if (!approvalDialog) {
      setApprovalNotes("");
      setApprovalHours("");
    }
  }, [approvalDialog, selectedSchedule]);

  const scheduleModifiers = useMemo(() => {
    const absence: Date[] = [];
    const late: Date[] = [];
    const overtime: Date[] = [];
    const scheduled: Date[] = [];
    for (const schedule of schedules ?? []) {
      const date = fromDateKey(schedule.scheduleDate);
      scheduled.push(date);
      const pending = schedule.pendingExceptions ?? [];
      if (
        pending.includes("absence") ||
        (schedule.actualMinutes === 0 && (schedule.absenceApprovalStatus ?? "pending") !== "approved")
      ) {
        absence.push(date);
      }
      if (pending.includes("late")) {
        late.push(date);
      }
      if (pending.includes("overtime")) {
        overtime.push(date);
      }
    }
    return { absence, late, overtime, scheduled };
  }, [schedules]);

  const totals = useMemo(() => {
    let expected = 0;
    let actual = 0;
    let pending = 0;
    let breaches = 0;
    for (const schedule of schedules ?? []) {
      expected += Number(schedule.expectedMinutes ?? 0);
      actual += Number(schedule.actualMinutes ?? 0);
      pending += (schedule.pendingExceptions?.length ?? 0);
      const limit = schedule.shiftTemplate?.overtimeLimitMinutes ?? DEFAULT_OVERTIME_LIMIT_MINUTES;
      const variance = Number(schedule.varianceMinutes ?? schedule.actualMinutes - schedule.expectedMinutes);
      if (variance > limit && (schedule.overtimeApprovalStatus ?? "pending") !== "approved") {
        breaches += 1;
      }
    }
    return { expected, actual, pending, breaches };
  }, [schedules]);

  const { data: attendanceRows = [], refetch: refetchAttendance } = useQuery<any[]>({
    queryKey: ["/api/attendance", range.start, range.end],
    queryFn: async () => {
      const res = await apiGet(`/api/attendance?startDate=${range.start}&endDate=${range.end}`);
      if (!res.ok) throw new Error(res.error || "Failed");
      return res.data;
    },
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeId: "",
      date: new Date().toISOString().split("T")[0],
      source: "manual",
    },
  });

  useEffect(() => {
    if (selectedEmployeeId) {
      form.setValue("employeeId", selectedEmployeeId);
    }
  }, [selectedEmployeeId, form]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPost("/api/attendance", data);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      setIsOpen(false);
      refetchAttendance();
      queryClient.invalidateQueries({ queryKey: scheduleQueryKey });
      toast({ title: t("attendancePage.recorded", "Attendance recorded") });
    },
    onError: (error: any) => {
      toast({
        title: error?.error || t("attendancePage.error", "Failed to record attendance"),
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiUpload("/api/attendance/import", fd);
      if (!res.ok) throw res;
      return res.data as any;
    },
    onSuccess: (data: any) => {
      refetchAttendance();
      queryClient.invalidateQueries({ queryKey: scheduleQueryKey });
      toast({
        title: t("attendancePage.imported", "Imported"),
        description: `${t("attendancePage.imported", "Imported")} ${data.imported}, ${t("attendancePage.failed", "failed")} ${data.failed}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: error?.error || t("attendancePage.error", "Failed to import attendance"),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/attendance/${id}`);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      refetchAttendance();
      queryClient.invalidateQueries({ queryKey: scheduleQueryKey });
      toast({ title: t("attendancePage.removed", "Attendance removed") });
    },
    onError: (error: any) => {
      toast({
        title: error?.error || t("attendancePage.error", "Failed to delete attendance"),
        variant: "destructive",
      });
    },
  });

  const approvalMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      type: "late" | "absence" | "overtime";
      status: "approved" | "rejected";
      notes?: string;
      minutes?: number;
    }) => {
      const res = await apiPost(
        `/api/attendance/schedules/${payload.id}/approvals`,
        {
          type: payload.type,
          status: payload.status,
          notes: payload.notes,
          minutes: payload.minutes,
        },
      );
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKey });
      toast({ title: t("attendancePage.approvalSaved", "Schedule approval updated") });
      setApprovalDialog(null);
    },
    onError: (error: any) => {
      toast({
        title: error?.error || t("attendancePage.error", "Failed to update approval"),
        variant: "destructive",
      });
    },
  });

  const handleApproval = (status: "approved" | "rejected") => {
    if (!approvalDialog || !selectedSchedule) {
      return;
    }
    const trimmedNotes = approvalNotes.trim();
    let minutes: number | undefined;
    if (approvalDialog.type === "overtime") {
      if (status === "approved") {
        const parsed = Number.parseFloat(approvalHours);
        if (Number.isFinite(parsed) && parsed > 0) {
          minutes = Math.round(parsed * 60);
        } else {
          const fallback = selectedSchedule.overtimeMinutes ?? Math.max(0, selectedSchedule.varianceMinutes ?? 0);
          minutes = Math.round(fallback);
        }
      } else {
        minutes = 0;
      }
    }
    approvalMutation.mutate({
      id: selectedSchedule.id,
      type: approvalDialog.type,
      status,
      notes: trimmedNotes.length > 0 ? trimmedNotes : undefined,
      minutes,
    });
  };

  const statusClass = (status?: string | null) => {
    switch (status) {
      case "approved":
        return "bg-emerald-100 text-emerald-800";
      case "rejected":
        return "bg-rose-100 text-rose-800";
      default:
        return "bg-amber-100 text-amber-800";
    }
  };

  const absencePending = selectedSchedule
    ? (selectedSchedule.pendingExceptions ?? []).includes("absence") ||
      (selectedSchedule.actualMinutes === 0 && (selectedSchedule.absenceApprovalStatus ?? "pending") !== "approved")
    : false;
  const latePending = selectedSchedule
    ? (selectedSchedule.pendingExceptions ?? []).includes("late")
    : false;
  const overtimePending = selectedSchedule
    ? (selectedSchedule.pendingExceptions ?? []).includes("overtime")
    : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("nav.attendance", "Attendance")}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "attendancePage.subtitle",
              "Plan shifts, approve exceptions, and reconcile actual punches.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selectedEmployeeId ?? ""}
            onValueChange={value => setSelectedEmployeeId(value || null)}
            disabled={employees.length === 0}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("attendancePage.selectEmployee", "Select employee")} />
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee: any) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {`${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || employee.employeeCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={range.start}
            onChange={event => setRange(prev => ({ ...prev, start: event.target.value }))}
          />
          <Input
            type="date"
            value={range.end}
            onChange={event => setRange(prev => ({ ...prev, end: event.target.value }))}
          />
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <span>{t("attendancePage.importCsv", "Import CSV")}</span>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) {
                  importMutation.mutate(file);
                }
              }}
            />
          </label>
          <Button
            variant="outline"
            onClick={async () => {
              const res = await fetch("/api/attendance/template", { credentials: "include" });
              const text = await res.text();
              const blob = new Blob([text], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "attendance-template.csv";
              document.body.appendChild(anchor);
              anchor.click();
              anchor.remove();
              URL.revokeObjectURL(url);
            }}
          >
            {t("attendancePage.downloadTemplate", "Download Template")}
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>{t("attendancePage.record", "Record")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("attendancePage.record", "Record attendance")}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(data => createMutation.mutate(data))}
                  className="space-y-3"
                >
                  <FormField
                    control={form.control}
                    name="employeeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("docgen.employee", "Employee")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("docgen.employee", "Employee")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {employees.map((employee: any) => (
                              <SelectItem key={employee.id} value={employee.id}>
                                {`${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || employee.employeeCode}
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
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("vacationsPage.startDate", "Date")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="checkIn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("attendancePage.checkIn", "Check-in")}</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="checkOut"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("attendancePage.checkOut", "Check-out")}</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="hours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("attendancePage.hoursOptional", "Hours (optional)")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.25"
                            {...field}
                            onChange={event => field.onChange(event.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("attendancePage.notes", "Notes")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? t("actions.save", "Save") : t("actions.save", "Save")}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("attendancePage.plannedSchedules", "Planned schedules")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedEmployeeId ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      {t("attendancePage.expectedHours", "Expected hours")}
                    </p>
                    <p className="text-lg font-semibold">{minutesToHours(totals.expected)}h</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      {t("attendancePage.actualHours", "Actual hours")}
                    </p>
                    <p className="text-lg font-semibold">{minutesToHours(totals.actual)}h</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      {t("attendancePage.variance", "Variance")}
                    </p>
                    <p
                      className={`text-lg font-semibold ${
                        totals.actual - totals.expected >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {formatVariance(totals.actual - totals.expected)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">
                      {t("attendancePage.pendingApprovals", "Pending approvals")}
                    </p>
                    <p className="text-lg font-semibold">{totals.pending}</p>
                  </div>
                </div>
                {schedulesLoading && (
                  <p className="text-xs text-muted-foreground">
                    {t("attendancePage.loadingSchedule", "Updating schedule data…")}
                  </p>
                )}
                <Calendar
                  mode="single"
                  month={selectedDate}
                  selected={selectedDate}
                  onSelect={date => {
                    if (date) {
                      setSelectedDate(date);
                    }
                  }}
                  onMonthChange={month => {
                    setSelectedDate(month);
                    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
                    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
                    setRange({ start: toDateKey(monthStart), end: toDateKey(monthEnd) });
                  }}
                  modifiers={scheduleModifiers}
                  modifiersClassNames={{
                    absence: "bg-rose-100 text-rose-900 hover:bg-rose-100",
                    late: "bg-amber-100 text-amber-900 hover:bg-amber-100",
                    overtime: "bg-sky-100 text-sky-900 hover:bg-sky-100",
                    scheduled: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                  }}
                  components={{
                    DayContent: ({ date }) => {
                      const key = toDateKey(date);
                      const schedule = scheduleMap.get(key);
                      return (
                        <div className="flex h-full flex-col items-center justify-center py-1">
                          <span className="text-sm font-medium">{date.getDate()}</span>
                          {schedule ? (
                            <span className="text-[10px] text-muted-foreground">
                              {schedule.shiftTemplate?.name || t("attendancePage.shift", "Shift")}
                            </span>
                          ) : null}
                        </div>
                      );
                    },
                  }}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("attendancePage.selectEmployeePrompt", "Select an employee to view schedules.")}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("attendancePage.dailyDetail", "Daily details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedEmployeeId ? (
              <p className="text-sm text-muted-foreground">
                {t("attendancePage.selectEmployeePrompt", "Select an employee to view schedules.")}
              </p>
            ) : schedulesLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("attendancePage.loadingSchedule", "Updating schedule data…")}
              </p>
            ) : selectedSchedule ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {selectedSchedule.shiftTemplate?.name || t("attendancePage.shift", "Shift")}
                    </p>
                    <h3 className="text-lg font-semibold">
                      {shortTime(selectedSchedule.customStartTime ?? selectedSchedule.shiftTemplate?.startTime)}
                      {" "}–{" "}
                      {shortTime(selectedSchedule.customEndTime ?? selectedSchedule.shiftTemplate?.endTime)}
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase text-muted-foreground">
                      {t("attendancePage.expected", "Expected")}
                    </p>
                    <p className="text-lg font-semibold">
                      {minutesToHours(selectedSchedule.expectedMinutes)}h
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    {t("attendancePage.actual", "Actual")}: {" "}
                    <span className="font-medium">
                      {minutesToHours(selectedSchedule.actualMinutes)}h
                    </span>
                  </div>
                  <div>
                    {t("attendancePage.variance", "Variance")}: {" "}
                    <span
                      className={
                        (selectedSchedule.actualMinutes ?? 0) - (selectedSchedule.expectedMinutes ?? 0) >= 0
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }
                    >
                      {formatVariance(
                        (selectedSchedule.actualMinutes ?? 0) - (selectedSchedule.expectedMinutes ?? 0),
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className={statusClass(selectedSchedule.lateApprovalStatus)}>
                    {t("attendancePage.late", "Late")}: {selectedSchedule.lateApprovalStatus ?? "pending"}
                  </Badge>
                  <Badge className={statusClass(selectedSchedule.absenceApprovalStatus)}>
                    {t("attendancePage.absence", "Absence")}: {selectedSchedule.absenceApprovalStatus ?? "pending"}
                  </Badge>
                  <Badge className={statusClass(selectedSchedule.overtimeApprovalStatus)}>
                    {t("attendancePage.overtime", "Overtime")}: {selectedSchedule.overtimeApprovalStatus ?? "pending"}
                  </Badge>
                </div>
                {selectedSchedule.notes && (
                  <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {selectedSchedule.notes}
                  </p>
                )}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">
                    {t("attendancePage.actualPunches", "Actual punches")}
                  </h4>
                  {selectedSchedule.attendanceRecords.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("attendancePage.noPunches", "No punches recorded")}
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {selectedSchedule.attendanceRecords.map((record: any) => {
                        const hoursValue =
                          record.hours !== undefined && record.hours !== null
                            ? Number(record.hours)
                            : undefined;
                        return (
                          <li
                            key={record.id}
                            className="flex items-center justify-between rounded-md border px-3 py-2"
                          >
                            <span>
                              {formatDateTime(record.checkIn)} → {formatDateTime(record.checkOut)}
                            </span>
                            <span className="font-medium">
                              {Number.isFinite(hoursValue) ? `${hoursValue!.toFixed(2)}h` : ""}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">
                    {t("attendancePage.actions", "Actions")}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {latePending && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setApprovalDialog({ type: "late" })}
                        disabled={approvalMutation.isPending}
                      >
                        {t("attendancePage.approveLate", "Approve late arrival")}
                      </Button>
                    )}
                    {absencePending && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setApprovalDialog({ type: "absence" })}
                        disabled={approvalMutation.isPending}
                      >
                        {t("attendancePage.approveAbsence", "Approve absence")}
                      </Button>
                    )}
                    {overtimePending && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setApprovalDialog({ type: "overtime" })}
                        disabled={approvalMutation.isPending}
                      >
                        {t("attendancePage.approveOvertime", "Approve overtime")}
                      </Button>
                    )}
                    {!latePending && !absencePending && !overtimePending && (
                      <p className="text-sm text-muted-foreground">
                        {t("attendancePage.noPendingApprovals", "No pending approvals")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("attendancePage.noSchedule", "No planned schedule for the selected date.")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("attendancePage.records", "Records")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {attendanceRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {t("attendancePage.none", "No attendance records")}
              </div>
            ) : (
              attendanceRows.map((row: any) => {
                const employee = employeeMap.get(row.employeeId);
                const name = employee
                  ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || employee.employeeCode
                  : t("attendancePage.unknownEmployee", "Unknown employee");
                const hoursValue = row.hours !== undefined && row.hours !== null ? Number(row.hours) : undefined;
                return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      {new Date(row.date).toLocaleDateString()} • {name}
                    </div>
                    <div className="flex items-center gap-3">
                      <div>
                        {row.checkIn ? new Date(row.checkIn).toLocaleString() : "—"} → {" "}
                        {row.checkOut ? new Date(row.checkOut).toLocaleString() : "—"}
                      </div>
                      <div>{Number.isFinite(hoursValue) ? `${hoursValue!.toFixed(2)}h` : ""}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteMutation.mutate(row.id)}
                        disabled={deleteMutation.isPending}
                      >
                        {t("actions.delete", "Delete")}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(approvalDialog)} onOpenChange={open => !open && setApprovalDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalDialog?.type === "late"
                ? t("attendancePage.approveLate", "Approve late arrival")
                : approvalDialog?.type === "absence"
                ? t("attendancePage.approveAbsence", "Approve absence")
                : t("attendancePage.approveOvertime", "Approve overtime")}
            </DialogTitle>
          </DialogHeader>
          {approvalDialog && selectedSchedule ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t(
                  "attendancePage.approvalHint",
                  "Add optional notes before approving or rejecting this exception.",
                )}
              </p>
              <div className="space-y-2">
                <FormLabel>{t("attendancePage.notes", "Notes")}</FormLabel>
                <Textarea
                  value={approvalNotes}
                  onChange={event => setApprovalNotes(event.target.value)}
                  placeholder={t("attendancePage.notesPlaceholder", "Optional explanation")}
                />
              </div>
              {approvalDialog.type === "overtime" && (
                <div className="space-y-2">
                  <FormLabel>
                    {t("attendancePage.overtimeHours", "Approved overtime (hours)")}
                  </FormLabel>
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    value={approvalHours}
                    onChange={event => setApprovalHours(event.target.value)}
                  />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleApproval("rejected")}
                  disabled={approvalMutation.isPending}
                >
                  {t("actions.reject", "Reject")}
                </Button>
                <Button
                  onClick={() => handleApproval("approved")}
                  disabled={approvalMutation.isPending}
                >
                  {t("actions.approve", "Approve")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("attendancePage.noSchedule", "No planned schedule for the selected date.")}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
