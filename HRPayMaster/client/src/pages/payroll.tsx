import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

import PayrollForm from "@/components/payroll/payroll-form";
import PayrollDetailsView from "@/components/payroll/payroll-details-view";
import PayrollEditView from "@/components/payroll/payroll-edit-view-simple";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calculator, DollarSign, FileText, Trash2, Eye, Edit } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PayrollRun, User } from "@shared/schema";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface PayrollGenerateRequest {
  period: string;
  startDate: string;
  endDate: string;
}

export default function Payroll() {
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [selectedPayrollId, setSelectedPayrollId] = useState<string | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [payrollToDelete, setPayrollToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const user = queryClient.getQueryData<User>(["/api/me"]);
  const canGenerate = user?.role === "admin" || user?.role === "hr";

  const {
    data: payrollRuns,
    isLoading,
    error,
    refetch,
  } = useQuery<PayrollRun[]>({
    queryKey: ["/api/payroll"],
    enabled: canGenerate,
  });

  const generatePayrollMutation = useMutation({
    mutationFn: async (data: PayrollGenerateRequest) => {
      await apiRequest("POST", "/api/payroll/generate", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsGenerateDialogOpen(false);
      toast({
        title: "Success",
        description: "Payroll generated successfully",
      });
    },
    onError: async (err: any) => {
      const status = err?.response?.status;

      if (status === 401 || status === 403) {
        toast({
          title: "Error",
          description: "Please log in with an admin or HR account.",
          variant: "destructive",
        });
        return;
      }

      let description = "Failed to generate payroll";
      try {
        const data = await err.response?.json();
        if (data?.error?.message || data?.message) {
          description = data.error?.message ?? data.message;
        }
      } catch (_) {
        if (err instanceof Error) {
          try {
            const parsed = JSON.parse(err.message.replace(/^\d+:\s*/, ""));
            description = parsed.error?.message ?? parsed.message ?? description;
          } catch {
            // ignore JSON parse errors
          }
        }
      }

      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    },
  });

  const deletePayrollMutation = useMutation({
    mutationFn: async (payrollId: string) => {
      await apiRequest("DELETE", `/api/payroll/${payrollId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Success",
        description: "Payroll run deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete payroll run",
        variant: "destructive",
      });
    },
  });

  if (!canGenerate) {
    return (
      <div>
        <p>You do not have permission to access payroll.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <p>Error loading payroll data</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const handleGeneratePayroll = (data: PayrollGenerateRequest) => {
    generatePayrollMutation.mutate(data);
  };

  const handleDeletePayroll = (payrollId: string) => {
    setPayrollToDelete(payrollId);
    setIsConfirmOpen(true);
  };

  const confirmDeletePayroll = () => {
    if (payrollToDelete) {
      deletePayrollMutation.mutate(payrollToDelete);
    }
    setIsConfirmOpen(false);
    setPayrollToDelete(null);
  };

  const handleConfirmOpenChange = (open: boolean) => {
    setIsConfirmOpen(open);
    if (!open) {
      setPayrollToDelete(null);
    }
  };

  const handleViewPayroll = (payrollId: string) => {
    setSelectedPayrollId(payrollId);
    setIsViewDialogOpen(true);
  };

  const handleEditPayroll = (payrollId: string) => {
    setSelectedPayrollId(payrollId);
    setIsEditDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success text-white';
      case 'pending':
        return 'bg-warning text-white';
      case 'cancelled':
        return 'bg-destructive text-white';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Manage employee payroll and compensation</p>
        </div>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalPayroll = payrollRuns?.reduce((sum, run) => sum + parseFloat(run.grossAmount), 0) || 0;
  const completedRuns = payrollRuns?.filter(run => run.status === 'completed').length || 0;
  const pendingRuns = payrollRuns?.filter(run => run.status === 'pending').length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
        <p className="text-muted-foreground">Manage employee payroll and compensation</p>
      </div>
            {/* Payroll Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="text-success" size={20} />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Total Payroll</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {formatCurrency(totalPayroll)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <FileText className="text-primary" size={20} />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Completed Runs</p>
                      <p className="text-2xl font-semibold text-gray-900">{completedRuns}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        <Calculator className="text-warning" size={20} />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Pending Runs</p>
                      <p className="text-2xl font-semibold text-gray-900">{pendingRuns}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Payroll History */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-medium text-gray-900">Payroll History</CardTitle>
                  
                  <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        className="bg-success text-white hover:bg-green-700"
                        disabled={!canGenerate}
                      >
                        <Calculator className="mr-2" size={16} />
                        Generate Payroll
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Generate New Payroll</DialogTitle>
                      </DialogHeader>
                      <PayrollForm
                        onSubmit={handleGeneratePayroll}
                        isSubmitting={generatePayrollMutation.isPending}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {!payrollRuns || payrollRuns.length === 0 ? (
                  <div className="text-center py-12">
                    <Calculator className="mx-auto h-12 w-12 text-gray-300" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No payroll runs</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by generating your first payroll.</p>
                    <div className="mt-6">
                      <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            className="bg-success text-white hover:bg-green-700"
                            disabled={!canGenerate}
                          >
                            <Calculator className="mr-2" size={16} />
                            Generate Payroll
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Generate New Payroll</DialogTitle>
                          </DialogHeader>
                          <PayrollForm
                            onSubmit={handleGeneratePayroll}
                            isSubmitting={generatePayrollMutation.isPending}
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Period
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date Range
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Gross Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Net Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {payrollRuns.map((payroll) => (
                          <tr key={payroll.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {payroll.period}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(payroll.startDate)} - {formatDate(payroll.endDate)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatCurrency(payroll.grossAmount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatCurrency(payroll.netAmount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge className={getStatusColor(payroll.status)}>
                                {payroll.status}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewPayroll(payroll.id)}
                                >
                                  <Eye className="mr-1" size={14} />
                                  View
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditPayroll(payroll.id)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <Edit className="mr-1" size={14} />
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeletePayroll(payroll.id)}
                                  disabled={deletePayrollMutation.isPending}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 size={16} />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* View Payroll Dialog */}
            <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Payroll Details</DialogTitle>
                </DialogHeader>
                {selectedPayrollId && (
                  <PayrollDetailsView payrollId={selectedPayrollId} />
                )}
              </DialogContent>
            </Dialog>

            {/* Edit Payroll Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Payroll (Excel-like)</DialogTitle>
                </DialogHeader>
                {selectedPayrollId && (
                  <PayrollEditView payrollId={selectedPayrollId} />
                )}
              </DialogContent>
            </Dialog>
            <ConfirmDialog
              open={isConfirmOpen}
              onOpenChange={handleConfirmOpenChange}
              title="Delete Payroll Run"
              description="Are you sure you want to delete this payroll run?"
              confirmText="Delete"
              onConfirm={confirmDeletePayroll}
            />
    </div>
  );
}
