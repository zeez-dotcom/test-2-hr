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
import { Gift, FileImage } from "lucide-react";

const bonusFormSchema = z.object({
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  bonusType: z.enum(["performance", "referral", "holiday", "other"], {
    required_error: "Please select a bonus type",
  }),
  reason: z.string().min(1, "Please provide a reason"),
  documentUrl: z.string().optional(),
});

type BonusFormData = z.infer<typeof bonusFormSchema>;

interface BonusFormProps {
  employeeId: string;
  payrollEntryId: string;
  currentBonus: number;
  currentGrossPay: number;
  currentNetPay: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BonusForm({
  employeeId,
  payrollEntryId,
  currentBonus,
  currentGrossPay,
  currentNetPay,
  isOpen,
  onClose,
  onSuccess,
}: BonusFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadedImage, setUploadedImage] = useState<string>("");

  const form = useForm<BonusFormData>({
    resolver: zodResolver(bonusFormSchema),
    defaultValues: {
      amount: 0,
      bonusType: "performance",
      reason: "",
      documentUrl: "",
    },
  });

  const watchedBonusType = form.watch("bonusType");

  const updatePayrollMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPut(`/api/payroll/entries/${payrollEntryId}`, data);
      if (!res.ok) throw new Error(res.error || "Failed to add bonus");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      toast({
        title: "Success",
        description: "Bonus added successfully",
      });
      onSuccess();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add bonus",
        variant: "destructive",
      });
    },
  });

  const createEmployeeEventMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPost("/api/employee-events", data);
      if (!res.ok) throw new Error(res.error || "Failed to record event");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-events"] });
    },
  });

  const onSubmit = async (data: BonusFormData) => {
    try {
      const eventData = {
        employeeId,
        eventType: "bonus",
        title: `${data.bonusType.replace('_', ' ').toUpperCase()} Bonus`,
        description: data.reason,
        amount: data.amount.toString(),
        eventDate: new Date().toISOString().split('T')[0],
        affectsPayroll: true,
        documentUrl: uploadedImage || data.documentUrl,
        status: "active",
      };

      await createEmployeeEventMutation.mutateAsync(eventData);

      const newBonus = currentBonus + data.amount;
      const updateData: any = {
        bonusAmount: newBonus.toString(),
        grossPay: (currentGrossPay + data.amount).toString(),
        netPay: (currentNetPay + data.amount).toString(),
        adjustmentReason: `${data.bonusType.replace('_', ' ')} bonus: ${data.reason}`,
      };

      await updatePayrollMutation.mutateAsync(updateData);
    } catch (error) {
      console.error("Error adding bonus:", error);
      toast({
        title: "Error",
        description: "Failed to add bonus",
        variant: "destructive",
      });
    }
  };

  const getBonusTypeLabel = (type: string) => {
    switch (type) {
      case "performance": return "Performance";
      case "referral": return "Referral";
      case "holiday": return "Holiday";
      case "other": return "Other";
      default: return type;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Add Bonus
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bonus Amount (KWD)</FormLabel>
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
              name="bonusType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bonus Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select bonus type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="performance">Performance Bonus</SelectItem>
                      <SelectItem value="referral">Referral Bonus</SelectItem>
                      <SelectItem value="holiday">Holiday Bonus</SelectItem>
                      <SelectItem value="other">Other Bonus</SelectItem>
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
                      placeholder={`Enter reason for ${getBonusTypeLabel(watchedBonusType).toLowerCase()}...`}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                      label="Upload bonus justification"
                    />
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
                {updatePayrollMutation.isPending ? "Adding..." : "Add Bonus"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
