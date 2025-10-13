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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

import CarImport from "@/components/cars/car-import";

import { insertCarSchema, insertCarAssignmentSchema, type CarWithAssignment, type CarAssignmentWithDetails, type InsertCarAssignment } from "@shared/schema";
import { sanitizeImageSrc } from "@/lib/sanitizeImageSrc";
import { queryClient } from "@/lib/queryClient";
import { apiGet, apiPost, apiPut, apiDelete, apiUpload } from "@/lib/http";
import { toastApiError } from "@/lib/toastError";

export default function Cars() {
  const { t } = useTranslation();
  const [isCreateCarDialogOpen, setIsCreateCarDialogOpen] = useState(false);
  const [isAssignCarDialogOpen, setIsAssignCarDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [registrationPreview, setRegistrationPreview] = useState<string | null>(null);
  const [carImagePreview, setCarImagePreview] = useState<string | null>(null);
  const [editingCar, setEditingCar] = useState<CarWithAssignment | null>(null);
  const { toast } = useToast();
  const [repairDialogContext, setRepairDialogContext] = useState<
    { car: CarWithAssignment; mode: "log" | "return" } | null
  >(null);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const assignmentSearchTerm = assignmentSearch.trim();

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

  const {
    data: searchedAssignments = [],
    isLoading: isSearchLoading,
    isFetching: isSearching,
    error: searchError,
  } = useQuery<CarAssignmentWithDetails[]>({
    queryKey: ["/api/car-assignments/search", assignmentSearchTerm],
    enabled: assignmentSearchTerm.length > 0,
    queryFn: async ({ queryKey }) => {
      const [, searchValue] = queryKey as [string, string];
      const params = new URLSearchParams();
      params.set("plateNumber", searchValue);
      params.set("vin", searchValue);
      params.set("serial", searchValue);
      const res = await apiGet(`/api/car-assignments?${params.toString()}`);
      if (!res.ok) throw new Error(res.error || `Request failed with status ${res.status}`);
      const data = res.data;
      return Array.isArray(data) ? (data as CarAssignmentWithDetails[]) : [];
    },
  });

  const { data: employees = [], error: employeesError } = useQuery({
    queryKey: ["/api/employees"]
  });

  const { data: vacations = [] } = useQuery<any[]>({
    queryKey: ["/api/vacations"],
  });

  const postCarStatus = async (carId: string, status: string) => {
    const res = await apiPost(`/api/cars/${carId}/status`, { status });
    if (!res.ok) throw res;
    return res.data;
  };

  const createCarMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiUpload("/api/cars", data);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      setIsCreateCarDialogOpen(false);
      toast({ title: t('cars.addSuccess','Car added successfully') });
    },
    onError: (err: any) => {
      if (err?.status === 413) {
        toastApiError(err, t('cars.fileTooLarge','File too large'));
      } else {
        toastApiError(err, t('cars.addFailed','Failed to add car'));
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
        try {
          await postCarStatus(variables.carId, "assigned");
        } catch (err) {
          toastApiError(err as any, t('cars.statusUpdateFailed','Failed to update car status'));
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/car-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/car-assignments/search"] });
      setIsAssignCarDialogOpen(false);
      toast({ title: t('cars.assignSuccess','Car assigned successfully') });
    },
    onError: (err: any) => {
      const msg = err?.message || 'Failed to assign car';
      toast({ title: t('cars.assignFailed','Failed to assign car'), description: msg, variant: "destructive" });
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
        try {
          await postCarStatus(variables.carId, "available");
        } catch (err) {
          toastApiError(err as any, t('cars.statusUpdateFailed','Failed to update car status'));
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/car-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/car-assignments/search"] });
      toast({ title: t('cars.assignmentUpdateSuccess','Assignment updated successfully') });
    },
    onError: () => {
      toast({ title: t('cars.assignmentUpdateFailed','Failed to update assignment'), variant: "destructive" });
    }
  });

  const deleteCarMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/cars/${id}`);
      if (!res.ok) throw new Error(res.error || "Failed to delete car");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      toast({ title: t('cars.deleteSuccess','Car deleted successfully') });
    },
    onError: () => {
      toast({ title: t('cars.deleteFailed','Failed to delete car'), variant: "destructive" });
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
      toast({ title: t('cars.updateSuccess','Car updated successfully') });
    },
    onError: (err: any) => {
      if (err?.status === 413) {
        toastApiError(err, t('cars.fileTooLarge','File too large'));
      } else {
        toastApiError(err, t('cars.updateFailed','Failed to update car'));
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

  const createRepairFormDefaults = () => ({
    repairDate: new Date().toISOString().split('T')[0],
    description: '',
    cost: undefined as any,
    vendor: '',
    document: undefined as any,
  });

  const repairForm = useForm<z.infer<typeof repairSchema>>({
    resolver: zodResolver(repairSchema),
    defaultValues: createRepairFormDefaults(),
  });

  const addRepairMutation = useMutation<
    void,
    unknown,
    { carId: string; data: z.infer<typeof repairSchema> }
  >({
    mutationFn: async ({ carId, data }) => {
      const form = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          form.append(k, v instanceof File ? v : String(v));
        }
      });
      const res = await apiUpload(`/api/cars/${carId}/repairs`, form);
      if (!res.ok) throw res;
    },
    onError: (err) => {
      toastApiError(err as any, t('cars.repairLogFailed','Failed to log repair'));
    }
  });

  const carStatusMutation = useMutation<any, unknown, { carId: string; status: string }>({
    mutationFn: ({ carId, status }: { carId: string; status: string }) => postCarStatus(carId, status),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      if (variables.carId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cars", variables.carId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/car-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/car-assignments", variables.carId] });
      toast({
        title:
          variables.status === "maintenance"
            ? t('cars.markedMaintenance','Car marked for maintenance')
            : t('cars.returnedToService','Car returned to service'),
      });
    },
    onError: (err) => {
      toastApiError(err as any, t('cars.statusUpdateFailed','Failed to update car status'));
    },
  });

  const updateCarAssignmentStatus = useMutation<
    any,
    unknown,
    { assignmentId: string; status: string; carId: string; returnDate?: string }
  >({
    mutationFn: async ({ assignmentId, status, returnDate }) => {
      const payload: Record<string, string> = { status };
      if (returnDate) {
        payload.returnDate = returnDate;
      }
      const res = await apiPut(`/api/car-assignments/${assignmentId}`, payload);
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      if (variables.carId) {
        queryClient.invalidateQueries({ queryKey: ["/api/cars", variables.carId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/car-assignments"] });
      if (variables.carId) {
        queryClient.invalidateQueries({ queryKey: ["/api/car-assignments", variables.carId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/car-assignments/search"] });
      if (variables.carId && variables.status) {
        carStatusMutation.mutate({ carId: variables.carId, status: variables.status });
      }
    },
    onError: (err) => {
      toastApiError(err as any, 'Failed to update car status');
    }
  });

  const resetRepairFormValues = () => {
    repairForm.reset(createRepairFormDefaults());
  };

  const openRepairDialog = (car: CarWithAssignment, mode: "log" | "return") => {
    resetRepairFormValues();
    setRepairDialogContext({ car, mode });
  };

  const handleCarStatusChange = (
    car: CarWithAssignment,
    status: "available" | "maintenance" | string
  ) => {
    if (car.status === "maintenance" && status === "available") {
      openRepairDialog(car, "return");
      return;
    }

    if (status === "maintenance") {
      const activeAssignment =
        car.currentAssignment ??
        carAssignments.find(assignment => assignment.carId === car.id && assignment.status === "active");
      if (activeAssignment?.id) {
        const today = new Date().toISOString().split("T")[0];
        updateCarAssignmentStatus.mutate({
          assignmentId: activeAssignment.id,
          carId: car.id,
          status: "maintenance",
          ...(activeAssignment.returnDate ? {} : { returnDate: today }),
        });
        return;
      }
    }

    carStatusMutation.mutate({ carId: car.id, status });
  };

  const handleRepairDialogSubmit = repairForm.handleSubmit(async (data) => {
    if (!repairDialogContext) return;

    try {
      await addRepairMutation.mutateAsync({ carId: repairDialogContext.car.id, data });
      if (repairDialogContext.mode === "return") {
        await carStatusMutation.mutateAsync({
          carId: repairDialogContext.car.id,
          status: "available",
        });
      } else {
        toast({ title: t('cars.repairLogged','Repair logged successfully') });
      }
      resetRepairFormValues();
      setRepairDialogContext(null);
    } catch (err) {
      // Errors are handled by the respective mutations
    }
  });

  const isRepairDialogSubmitting = addRepairMutation.isPending || carStatusMutation.isPending;
  const isReturnDialog = repairDialogContext?.mode === "return";
  const repairDialogVehicleName = repairDialogContext
    ? [
        repairDialogContext.car.year,
        repairDialogContext.car.make,
        repairDialogContext.car.model,
      ]
        .filter(Boolean)
        .join(" ")
    : "";

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

  const getAssignmentStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-blue-100 text-blue-800"><Users className="w-3 h-3 mr-1" />Active</Badge>;
      case "completed":
        return <Badge className="bg-gray-100 text-gray-800"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const normalizedHistorySearch = assignmentSearchTerm.toLowerCase();
  const unfilteredHistoryAssignments = assignmentSearchTerm.length > 0 ? searchedAssignments : carAssignments;
  const historyAssignments = unfilteredHistoryAssignments.filter(assignment => {
    if (!normalizedHistorySearch) return true;
    const car = assignment.car;
    if (!car) return false;
    const plate = car.plateNumber?.toLowerCase() ?? "";
    const vin = car.vin?.toLowerCase() ?? "";
    const serial = car.serial?.toLowerCase() ?? "";
    return [plate, vin, serial].some(value => value.includes(normalizedHistorySearch));
  });
  const historyLoading = assignmentSearchTerm.length > 0 ? isSearchLoading && searchedAssignments.length === 0 : assignmentsLoading;
  const historyError = assignmentSearchTerm.length > 0 ? searchError : assignmentsError;
  const historyErrorMessage = historyError instanceof Error ? historyError.message : null;
  const historyRefreshing = assignmentSearchTerm.length > 0 ? isSearching && searchedAssignments.length > 0 : false;

  const validCars = cars.filter(car => car.id && car.id.trim() !== "");
  const availableCars = validCars.filter(car => car.status === "available");
  const maintenanceCars = validCars.filter(car => car.status === "maintenance");
  const totalCars = validCars.length;
  const availableCount = availableCars.length;
  const assignedCount = validCars.filter(car => car.status === "assigned").length;
  const maintenanceCount = maintenanceCars.length;
  const formatDateSafely = (value?: string | null) =>
    value ? format(new Date(value), "MMM d, yyyy") : "—";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('cars.title','Fleet Management')}</h1>
          <p className="text-muted-foreground">{t('cars.subtitle','Manage company vehicles and track assignments')}</p>
        </div>
        <div className="flex space-x-2">
          <Dialog open={isAssignCarDialogOpen} onOpenChange={setIsAssignCarDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Users className="w-4 h-4 mr-2" />
                {t('cars.assignCar','Assign Car')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{t('cars.assignTitle','Assign Car to Employee')}</DialogTitle>
                <DialogDescription>
                  {t('cars.assignDesc','Assign an available vehicle to an employee.')}
                </DialogDescription>
              </DialogHeader>
              <Form {...assignmentForm}>
                <form onSubmit={assignmentForm.handleSubmit(onSubmitAssignment)} className="space-y-4">
                  <FormField
                    control={assignmentForm.control}
                    name="carId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('cars.availableCar','Available Car')}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t('cars.selectCar','Select Car')} />
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
                      {assignCarMutation.isPending ? t('cars.assigning','Assigning...') : t('cars.assignCar','Assign Car')}
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
                {t('cars.addCar','Add Car')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{t('cars.addVehicleTitle','Add New Vehicle')}</DialogTitle>
                <DialogDescription>
                  {t('cars.addVehicleDesc','Add a new vehicle to the company fleet.')}
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
                          <FormLabel>{t('cars.make','Make')}</FormLabel>
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
                          <FormLabel>{t('cars.model','Model')}</FormLabel>
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
                          <FormLabel>{t('cars.year','Year')}</FormLabel>
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
                          <FormLabel>{t('cars.plateNumber','Plate Number')}</FormLabel>
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
                        <FormLabel>{t('cars.currentMileage','Current Mileage')}</FormLabel>
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
                        <FormLabel>{t('cars.registrationOwner','Registration Owner')}</FormLabel>
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
                        <FormLabel>{t('cars.registrationExpiry','Registration Expiry')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={carForm.control}
                    name="spareTireCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('cars.spareTires','Spare Tires (count)')}</FormLabel>
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
                        <FormLabel>{t('cars.carImage','Car Image')}</FormLabel>
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
                            alt={t('cars.carPreviewAlt','Car preview')}
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
                        <FormLabel>{t('cars.registrationDocument','Registration Document')}</FormLabel>
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
                            alt={t('cars.registrationPreviewAlt','Registration document preview')}
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
                        <FormLabel>{t('cars.registrationVideo','Registration Video (optional)')}</FormLabel>
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
                      {createCarMutation.isPending ? t('cars.adding','Adding...') : t('cars.addCar','Add Car')}
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
                {t('cars.import','Import')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{t('cars.importTitle','Import Vehicles')}</DialogTitle>
                <DialogDescription>
                  {t('cars.importDesc','Upload a spreadsheet to add or update vehicles.')}
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
                    name="spareTireCount"
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
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="history">Assignment History</TabsTrigger>
        </TabsList>

        <TabsContent value="fleet" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Vehicles</CardTitle>
                <Car className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalCars}</div>
                <p className="text-xs text-muted-foreground">All fleet vehicles</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Available</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{availableCount}</div>
                <p className="text-xs text-muted-foreground">Ready for assignment</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assigned</CardTitle>
                <Users className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{assignedCount}</div>
                <p className="text-xs text-muted-foreground">Currently in use</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-500">{maintenanceCount}</div>
                <p className="text-xs text-muted-foreground">Requires attention</p>
              </CardContent>
            </Card>
          </div>

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
              {validCars.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="p-6 text-center">
                    <Car className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles</h3>
                    <p className="text-gray-500">Add the first vehicle to your fleet.</p>
                  </CardContent>
                </Card>
              ) : (
                validCars.map((car) => (
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
                          <Button size="sm" variant="outline" onClick={() => openRepairDialog(car, "log")}>
                            {t('cars.repair','Repair')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setRepairsDialogCar(car)}>
                            {t('cars.repairs','Repairs')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              (carStatusMutation.isPending &&
                                carStatusMutation.variables?.carId === car.id) ||
                              (updateCarAssignmentStatus.isPending &&
                                updateCarAssignmentStatus.variables?.carId === car.id)
                            }
                            onClick={() =>
                              handleCarStatusChange(
                                car,
                                car.status === "maintenance" ? "available" : "maintenance",
                              )
                            }
                          >
                            {car.status === "maintenance" ? t('cars.backToService','Back to Service') : t('cars.markMaintenance','Mark as Maintenance')}
                          </Button>
                        </div>
                      </div>
                      <CardDescription>{car.plateNumber}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">{t('cars.status','Status')}</span>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(car.status)}
                            <Badge variant="outline">{t('cars.spareTiresLabel','Spare Tires')}: {(car as any).spareTireCount ?? 0}</Badge>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">{t('cars.mileage','Mileage')}</span>
                          <span className="text-sm font-medium">{car.mileage?.toLocaleString()} {t('cars.miles','miles')}</span>
                        </div>
                        {car.registrationOwner && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">{t('cars.owner','Owner')}</span>
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
                              <span className="text-sm text-muted-foreground">{t('cars.assignedTo','Assigned to')}</span>
                              <span className="text-sm font-medium">
                                {car.currentAssignment.employee?.firstName} {car.currentAssignment.employee?.lastName}
                              </span>
                            </div>
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-sm text-muted-foreground">{t('cars.since','Since')}</span>
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
                    <h3 className="text-lg font-medium text-gray-900 mb-2">{t('cars.noActive','No active assignments')}</h3>
                    <p className="text-gray-500">{t('cars.noActiveDesc','No cars are currently assigned to employees.')}</p>
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
                              {t('cars.viewDocument','View Document')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReturnCar(assignment.id)}
                              disabled={updateAssignmentMutation.isPending}
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              {t('cars.returnCar','Return Car')}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">{t('cars.employee','Employee')}</span>
                            <p className="font-medium">{assignment.employee?.firstName} {assignment.employee?.lastName}</p>
                            <p>{assignment.employee?.phone}</p>
                            <p>{t('cars.license','License')}: {assignment.employee?.drivingLicenseNumber}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('cars.carRegistration','Car Registration')}</span>
                            <p className="font-medium">{assignment.car?.plateNumber}</p>
                            <p>{t('cars.expiry','Expiry')}: {assignment.car?.registrationExpiry ? format(new Date(assignment.car.registrationExpiry), "MMM d, yyyy") : "N/A"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('cars.assignedDate','Assigned Date')}</span>
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

        <TabsContent value="maintenance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('cars.maintenance.title', 'Vehicles in Maintenance')}</CardTitle>
              <CardDescription>
                {t('cars.maintenance.description', 'Fleet vehicles currently out of service for maintenance.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {maintenanceCars.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('cars.maintenance.vehicleHeader', 'Vehicle')}</TableHead>
                      <TableHead>{t('cars.maintenance.assignmentHeader', 'Assignment')}</TableHead>
                      <TableHead>{t('cars.maintenance.datesHeader', 'Dates')}</TableHead>
                      <TableHead>{t('cars.maintenance.notesHeader', 'Notes')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {maintenanceCars.map((car) => {
                      const vehicleName =
                        [car.year, car.make, car.model].filter(Boolean).join(" ") ||
                        t('cars.maintenance.vehicleFallback', 'Vehicle');
                      const plateDetails = [car.plateNumber, car.vin].filter(Boolean).join(" • ");
                      const assignedEmployee = car.currentAssignment?.employee
                        ? `${car.currentAssignment.employee.firstName ?? ""} ${car.currentAssignment.employee.lastName ?? ""}`.trim()
                        : null;
                      const assignmentNotes = car.currentAssignment?.notes ?? car.notes ?? "";

                      return (
                        <TableRow key={car.id}>
                          <TableCell>
                            <div className="font-medium">{vehicleName}</div>
                            <div className="text-sm text-muted-foreground">
                              {plateDetails || t('cars.maintenance.noPlate', 'No plate or VIN provided')}
                            </div>
                            <div className="mt-2">{getStatusBadge(car.status)}</div>
                          </TableCell>
                          <TableCell>
                            {assignedEmployee ? (
                              <div className="space-y-1 text-sm">
                                <div className="font-medium">{assignedEmployee}</div>
                                {car.currentAssignment?.employee?.phone && (
                                  <div className="text-muted-foreground">
                                    {car.currentAssignment.employee.phone}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {t('cars.maintenance.unassigned', 'Not currently assigned')}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-sm">
                              <div>
                                {t('cars.maintenance.assignedLabel', 'Assigned: {{date}}', {
                                  date: formatDateSafely(car.currentAssignment?.assignedDate),
                                })}
                              </div>
                              <div>
                                {t('cars.maintenance.returnedLabel', 'Returned: {{date}}', {
                                  date: formatDateSafely(car.currentAssignment?.returnDate),
                                })}
                              </div>
                              {car.registrationExpiry && (
                                <div>
                                  {t('cars.maintenance.registrationLabel', 'Registration: {{date}}', {
                                    date: formatDateSafely(car.registrationExpiry),
                                  })}
                                </div>
                              )}
                              {car.insuranceExpiry && (
                                <div>
                                  {t('cars.maintenance.insuranceLabel', 'Insurance: {{date}}', {
                                    date: formatDateSafely(car.insuranceExpiry),
                                  })}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {assignmentNotes ? (
                              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                                {assignmentNotes}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {t('cars.maintenance.noNotes', 'No notes recorded.')}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-sm text-muted-foreground">
                  <Car className="h-10 w-10 text-gray-400" />
                  {t('cars.maintenance.empty', 'No vehicles are currently marked for maintenance.')}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-medium">{t('cars.history.title', 'Assignment History')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('cars.history.description', 'Search across active and completed vehicle assignments.')}
              </p>
            </div>
            <div className="sm:w-72">
              <Input
                placeholder={t('cars.history.searchPlaceholder', 'Search by plate, VIN, or serial')}
                value={assignmentSearch}
                onChange={event => setAssignmentSearch(event.target.value)}
                aria-label={t('cars.history.searchAria', 'Search assignments')}
              />
              {historyRefreshing && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('cars.history.refreshing', 'Updating results…')}
                </p>
              )}
            </div>
          </div>

          {historyError ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-destructive">
                  {historyErrorMessage || t('cars.history.error', 'Unable to load assignments.')}
                </p>
              </CardContent>
            </Card>
          ) : historyLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, index) => (
                <Card key={index}>
                  <CardContent className="p-6">
                    <div className="animate-pulse space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : historyAssignments.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center space-y-2">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900">
                  {t('cars.history.emptyTitle', 'No assignments found')}
                </h3>
                <p className="text-gray-500">
                  {t('cars.history.emptyDescription', 'Try adjusting your search to find historical records.')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {historyAssignments.map(assignment => {
                const startDate = assignment.assignedDate
                  ? format(new Date(assignment.assignedDate), "MMM d, yyyy")
                  : t('cars.history.unknownDate', 'Unknown');
                const endDate = assignment.returnDate
                  ? format(new Date(assignment.returnDate), "MMM d, yyyy")
                  : t('cars.history.present', 'Present');
                const vehicleNameParts = [assignment.car?.year, assignment.car?.make, assignment.car?.model].filter(Boolean) as string[];
                const vehicleName =
                  vehicleNameParts.length > 0
                    ? vehicleNameParts.join(" ")
                    : t('cars.history.vehicleFallback', 'Vehicle Assignment');
                const employeeName = assignment.employee
                  ?
                      [assignment.employee.firstName, assignment.employee.lastName]
                        .filter(Boolean)
                        .join(" ")
                        .trim() || t('cars.history.unknownEmployee', 'Unknown employee')
                  : t('cars.history.unknownEmployee', 'Unknown employee');
                const statusLabel = assignment.status
                  ? assignment.status.charAt(0).toUpperCase() + assignment.status.slice(1)
                  : t('cars.status', 'Status');

                return (
                  <Card key={assignment.id}>
                    <CardHeader className="pb-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <CardTitle className="text-lg">{vehicleName}</CardTitle>
                          <CardDescription>
                            {assignment.car?.plateNumber ?? t('cars.history.unknownPlate', 'Unknown plate')}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {getAssignmentStatusBadge(assignment.status)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <span className="text-muted-foreground">
                            {t('cars.history.periodLabel', 'Assignment Period')}
                          </span>
                          <p className="font-medium">{startDate} – {endDate}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('cars.employee', 'Employee')}</span>
                          <p className="font-medium">{employeeName}</p>
                          {assignment.employee?.phone && (
                            <p className="text-muted-foreground">{assignment.employee.phone}</p>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('cars.status', 'Status')}</span>
                          <p className="font-medium">{statusLabel}</p>
                        </div>
                      </div>
                      {assignment.notes && (
                        <div className="pt-4 border-t">
                          <span className="text-muted-foreground block mb-1">
                            {t('cars.history.notesLabel', 'Notes')}
                          </span>
                          <p>{assignment.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Repair Dialog */}
      <Dialog
        open={!!repairDialogContext}
        onOpenChange={(open) => {
          if (!open) {
            setRepairDialogContext(null);
            resetRepairFormValues();
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{isReturnDialog ? t('cars.returnCarToService','Return Car to Service') : t('cars.logRepair','Log Car Repair')}</DialogTitle>
            <DialogDescription>
              {isReturnDialog
                ? t('cars.returnServiceDesc', 'Record the maintenance details before returning {{vehicle}} to service.', { vehicle: repairDialogVehicleName || t('cars.thisVehicle','this vehicle') })
                : t('cars.trackMaintenanceDesc','Track maintenance and repair activity.')}
            </DialogDescription>
          </DialogHeader>
          <Form {...repairForm}>
            <form onSubmit={handleRepairDialogSubmit} className="space-y-4">
              <FormField
                control={repairForm.control}
                name="repairDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('cars.repairDate','Repair Date')}</FormLabel>
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
                    <FormLabel>{t('cars.description','Description')}</FormLabel>
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
                      <FormLabel>{t('cars.costOptional','Cost (optional)')}</FormLabel>
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
                      <FormLabel>{t('cars.vendorOptional','Vendor (optional)')}</FormLabel>
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
                    <FormLabel>{t('cars.receiptOptional','Receipt/Document (optional)')}</FormLabel>
                    <FormControl>
                      <Input type="file" accept="image/*,application/pdf" onChange={e => field.onChange(e.target.files?.[0])} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={isRepairDialogSubmitting}>
                  {isReturnDialog
                    ? isRepairDialogSubmitting
                      ? t('cars.returning','Returning...')
                      : t('cars.returnToService','Return to Service')
                    : isRepairDialogSubmitting
                    ? t('cars.saving','Saving...')
                    : t('cars.saveRepair','Save Repair')}
                </Button>
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
