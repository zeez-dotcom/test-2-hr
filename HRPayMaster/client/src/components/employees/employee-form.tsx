import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEmployeeSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import ImageUpload from "@/components/ui/image-upload";
import type { Department, InsertEmployee } from "@shared/schema";
import { z } from "zod";

const formSchema = insertEmployeeSchema.extend({
  salary: z.string().min(1, "Salary is required").transform(val => val.toString()),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  visaAlertDays: z.coerce.number().min(1).max(365).optional(),
  civilIdAlertDays: z.coerce.number().min(1).max(365).optional(),
  passportAlertDays: z.coerce.number().min(1).max(365).optional(),
  employeeCode: z.string().min(1, "Employee code is required"),
});

type FormData = z.infer<typeof formSchema>;

interface EmployeeFormProps {
  departments: Department[];
  onSubmit: (employee: InsertEmployee) => void;
  isSubmitting: boolean;
  initialData?: Partial<InsertEmployee>;
}

export default function EmployeeForm({ 
  departments, 
  onSubmit, 
  isSubmitting, 
  initialData 
}: EmployeeFormProps) {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: initialData?.firstName || "",
      lastName: initialData?.lastName || "",
      employeeCode: initialData?.employeeCode || "",
      email: initialData?.email || "",
      phone: initialData?.phone || "",
      position: initialData?.position || "",
      role: initialData?.role || "employee",
      departmentId: initialData?.departmentId || undefined,
      salary: initialData?.salary || "",
      startDate: initialData?.startDate || new Date().toISOString().split('T')[0],
      status: initialData?.status || "active",
      visaAlertDays: initialData?.visaAlertDays || 90,
      civilIdAlertDays: initialData?.civilIdAlertDays || 60,
      passportAlertDays: initialData?.passportAlertDays || 90,
      profileImage: initialData?.profileImage || undefined,
      visaImage: initialData?.visaImage || undefined,
      civilIdImage: initialData?.civilIdImage || undefined,
      passportImage: initialData?.passportImage || undefined,
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
      iban: initialData?.iban || "",
      swiftCode: initialData?.swiftCode || "",
      residencyName: initialData?.residencyName || "",
      residencyOnCompany: initialData?.residencyOnCompany ?? false,
      professionCategory: initialData?.professionCategory || "",
    },
  });

  const residencyOnCompany = form.watch("residencyOnCompany");

  const handleSubmit = (data: FormData) => {
    onSubmit({
      ...data,
      salary: data.salary.toString(),
      transferable: data.transferable,
      residencyOnCompany: data.residencyOnCompany,
    });
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
              control={form.control}
              name="drivingLicenseImage"
              render={({ field }) => (
                <FormItem>
                  <ImageUpload
                    label="Driving License Image"
                    value={field.value || ""}
                    onChange={field.onChange}
                    variant="document"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Other Documents */}
          <FormField
            control={form.control}
            name="otherDocs"
            render={({ field }) => (
              <FormItem>
                <ImageUpload
                  label="Other Documents"
                  value={field.value || ""}
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
