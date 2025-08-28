import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Car, Users, Plus, Trash2, Edit, CheckCircle, XCircle, AlertTriangle, Upload } from "lucide-react";

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
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

export default function Cars() {
  const [isCreateCarDialogOpen, setIsCreateCarDialogOpen] = useState(false);
  const [isAssignCarDialogOpen, setIsAssignCarDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const { toast } = useToast();

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

  const createCarMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/cars", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      setIsCreateCarDialogOpen(false);
      toast({ title: "Car added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add car", variant: "destructive" });
    }
  });

  const assignCarMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/car-assignments", data),
    onSuccess: async (_data, variables: any) => {
      if (variables?.carId) {
        await apiRequest("PUT", `/api/cars/${variables.carId}`, { status: "assigned" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/car-assignments"] });
      setIsAssignCarDialogOpen(false);
      toast({ title: "Car assigned successfully" });
    },
    onError: () => {
      toast({ title: "Failed to assign car", variant: "destructive" });
    }
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: ({ id, data, }: { id: string; data: any; carId?: string }) =>
      apiRequest("PUT", `/api/car-assignments/${id}`, data),
    onSuccess: async (_data, variables) => {
      if (variables?.carId) {
        await apiRequest("PUT", `/api/cars/${variables.carId}`, { status: "available" });
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
    mutationFn: (id: string) => apiRequest("DELETE", `/api/cars/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      toast({ title: "Car deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete car", variant: "destructive" });
    }
  });

  const carForm = useForm({
    resolver: zodResolver(insertCarSchema),
    defaultValues: {
      make: "",
      model: "",
      year: new Date().getFullYear(),
      licensePlate: "",
      status: "available",
      mileage: 0
    }
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

  const onSubmitCar = (data: any) => {
    createCarMutation.mutate(data);
  };

  const onSubmitAssignment = (data: any) => {
    assignCarMutation.mutate(data);
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
                      name="licensePlate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>License Plate</FormLabel>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteCarMutation.mutate(car.id)}
                          disabled={deleteCarMutation.isPending}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <CardDescription>{car.plateNumber}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Status</span>
                          {getStatusBadge(car.status)}
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Mileage</span>
                          <span className="text-sm font-medium">{car.mileage?.toLocaleString()} miles</span>
                        </div>
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
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
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
    </div>
  );
}