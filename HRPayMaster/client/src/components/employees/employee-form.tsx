import { useForm, type SubmitHandler } from "react-hook-form";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEmployeeSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import ImageUpload from "@/components/ui/image-upload";
import { CommandDialog, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { queryClient } from "@/lib/queryClient";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/http";
import { useToast } from "@/hooks/use-toast";
import { toastApiError } from "@/lib/toastError";
import type {
  Company,
  Department,
  InsertEmployee,
  InsertEmployeeEvent,
  EmployeeEvent,
  EmployeeCustomField,
  EmployeeCustomValueMap,
} from "@shared/schema";
import { z } from "zod";
import AllowanceRecurringFields from "@/components/employees/allowance-recurring-fields";
import AllowanceTypeCombobox from "@/components/employees/allowance-type-combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate, getCurrencyCode } from "@/lib/utils";
import { Plus, Edit, Trash2 } from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";

const formSchema = insertEmployeeSchema.extend({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  position: z.string().trim().min(1, "Position is required"),
  salary: z
    .coerce
    .number({ invalid_type_error: "Salary is required" })
    .min(1, "Salary is required"),
  startDate: z.string().trim().min(1, "Start date is required"),
  additions: z.coerce.number().optional(),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  visaAlertDays: z.coerce.number().max(365).optional(),
  civilIdAlertDays: z.coerce.number().max(365).optional(),
  passportAlertDays: z.coerce.number().max(365).optional(),
  employeeCode: z.string().trim().min(1, "Employee code is required"),
});

const allowanceFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  amount: z
    .string()
    .trim()
    .min(1, "Amount is required")
    .refine((value) => !Number.isNaN(Number(value)), "Amount must be a valid number")
    .refine((value) => Number(value) >= 0, "Amount must be zero or positive"),
  recurrenceType: z.enum(["none", "monthly"]),
  recurrenceEndDate: z.string().nullable().optional(),
});

type FormData = z.infer<typeof formSchema>;
type AllowanceFormValues = z.infer<typeof allowanceFormSchema>;
type EmployeeFormSubmission = InsertEmployee & {
  customFieldValues?: EmployeeCustomValueMap;
};

interface EmployeeFormProps {
  departments: Department[];
  companies?: Company[];
  onSubmit: (employee: EmployeeFormSubmission) => void;
  isSubmitting: boolean;
  initialData?: Partial<EmployeeFormSubmission>;
  employeeId?: string;
}

