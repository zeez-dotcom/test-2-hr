import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

import EmployeeTable from "@/components/employees/employee-table";
import EmployeeForm from "@/components/employees/employee-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EmployeeWithDepartment, Department, InsertEmployee } from "@shared/schema";

export default function Employees() {
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeWithDepartment | null>(null);
  const { toast } = useToast();

  const { data: employees, isLoading: employeesLoading } = useQuery<EmployeeWithDepartment[]>({
    queryKey: ["/api/employees"],
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      await apiRequest("DELETE", `/api/employees/${employeeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Success",
        description: "Employee deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete employee",
        variant: "destructive",
      });
    },
  });

  const addEmployeeMutation = useMutation({
    mutationFn: async (employee: InsertEmployee) => {
      await apiRequest("POST", "/api/employees", employee);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsAddDialogOpen(false);
      toast({
        title: "Success",
        description: "Employee added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add employee",
        variant: "destructive",
      });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, employee }: { id: string; employee: Partial<InsertEmployee> }) => {
      await apiRequest("PUT", `/api/employees/${id}`, employee);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsEditDialogOpen(false);
      setEditingEmployee(null);
      toast({
        title: "Success",
        description: "Employee updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update employee",
        variant: "destructive",
      });
    },
  });

  // Filter employees based on search query and department
  const filteredEmployees = employees?.filter((employee) => {
    const matchesSearch = searchQuery === "" || 
      `${employee.firstName} ${employee.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.position.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDepartment = departmentFilter === "" || departmentFilter === "all" || employee.departmentId === departmentFilter;
    
    return matchesSearch && matchesDepartment;
  }) || [];

  const handleDeleteEmployee = (employeeId: string) => {
    if (window.confirm("Are you sure you want to delete this employee?")) {
      deleteEmployeeMutation.mutate(employeeId);
    }
  };

  const handleAddEmployee = (employee: InsertEmployee) => {
    addEmployeeMutation.mutate(employee);
  };

  const handleEditEmployee = (employee: EmployeeWithDepartment) => {
    setEditingEmployee(employee);
    setIsEditDialogOpen(true);
  };

  const handleUpdateEmployee = (employee: InsertEmployee) => {
    if (editingEmployee) {
      const { employeeCode, ...updates } = employee;
      updateEmployeeMutation.mutate({
        id: editingEmployee.id,
        employee: updates,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
        <p className="text-muted-foreground">Manage your team members and their information</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <h3 className="text-lg font-medium text-gray-900">Employee Directory</h3>
            
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search employees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 pl-10"
                />
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              </div>
              
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments?.filter(dept => dept.id && dept.id.trim() !== "").map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-white hover:bg-blue-700">
                    <Plus className="mr-2" size={16} />
                    Add Employee
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Employee</DialogTitle>
                  </DialogHeader>
                  <EmployeeForm
                    departments={departments || []}
                    onSubmit={handleAddEmployee}
                    isSubmitting={addEmployeeMutation.isPending}
                  />
                </DialogContent>
                </Dialog>
            </div>
          </div>
        </div>
        
        <EmployeeTable
          employees={filteredEmployees}
          isLoading={employeesLoading}
          onDeleteEmployee={handleDeleteEmployee}
          onEditEmployee={handleEditEmployee}
          isDeleting={deleteEmployeeMutation.isPending}
        />

        {/* Edit Employee Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Employee</DialogTitle>
            </DialogHeader>
            {editingEmployee && (
              <EmployeeForm
                key={editingEmployee.id}
                departments={departments || []}
                onSubmit={handleUpdateEmployee}
                isSubmitting={updateEmployeeMutation.isPending}
                initialData={editingEmployee}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
