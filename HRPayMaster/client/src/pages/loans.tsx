import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { DollarSign, Calendar, CheckCircle, XCircle, Plus, Trash2, Edit, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

import { insertLoanSchema, type LoanWithEmployee } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

export default function Loans() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const {
    data: loans = [],
    isLoading,
    error: loansError,
  } = useQuery<LoanWithEmployee[]>({
    queryKey: ["/api/loans"]
  });

  const { data: employees = [], error: employeesError } = useQuery({
    queryKey: ["/api/employees"]
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/loans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Loan created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create loan", variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PUT", `/api/loans/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      toast({ title: "Loan updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update loan", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/loans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      toast({ title: "Loan deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete loan", variant: "destructive" });
    }
  });

  const form = useForm({
    resolver: zodResolver(insertLoanSchema.omit({ remainingAmount: true })),
    defaultValues: {
      employeeId: "",
      amount: "",
      monthlyDeduction: "",
      startDate: new Date().toISOString().split('T')[0],
      status: "pending",
      interestRate: "0",
      reason: ""
    }
  });

  if (loansError || employeesError) {
    return <div>Error loading loans</div>;
  }

  const onSubmit = (data: any) => {
    createMutation.mutate(data);
  };

  const handleApprove = (id: string) => {
    updateMutation.mutate({ 
      id, 
      data: { status: "approved" }
    });
  };

  const handleReject = (id: string) => {
    updateMutation.mutate({ 
      id, 
      data: { status: "rejected" }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case "completed":
        return <Badge className="bg-blue-100 text-blue-800"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary"><Calendar className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const calculateMonthsRemaining = (amount: string, monthlyDeduction: string, startDate: string) => {
    const total = parseFloat(amount);
    const monthly = parseFloat(monthlyDeduction);
    if (monthly <= 0) return 0;
    
    const monthsTotal = Math.ceil(total / monthly);
    const monthsElapsed = Math.floor((new Date().getTime() - new Date(startDate).getTime()) / (30 * 24 * 60 * 60 * 1000));
    return Math.max(0, monthsTotal - monthsElapsed);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employee Loans</h1>
          <p className="text-muted-foreground">Manage employee loan requests and track payroll deductions</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Loan
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Employee Loan</DialogTitle>
              <DialogDescription>
                Create a new loan for an employee with automatic payroll deductions.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Loan Amount</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="5000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="monthlyDeduction"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monthly Deduction</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="500" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                    name="interestRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Interest Rate (%)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purpose</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Loan purpose or reason..."
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create Loan"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {loans.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <DollarSign className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No loans</h3>
                <p className="text-gray-500">Create the first employee loan to get started.</p>
              </CardContent>
            </Card>
          ) : (
            loans.map((loan) => (
              <Card key={loan.id}>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <div>
                        <CardTitle className="text-lg">
                          {loan.employee?.firstName} {loan.employee?.lastName}
                        </CardTitle>
                        <CardDescription>
                          ${parseFloat(loan.amount).toLocaleString()} loan • ${parseFloat(loan.monthlyDeduction).toLocaleString()}/month
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(loan.status)}
                      {loan.status === "pending" && (
                        <div className="flex space-x-1">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleApprove(loan.id)}
                            disabled={updateMutation.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleReject(loan.id)}
                            disabled={updateMutation.isPending}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(loan.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Start Date</span>
                      <p className="font-medium">{format(new Date(loan.startDate), "MMM d, yyyy")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Interest Rate</span>
                      <p className="font-medium">{parseFloat(loan.interestRate || "0")}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Months Remaining</span>
                      <p className="font-medium">
                        {loan.status === "approved" 
                          ? calculateMonthsRemaining(loan.amount, loan.monthlyDeduction, loan.startDate)
                          : "N/A"
                        }
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total Payments</span>
                      <p className="font-medium">
                        {Math.ceil(parseFloat(loan.amount) / parseFloat(loan.monthlyDeduction))} months
                      </p>
                    </div>
                  </div>
                  {loan.reason && (
                    <div className="mt-4 pt-4 border-t">
                      <span className="text-muted-foreground text-sm">Purpose:</span>
                      <p className="text-sm mt-1">{loan.reason}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}