import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  period: z.string().min(1, "Period is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
}).refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
  message: "End date must be after start date",
  path: ["endDate"],
});

type FormData = z.infer<typeof formSchema>;

interface PayrollFormProps {
  onSubmit: (data: FormData) => void;
  isSubmitting: boolean;
  canGenerate: boolean;
}

export default function PayrollForm({ onSubmit, isSubmitting, canGenerate }: PayrollFormProps) {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      period: "",
      startDate: "",
      endDate: "",
    },
    mode: "onChange",
  });

  // Helper to generate period suggestions
  const getCurrentMonthPeriod = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.toLocaleDateString('en-US', { month: 'long' });
    return `${month} ${year}`;
  };

  const getCurrentMonthDates = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    
    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    };
  };

  const fillCurrentMonth = () => {
    const period = getCurrentMonthPeriod();
    const dates = getCurrentMonthDates();
    
    form.setValue('period', period);
    form.setValue('startDate', dates.start);
    form.setValue('endDate', dates.end);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="period"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payroll Period</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., January 2024" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
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

        <div className="border-t border-gray-200 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={fillCurrentMonth}
            className="mb-4"
          >
            Fill Current Month
          </Button>
        </div>
        
        <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
          <Button
            type="submit"
            disabled={isSubmitting || !canGenerate || !form.formState.isValid}
            className="bg-success text-white hover:bg-green-700"
          >
            {isSubmitting ? "Generating..." : "Generate Payroll"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
