import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/http";
import { Calendar, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toastApiError } from "@/lib/toastError";
import { generateEventReceipt } from "@/lib/event-receipts";
import type { Employee, EmployeeEvent } from "@shared/schema";
import { submitPayrollVacationOverride } from "@/lib/payroll-vacation";

const vacationFormSchema = z
  .object({
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    leaveType: z.enum(["annual", "sick", "emergency", "unpaid"]),
    deductFromSalary: z.boolean().default(false),
  })
  .refine(data => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }
    return start <= end;
  }, {
    path: ["endDate"],
    message: "End date must be on or after the start date",
  });

interface SmartVacationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  payrollEntryId: string;
  employeeId: string;
  currentVacationDays: number;
  payrollId: string;
}

export function SmartVacationForm({
  isOpen,
  onClose,
  onSuccess,
  payrollEntryId,
  employeeId,
  currentVacationDays,
  payrollId,
}: SmartVacationFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date();
  const defaultStartDate = today.toISOString().split("T")[0];
  const defaultEndDate = new Date(today);
  if (currentVacationDays > 1) {
    defaultEndDate.setDate(defaultEndDate.getDate() + (currentVacationDays - 1));
  }
  const defaultEndDateString = defaultEndDate.toISOString().split("T")[0];

  const form = useForm<z.infer<typeof vacationFormSchema>>({
    resolver: zodResolver(vacationFormSchema),
    defaultValues: {
      startDate: defaultStartDate,
      endDate: defaultEndDateString,
      leaveType: "annual",
      deductFromSalary: false,
    },
  });

  const updatePayrollMutation = useMutation({
    mutationFn: async (data: {
      startDate: string;
      endDate: string;
      leaveType: "annual" | "sick" | "emergency" | "unpaid";
      deductFromSalary: boolean;
      reason: string;
    }) => {
      await submitPayrollVacationOverride(payrollEntryId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] });
      toast({
        title: "Success",
        description: "Vacation updated successfully",
      });
      onSuccess();
      onClose();
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to update vacation override");
    },
  });

  const onSubmit = async (data: z.infer<typeof vacationFormSchema>) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const totalDays =
      Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))) + 1;

    const reason = `${data.leaveType} leave: ${totalDays} day${totalDays === 1 ? "" : "s"} (${data.startDate} → ${data.endDate})${
      data.leaveType === "emergency" && !data.deductFromSalary ? " (no salary deduction)" : ""
    }`;

    try {
      await updatePayrollMutation.mutateAsync({
        startDate: data.startDate,
        endDate: data.endDate,
        leaveType: data.leaveType,
        deductFromSalary: data.deductFromSalary,
        reason,
      });
    } catch {
      return;
    }

    const eventData = {
      employeeId,
      eventType: "vacation",
      title: `${data.leaveType.charAt(0).toUpperCase() + data.leaveType.slice(1)} Leave`,
      description: `${totalDays} day${totalDays === 1 ? "" : "s"} of ${data.leaveType} leave (${data.startDate} → ${data.endDate})${
        data.leaveType === "emergency" && !data.deductFromSalary ? " (no salary deduction)" : ""
      }`,
      amount: "0",
      eventDate: data.startDate,
      affectsPayroll: data.leaveType !== "emergency" || data.deductFromSalary,
      status: "active",
    };

    try {
      const res = await apiPost("/api/employee-events", eventData);
      if (!res.ok) throw res;
      const createdEvent = res.data as EmployeeEvent;
      const employees = queryClient.getQueryData<Employee[]>(["/api/employees"]);
      const employee = employees?.find(e => e.id === employeeId);
      try {
        await generateEventReceipt({ event: createdEvent, employee, queryClient });
      } catch (receiptError) {
        console.error("Failed to generate vacation event receipt", receiptError);
        toast({
          title: "Receipt not generated",
          description: "The vacation event was logged but the receipt could not be created.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to create employee event:", error);
      toastApiError(error as any, "Failed to create employee event");
    }
  };

  const watchedLeaveType = form.watch("leaveType");
  const watchedStart = form.watch("startDate");
  const watchedEnd = form.watch("endDate");

  let computedDays = 0;
  if (watchedStart && watchedEnd) {
    const start = new Date(watchedStart);
    const end = new Date(watchedEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
      computedDays = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))) + 1;
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Add Vacation Days
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {computedDays > 0
                ? `${computedDays} day${computedDays === 1 ? "" : "s"} selected`
                : "Select a valid date range to calculate days"}
            </div>

            <FormField
              control={form.control}
              name="leaveType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Leave Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select leave type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="annual">Annual Leave</SelectItem>
                      <SelectItem value="sick">Sick Leave (max 14/year)</SelectItem>
                      <SelectItem value="emergency">Emergency Leave</SelectItem>
                      <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchedLeaveType === "emergency" && (
              <FormField
                control={form.control}
                name="deductFromSalary"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Deduct from Salary</FormLabel>
                      <div className="text-sm text-muted-foreground">
                        Should this emergency leave be deducted from salary?
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={updatePayrollMutation.isPending}>
                {updatePayrollMutation.isPending ? "Processing..." : "Apply Vacation Days"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}