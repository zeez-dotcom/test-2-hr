import { useState } from "react";
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
import { apiPut, apiPost } from "@/lib/http";
import { Calendar, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const vacationFormSchema = z.object({
  days: z.number().min(1, "Days must be at least 1"),
  leaveType: z.enum(["annual", "sick", "emergency", "unpaid"]),
  deductFromSalary: z.boolean().default(false),
});

interface SmartVacationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  payrollEntryId: string;
  employeeId: string;
  currentVacationDays: number;
}

export function SmartVacationForm({
  isOpen,
  onClose,
  onSuccess,
  payrollEntryId,
  employeeId,
  currentVacationDays,
}: SmartVacationFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof vacationFormSchema>>({
    resolver: zodResolver(vacationFormSchema),
    defaultValues: {
      days: currentVacationDays || 1,
      leaveType: "annual",
      deductFromSalary: false,
    },
  });

  const updatePayrollMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPut(`/api/payroll/entries/${payrollEntryId}`, data);
      if (!res.ok) throw new Error(res.error || "Failed to update vacation days");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      toast({
        title: "Success",
        description: "Vacation days updated successfully",
      });
      onSuccess();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vacation days",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: z.infer<typeof vacationFormSchema>) => {
    const updateData = {
      vacationDays: data.days,
      adjustmentReason: `${data.leaveType} leave: ${data.days} days${
        data.leaveType === "emergency" && !data.deductFromSalary ? " (no salary deduction)" : ""
      }`,
    };

    // Create corresponding employee event for tracking
    const eventData = {
      employeeId,
      eventType: "vacation",
      title: `${data.leaveType.charAt(0).toUpperCase() + data.leaveType.slice(1)} Leave`,
      description: `${data.days} days of ${data.leaveType} leave${
        data.leaveType === "emergency" && !data.deductFromSalary ? " (no salary deduction)" : ""
      }`,
      amount: "0",
      eventDate: new Date().toISOString().split('T')[0],
      affectsPayroll: data.leaveType !== "emergency" || data.deductFromSalary,
      status: "active",
    };

    // Create event first, then update payroll
    try {
      await apiPost("/api/employee-events", eventData);
    } catch (error) {
      console.error("Failed to create employee event:", error);
    }

    await updatePayrollMutation.mutateAsync(updateData);
  };

  const watchedLeaveType = form.watch("leaveType");

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
            <FormField
              control={form.control}
              name="days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of Days</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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