export default function EmployeeForm({
  departments,
  companies = [],
  onSubmit,
  isSubmitting,
  initialData,
  employeeId,
}: EmployeeFormProps) {
  const { toast } = useToast();
  const currencyCode = getCurrencyCode();
  const [companyOpen, setCompanyOpen] = useState(false);
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newDepartmentOpen, setNewDepartmentOpen] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [search, setSearch] = useState("");
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      firstName: initialData?.firstName || "",
      lastName: initialData?.lastName || "",
      arabicName: initialData?.arabicName || "",
      nickname: initialData?.nickname || "",
      employeeCode: initialData?.employeeCode || "",
      email: initialData?.email || "",
      phone: initialData?.phone || "",
      position: initialData?.position || "",
      workLocation: initialData?.workLocation || undefined,
      role: initialData?.role || "employee",
      departmentId: initialData?.departmentId || undefined,
      companyId: initialData?.companyId || undefined,
      salary: initialData?.salary ?? undefined,
      additions: initialData?.additions ?? undefined,
      standardWorkingDays: initialData?.standardWorkingDays || 26,
      startDate: initialData?.startDate || new Date().toISOString().split('T')[0],
      status: initialData?.status || "active",
      emergencyPhone: initialData?.emergencyPhone || "",
      nationalId: initialData?.nationalId || "",
      address: initialData?.address || "",
      dateOfBirth: initialData?.dateOfBirth || "",
      visaAlertDays: initialData?.visaAlertDays || 90,
      civilIdAlertDays: initialData?.civilIdAlertDays || 60,
      passportAlertDays: initialData?.passportAlertDays || 90,
      profileImage: initialData?.profileImage || undefined,
      visaImage: initialData?.visaImage || undefined,
      civilIdImage: initialData?.civilIdImage || undefined,
      passportImage: initialData?.passportImage || undefined,
      bankIban: initialData?.bankIban || "",
      bankName: initialData?.bankName || "",
      nationality: initialData?.nationality || "",
      
      // profession removed from UI (use Position instead)
      paymentMethod: initialData?.paymentMethod || "",
      transferable: initialData?.transferable ?? false,
      drivingLicenseNumber: initialData?.drivingLicenseNumber || "",
      drivingLicenseIssueDate: initialData?.drivingLicenseIssueDate || "",
      drivingLicenseExpiryDate: initialData?.drivingLicenseExpiryDate || "",
      drivingLicenseImage: initialData?.drivingLicenseImage || undefined,
      otherDocs: initialData?.otherDocs || undefined,
      additionalDocs: initialData?.additionalDocs || undefined,
      // removed plain IBAN field; use bankIban only
      swiftCode: initialData?.swiftCode || "",
      residencyName: initialData?.residencyName || "",
      residencyOnCompany: initialData?.residencyOnCompany ?? false,
      professionCategory: initialData?.professionCategory || "",
    },
  });

  const addCompanyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiPost("/api/companies", { name });
      if (!res.ok) throw res;
      return res.data as Company;
    },
    onSuccess: (data: Company) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      form.setValue("companyId", data.id);
      setNewCompanyOpen(false);
      setNewCompanyName("");
      toast({ title: "Company added" });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to add company");
    },
  });

  const residencyOnCompany = form.watch("residencyOnCompany");

  const addDepartmentMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiPost("/api/departments", { name });
      if (!res.ok) throw res;
      return res.data as Department;
    },
    onSuccess: (data: Department) => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      form.setValue("departmentId", data.id);
      setNewDepartmentOpen(false);
      setNewDepartmentName("");
      toast({ title: "Department added" });
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to add department");
    },
  });

  const employeeStartDateValue = form.watch("startDate");

  const [isAllowanceDialogOpen, setIsAllowanceDialogOpen] = useState(false);
  const [allowanceToEdit, setAllowanceToEdit] = useState<EmployeeEvent | null>(null);
  const [isAllowanceConfirmOpen, setIsAllowanceConfirmOpen] = useState(false);
  const [allowanceToDelete, setAllowanceToDelete] = useState<string | null>(null);

  const allowanceForm = useForm<AllowanceFormValues>({
    resolver: zodResolver(allowanceFormSchema),
    defaultValues: {
      title: "",
      amount: "",
      recurrenceType: "none",
      recurrenceEndDate: null,
    },
  });

  const allowanceRecurrenceType = allowanceForm.watch("recurrenceType");

  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [initialCustomFieldValues, setInitialCustomFieldValues] = useState<EmployeeCustomValueMap>({});

  const {
    data: customFields = [],
    isLoading: customFieldsLoading,
    error: customFieldsError,
  } = useQuery<EmployeeCustomField[]>({
    queryKey: ["/api/employees/custom-fields"],
    queryFn: async () => {
      const res = await apiGet("/api/employees/custom-fields");
      if (!res.ok) {
        throw new Error(res.error || "Failed to load custom fields");
      }
      return res.data as EmployeeCustomField[];
    },
  });

  const {
    data: employeeCustomFieldsResponse,
    isLoading: employeeCustomFieldsLoading,
    isFetched: employeeCustomFieldsFetched,
    error: employeeCustomFieldsError,
  } = useQuery<{ fields: EmployeeCustomField[]; values: EmployeeCustomValueMap }>({
    queryKey: ["/api/employees", employeeId ?? "", "custom-fields"],
    enabled: !!employeeId,
    queryFn: async () => {
      if (!employeeId) {
        return { fields: [], values: {} };
      }
      const res = await apiGet(`/api/employees/${employeeId}/custom-fields`);
      if (!res.ok) {
        throw new Error(res.error || "Failed to load custom field values");
      }
      const payload = (res.data || {}) as {
        fields?: EmployeeCustomField[];
        values?: EmployeeCustomValueMap;
      };
      return {
        fields: payload.fields ?? [],
        values: payload.values ?? {},
      };
    },
  });

  useEffect(() => {
    if (allowanceRecurrenceType !== "monthly") {
      allowanceForm.setValue("recurrenceEndDate", null);
    }
  }, [allowanceRecurrenceType, allowanceForm]);

  useEffect(() => {
    if (initialData?.customFieldValues) {
      setInitialCustomFieldValues(initialData.customFieldValues);
      setCustomFieldValues(prev => {
        const next = { ...prev };
        for (const [fieldId, value] of Object.entries(initialData.customFieldValues ?? {})) {
          next[fieldId] = value ?? "";
        }
        return next;
      });
    }
  }, [initialData]);

  useEffect(() => {
    if (employeeId && employeeCustomFieldsFetched) {
      if (employeeCustomFieldsResponse?.fields?.length) {
        queryClient.setQueryData(["/api/employees/custom-fields"], employeeCustomFieldsResponse.fields);
      }
      const values = employeeCustomFieldsResponse?.values ?? {};
      setInitialCustomFieldValues(values);
      setCustomFieldValues(prev => {
        const next = { ...prev };
        for (const [fieldId, value] of Object.entries(values)) {
          next[fieldId] = value ?? "";
        }
        return next;
      });
    }
  }, [employeeId, employeeCustomFieldsFetched, employeeCustomFieldsResponse]);

  useEffect(() => {
    if (customFields.length === 0) return;
    setCustomFieldValues(prev => {
      const next = { ...prev };
      let changed = false;
      for (const field of customFields) {
        if (!(field.id in next)) {
          next[field.id] = "";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [customFields]);

  const {
    data: allowanceEvents = [],
    isLoading: allowancesLoading,
    error: allowanceError,
  } = useQuery<EmployeeEvent[]>({
    queryKey: ["/api/employee-events", employeeId ?? ""],
    enabled: !!employeeId,
    queryFn: async () => {
      if (!employeeId) return [];
      const params = new URLSearchParams({ employeeId, eventType: "allowance" });
      const res = await apiGet(`/api/employee-events?${params.toString()}`);
      if (!res.ok) {
        throw new Error(res.error || "Failed to load allowances");
      }
      return res.data as EmployeeEvent[];
    },
  });

  const allowanceRecurrenceStartDate = (() => {
    const base = allowanceToEdit?.eventDate ?? employeeStartDateValue;
    if (!base) return null;
    const parsed = new Date(base);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  })();

  const resetAllowanceForm = () => {
    allowanceForm.reset({
      title: "",
      amount: "",
      recurrenceType: "none",
      recurrenceEndDate: null,
    });
  };

  const resolveAllowanceEventDate = (existingDate?: string | null) => {
    const base = existingDate || form.getValues("startDate") || initialData?.startDate;
    if (base) {
      const parsed = new Date(base);
      if (!Number.isNaN(parsed.getTime())) {
        return base;
      }
    }
    return new Date().toISOString().split("T")[0];
  };

  const handleOpenAllowanceDialog = (event?: EmployeeEvent) => {
    if (event) {
      setAllowanceToEdit(event);
      allowanceForm.reset({
        title: event.title ?? "",
        amount: String(event.amount ?? ""),
        recurrenceType: (event.recurrenceType as AllowanceFormValues["recurrenceType"]) ?? "none",
        recurrenceEndDate: event.recurrenceEndDate ?? null,
      });
    } else {
      setAllowanceToEdit(null);
      resetAllowanceForm();
    }
    setIsAllowanceDialogOpen(true);
  };

  const createAllowanceMutation = useMutation<EmployeeEvent, any, AllowanceFormValues>({
    mutationFn: async (values: AllowanceFormValues) => {
      if (!employeeId) {
        throw new Error("Missing employee ID");
      }
      const payload: InsertEmployeeEvent = {
        employeeId,
        eventType: "allowance",
        title: values.title,
        description: values.title,
        amount: Number(values.amount).toString(),
        eventDate: resolveAllowanceEventDate(),
        affectsPayroll: true,
        status: "active",
        recurrenceType: values.recurrenceType,
        recurrenceEndDate: values.recurrenceType === "monthly" ? values.recurrenceEndDate ?? null : null,
      };
      const res = await apiPost("/api/employee-events", payload);
      if (!res.ok) throw res;
      return res.data as EmployeeEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-events"] });
      setIsAllowanceDialogOpen(false);
      setAllowanceToEdit(null);
      resetAllowanceForm();
      toast({ title: "Allowance saved" });
    },
    onError: (error) => {
      toastApiError(error as any, "Failed to create allowance");
    },
  });

  const updateAllowanceMutation = useMutation<
    EmployeeEvent,
    any,
    { id: string; values: AllowanceFormValues; eventDate?: string | null }
  >({
    mutationFn: async ({ id, values, eventDate }) => {
      if (!employeeId) {
        throw new Error("Missing employee ID");
      }
      const payload: Partial<InsertEmployeeEvent> = {
        employeeId,
        eventType: "allowance",
        title: values.title,
        description: values.title,
        amount: Number(values.amount).toString(),
        eventDate: resolveAllowanceEventDate(eventDate),
        affectsPayroll: true,
        status: "active",
        recurrenceType: values.recurrenceType,
        recurrenceEndDate: values.recurrenceType === "monthly" ? values.recurrenceEndDate ?? null : null,
      };
      const res = await apiPut(`/api/employee-events/${id}`, payload);
      if (!res.ok) throw res;
      return res.data as EmployeeEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-events"] });
      setIsAllowanceDialogOpen(false);
      setAllowanceToEdit(null);
      resetAllowanceForm();
      toast({ title: "Allowance updated" });
    },
    onError: (error) => {
      toastApiError(error as any, "Failed to update allowance");
    },
  });

  const deleteAllowanceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/employee-events/${id}`);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-events"] });
      setIsAllowanceConfirmOpen(false);
      setAllowanceToDelete(null);
      toast({ title: "Allowance deleted" });
    },
    onError: (error) => {
      toastApiError(error as any, "Failed to delete allowance");
    },
  });

  const isSavingAllowance = createAllowanceMutation.isPending || updateAllowanceMutation.isPending;

  const handleAllowanceSubmit = allowanceForm.handleSubmit((values) => {
    if (allowanceToEdit) {
      updateAllowanceMutation.mutate({
        id: allowanceToEdit.id,
        values,
        eventDate: allowanceToEdit.eventDate,
      });
    } else {
      createAllowanceMutation.mutate(values);
    }
  });

  const handleSubmit: SubmitHandler<FormData> = ({
    employeeCode,
    workLocation,
    transferable,
    residencyOnCompany,
    ...rest
  }) => {
    const payload: EmployeeFormSubmission = {
      ...rest,
      transferable: transferable ?? false,
      residencyOnCompany: residencyOnCompany ?? false,
      employeeCode,
    };
    if (workLocation && workLocation.trim() !== "") {
      payload.workLocation = workLocation.trim();
    }
    if (customFields.length > 0) {
      const nextValues: EmployeeCustomValueMap = {};
      for (const field of customFields) {
        const raw = customFieldValues[field.id];
        if (raw === undefined) {
          continue;
        }
        const trimmed = raw.trim();
        const initial = initialCustomFieldValues[field.id];
        if (trimmed === "") {
          if (initial !== undefined && initial !== null) {
            nextValues[field.id] = null;
          }
          continue;
        }
        if (initial !== undefined && initial !== null && trimmed === initial) {
          continue;
        }
        nextValues[field.id] = trimmed;
      }
      if (Object.keys(nextValues).length > 0) {
        payload.customFieldValues = nextValues;
      }
    }
    onSubmit(payload);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="employeeCode"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Employee Code</FormLabel>
                <FormControl>
                  <Input placeholder="EMP001" disabled={!!initialData?.employeeCode} {...field} />
                </FormControl>
                {fieldState.error && (
                  <p className="text-sm text-red-500">{fieldState.error.message}</p>
                )}
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <Input placeholder="John" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <Input placeholder="Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="arabicName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Arabic Name</FormLabel>
                <FormControl>
                  <Input placeholder="جون دو" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nickname"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nickname</FormLabel>
                <FormControl>
                  <Input placeholder="Johnny" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="john.doe@company.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="(555) 123-4567" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="position"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Position</FormLabel>
                <FormControl>
                  <Input placeholder="Software Engineer" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="workLocation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work Location</FormLabel>
                <FormControl>
                  <Input placeholder="Office" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="companyId"
            render={({ field }) => {
              const selected = companies.find(c => c.id === field.value);
              return (
                <FormItem>
                  <FormLabel>Company</FormLabel>
                  <FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => setCompanyOpen(true)}
                    >
                      {selected ? selected.name : "Select Company"}
                    </Button>
                  </FormControl>
                  <FormMessage />
                  <CommandDialog open={companyOpen} onOpenChange={setCompanyOpen}>
                    <CommandInput
                      placeholder="Search company..."
                      value={search}
                      onValueChange={setSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        <Button
                          onClick={() => {
                            setCompanyOpen(false);
                            setNewCompanyOpen(true);
                            setNewCompanyName(search);
                          }}
                          variant="ghost"
                        >
                          Create "{search}"
                        </Button>
                      </CommandEmpty>
                      {companies.map(co => (
                        <CommandItem
                          key={co.id}
                          value={co.name}
                          onSelect={() => {
                            field.onChange(co.id);
                            setCompanyOpen(false);
                          }}
                        >
                          {co.name}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </CommandDialog>
                  <Dialog open={newCompanyOpen} onOpenChange={setNewCompanyOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Company</DialogTitle>
                      </DialogHeader>
                      <div className="flex items-center space-x-2">
                        <Input
                          value={newCompanyName}
                          onChange={e => setNewCompanyName(e.target.value)}
                          placeholder="Company name"
                        />
                        <Button
                          onClick={() => addCompanyMutation.mutate(newCompanyName)}
                          disabled={addCompanyMutation.isPending || !newCompanyName.trim()}
                        >
                          {addCompanyMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </FormItem>
              );
            }}
          />

          <FormField
            control={form.control}
            name="departmentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department</FormLabel>
                <Select
                  onValueChange={(val) => {
                    if (val === "__create__") {
                      setNewDepartmentOpen(true);
                      return;
                    }
                    field.onChange(val);
                  }}
                  value={field.value || undefined}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__create__">+ Create Department</SelectItem>
                    {departments
                      .filter(dept => dept.id && dept.id.trim() !== "")
                      .map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
                <Dialog open={newDepartmentOpen} onOpenChange={setNewDepartmentOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Department</DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center space-x-2">
                      <Input
                        value={newDepartmentName}
                        onChange={e => setNewDepartmentName(e.target.value)}
                        placeholder="Department name"
                      />
                      <Button
                        onClick={() => addDepartmentMutation.mutate(newDepartmentName)}
                        disabled={addDepartmentMutation.isPending || !newDepartmentName.trim()}
                      >
                        {addDepartmentMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="salary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Salary</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="75000" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="additions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Additions</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="standardWorkingDays"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Standard Working Days per Month</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="26" {...field} value={field.value || 26} />
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
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="on_leave">On Leave</SelectItem>
                    <SelectItem value="resigned">Resigned</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "employee"}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="dateOfBirth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date of Birth</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nationalId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>National ID</FormLabel>
                <FormControl>
                  <Input placeholder="National ID" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Input placeholder="Address" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="emergencyPhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Emergency Phone</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="(555) 987-6543" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bankIban"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bank IBAN</FormLabel>
                <FormControl>
                  <Input placeholder="Bank IBAN" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bankName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bank Name</FormLabel>
                <FormControl>
                  <Input placeholder="Bank Name" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nationality"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nationality</FormLabel>
                <FormControl>
                  <Input placeholder="Nationality" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          

          {/* Profession field removed; Position is retained */}

          <FormField
            control={form.control}
            name="paymentMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Method</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Method" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="transferable"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Transferable</FormLabel>
                <Select
                  onValueChange={v => field.onChange(v === "true")}
                  value={field.value ? "true" : "false"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />


          {/* Plain IBAN field removed (keep Bank IBAN) */}
          <FormField
            control={form.control}
            name="swiftCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SWIFT Code</FormLabel>
                <FormControl>
                  <Input placeholder="SWIFT" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="residencyOnCompany"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Residency On Company</FormLabel>
                <Select
                  onValueChange={v => field.onChange(v === "true")}
                  value={field.value ? "true" : "false"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {!residencyOnCompany && (
            <FormField
              control={form.control}
              name="residencyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Residency Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Residency Name" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="professionCategory"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profession Category</FormLabel>
                <FormControl>
                  <Input placeholder="Category" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {customFieldsLoading ? (
          <p className="text-sm text-muted-foreground">Loading custom fields...</p>
        ) : customFieldsError ? (
          <p className="text-sm text-red-500">
            {customFieldsError instanceof Error
              ? customFieldsError.message
              : "Failed to load custom fields."}
          </p>
        ) : customFields.length > 0 ? (
          <div className="space-y-4 rounded-lg bg-gray-50 p-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Custom Fields</h3>
              <p className="text-sm text-muted-foreground">
                Capture additional employee details configured in settings.
              </p>
            </div>
            {employeeId && employeeCustomFieldsLoading ? (
              <p className="text-sm text-muted-foreground">Loading custom field values...</p>
            ) : employeeCustomFieldsError ? (
              <p className="text-sm text-red-500">
                {employeeCustomFieldsError instanceof Error
                  ? employeeCustomFieldsError.message
                  : "Failed to load custom field values."}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {customFields.map(field => (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={`custom-field-${field.id}`}>{field.name}</Label>
                    <Input
                      id={`custom-field-${field.id}`}
                      value={customFieldValues[field.id] ?? ""}
                      onChange={event =>
                        setCustomFieldValues(prev => ({
                          ...prev,
                          [field.id]: event.target.value,
                        }))
                      }
                      placeholder={field.name}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {employeeId && (
          <div className="space-y-4 rounded-lg bg-gray-50 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Allowances</h3>
                <p className="text-sm text-muted-foreground">
                  Manage recurring allowances that are applied to this employee's payroll.
                </p>
              </div>
              <Button
                type="button"
                className="bg-primary text-white hover:bg-blue-700"
                onClick={() => handleOpenAllowanceDialog()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add allowance
              </Button>
            </div>

            {allowancesLoading ? (
              <p className="text-sm text-muted-foreground">Loading allowances...</p>
            ) : allowanceError ? (
              <p className="text-sm text-red-500">
                {allowanceError instanceof Error
                  ? allowanceError.message
                  : "Failed to load allowances."}
              </p>
            ) : allowanceEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No allowances recorded for this employee.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Recurrence</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allowanceEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{event.title}</TableCell>
                      <TableCell>{formatCurrency(event.amount ?? 0)}</TableCell>
                      <TableCell>
                        {event.recurrenceType === "monthly"
                          ? event.recurrenceEndDate
                            ? `Monthly until ${formatDate(event.recurrenceEndDate)}`
                            : "Monthly (no end date)"
                          : "One-time"}
                      </TableCell>
                      <TableCell>
                        {event.eventDate ? formatDate(event.eventDate) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenAllowanceDialog(event)}
                            disabled={isSavingAllowance}
                            aria-label="Edit allowance"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setAllowanceToDelete(event.id);
                              setIsAllowanceConfirmOpen(true);
                            }}
                            disabled={deleteAllowanceMutation.isPending}
                            aria-label="Delete allowance"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {/* Profile Image Section */}
        <div className="space-y-4 p-6 bg-blue-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Profile Information</h3>
          <FormField
            control={form.control}
            name="profileImage"
            render={({ field }) => (
              <FormItem>
                <ImageUpload
                  label="Profile Picture"
                  value={field.value || ""}
                  onChange={field.onChange}
                  variant="profile"
                  maxSizeMB={2}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Document Tracking Section */}
        <div className="space-y-6 p-6 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Document Tracking</h3>
          
          {/* Visa Information */}
          <div className="space-y-4">
            <h4 className="text-md font-medium text-gray-800">Visa Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="visaNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visa Number</FormLabel>
                    <FormControl>
                      <Input placeholder="123456789" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="visaType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visa Type</FormLabel>
                    <FormControl>
                      <Input placeholder="Work Visa" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="visaAlertDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alert Days Before Expiry</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="30" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="visaIssueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visa Issue Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="visaExpiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visa Expiry Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Visa Image Upload */}
            <FormField
              control={form.control}
              name="visaImage"
              render={({ field }) => (
                <FormItem>
                  <ImageUpload
                    label="Visa Document Image"
                    value={field.value || ""}
                    onChange={field.onChange}
                    variant="document"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Civil ID Information */}
          <div className="space-y-4">
            <h4 className="text-md font-medium text-gray-800">Civil ID Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="civilId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Civil ID Number</FormLabel>
                    <FormControl>
                      <Input placeholder="123456789012" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="civilIdAlertDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alert Days Before Expiry</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="60" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="civilIdIssueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Civil ID Issue Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="civilIdExpiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Civil ID Expiry Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Civil ID Image Upload */}
            <FormField
              control={form.control}
              name="civilIdImage"
              render={({ field }) => (
                <FormItem>
                  <ImageUpload
                    label="Civil ID Document Image"
                    value={field.value || ""}
                    onChange={field.onChange}
                    variant="document"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Passport Information */}
          <div className="space-y-4">
            <h4 className="text-md font-medium text-gray-800">Passport Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="passportNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Passport Number</FormLabel>
                    <FormControl>
                      <Input placeholder="A12345678" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="passportAlertDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alert Days Before Expiry</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="90" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="passportIssueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Passport Issue Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="passportExpiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Passport Expiry Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Passport Image Upload */}
            <FormField
              control={form.control}
              name="passportImage"
              render={({ field }) => (
                <FormItem>
                  <ImageUpload
                    label="Passport Document Image"
                    value={field.value || ""}
                    onChange={field.onChange}
                    variant="document"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Driving License Information */}
          <div className="space-y-4 mt-6">
            <h4 className="text-md font-medium text-gray-800">Driving License Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="drivingLicenseNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>License Number</FormLabel>
                    <FormControl>
                      <Input placeholder="DL12345" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="drivingLicenseIssueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Issue Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="drivingLicenseExpiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiry Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

          <FormField
            control={form.control as any}
            name="drivingLicenseImage"
            render={({ field }) => (
              <FormItem>
                <ImageUpload
                  label="Driving License Image"
                  value={String(field.value || "")}
                  onChange={field.onChange}
                  variant="document"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          </div>

          {/* Additional Documents */}
          <FormField
            control={form.control as any}
            name="additionalDocs"
            render={({ field }) => (
              <FormItem>
                <ImageUpload
                  label="Additional Documents"
                  value={String(field.value || "")}
                  onChange={field.onChange}
                  variant="document"
                />
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Other Documents */}
          <FormField
            control={form.control as any}
            name="otherDocs"
            render={({ field }) => (
              <FormItem>
                <ImageUpload
                  label="Other Documents"
                  value={String(field.value || "")}
                  onChange={field.onChange}
                  variant="document"
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
          <Button type="submit" disabled={isSubmitting} className="bg-primary text-white hover:bg-blue-700">
            {isSubmitting
              ? (initialData ? "Updating..." : "Adding...")
              : (initialData ? "Update Employee" : "Add Employee")
            }
          </Button>
        </div>
      </form>
      {employeeId && (
        <>
          <Dialog
            open={isAllowanceDialogOpen}
            onOpenChange={(open) => {
              setIsAllowanceDialogOpen(open);
              if (!open) {
                setAllowanceToEdit(null);
                resetAllowanceForm();
              }
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{allowanceToEdit ? "Edit allowance" : "Add allowance"}</DialogTitle>
              </DialogHeader>
              <Form {...allowanceForm}>
                <form onSubmit={handleAllowanceSubmit} className="space-y-4">
                  <FormField
                    control={allowanceForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <AllowanceTypeCombobox
                            value={field.value ?? ""}
                            onChange={name => field.onChange(name)}
                            placeholder="Housing allowance"
                            disabled={isSavingAllowance}
                            extraOptions={allowanceEvents
                              .map(event => event.title ?? "")
                              .filter(title => title.trim().length > 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={allowanceForm.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount ({currencyCode})</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.001"
                            placeholder="0.000"
                            value={field.value ?? ""}
                            onChange={(event) => field.onChange(event.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <AllowanceRecurringFields
                    form={allowanceForm}
                    recurrenceStartDate={allowanceRecurrenceStartDate}
                  />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsAllowanceDialogOpen(false);
                        setAllowanceToEdit(null);
                        resetAllowanceForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSavingAllowance}>
                      {isSavingAllowance
                        ? "Saving..."
                        : allowanceToEdit
                          ? "Update allowance"
                          : "Add allowance"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          <ConfirmDialog
            open={isAllowanceConfirmOpen}
            onOpenChange={(open) => {
              setIsAllowanceConfirmOpen(open);
              if (!open) {
                setAllowanceToDelete(null);
              }
            }}
            title="Delete allowance"
            description="This allowance will be removed from the employee profile."
            confirmText="Delete"
            onConfirm={() => {
              if (allowanceToDelete && !deleteAllowanceMutation.isPending) {
                deleteAllowanceMutation.mutate(allowanceToDelete);
              }
            }}
          />
        </>
      )}
    </Form>
  );
}
