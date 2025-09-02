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
import { apiRequest } from "@/lib/queryClient";
import { Minus } from "lucide-react";

const deductionFormSchema = z.object({
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  deductionType: z.enum(["tax", "social_security", "health_insurance", "loan", "penalty", "other"]),
  reason: z.string().min(1, "Please provide a reason"),
});

interface SmartDeductionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  payrollEntryId: string;
  employeeId: string;
  currentDeductions: number;
}

export function SmartDeductionForm({
  isOpen,
  onClose,
  onSuccess,
  payrollEntryId,
  employeeId,
  currentDeductions,
}: SmartDeductionFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(deductionFormSchema),
    defaultValues: {
      amount: 0,
      deductionType: "other" as const,
      reason: "",
    },
  });

  const updatePayrollMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("PUT", `/api/payroll/entries/${payrollEntryId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      toast({
        title: "Success",
        description: "Deduction added successfully",
      });
      onSuccess();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add deduction",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: z.infer<typeof deductionFormSchema>) => {
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

    // Create corresponding employee event for tracking
    const eventData = {
      employeeId,
      eventType: "deduction",
      title: `${data.deductionType.replace('_', ' ').toUpperCase()} Deduction`,
      description: data.reason,
      amount: data.amount.toString(),
      eventDate: new Date().toISOString().split('T')[0],
      affectsPayroll: true,
      status: "active",
    };

    // Create event first, then update payroll
    try {
      await apiRequest("POST", "/api/employee-events", eventData);
    } catch (error: any) {
      console.error("Failed to create employee event:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create employee event",
        variant: "destructive",
      });
    }

    await updatePayrollMutation.mutateAsync(updateData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
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
                      placeholder="Enter reason for deduction..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={updatePayrollMutation.isPending}>
                {updatePayrollMutation.isPending ? "Adding..." : "Add Deduction"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}