import { Button } from "@/components/ui/button";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import type { UseFormReturn, FieldValues, Path } from "react-hook-form";

interface AllowanceRecurringFieldsProps<TFieldValues extends FieldValues> {
  form: UseFormReturn<TFieldValues>;
  recurrenceStartDate: Date | null | undefined;
}

export function AllowanceRecurringFields<TFieldValues extends FieldValues>({
  form,
  recurrenceStartDate,
}: AllowanceRecurringFieldsProps<TFieldValues>) {
  const recurrenceType = form.watch("recurrenceType" as Path<TFieldValues>) as
    | "none"
    | "monthly"
    | undefined;

  return (
    <div className="space-y-3 rounded-md border border-dashed border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Monthly allowance</p>
          <p className="text-xs text-blue-800/80 dark:text-blue-200/80">
            Apply this allowance automatically each month. Set an optional end date to stop it.
          </p>
        </div>
        <FormField
          control={form.control}
          name={"recurrenceType" as any}
          render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormLabel htmlFor="monthly-allowance" className="text-xs font-medium text-muted-foreground">
                Recurring monthly
              </FormLabel>
              <FormControl>
                <Switch
                  id="monthly-allowance"
                  checked={field.value === "monthly"}
                  onCheckedChange={(checked) => field.onChange(checked ? "monthly" : "none")}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {recurrenceType === "monthly" && (
        <FormField
          control={form.control}
          name={"recurrenceEndDate" as any}
          render={({ field }) => (
            <FormItem>
              <FormLabel>End date (optional)</FormLabel>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn("w-full justify-start", !field.value && "text-muted-foreground")}
                      >
                        {field.value ? (
                          format(new Date(field.value), "PPP")
                        ) : (
                          <span>Select end date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : null)}
                      disabled={(date) => {
                        if (!recurrenceStartDate) return false;
                        return date < recurrenceStartDate;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => field.onChange(null)}
                  disabled={!field.value}
                >
                  Clear
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}

export default AllowanceRecurringFields;
