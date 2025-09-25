import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiPut, apiPost } from "@/lib/http";
import ImageUpload from "@/components/ui/image-upload";
import { Minus, FileImage } from "lucide-react";
import { toastApiError } from "@/lib/toastError";
import { generateEventReceipt } from "@/lib/event-receipts";
import type { Employee, EmployeeEvent } from "@shared/schema";

const deductionFormSchema = z.object({
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  deductionType: z.enum(["tax", "social_security", "health_insurance", "loan", "penalty", "other"], {
    required_error: "Please select a deduction type",
  }),
  reason: z.string().min(1, "Please provide a reason"),
  documentUrl: z.string().optional(),
});

type DeductionFormData = z.infer<typeof deductionFormSchema>;

interface DeductionFormProps {
  employeeId: string;
  payrollEntryId: string;
  currentDeductions: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  payrollId: string;
}

export function DeductionForm({
  employeeId,
  payrollEntryId,
  currentDeductions,
  isOpen,
  onClose,
  onSuccess,
  payrollId,
}: DeductionFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadedImage, setUploadedImage] = useState<string>("");

  const form = useForm<DeductionFormData>({
    resolver: zodResolver(deductionFormSchema),
    defaultValues: {
      amount: 0,
      deductionType: "other",
      reason: "",
      documentUrl: "",
    },
  });

  const watchedDeductionType = form.watch("deductionType");

  const updatePayrollMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPut(`/api/payroll/entries/${payrollEntryId}`, data);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] });
      toast({
        title: "Success",
        description: "Deduction added successfully",
      });
      onSuccess();
      onClose();
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to add deduction");
    },
  });

  const createEmployeeEventMutation = useMutation<EmployeeEvent, any, any>({
    mutationFn: async (data: any) => {
      const res = await apiPost("/api/employee-events", data);
      if (!res.ok) throw res;
      return res.data as EmployeeEvent;
    },
    onSuccess: async (createdEvent) => {
      let receiptError: unknown = null;
      const employees = queryClient.getQueryData<Employee[]>(["/api/employees"]);
      const employee = employees?.find((e) => e.id === createdEvent.employeeId);
      try {
        await generateEventReceipt({ event: createdEvent, employee, queryClient });
      } catch (error) {
        receiptError = error;
        console.error("Failed to generate deduction receipt", error);
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/employee-events"] });

      if (receiptError) {
        toast({
          title: "Receipt not generated",
          description: "The deduction event was saved but the receipt could not be created.",
          variant: "destructive",
        });
      }
    },
    onError: (err) => toastApiError(err as any, "Failed to record event"),
  });

  const onSubmit = async (data: DeductionFormData) => {
    try {
      // Create employee event record for tracking
      const eventData = {
        employeeId,
        eventType: "deduction",
        title: `${data.deductionType.replace('_', ' ').toUpperCase()} Deduction`,
        description: data.reason,
        amount: data.amount.toString(),
        eventDate: new Date().toISOString().split('T')[0],
        affectsPayroll: true,
        documentUrl: uploadedImage || data.documentUrl,
        status: "active",
      };

      await createEmployeeEventMutation.mutateAsync(eventData);

      // Update the specific deduction field in payroll entry
      const updateData: any = {
        adjustmentReason: `${data.deductionType.replace('_', ' ')} deduction: ${data.reason}`,
      };

      // Map deduction type to the appropriate field
      switch (data.deductionType) {
        case "tax":
          updateData.taxDeduction = data.amount.toString();
          break;
        case "social_security":
          updateData.socialSecurityDeduction = data.amount.toString();
          break;
        case "health_insurance":
          updateData.healthInsuranceDeduction = data.amount.toString();
          break;
        case "loan":
          updateData.loanDeduction = data.amount.toString();
          break;
        case "penalty":
        case "other":
          updateData.otherDeductions = (currentDeductions + data.amount).toString();
          break;
      }

      await updatePayrollMutation.mutateAsync(updateData);

    } catch (error) {
      console.error("Error adding deduction:", error);
      toastApiError(error as any, "Failed to add deduction");
    }
  };

  const getDeductionTypeLabel = (type: string) => {
    switch (type) {
      case "tax": return "Tax Deduction";
      case "social_security": return "Social Security";
      case "health_insurance": return "Health Insurance";
      case "loan": return "Loan Deduction";
      case "penalty": return "Penalty";
      case "other": return "Other Deduction";
      default: return type;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Minus className="h-5 w-5" />
            Add Deduction
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deduction Amount (KWD)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="deductionType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deduction Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select deduction type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="tax">Tax Deduction</SelectItem>
                      <SelectItem value="social_security">Social Security</SelectItem>
                      <SelectItem value="health_insurance">Health Insurance</SelectItem>
                      <SelectItem value="loan">Loan Deduction</SelectItem>
                      <SelectItem value="penalty">Penalty</SelectItem>
                      <SelectItem value="other">Other Deduction</SelectItem>
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
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={`Enter reason for ${getDeductionTypeLabel(watchedDeductionType).toLowerCase()}...`}
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
                      label="Upload receipt, penalty notice, etc."
                    />
                    {watchedDeductionType === "penalty" && (
                      <p className="text-xs text-muted-foreground">
                        Penalty documentation recommended
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
                disabled={updatePayrollMutation.isPending}
              >
                {updatePayrollMutation.isPending ? "Adding..." : "Add Deduction"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}