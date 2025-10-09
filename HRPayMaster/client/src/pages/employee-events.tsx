import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Calendar as CalendarIcon, TrendingUp, TrendingDown, Award, AlertTriangle, Clock, Trash2, Edit, User, FileText, Car, Info, Printer } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { cn, formatCurrency, formatDate, getNewTabRel, openUrlInNewTab } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { apiPost, apiPut, apiDelete } from "@/lib/http";
import { useToast } from "@/hooks/use-toast";
import type { EmployeeEvent, Employee, InsertEmployeeEvent } from "@shared/schema";
import { insertEmployeeEventSchema } from "@shared/schema";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { generateEventReceipt } from "@/lib/event-receipts";
import { allowanceRecursInRange, getMonthBounds, parseDateInput } from "@/lib/employee-events";
import AllowanceRecurringFields from "@/components/employees/allowance-recurring-fields";
import AllowanceTypeCombobox from "@/components/employees/allowance-type-combobox";

const financialEventTypes = ["bonus", "commission", "deduction", "allowance", "overtime", "penalty"] as const;

export default function EmployeeEvents() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);
  const [eventToEdit, setEventToEdit] = useState<(EmployeeEvent & { employee?: Employee }) | null>(null);
  const [printingEventId, setPrintingEventId] = useState<string | null>(null);
  const { toast } = useToast();

  const {
    data: events,
    isLoading,
    error: eventsError,
  } = useQuery<(EmployeeEvent & { employee: Employee })[]>({
    queryKey: ["/api/employee-events"],
  });
  const [location] = useLocation();
  const params = new URLSearchParams(location.split('?')[1] || '');
  const monthParam = params.get('month'); // YYYY-MM
  const typesParam = params.get('types'); // comma-separated types
  const typeSet = new Set((typesParam || '').split(',').map(s => s.trim()).filter(Boolean));
  const viewEvents = (events || []).filter(ev => {
    const typeOk = typeSet.size ? typeSet.has(ev.eventType) : true;
    if (!typeOk) return false;
    if (!monthParam) return true;
    const [yearRaw, monthRaw] = monthParam.split('-').map(Number);
    if (!Number.isFinite(yearRaw) || !Number.isFinite(monthRaw)) {
      return true;
    }
    const { start: monthStart, end: monthEnd } = getMonthBounds(yearRaw, monthRaw);
    if (allowanceRecursInRange(ev, monthStart, monthEnd)) {
      return true;
    }
    const eventDate = parseDateInput(ev.eventDate);
    if (!eventDate) return false;
    return eventDate >= monthStart && eventDate <= monthEnd;
  });

  const { data: employees, error: employeesError } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const createDefaultValues = useCallback(
    (): Partial<InsertEmployeeEvent> => ({
      eventType: "bonus",
      affectsPayroll: true,
      status: "active",
      eventDate: format(new Date(), 'yyyy-MM-dd'),
      recurrenceType: "none",
      recurrenceEndDate: null,
    }),
    [],
  );

  const form = useForm<InsertEmployeeEvent>({
    resolver: zodResolver(insertEmployeeEventSchema.extend({
      eventDate: insertEmployeeEventSchema.shape.eventDate.transform((val) =>
        typeof val === 'string' ? val : format(val, 'yyyy-MM-dd')
      ),
    })),
    defaultValues: createDefaultValues(),
  });

  const selectedEventType = form.watch("eventType");
  const recurrenceType = form.watch("recurrenceType");
  const eventDateValue = form.watch("eventDate");
  const recurrenceStartDate = parseDateInput(eventDateValue);

  useEffect(() => {
    if (!financialEventTypes.includes(selectedEventType as any)) {
      form.setValue("amount", "0");
    }
  }, [selectedEventType, form]);

  useEffect(() => {
    if (recurrenceType !== "monthly") {
      form.setValue("recurrenceEndDate", null);
    }
  }, [recurrenceType, form]);

  const createEventMutation = useMutation<EmployeeEvent, Error, InsertEmployeeEvent>({
    mutationFn: async (data: InsertEmployeeEvent) => {
      const res = await apiPost("/api/employee-events", data);
      if (!res.ok) throw new Error(res.error || "Failed to record employee event");
      return res.data as EmployeeEvent;
    },
    onSuccess: async (createdEvent) => {
      setIsDialogOpen(false);
      form.reset(createDefaultValues());

      let receiptError: unknown = null;
      const employee = employees?.find((e) => e.id === createdEvent.employeeId);
      try {
        await generateEventReceipt({
          event: createdEvent,
          employee,
          queryClient,
        });
      } catch (error) {
        receiptError = error;
        console.error("Failed to generate event receipt", error);
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/employee-events"] });

      toast({
        title: "Success",
        description: "Employee event recorded successfully",
      });

      if (receiptError) {
        toast({
          title: "Receipt not generated",
          description: "The event was saved but the receipt could not be generated.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to record employee event",
        variant: "destructive",
      });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await apiDelete(`/api/employee-events/${eventId}`);
      if (!res.ok) throw new Error(res.error || "Failed to delete employee event");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-events"] });
      toast({
        title: "Success",
        description: "Employee event deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete employee event",
        variant: "destructive",
      });
    },
  });
  
  const updateEventMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertEmployeeEvent }) => {
      const res = await apiPut(`/api/employee-events/${id}`, data);
      if (!res.ok) throw new Error(res.error || "Failed to update employee event");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-events"] });
      setIsDialogOpen(false);
      setEventToEdit(null);
      form.reset(createDefaultValues());
      toast({
        title: "Success",
        description: "Employee event updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update employee event",
        variant: "destructive",
      });
    },
  });

  const handlePrintEvent = async (event: EmployeeEvent & { employee?: Employee }) => {
    setPrintingEventId(event.id);

    try {
      if (event.documentUrl) {
        openUrlInNewTab(event.documentUrl);
        return;
      }

      const employee = employees?.find((e) => e.id === event.employeeId);
      await generateEventReceipt({
        event,
        employee,
        queryClient,
      });
    } catch (error) {
      console.error("Failed to print event receipt", error);
      toast({
        title: "Unable to print event",
        description: "We couldn't generate the event receipt. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPrintingEventId(null);
    }
  };

  if (eventsError || employeesError) {
    return <div>Error loading employee events</div>;
  }

  const getEventTypeIcon = (eventType: string) => {
    switch (eventType) {
      case 'bonus':
        return <Award className="h-4 w-4 text-green-600" />;
      case 'deduction':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'allowance':
        return <TrendingUp className="h-4 w-4 text-blue-600" />;
      case 'overtime':
        return <Clock className="h-4 w-4 text-purple-600" />;
      case 'penalty':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'employee_update':
        return <User className="h-4 w-4 text-gray-600" />;
      case 'document_update':
        return <FileText className="h-4 w-4 text-gray-600" />;
      case 'asset_assignment':
      case 'asset_update':
      case 'asset_removal':
        return <Car className="h-4 w-4 text-gray-600" />;
      default:
        return <Info className="h-4 w-4 text-gray-600" />;
    }
  };

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'bonus':
        return 'bg-green-100 text-green-800';
      case 'deduction':
        return 'bg-red-100 text-red-800';
      case 'allowance':
        return 'bg-blue-100 text-blue-800';
      case 'overtime':
        return 'bg-purple-100 text-purple-800';
      case 'penalty':
        return 'bg-orange-100 text-orange-800';
      case 'employee_update':
      case 'document_update':
      case 'asset_assignment':
      case 'asset_update':
      case 'asset_removal':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const onSubmit = (data: InsertEmployeeEvent) => {
    if (eventToEdit) {
      updateEventMutation.mutate({ id: eventToEdit.id, data });
    } else {
      createEventMutation.mutate(data);
    }
  };

  const handleEditEvent = (event: EmployeeEvent & { employee?: Employee }) => {
    setEventToEdit(event);
    form.reset({
      employeeId: event.employeeId,
      eventType: event.eventType as any,
      title: event.title,
      description: event.description,
      amount: event.amount?.toString(),
      eventDate: format(new Date(event.eventDate), 'yyyy-MM-dd'),
      documentUrl: event.documentUrl ?? '',
      affectsPayroll: event.affectsPayroll,
      status: event.status as any,
      recurrenceType: (event.recurrenceType ?? "none") as InsertEmployeeEvent["recurrenceType"],
      recurrenceEndDate: event.recurrenceEndDate
        ? format(new Date(event.recurrenceEndDate), 'yyyy-MM-dd')
        : null,
    });
    setIsDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEventToEdit(null);
      form.reset(createDefaultValues());
    }
  };

  const handleDeleteEvent = (eventId: string) => {
    setEventToDelete(eventId);
    setIsConfirmOpen(true);
  };

  const confirmDeleteEvent = () => {
    if (eventToDelete) {
      deleteEventMutation.mutate(eventToDelete);
    }
    setIsConfirmOpen(false);
    setEventToDelete(null);
  };

  const handleConfirmOpenChange = (open: boolean) => {
    setIsConfirmOpen(open);
    if (!open) {
      setEventToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employee Events</h1>
          <p className="text-muted-foreground">Record payroll adjustments and employee events</p>
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-800">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Calculate statistics
  const totalBonuses = events?.filter(e => e.eventType === 'bonus').reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0;
  const totalDeductions = events?.filter(e => e.eventType === 'deduction').reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0;
  const totalAllowances = events?.filter(e => e.eventType === 'allowance').reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employee Events</h1>
          <p className="text-muted-foreground">Record payroll adjustments and employee events</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEventToEdit(null); form.reset(createDefaultValues()); }}>
              <Plus className="mr-2" size={16} />
              Add Event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{eventToEdit ? "Edit Employee Event" : "Record Employee Event"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="employeeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employee *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select employee" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {employees?.map((employee) => (
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

                  <FormField
                    control={form.control}
                    name="eventType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select event type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="bonus">Bonus</SelectItem>
                            <SelectItem value="commission">Commission</SelectItem>
                            <SelectItem value="deduction">Deduction</SelectItem>
                            <SelectItem value="allowance">Allowance</SelectItem>
                            <SelectItem value="overtime">Overtime</SelectItem>
                            <SelectItem value="penalty">Penalty</SelectItem>
                            <SelectItem value="employee_update">Employee Update</SelectItem>
                            <SelectItem value="document_update">Document Update</SelectItem>
                            <SelectItem value="asset_assignment">Asset Assignment</SelectItem>
                            <SelectItem value="asset_update">Asset Update</SelectItem>
                            <SelectItem value="asset_removal">Asset Removal</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title *</FormLabel>
                      <FormControl>
                        {selectedEventType === "allowance" ? (
                          <AllowanceTypeCombobox
                            value={field.value ?? ""}
                            onChange={name => field.onChange(name)}
                            placeholder="Select allowance type"
                            extraOptions={events
                              ?.filter(event => event.eventType === "allowance")
                              .map(event => event.title ?? "")
                              .filter(title => title.trim().length > 0)}
                          />
                        ) : (
                          <Input
                            placeholder="Event title (e.g., Car damage deduction)"
                            {...field}
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description *</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Detailed description of the event and reason" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {financialEventTypes.includes(selectedEventType as any) && (
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (KWD) *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="eventDate"
                    render={({ field }) => (
                      <FormItem className={financialEventTypes.includes(selectedEventType as any) ? "" : "md:col-span-2"}>
                        <FormLabel>Event Date *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(new Date(field.value), "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                              disabled={(date) =>
                                date > new Date() || date < new Date("1900-01-01")
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {selectedEventType === "allowance" && (
                  <AllowanceRecurringFields form={form} recurrenceStartDate={recurrenceStartDate ?? null} />
                )}

                <FormField
                  control={form.control}
                  name="documentUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document URL (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Upload document link or reference"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleDialogOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createEventMutation.isPending || updateEventMutation.isPending}
                    className="bg-success text-white hover:bg-success/90"
                  >
                    {eventToEdit
                      ? updateEventMutation.isPending
                        ? "Updating..."
                        : "Update Event"
                      : createEventMutation.isPending
                        ? "Recording..."
                        : "Record Event"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bonuses</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalBonuses)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deductions</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalDeductions)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Allowances</CardTitle>
            <Award className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(totalAllowances)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Events List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          {!events || events.length === 0 ? (
            <div className="text-center py-12">
              <Award className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No events recorded</h3>
              <p className="mt-1 text-sm text-gray-500">
                Start by adding bonuses, deductions, or other payroll adjustments.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {viewEvents.map((event) => (
                <div key={event.id} className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="mt-1">
                        {getEventTypeIcon(event.eventType)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h4 className="text-sm font-medium text-gray-900">
                            {event.title}
                          </h4>
                          <Badge className={getEventTypeColor(event.eventType)}>
                            {event.eventType}
                          </Badge>
                          {event.eventType === 'allowance' && event.recurrenceType === 'monthly' && (
                            <Badge className="border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100" variant="outline">
                              Monthly{event.recurrenceEndDate ? ` • Ends ${formatDate(event.recurrenceEndDate)}` : ' • Ongoing'}
                            </Badge>
                          )}
                          {!event.affectsPayroll && (
                            <Badge variant="outline">Non-payroll</Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 mb-2">
                          <strong>{event.employee?.firstName} {event.employee?.lastName}</strong>
                          {' '} • {formatDate(event.eventDate)}
                        </div>
                        <p className="text-sm text-gray-700 mb-2">
                          {event.description}
                        </p>
                        {event.documentUrl && (
                          <a 
                            href={event.documentUrl} 
                            target="_blank" 
                            rel={getNewTabRel(event.documentUrl)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            View Document
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePrintEvent(event)}
                        disabled={printingEventId === event.id}
                        className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                        aria-label="Print event receipt"
                      >
                        <Printer className="h-4 w-4" />
                        <span className="ml-1 hidden sm:inline">Print</span>
                      </Button>
                      {financialEventTypes.includes(event.eventType as any) && (
                        <div className="text-right">
                          <div className={`text-lg font-semibold ${
                            ['deduction', 'penalty'].includes(event.eventType)
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}>
                            {['deduction', 'penalty'].includes(event.eventType) ? '-' : '+'}
                            {formatCurrency(parseFloat(event.amount))}
                          </div>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditEvent(event)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteEvent(event.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={handleConfirmOpenChange}
        title="Delete Event"
        description="Are you sure you want to delete this event?"
        confirmText="Delete"
        onConfirm={confirmDeleteEvent}
      />
    </div>
  );
}
