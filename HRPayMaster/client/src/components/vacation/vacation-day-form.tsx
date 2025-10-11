import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiPut, apiPost } from "@/lib/http";
import ImageUpload from "@/components/ui/image-upload";
import { Calendar, AlertTriangle, FileImage } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { SickLeaveTracking } from "@shared/schema";
import { toastApiError } from "@/lib/toastError";

const vacationFormSchema = z.object({
  days: z.number().min(1, "Days must be at least 1"),
  leaveType: z.enum(["annual", "sick", "emergency", "unpaid"], {
    required_error: "Please select a leave type",
  }),
  reason: z.string().optional(),
  deductFromSalary: z.boolean().default(false),
  documentUrl: z.string().optional(),
});

type VacationFormData = z.infer<typeof vacationFormSchema>;

interface VacationDayFormProps {
  employeeId: string;
  currentVacationDays: number;
  payrollEntryId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  payrollId: string;
}

export function VacationDayForm({
  employeeId,
  currentVacationDays,
  payrollEntryId,
  isOpen,
  onClose,
  onSuccess,
  payrollId,
}: VacationDayFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadedImage, setUploadedImage] = useState<string>("");

  // Get employee's sick leave balance
  const { data: sickLeaveBalance } = useQuery<SickLeaveTracking>({
    queryKey: [`/api/employees/${employeeId}/sick-leave-balance`],
    enabled: isOpen,
  });

  const form = useForm<VacationFormData>({
    resolver: zodResolver(vacationFormSchema),
    defaultValues: {
      days: currentVacationDays,
      leaveType: "annual",
      deductFromSalary: false,
      reason: "",
      documentUrl: "",
    },
  });

  const watchedLeaveType = form.watch("leaveType");
  const watchedDays = form.watch("days");

  const updatePayrollMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPut(`/api/payroll/entries/${payrollEntryId}`, data);
      if (!res.ok) throw res;
      return res.data;
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to update vacation days");
    },
  });

  const createVacationRequestMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPost("/api/vacations", data);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacations"] });
    },
    onError: (err) => toastApiError(err as any, "Failed to create vacation"),
  });

  const updateSickLeaveMutation = useMutation({
    mutationFn: async (data: Partial<SickLeaveTracking> & { year: number; daysUsed?: number }) => {
      const res = await apiPost(`/api/employees/${employeeId}/sick-leave-balance`, data);
      if (!res.ok) throw res;
      return res.data as SickLeaveTracking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/employees/${employeeId}/sick-leave-balance`],
      });
    },
    onError: (err) => toastApiError(err as any, "Failed to update sick leave balance"),
  });

  const onSubmit = async (data: VacationFormData) => {
    try {
      if (data.leaveType === "sick") {
        const remainingSickDays = sickLeaveBalance?.remainingSickDays || 14;
        if (data.days > remainingSickDays) {
          toast({
            title: "Sick Leave Limit Exceeded",
            description: `Employee has only ${remainingSickDays} sick days remaining this year.`,
            variant: "destructive",
          });
          return;
        }
      }

      const vacationRequestData = {
        employeeId,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + data.days * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        days: data.days,
        reason: data.reason || "",
        leaveType: data.leaveType,
        deductFromSalary: data.deductFromSalary,
        documentUrl: uploadedImage || data.documentUrl,
        status: "approved", // Auto-approve for payroll entries
      };

      await createVacationRequestMutation.mutateAsync(vacationRequestData);

      const payrollUpdateData = {
        vacationDays: data.days,
        adjustmentReason: `${data.leaveType} leave: ${data.days} days`,
      };

      if (data.leaveType === "emergency" && !data.deductFromSalary) {
        payrollUpdateData.adjustmentReason += " (no salary deduction)";
      }

      await updatePayrollMutation.mutateAsync(payrollUpdateData);

      if (data.leaveType === "sick") {
        await updateSickLeaveMutation.mutateAsync({
          year: new Date().getFullYear(),
          daysUsed: data.days,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/payroll", payrollId],
      });

      toast({
        title: "Success",
        description: "Vacation days updated successfully",
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error processing vacation request:", error);
      if (
        error !== createVacationRequestMutation.error &&
        error !== updatePayrollMutation.error &&
        error !== updateSickLeaveMutation.error
      ) {
        toastApiError(error as any, "Failed to process vacation request");
      }
    }
  };

  const remainingSickDays = sickLeaveBalance?.remainingSickDays || 14;
  const showSickLeaveWarning = watchedLeaveType === "sick" && watchedDays > remainingSickDays;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
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
                      <SelectItem value="sick">Sick Leave</SelectItem>
                      <SelectItem value="emergency">Emergency Leave</SelectItem>
                      <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sick Leave Warning */}
            {showSickLeaveWarning && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Employee has only {remainingSickDays} sick days remaining this year.
                  Cannot exceed this limit.
                </AlertDescription>
              </Alert>
            )}

            {/* Sick Leave Balance Info */}
            {watchedLeaveType === "sick" && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Sick Leave Balance:</strong> {remainingSickDays} days remaining this year
                </p>
              </div>
            )}

            {/* Emergency Leave Deduction Option */}
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

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter reason for leave..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Document Upload */}
            <FormField
              control={form.control}
              name="documentUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <FileImage className="h-4 w-4" />
                    Supporting Document (Optional)
                  </FormLabel>
                  <div className="space-y-2">
                    <ImageUpload
                      onChange={(base64) => {
                        setUploadedImage(base64 || "");
                        field.onChange(base64);
                      }}
                      value={uploadedImage || undefined}
                      label="Upload medical certificate, emergency documentation, etc."
                    />
                    {watchedLeaveType === "sick" && (
                      <p className="text-xs text-muted-foreground">
                        Medical certificate recommended for sick leave
                      </p>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updatePayrollMutation.isPending || showSickLeaveWarning}
              >
                {updatePayrollMutation.isPending ? "Processing..." : "Apply Vacation Days"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}