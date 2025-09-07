import { useForm, type SubmitHandler } from "react-hook-form";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEmployeeSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import ImageUpload from "@/components/ui/image-upload";
import { CommandDialog, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { queryClient } from "@/lib/queryClient";
import { apiPost } from "@/lib/http";
import { useToast } from "@/hooks/use-toast";
import type { Company, Department, InsertEmployee } from "@shared/schema";
import { z } from "zod";

const formSchema = insertEmployeeSchema.extend({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  position: z.string().trim().min(1, "Position is required"),
  salary: z.string().trim().min(1, "Salary is required"),
  startDate: z.string().trim().min(1, "Start date is required"),
  additions: z.string().optional(),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  visaAlertDays: z.coerce.number().max(365).optional(),
  civilIdAlertDays: z.coerce.number().max(365).optional(),
  passportAlertDays: z.coerce.number().max(365).optional(),
  employeeCode: z
    .string()
    .trim()
    .min(1, "Employee code cannot be empty")
    .optional()
    .or(z.literal("")),
});

type FormData = z.infer<typeof formSchema>;

interface EmployeeFormProps {
  departments: Department[];
  companies?: Company[];
  onSubmit: (employee: InsertEmployee) => void;
  isSubmitting: boolean;
  initialData?: Partial<InsertEmployee>;
}

export default function EmployeeForm({
  departments,
  companies = [],
  onSubmit,
  isSubmitting,
  initialData
}: EmployeeFormProps) {
  const { toast } = useToast();
  const [companyOpen, setCompanyOpen] = useState(false);
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
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
      salary:
        initialData?.salary !== undefined ? String(initialData.salary) : "",
      additions:
        initialData?.additions !== undefined
          ? String(initialData.additions)
          : "",
      standardWorkingDays: initialData?.standardWorkingDays || 26,
      startDate: initialData?.startDate || new Date().toISOString().split('T')[0],
      status: initialData?.status || "active",
      emergencyContact: initialData?.emergencyContact || "",
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
      professionCode: initialData?.professionCode || "",
      profession: initialData?.profession || "",
      paymentMethod: initialData?.paymentMethod || "",
      transferable: initialData?.transferable ?? false,
      drivingLicenseNumber: initialData?.drivingLicenseNumber || "",
      drivingLicenseIssueDate: initialData?.drivingLicenseIssueDate || "",
      drivingLicenseExpiryDate: initialData?.drivingLicenseExpiryDate || "",
      drivingLicenseImage: initialData?.drivingLicenseImage || undefined,
      otherDocs: initialData?.otherDocs || undefined,
      additionalDocs: initialData?.additionalDocs || undefined,
      iban: initialData?.iban || "",
      swiftCode: initialData?.swiftCode || "",
      residencyName: initialData?.residencyName || "",
      residencyOnCompany: initialData?.residencyOnCompany ?? false,
      professionCategory: initialData?.professionCategory || "",
    },
  });

  const addCompanyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiPost("/api/companies", { name });
      if (!res.ok) throw new Error(res.error || "Failed to add company");
      return res.data as Company;
    },
    onSuccess: (data: Company) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      form.setValue("companyId", data.id);
      setNewCompanyOpen(false);
      setNewCompanyName("");
      toast({ title: "Company added" });
    },
    onError: () => {
      toast({ title: "Failed to add company", variant: "destructive" });
    },
  });

  const residencyOnCompany = form.watch("residencyOnCompany");

  const handleSubmit: SubmitHandler<FormData> = (data) => {
    const {
      employeeCode,
      workLocation,
      salary,
      additions,
      visaAlertDays,
      civilIdAlertDays,
      passportAlertDays,
      transferable,
      residencyOnCompany,
      ...rest
    } = data;
    const payload: any = {
      ...rest,
      ...(salary ? { salary: Number(salary) } : {}),
      ...(additions ? { additions: Number(additions) } : {}),
      ...(visaAlertDays ? { visaAlertDays: Number(visaAlertDays) } : {}),
      ...(civilIdAlertDays ? { civilIdAlertDays: Number(civilIdAlertDays) } : {}),
      ...(passportAlertDays ? { passportAlertDays: Number(passportAlertDays) } : {}),
      transferable: transferable ?? false,
      residencyOnCompany: residencyOnCompany ?? false,
    };
    if (employeeCode && employeeCode.trim() !== "") {
      payload.employeeCode = employeeCode.trim();
    }
    if (workLocation && workLocation.trim() !== "") {
      payload.workLocation = workLocation.trim();
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
            render={({ field }) => (
              <FormItem>
                <FormLabel>Employee Code</FormLabel>
                <FormControl>
                  <Input placeholder="EMP001" disabled={!!initialData?.employeeCode} {...field} />
                </FormControl>
                <FormMessage />
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
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {departments.filter(dept => dept.id && dept.id.trim() !== "").map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
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
            name="salary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Salary</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="75000" {...field} />
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
                  <Input type="number" placeholder="0" {...field} />
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
            name="emergencyContact"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Emergency Contact</FormLabel>
                <FormControl>
                  <Input placeholder="Contact Name" {...field} value={field.value || ""} />
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

          <FormField
            control={form.control}
            name="professionCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profession Code</FormLabel>
                <FormControl>
                  <Input placeholder="Code" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="profession"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profession</FormLabel>
                <FormControl>
                  <Input placeholder="Profession" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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


          <FormField
            control={form.control}
            name="iban"
            render={({ field }) => (
              <FormItem>
                <FormLabel>IBAN</FormLabel>
                <FormControl>
                  <Input placeholder="IBAN" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
    </Form>
  );
}
