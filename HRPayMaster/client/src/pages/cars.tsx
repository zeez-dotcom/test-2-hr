import { useState } from "react";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Car, Users, Plus, Trash2, Edit, CheckCircle, XCircle, AlertTriangle, Upload, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

import CarImport from "@/components/cars/car-import";

import { insertCarSchema, insertCarAssignmentSchema, type CarWithAssignment, type CarAssignmentWithDetails, type InsertCarAssignment } from "@shared/schema";
import { sanitizeImageSrc } from "@/lib/sanitizeImageSrc";
import { queryClient } from "@/lib/queryClient";
import { apiPost, apiPut, apiDelete, apiUpload } from "@/lib/http";
import { toastApiError } from "@/lib/toastError";

export default function Cars() {
  const [isCreateCarDialogOpen, setIsCreateCarDialogOpen] = useState(false);
  const [isAssignCarDialogOpen, setIsAssignCarDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [registrationPreview, setRegistrationPreview] = useState<string | null>(null);
  const [carImagePreview, setCarImagePreview] = useState<string | null>(null);
  const [editingCar, setEditingCar] = useState<CarWithAssignment | null>(null);
  const { toast } = useToast();
  const [repairDialogCarId, setRepairDialogCarId] = useState<string | null>(null);

  const {
    data: cars = [],
    isLoading: carsLoading,
    error: carsError,
  } = useQuery<CarWithAssignment[]>({
    queryKey: ["/api/cars"]
  });

  const {
    data: carAssignments = [],
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useQuery<CarAssignmentWithDetails[]>({
    queryKey: ["/api/car-assignments"]
  });

  const { data: employees = [], error: employeesError } = useQuery({
    queryKey: ["/api/employees"]
  });

  const { data: vacations = [] } = useQuery<any[]>({
    queryKey: ["/api/vacations"],
  });

  const createCarMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiUpload("/api/cars", data);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      setIsCreateCarDialogOpen(false);
      toast({ title: "Car added successfully" });
    },
    onError: (err: any) => {
      if (err?.status === 413) {
        toastApiError(err, "File too large");
      } else {
        toastApiError(err, "Failed to add car");
      }
    }
  });

  const assignCarMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPost("/api/car-assignments", data);
      if (!res.ok) throw new Error(res.error || "Failed to assign car");
    },
    onSuccess: async (_data, variables: any) => {
      if (variables?.carId) {
        await apiPut(`/api/cars/${variables.carId}`, { status: "assigned" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/car-assignments"] });
      setIsAssignCarDialogOpen(false);
      toast({ title: "Car assigned successfully" });
    },
    onError: (err: any) => {
      const msg = err?.message || 'Failed to assign car';
      toast({ title: "Failed to assign car", description: msg, variant: "destructive" });
    }
  });

  const updateAssignmentMutation = useMutation<Response, Error, { id: string; data: any; carId?: string }>({
    mutationFn: async ({ id, data }) => {
      const res = await apiPut(`/api/car-assignments/${id}`, data);
      if (!res.ok) throw new Error(res.error || "Failed to update assignment");
      return res as any;
    },
    onSuccess: async (_data, variables) => {
      if (variables?.carId) {
        await apiPut(`/api/cars/${variables.carId}`, { status: "available" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/car-assignments"] });
      toast({ title: "Assignment updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update assignment", variant: "destructive" });
    }
  });

  const deleteCarMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/cars/${id}`);
      if (!res.ok) throw new Error(res.error || "Failed to delete car");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      toast({ title: "Car deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete car", variant: "destructive" });
    }
  });

  const updateCarMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      const res = await apiPut(`/api/cars/${id}`, data);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      setEditingCar(null);
      setRegistrationPreview(null);
      toast({ title: "Car updated successfully" });
    },
    onError: (err: any) => {
      if (err?.status === 413) {
        toastApiError(err, "File too large");
      } else {
        toastApiError(err, "Failed to update car");
      }
    }
  });

  const repairSchema = z.object({
    repairDate: z.string().min(1, 'Repair date is required'),
    description: z.string().min(1, 'Description is required'),
    cost: z.preprocess(v => v === '' || v === undefined ? undefined : Number(v), z.number().nonnegative().optional()),
    vendor: z.string().optional(),
    document: z.any().optional(),
  });

  const repairForm = useForm<z.infer<typeof repairSchema>>({
    resolver: zodResolver(repairSchema),
    defaultValues: {
      repairDate: new Date().toISOString().split('T')[0],
      description: '',
      cost: undefined as any,
      vendor: '',
      document: undefined as any,
    },
  });

  const addRepairMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!repairDialogCarId) throw new Error('No car selected');
      const form = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          form.append(k, v instanceof File ? v : String(v));
        }
      });
      const res = await apiUpload(`/api/cars/${repairDialogCarId}/repairs`, form);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      toast({ title: 'Repair logged successfully' });
      setRepairDialogCarId(null);
      repairForm.reset({
        repairDate: new Date().toISOString().split('T')[0],
        description: '',
        cost: undefined as any,
        vendor: '',
        document: undefined as any,
      });
    },
    onError: (err) => {
      toastApiError(err as any, 'Failed to log repair');
    }
  });

  const [repairsDialogCar, setRepairsDialogCar] = useState<CarWithAssignment | null>(null);
  const repairsQuery = useQuery<any[]>({
    queryKey: repairsDialogCar ? ["/api/cars", repairsDialogCar.id, "repairs"] : ["/noop"],
    queryFn: async () => {
      const res = await fetch(`/api/cars/${repairsDialogCar!.id}/repairs`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!repairsDialogCar,
  });

  const carSchema = insertCarSchema.extend({
    plateNumber: z.string().min(1, "Plate number is required"),
    registrationOwner: z.string().min(1, "Registration owner is required"),
    registrationDocumentImage: z
      .any()
      .refine(
        file => file instanceof File || typeof file === "string",
        "Registration document image is required",
      ),
    registrationExpiry: z.string().min(1, "Registration expiry is required"),
  });

  const carForm = useForm<z.infer<typeof carSchema>>({
    resolver: zodResolver(carSchema),
    defaultValues: {
      make: "",
      model: "",
      year: new Date().getFullYear(),
      plateNumber: "",
      status: "available",
      mileage: 0,
      registrationOwner: "",
      registrationExpiry: "",
      registrationDocumentImage: undefined,
      carImage: undefined as any,
      registrationVideo: undefined as any,
      spareTireCount: 0 as any,
    },
  });

  const editCarForm = useForm<z.infer<typeof carSchema>>({
    resolver: zodResolver(carSchema),
  });

  const assignmentForm = useForm<InsertCarAssignment>({
    resolver: zodResolver(insertCarAssignmentSchema),
    defaultValues: {
      carId: "",
      employeeId: "",
      assignedDate: new Date().toISOString().split('T')[0],
      status: "active",
      notes: "",
    },
  });

  if (carsError || assignmentsError || employeesError) {
    return <div>Error loading cars</div>;
  }

  const onSubmitCar = (data: z.infer<typeof carSchema>) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(
          key,
          value instanceof File ? value : String(value)
        );
      }
    });

    createCarMutation.mutate(formData);
  };

  const onSubmitAssignment = (data: any) => {
    const empId = data?.employeeId;
    const asgDate = new Date(data?.assignedDate || new Date().toISOString().split('T')[0]);
    const overlap = (vacations as any[]).some(v => v.employeeId === empId &&
      // consider approved or pending requests
      (v.status === 'approved' || v.status === 'pending') &&
      new Date(v.startDate) <= asgDate && new Date(v.endDate) >= asgDate
    );
    if (overlap) {
      const proceed = window.confirm('This employee has a vacation overlapping the assignment date. Proceed with assigning the car?');
      if (!proceed) return;
    }
    assignCarMutation.mutate(data);
  };

  const handleEditCar = (car: CarWithAssignment) => {
    setEditingCar(car);
    setRegistrationPreview(car.registrationDocumentImage ?? null);
    setCarImagePreview((car as any).carImage ?? null);
    editCarForm.reset({
      make: car.make,
      model: car.model,
      year: car.year,
      plateNumber: car.plateNumber,
      status: car.status,
      mileage: car.mileage ?? 0,
      registrationOwner: car.registrationOwner ?? "",
      registrationExpiry: car.registrationExpiry
        ? car.registrationExpiry.split("T")[0]
        : "",
      registrationDocumentImage: car.registrationDocumentImage ?? undefined,
      carImage: (car as any).carImage ?? undefined,
      registrationVideo: (car as any).registrationVideo ?? undefined,
      spareTireCount: (car as any).spareTireCount ?? 0,
    });
  };

  const onSubmitEditCar = (data: z.infer<typeof carSchema>) => {
    if (!editingCar) return;
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(
          key,
          value instanceof File ? value : String(value)
        );
      }
    });
    updateCarMutation.mutate({ id: editingCar.id, data: formData });
  };

  const handleReturnCar = (assignmentId: string) => {
    const assignment = carAssignments.find(a => a.id === assignmentId);
    updateAssignmentMutation.mutate({
      id: assignmentId,
      data: {
        status: "completed",
        returnDate: new Date().toISOString().split('T')[0]
      },
      carId: assignment?.carId
    });
  };

  const viewAssignmentDocument = (assignment: CarAssignmentWithDetails) => {
    window.open(`/api/car-assignments/${assignment.id}/document`, "_blank");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Available</Badge>;
      case "assigned":
        return <Badge className="bg-blue-100 text-blue-800"><Users className="w-3 h-3 mr-1" />Assigned</Badge>;
      case "maintenance":
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Maintenance</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const availableCars = cars.filter(
    car => car.status === "available" && car.id && car.id.trim() !== ""
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fleet Management</h1>
          <p className="text-muted-foreground">Manage company vehicles and track assignments</p>
        </div>
        <div className="flex space-x-2">
          <Dialog open={isAssignCarDialogOpen} onOpenChange={setIsAssignCarDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Users className="w-4 h-4 mr-2" />
                Assign Car
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Assign Car to Employee</DialogTitle>
                <DialogDescription>
                  Assign an available vehicle to an employee.
                </DialogDescription>
              </DialogHeader>
              <Form {...assignmentForm}>
                <form onSubmit={assignmentForm.handleSubmit(onSubmitAssignment)} className="space-y-4">
                  <FormField
                    control={assignmentForm.control}
                    name="carId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Available Car</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Car" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableCars.map(car => (
                              <SelectItem key={car.id} value={car.id}>
                                {car.year} {car.make} {car.model} - {car.plateNumber}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={assignmentForm.control}
                    name="employeeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employee</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Employee" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(employees as any[]).filter(emp => emp.id && emp.id.trim() !== "").map((employee: any) => (
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
                    control={assignmentForm.control}
                    name="assignedDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assignment Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={assignmentForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Assignment notes..."
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button type="submit" disabled={assignCarMutation.isPending}>
                      {assignCarMutation.isPending ? "Assigning..." : "Assign Car"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateCarDialogOpen} onOpenChange={setIsCreateCarDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Car
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Vehicle</DialogTitle>
                <DialogDescription>
                  Add a new vehicle to the company fleet.
                </DialogDescription>
              </DialogHeader>
              <Form {...carForm}>
                <form onSubmit={carForm.handleSubmit(onSubmitCar)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={carForm.control}
                      name="make"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Make</FormLabel>
                          <FormControl>
                            <Input placeholder="Toyota" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={carForm.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model</FormLabel>
                          <FormControl>
                            <Input placeholder="Camry" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={carForm.control}
                      name="year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Year</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="2024" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={carForm.control}
                      name="plateNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plate Number</FormLabel>
                          <FormControl>
                            <Input placeholder="ABC-123" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={carForm.control}
                    name="mileage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Mileage</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="25000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={carForm.control}
                    name="registrationOwner"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Owner</FormLabel>
                        <FormControl>
                          <Input placeholder="Owner name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={carForm.control}
                    name="registrationExpiry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Expiry</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={carForm.control}
                    name="spareTireCount" as={undefined as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spare Tires (count)</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} onChange={e => field.onChange(Number(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={carForm.control}
                    name="carImage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Car Image</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              field.onChange(file);
                              setCarImagePreview(file ? URL.createObjectURL(file) : null);
                            }}
                          />
                        </FormControl>
                        {carImagePreview && (
                          <img
                            src={sanitizeImageSrc(carImagePreview)}
                            alt="Car preview"
                            className="h-32 mt-2 rounded-md object-cover"
                          />
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={carForm.control}
                    name="registrationDocumentImage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Document</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              field.onChange(file);
                              setRegistrationPreview(file ? URL.createObjectURL(file) : null);
                            }}
                          />
                        </FormControl>
                        {(registrationPreview || typeof field.value === "string") && (
                          <img
                            src={sanitizeImageSrc(registrationPreview || (field.value as string))}
                            alt="Registration document preview"
                            className="h-32 mt-2 rounded-md object-cover"
                          />
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={carForm.control}
                    name="registrationVideo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Video (optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="video/*"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              field.onChange(file);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button type="submit" disabled={createCarMutation.isPending}>
                      {createCarMutation.isPending ? "Adding..." : "Add Car"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Import Vehicles</DialogTitle>
                <DialogDescription>
                  Upload a spreadsheet to add or update vehicles.
                </DialogDescription>
              </DialogHeader>
              <CarImport />
            </DialogContent>
          </Dialog>

          <Dialog
            open={!!editingCar}
            onOpenChange={open => {
              if (!open) {
                setEditingCar(null);
                setRegistrationPreview(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Edit Vehicle</DialogTitle>
                <DialogDescription>
                  Update the vehicle information.
                </DialogDescription>
              </DialogHeader>
              <Form {...editCarForm}>
                <form
                  onSubmit={editCarForm.handleSubmit(onSubmitEditCar)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editCarForm.control}
                      name="make"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Make</FormLabel>
                          <FormControl>
                            <Input placeholder="Toyota" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editCarForm.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model</FormLabel>
                          <FormControl>
                            <Input placeholder="Camry" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editCarForm.control}
                      name="year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Year</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="2024" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editCarForm.control}
                      name="plateNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plate Number</FormLabel>
                          <FormControl>
                            <Input placeholder="ABC-123" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={editCarForm.control}
                    name="mileage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Mileage</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="25000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editCarForm.control}
                    name="registrationOwner"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Owner</FormLabel>
                        <FormControl>
                          <Input placeholder="Owner name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editCarForm.control}
                    name="registrationExpiry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Expiry</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editCarForm.control}
                    name="spareTireCount" as={undefined as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spare Tires (count)</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} onChange={e => field.onChange(Number(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editCarForm.control}
                    name="carImage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Car Image</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              field.onChange(file);
                              setCarImagePreview(file ? URL.createObjectURL(file) : null);
                            }}
                          />
                        </FormControl>
                        {(carImagePreview || typeof field.value === "string") && (
                          <img
                            src={sanitizeImageSrc(carImagePreview || (field.value as string))}
                            alt="Car preview"
                            className="h-32 mt-2 rounded-md object-cover"
                          />
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editCarForm.control}
                    name="registrationDocumentImage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Document</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              field.onChange(file);
                              setRegistrationPreview(file ? URL.createObjectURL(file) : null);
                            }}
                          />
                        </FormControl>
                        {(registrationPreview || typeof field.value === "string") && (
                          <img
                            src={sanitizeImageSrc(registrationPreview || (field.value as string))}
                            alt="Registration document preview"
                            className="h-32 mt-2 rounded-md object-cover"
                          />
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editCarForm.control}
                    name="registrationVideo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Video (optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="video/*"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              field.onChange(file);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button type="submit" disabled={updateCarMutation.isPending}>
                      {updateCarMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="fleet" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fleet">Fleet Overview</TabsTrigger>
          <TabsTrigger value="assignments">Active Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="fleet" className="space-y-4">
          {carsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cars.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="p-6 text-center">
                    <Car className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles</h3>
                    <p className="text-gray-500">Add the first vehicle to your fleet.</p>
                  </CardContent>
                </Card>
              ) : (
                cars.map((car) => (
                  <Card key={car.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Car className="w-4 h-4" />
                          <CardTitle className="text-lg">
                            {car.year} {car.make} {car.model}
                          </CardTitle>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEditCar(car)}>
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteCarMutation.mutate(car.id)}
                            disabled={deleteCarMutation.isPending}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRepairDialogCarId(car.id)}>
                            Repair
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRepairsDialogCar(car)}>
                            Repairs
                          </Button>
                        </div>
                      </div>
                      <CardDescription>{car.plateNumber}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Status</span>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(car.status)}
                            <Badge variant="outline">Spare Tires: {(car as any).spareTireCount ?? 0}</Badge>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Mileage</span>
                          <span className="text-sm font-medium">{car.mileage?.toLocaleString()} miles</span>
                        </div>
                        {car.registrationOwner && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Owner</span>
                            <span className="text-sm font-medium">{car.registrationOwner}</span>
                          </div>
                        )}
                        {(car as any).carImage && (
                          <div className="mt-2">
                            <img
                              src={sanitizeImageSrc((car as any).carImage)}
                              alt="Car image"
                              className="h-32 w-full object-cover rounded-md"
                            />
                          </div>
                        )}
                        {car.registrationDocumentImage && (
                          <div className="mt-2">
                            <img
                              src={sanitizeImageSrc(car.registrationDocumentImage)}
                              alt="Registration document"
                              className="h-32 w-full object-cover rounded-md"
                            />
                          </div>
                        )}
                        {car.currentAssignment && (
                          <div className="pt-2 border-t">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">Assigned to</span>
                              <span className="text-sm font-medium">
                                {car.currentAssignment.employee?.firstName} {car.currentAssignment.employee?.lastName}
                              </span>
                            </div>
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-sm text-muted-foreground">Since</span>
                              <span className="text-sm">{format(new Date(car.currentAssignment.assignedDate), "MMM d, yyyy")}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          {assignmentsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {carAssignments.filter(a => a.status === "active").length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No active assignments</h3>
                    <p className="text-gray-500">No cars are currently assigned to employees.</p>
                  </CardContent>
                </Card>
              ) : (
                carAssignments
                  .filter(assignment => assignment.status === "active")
                  .map((assignment) => (
                    <Card key={assignment.id}>
                      <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <Car className="w-5 h-5" />
                            <div>
                              <CardTitle className="text-lg">
                                {assignment.car?.year} {assignment.car?.make} {assignment.car?.model}
                              </CardTitle>
                              <CardDescription>
                                {assignment.car?.plateNumber} • Assigned to {assignment.employee?.firstName} {assignment.employee?.lastName}
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => viewAssignmentDocument(assignment)}
                            >
                              <FileText className="w-3 h-3 mr-1" />
                              View Document
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReturnCar(assignment.id)}
                              disabled={updateAssignmentMutation.isPending}
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Return Car
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Employee</span>
                            <p className="font-medium">{assignment.employee?.firstName} {assignment.employee?.lastName}</p>
                            <p>{assignment.employee?.phone}</p>
                            <p>License: {assignment.employee?.drivingLicenseNumber}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Car Registration</span>
                            <p className="font-medium">{assignment.car?.plateNumber}</p>
                            <p>Expiry: {assignment.car?.registrationExpiry ? format(new Date(assignment.car.registrationExpiry), "MMM d, yyyy") : "N/A"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Assigned Date</span>
                            <p className="font-medium">{format(new Date(assignment.assignedDate), "MMM d, yyyy")}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Duration</span>
                            <p className="font-medium">
                              {Math.floor((new Date().getTime() - new Date(assignment.assignedDate).getTime()) / (1000 * 60 * 60 * 24))} days
                            </p>
                          </div>
                        </div>
                        {assignment.notes && (
                          <div className="mt-4 pt-4 border-t">
                            <span className="text-muted-foreground text-sm">Notes:</span>
                            <p className="text-sm mt-1">{assignment.notes}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Repair Dialog */}
      <Dialog open={!!repairDialogCarId} onOpenChange={(open) => !open && setRepairDialogCarId(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Log Car Repair</DialogTitle>
            <DialogDescription>Track maintenance and repair activity.</DialogDescription>
          </DialogHeader>
          <Form {...repairForm}>
            <form onSubmit={repairForm.handleSubmit((data) => addRepairMutation.mutate(data))} className="space-y-4">
              <FormField
                control={repairForm.control}
                name="repairDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repair Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={repairForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="What was repaired?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={repairForm.control}
                  name="cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost (optional)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} onChange={e => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={repairForm.control}
                  name="vendor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Workshop name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={repairForm.control}
                name="document"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Receipt/Document (optional)</FormLabel>
                    <FormControl>
                      <Input type="file" accept="image/*,application/pdf" onChange={e => field.onChange(e.target.files?.[0])} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={addRepairMutation.isPending}>{addRepairMutation.isPending ? 'Saving...' : 'Save Repair'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Repairs List Dialog */}
      <Dialog open={!!repairsDialogCar} onOpenChange={(open) => !open && setRepairsDialogCar(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Repairs - {repairsDialogCar?.make} {repairsDialogCar?.model}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {repairsQuery.isLoading ? (
              <div>Loading repairs…</div>
            ) : (repairsQuery.data || []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No repairs found.</div>
            ) : (
              (repairsQuery.data || []).map((r: any) => (
                <div key={r.id} className="border rounded p-3 text-sm">
                  <div className="flex justify-between">
                    <div className="font-medium">{r.vendor || 'Repair'}</div>
                    <div>{new Date(r.repairDate).toLocaleDateString()}</div>
                  </div>
                  <div className="mt-1">{r.description}</div>
                  <div className="mt-1 text-muted-foreground">Cost: {r.cost ?? 'N/A'}</div>
                  {r.documentUrl && (
                    <div className="mt-1"><a className="text-blue-600 underline" href={r.documentUrl} target="_blank">View Document</a></div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
