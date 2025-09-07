import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building, Plus, Trash2, Edit, Users } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiPost, apiPut, apiDelete } from "@/lib/http";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertDepartmentSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { Department, InsertDepartment, EmployeeWithDepartment } from "@shared/schema";
import { z } from "zod";
import ConfirmDialog from "@/components/ui/confirm-dialog";

type DepartmentFormData = z.infer<typeof insertDepartmentSchema>;

export default function Departments() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [departmentToDelete, setDepartmentToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const {
    data: departments,
    isLoading,
    error: departmentsError,
  } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: employees, error: employeesError } = useQuery<EmployeeWithDepartment[]>({
    queryKey: ["/api/employees"],
  });

  const addForm = useForm<DepartmentFormData>({
    resolver: zodResolver(insertDepartmentSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const editForm = useForm<DepartmentFormData>({
    resolver: zodResolver(insertDepartmentSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const addDepartmentMutation = useMutation({
    mutationFn: async (department: InsertDepartment) => {
      const res = await apiPost("/api/departments", department);
      if (!res.ok) throw new Error(res.error || "Failed to add department");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsAddDialogOpen(false);
      addForm.reset();
      toast({
        title: "Success",
        description: "Department added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add department",
        variant: "destructive",
      });
    },
  });

  const updateDepartmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertDepartment> }) => {
      const res = await apiPut(`/api/departments/${id}`, data);
      if (!res.ok) throw new Error(res.error || "Failed to update department");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setEditingDepartment(null);
      editForm.reset();
      toast({
        title: "Success",
        description: "Department updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update department",
        variant: "destructive",
      });
    },
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (departmentId: string) => {
      const res = await apiDelete(`/api/departments/${departmentId}`);
      if (!res.ok) throw new Error(res.error || "Failed to delete department");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Success",
        description: "Department deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete department",
        variant: "destructive",
      });
    },
  });

  if (departmentsError || employeesError) {
    return <div>Error loading departments</div>;
  }

  const handleAddDepartment = (data: DepartmentFormData) => {
    addDepartmentMutation.mutate(data);
  };

  const handleEditDepartment = (data: DepartmentFormData) => {
    if (editingDepartment) {
      updateDepartmentMutation.mutate({
        id: editingDepartment.id,
        data,
      });
    }
  };

  const handleDeleteDepartment = (departmentId: string) => {
    const employeesInDept = employees?.filter(emp => emp.departmentId === departmentId).length || 0;

    if (employeesInDept > 0) {
      toast({
        title: "Cannot Delete Department",
        description: `This department has ${employeesInDept} employee(s). Please reassign them first.`,
        variant: "destructive",
      });
      return;
    }

    setDepartmentToDelete(departmentId);
    setIsConfirmOpen(true);
  };

  const confirmDeleteDepartment = () => {
    if (departmentToDelete) {
      deleteDepartmentMutation.mutate(departmentToDelete);
    }
    setIsConfirmOpen(false);
    setDepartmentToDelete(null);
  };

  const handleConfirmOpenChange = (open: boolean) => {
    setIsConfirmOpen(open);
    if (!open) {
      setDepartmentToDelete(null);
    }
  };

  const startEdit = (department: Department) => {
    setEditingDepartment(department);
    editForm.reset({
      name: department.name,
      description: department.description || "",
    });
  };

  const getEmployeeCount = (departmentId: string) => {
    return employees?.filter(emp => emp.departmentId === departmentId).length || 0;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Departments</h1>
          <p className="text-muted-foreground">Manage your organization's departments</p>
        </div>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-full mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Departments</h1>
          <p className="text-muted-foreground">Manage your organization's departments</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-white hover:bg-blue-700">
              <Plus className="mr-2" size={16} />
              Add Department
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Department</DialogTitle>
            </DialogHeader>
            <Form {...addForm}>
              <form onSubmit={addForm.handleSubmit(handleAddDepartment)} className="space-y-4">
                <FormField
                  control={addForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Engineering" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={addForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Brief description of the department"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={addDepartmentMutation.isPending}
                    className="bg-primary text-white hover:bg-blue-700"
                  >
                    {addDepartmentMutation.isPending ? "Adding..." : "Add Department"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {!departments || departments.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Building className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No departments</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by creating your first department.</p>
            <div className="mt-6">
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-white hover:bg-blue-700">
                    <Plus className="mr-2" size={16} />
                    Add Department
                  </Button>
                </DialogTrigger>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departments.map((department) => (
            <Card key={department.id}>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Building className="text-primary" size={20} />
                    </div>
                    <div className="ml-3">
                      <CardTitle className="text-lg font-medium text-gray-900">
                        {department.name}
                      </CardTitle>
                    </div>
                  </div>
                  <div className="flex space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(department)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <Edit size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDepartment(department.id)}
                      disabled={deleteDepartmentMutation.isPending}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4 min-h-[2.5rem]">
                  {department.description || "No description provided"}
                </p>
                
                <div className="flex items-center text-sm text-gray-500">
                  <Users size={16} className="mr-1" />
                  <span>{getEmployeeCount(department.id)} employee(s)</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Department Dialog */}
      <Dialog open={!!editingDepartment} onOpenChange={() => setEditingDepartment(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Department</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditDepartment)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Engineering" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Brief description of the department"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingDepartment(null)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateDepartmentMutation.isPending}
                  className="bg-primary text-white hover:bg-blue-700"
                >
                  {updateDepartmentMutation.isPending ? "Updating..." : "Update Department"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={handleConfirmOpenChange}
        title="Delete Department"
        description="Are you sure you want to delete this department?"
        confirmText="Delete"
        onConfirm={confirmDeleteDepartment}
      />
    </div>
  );
}
