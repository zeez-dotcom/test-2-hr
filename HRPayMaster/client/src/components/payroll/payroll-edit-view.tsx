import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  User,
  Plus,
  Minus,
  Edit3
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PayrollRunWithEntries, PayrollEntry } from "@shared/schema";
import { VacationDayForm } from "@/components/vacation/vacation-day-form";
import { DeductionForm } from "@/components/payroll/deduction-form";
import { BonusForm } from "@/components/payroll/bonus-form";

interface PayrollEditViewProps {
  payrollId: string;
}

export default function PayrollEditView({ payrollId }: PayrollEditViewProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ [key: string]: string }>({});
  const [isBonusFormOpen, setIsBonusFormOpen] = useState(false);
  const [isDeductionFormOpen, setIsDeductionFormOpen] = useState(false);
  const [isVacationFormOpen, setIsVacationFormOpen] = useState(false);
  const [selectedPayrollEntry, setSelectedPayrollEntry] = useState<PayrollEntry | null>(null);
  
  const { toast } = useToast();

  const { data: payrollRun, isLoading } = useQuery<PayrollRunWithEntries>({
    queryKey: ["/api/payroll", payrollId],
  });

  const { data: employees } = useQuery({
    queryKey: ["/api/employees"],
  });

  const updatePayrollEntryMutation = useMutation({
    mutationFn: async ({ entryId, updates }: { entryId: string; updates: Partial<PayrollEntry> }) => {
      await apiRequest("PUT", `/api/payroll/entries/${entryId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] });
      toast({
        title: "Success",
        description: "Payroll entry updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update payroll entry",
        variant: "destructive",
      });
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

  const handleAddBonus = (entry: PayrollEntry) => {
    setSelectedPayrollEntry(entry);
    setIsBonusFormOpen(true);
  };

  const handleAddDeduction = (entry: PayrollEntry) => {
    setSelectedPayrollEntry(entry);
    setIsDeductionFormOpen(true);
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
        className={`cursor-pointer hover:bg-gray-50 p-1 rounded ${className}`}
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
        <Badge className={getStatusColor(payrollRun.status)}>
          {payrollRun.status}
        </Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-success" size={16} />
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
                  <DollarSign className="text-primary" size={16} />
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

      {/* Editable Payroll Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Edit3 className="mr-2" size={20} />
            Editable Payroll (Excel-like)
          </CardTitle>
          <p className="text-sm text-gray-600">
            Click on any cell to edit. Press Enter to save, Escape to cancel.
          </p>
        </CardHeader>
        <CardContent>
          {!payrollRun.entries || payrollRun.entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No payroll entries found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Base Salary
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Working Days
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vacation Days
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bonuses
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Deductions
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Net Pay
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {payrollRun.entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          Employee {entry.employeeId}
                        </div>
                        <div className="text-xs text-gray-500">
                          ID: {entry.employeeId}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <EditableCell
                          entryId={entry.id}
                          field="baseSalary"
                          value={entry.baseSalary || entry.grossPay}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <EditableCell
                          entryId={entry.id}
                          field="workingDays"
                          value={entry.workingDays || 30}
                          type="number"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <EditableCell
                          entryId={entry.id}
                          field="vacationDays"
                          value={entry.vacationDays || 0}
                          type="number"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-green-600">
                        <div
                          className="cursor-pointer hover:bg-green-50 p-1 rounded text-green-600"
                          onDoubleClick={() => handleAddBonus(entry)}
                          title="Double-click to add bonus"
                        >
                          +{formatCurrency(parseFloat(entry.bonusAmount) || 0)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-red-600">
                        <div className="text-sm text-red-600">
                          -{formatCurrency(
                            (parseFloat(entry.taxDeduction) || 0) +
                            (parseFloat(entry.socialSecurityDeduction) || 0) +
                            (parseFloat(entry.healthInsuranceDeduction) || 0) +
                            (parseFloat(entry.loanDeduction) || 0) +
                            (parseFloat(entry.otherDeductions) || 0)
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(entry.netPay)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="flex justify-center space-x-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddBonus(entry)}
                            className="text-green-600 hover:text-green-700"
                            title="Add Bonus"
                          >
                            <Plus size={12} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddDeduction(entry)}
                            className="text-red-600 hover:text-red-700"
                            title="Add Deduction"
                          >
                            <Minus size={12} />
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

      {selectedPayrollEntry && (
        <BonusForm
          employeeId={selectedPayrollEntry.employeeId}
          payrollEntryId={selectedPayrollEntry.id}
          currentBonus={parseFloat(selectedPayrollEntry.bonusAmount) || 0}
          currentGrossPay={parseFloat(selectedPayrollEntry.grossPay) || 0}
          currentNetPay={parseFloat(selectedPayrollEntry.netPay) || 0}
          isOpen={isBonusFormOpen}
          onClose={() => setIsBonusFormOpen(false)}
          onSuccess={() =>
            queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] })
          }
        />
      )}

      {selectedPayrollEntry && (
        <DeductionForm
          employeeId={selectedPayrollEntry.employeeId}
          payrollEntryId={selectedPayrollEntry.id}
          currentDeductions={parseFloat(selectedPayrollEntry.otherDeductions) || 0}
          isOpen={isDeductionFormOpen}
          onClose={() => setIsDeductionFormOpen(false)}
          onSuccess={() =>
            queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] })
          }
        />
      )}
    </div>
  );
}