import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  User, 
  Calendar, 
  Plus, 
  Minus,
  Save,
  Edit3,
  Download,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PayrollRunWithEntries, PayrollEntry } from "@shared/schema";
import { SmartVacationForm } from "@/components/payroll/smart-vacation-form";
import { SmartDeductionForm } from "@/components/payroll/smart-deduction-form";
import { EnhancedPayrollTable } from "@/components/payroll/enhanced-payroll-table";
import { SimpleExportModal } from "@/components/payroll/simple-export-modal";
import { apiPut, apiPost } from "@/lib/http";
import { toastApiError } from "@/lib/toastError";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PayrollEditViewProps {
  payrollId: string;
}

export default function PayrollEditView({ payrollId }: PayrollEditViewProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ [key: string]: string }>({});
  
  // Smart form states
  const [isVacationFormOpen, setIsVacationFormOpen] = useState(false);
  const [isDeductionFormOpen, setIsDeductionFormOpen] = useState(false);
  const [selectedPayrollEntry, setSelectedPayrollEntry] = useState<PayrollEntry | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  
  const { toast } = useToast();

  const { data: payrollRun, isLoading } = useQuery<PayrollRunWithEntries>({
    queryKey: ["/api/payroll", payrollId],
  });

  const updatePayrollEntryMutation = useMutation({
    mutationFn: async ({ entryId, updates }: { entryId: string; updates: Partial<PayrollEntry> }) => {
      const res = await apiPut(`/api/payroll/entries/${entryId}`, updates);
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] });
      toast({
        title: "Success",
        description: "Payroll entry updated successfully",
      });
      setTotalsStale(true);
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to update payroll entry");
    },
  });

  const [totalsStale, setTotalsStale] = useState(false);
  const recalcTotalsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiPost(`/api/payroll/${payrollId}/recalculate`);
      if (!res.ok) throw res;
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] });
      toast({ title: "Success", description: "Payroll totals recalculated" });
      setTotalsStale(false);
    },
    onError: (err) => {
      toastApiError(err as any, "Failed to recalculate totals");
    },
  });

  const handleCellEdit = (entryId: string, field: string, value: string) => {
    const cellKey = `${entryId}-${field}`;
    setEditingCell(cellKey);
    setEditValues({ ...editValues, [cellKey]: value });
  };

  const handleCellSave = (entryId: string, field: string) => {
    const cellKey = `${entryId}-${field}`;
    const value = editValues[cellKey];
    
    if (value !== undefined) {
      const numericValue = parseFloat(value) || 0;
      updatePayrollEntryMutation.mutate({
        entryId,
        updates: { [field]: numericValue.toString() },
      });
    }
    
    setEditingCell(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return <div className="animate-pulse">Loading payroll details...</div>;
  }

  if (!payrollRun) {
    return <div className="text-center text-gray-500">Payroll run not found</div>;
  }

  const EditableCell = ({ 
    entryId, 
    field, 
    value,
    type = "number",
    className = ""
  }: { 
    entryId: string; 
    field: string; 
    value: number | string;
    type?: string;
    className?: string;
  }) => {
    const cellKey = `${entryId}-${field}`;
    const isEditing = editingCell === cellKey;
    const editValue = editValues[cellKey] ?? value.toString();

    if (isEditing) {
      return (
        <Input
          type={type}
          value={editValue}
          onChange={(e) => setEditValues({ ...editValues, [cellKey]: e.target.value })}
          onBlur={() => handleCellSave(entryId, field)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleCellSave(entryId, field);
            } else if (e.key === 'Escape') {
              setEditingCell(null);
            }
          }}
          className="h-8 text-sm"
          autoFocus
        />
      );
    }

    const handleCellClick = () => {
      if (field === "vacationDays") {
        // Open vacation form instead of direct editing
        const entry = payrollRun?.entries?.find(e => e.id === entryId);
        if (entry) {
          setSelectedPayrollEntry(entry);
          setIsVacationFormOpen(true);
        }
      } else if (field === "otherDeductions" || field === "taxDeduction" || field === "socialSecurityDeduction" || field === "healthInsuranceDeduction") {
        // Open deduction form instead of direct editing
        const entry = payrollRun?.entries?.find(e => e.id === entryId);
        if (entry) {
          setSelectedPayrollEntry(entry);
          setIsDeductionFormOpen(true);
        }
      } else {
        // Regular cell editing for other fields
        handleCellEdit(entryId, field, value.toString());
      }
    };

    return (
      <div
        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-1 rounded ${className}`}
        onClick={handleCellClick}
      >
        {field === "workingDays" || field === "actualWorkingDays" || field === "vacationDays" ? 
          value : 
          (type === "number" ? formatCurrency(value) : value)
        }
      </div>
    );
  };

  return (
    <div className="space-y-6 max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{payrollRun.period}</h2>
          <p className="text-gray-600">
            {formatDate(payrollRun.startDate)} - {formatDate(payrollRun.endDate)}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export by Location
          </Button>
          <Button 
            variant="outline"
            onClick={() => recalcTotalsMutation.mutate()}
            disabled={recalcTotalsMutation.isPending}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {recalcTotalsMutation.isPending ? "Recalculating..." : "Recalculate Totals"}
          </Button>
          <Badge className={getStatusColor(payrollRun.status)}>
            {payrollRun.status}
          </Badge>
        </div>
      </div>

      {totalsStale && (
        <Alert>
          <AlertDescription className="flex items-center justify-between w-full">
            <span>
              Totals may be out of date after recent edits.
            </span>
            <Button size="sm" onClick={() => recalcTotalsMutation.mutate()} disabled={recalcTotalsMutation.isPending}>
              {recalcTotalsMutation.isPending ? "Recalculating..." : "Recalculate Now"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-green-600" size={16} />
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Gross Amount</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(payrollRun.grossAmount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-blue-600" size={16} />
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Net Amount</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(payrollRun.netAmount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <User className="text-purple-600" size={16} />
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Employees</p>
                <p className="text-lg font-semibold text-gray-900">
                  {payrollRun.entries?.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Payroll Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            Smart Excel-like Editing
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payrollRun.entries && payrollRun.entries.length > 0 ? (
            <EnhancedPayrollTable 
              entries={payrollRun.entries} 
              payrollId={payrollId}
            />
          ) : (
            <div className="text-center py-4 text-gray-500">
              No payroll entries found
            </div>
          )}
        </CardContent>
      </Card>

      {/* Smart Forms */}
      {selectedPayrollEntry && (
        <SmartVacationForm
          isOpen={isVacationFormOpen}
          onClose={() => {
            setIsVacationFormOpen(false);
            setSelectedPayrollEntry(null);
          }}
          onSuccess={() => {}}
          payrollEntryId={selectedPayrollEntry.id}
          employeeId={selectedPayrollEntry.employeeId}
          currentVacationDays={selectedPayrollEntry.vacationDays || 0}
          payrollId={payrollId}
        />
      )}

      {selectedPayrollEntry && (
        <SmartDeductionForm
          isOpen={isDeductionFormOpen}
          onClose={() => {
            setIsDeductionFormOpen(false);
            setSelectedPayrollEntry(null);
          }}
          onSuccess={() => {}}
          payrollEntryId={selectedPayrollEntry.id}
          employeeId={selectedPayrollEntry.employeeId}
          currentDeductions={parseFloat(selectedPayrollEntry.otherDeductions?.toString() || "0")}
          payrollId={payrollId}
        />
      )}
      {/* Export Modal */}
      <SimpleExportModal
        payrollRun={payrollRun}
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
}
