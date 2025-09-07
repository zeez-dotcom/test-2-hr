import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Calculator,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Calendar,
  DollarSign,
  User,
  FileText,
  Undo,
  Redo,
  Save,
  Copy,
  ClipboardPaste,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { PayrollEntry } from "@shared/schema";
import { SmartVacationForm } from "@/components/payroll/smart-vacation-form";
import { SmartDeductionForm } from "@/components/payroll/smart-deduction-form";
import { apiPut } from "@/lib/http";

interface EnhancedPayrollTableProps {
  entries: any[];
  payrollId: string;
}

export function EnhancedPayrollTable({ entries, payrollId }: EnhancedPayrollTableProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ [key: string]: string }>({});
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [copiedValue, setCopiedValue] = useState<string>("");
  const [changeHistory, setChangeHistory] = useState<Array<{id: string, field: string, oldValue: any, newValue: any}>>([]);
  
  // Smart form states
  const [isVacationFormOpen, setIsVacationFormOpen] = useState(false);
  const [isDeductionFormOpen, setIsDeductionFormOpen] = useState(false);
  const [selectedPayrollEntry, setSelectedPayrollEntry] = useState<any>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updatePayrollEntryMutation = useMutation({
    mutationFn: async ({ entryId, updates }: { entryId: string; updates: Partial<PayrollEntry> }) => {
      const res = await apiPut(`/api/payroll/entries/${entryId}`, updates);
      if (!res.ok) throw new Error(res.error || "Failed to update payroll entry");
      return res.data;
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
      const entry = entries.find(e => e.id === entryId);
      const oldValue = entry?.[field];
      const numericValue = parseFloat(value) || 0;
      
      // Track change for undo functionality
      setChangeHistory(prev => [...prev, {
        id: entryId,
        field,
        oldValue,
        newValue: numericValue,
      }]);

      updatePayrollEntryMutation.mutate({
        entryId,
        updates: { [field]: numericValue.toString() },
      });
    }
    
    setEditingCell(null);
  };

  const handleCellClick = (entryId: string, field: string, value: any) => {
    if (field === "vacationDays") {
      // Open vacation form
      const entry = entries.find(e => e.id === entryId);
      if (entry) {
        setSelectedPayrollEntry(entry);
        setIsVacationFormOpen(true);
      }
    } else if (field === "otherDeductions" || field === "taxDeduction" || field === "socialSecurityDeduction" || field === "healthInsuranceDeduction") {
      // Open deduction form
      const entry = entries.find(e => e.id === entryId);
      if (entry) {
        setSelectedPayrollEntry(entry);
        setIsDeductionFormOpen(true);
      }
    } else {
      // Regular cell editing
      handleCellEdit(entryId, field, value?.toString() || "0");
    }
  };

  const handleCopy = () => {
    if (editingCell) {
      const value = editValues[editingCell];
      setCopiedValue(value || "");
      toast({
        title: "Copied",
        description: `Value "${value}" copied to clipboard`,
      });
    }
  };

  const handlePaste = () => {
    if (editingCell && copiedValue) {
      setEditValues({ ...editValues, [editingCell]: copiedValue });
      toast({
        title: "Pasted",
        description: `Value "${copiedValue}" pasted`,
      });
    }
  };

  const calculateRowTotal = (entry: any) => {
    const grossPay = parseFloat(entry.grossPay?.toString() || "0");
    const deductions = (
      parseFloat(entry.taxDeduction?.toString() || "0") +
      parseFloat(entry.socialSecurityDeduction?.toString() || "0") +
      parseFloat(entry.healthInsuranceDeduction?.toString() || "0") +
      parseFloat(entry.loanDeduction?.toString() || "0") +
      parseFloat(entry.otherDeductions?.toString() || "0")
    );
    return grossPay - deductions;
  };

  const getHealthIndicator = (entry: any) => {
    const netPay = calculateRowTotal(entry);
    const baseSalary = parseFloat(entry.baseSalary?.toString() || "0");
    const ratio = netPay / baseSalary;
    
    if (ratio > 0.85) return { color: "text-green-600", icon: CheckCircle, label: "Healthy" };
    if (ratio > 0.70) return { color: "text-yellow-600", icon: AlertCircle, label: "Moderate" };
    return { color: "text-red-600", icon: AlertCircle, label: "High Deductions" };
  };

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
    const editValue = editValues[cellKey] ?? (value?.toString() || "0");

    if (isEditing) {
      return (
        <div className="relative">
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
              } else if (e.ctrlKey && e.key === 'c') {
                handleCopy();
              } else if (e.ctrlKey && e.key === 'v') {
                handlePaste();
              }
            }}
            className="h-8 text-sm border-2 border-blue-500"
            autoFocus
          />
        </div>
      );
    }

    const displayValue = field === "workingDays" || field === "actualWorkingDays" || field === "vacationDays" ? 
      value : 
      (type === "number" ? formatCurrency(value) : value);

    return (
      <div
        className={`cursor-pointer hover:bg-blue-50 p-2 rounded transition-colors ${className} ${
          field === "vacationDays" ? "bg-orange-50 hover:bg-orange-100" : ""
        } ${
          field.includes("Deduction") || field === "otherDeductions" ? "bg-red-50 hover:bg-red-100" : ""
        }`}
        onClick={() => handleCellClick(entryId, field, value)}
        title={field === "vacationDays" ? "Click to add vacation days" : 
              field.includes("Deduction") ? "Click to add deduction" : 
              "Click to edit"}
      >
        <div className="flex items-center justify-between">
          <span>{displayValue}</span>
          {field === "vacationDays" && <Calendar className="h-3 w-3 text-orange-600" />}
          {(field.includes("Deduction") || field === "otherDeductions") && <DollarSign className="h-3 w-3 text-red-600" />}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Enhanced Toolbar */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <Button size="sm" variant="outline" onClick={handleCopy} disabled={!editingCell}>
            <Copy className="h-4 w-4 mr-1" />
            Copy
          </Button>
          <Button size="sm" variant="outline" onClick={handlePaste} disabled={!copiedValue}>
            <ClipboardPaste className="h-4 w-4 mr-1" />
            Paste
          </Button>
          <div className="h-4 w-px bg-gray-300" />
          <Button size="sm" variant="outline" disabled={changeHistory.length === 0}>
            <Undo className="h-4 w-4 mr-1" />
            Undo
          </Button>
          <Button size="sm" variant="outline">
            <Redo className="h-4 w-4 mr-1" />
            Redo
          </Button>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Calculator className="h-4 w-4" />
          <span>{entries.length} employees</span>
          <div className="h-4 w-px bg-gray-300" />
          <TrendingUp className="h-4 w-4" />
          <span>Smart editing enabled</span>
        </div>
      </div>

      {/* Enhanced Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="flex items-center space-x-1">
                  <User className="h-4 w-4" />
                  <span>Employee</span>
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Base Salary
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Working Days
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="flex items-center space-x-1">
                  <Calendar className="h-4 w-4 text-orange-600" />
                  <span>Vacation Days</span>
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="flex items-center space-x-1">
                  <DollarSign className="h-4 w-4 text-red-600" />
                  <span>Deductions</span>
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Net Pay
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {entries.map((entry) => {
              const healthIndicator = getHealthIndicator(entry);
              const HealthIcon = healthIndicator.icon;
              
              return (
                <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {entry.employee?.name || 
                           (entry.employee?.firstName && entry.employee?.lastName ? 
                            `${entry.employee.firstName} ${entry.employee.lastName}` : 
                            `Employee ${entry.employeeId}`)}
                        </div>
                        <div className="text-xs text-gray-500">
                          ID: {entry.employeeId}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <EditableCell 
                      entryId={entry.id} 
                      field="baseSalary" 
                      value={entry.baseSalary} 
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <EditableCell 
                      entryId={entry.id} 
                      field="actualWorkingDays" 
                      value={entry.actualWorkingDays} 
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <EditableCell 
                      entryId={entry.id} 
                      field="vacationDays" 
                      value={entry.vacationDays || 0} 
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <EditableCell 
                      entryId={entry.id} 
                      field="otherDeductions" 
                      value={entry.otherDeductions || 0} 
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <div className="flex items-center space-x-2">
                      <span>{formatCurrency(calculateRowTotal(entry))}</span>
                      <span title={healthIndicator.label}>
                        <HealthIcon className={`h-4 w-4 ${healthIndicator.color}`} />
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="outline" className={healthIndicator.color}>
                      {healthIndicator.label}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Smart Forms */}
      {selectedPayrollEntry && (
        <SmartVacationForm
          isOpen={isVacationFormOpen}
          onClose={() => {
            setIsVacationFormOpen(false);
            setSelectedPayrollEntry(null);
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] });
          }}
          payrollEntryId={selectedPayrollEntry.id}
          employeeId={selectedPayrollEntry.employeeId}
          currentVacationDays={selectedPayrollEntry.vacationDays || 0}
        />
      )}

      {selectedPayrollEntry && (
        <SmartDeductionForm
          isOpen={isDeductionFormOpen}
          onClose={() => {
            setIsDeductionFormOpen(false);
            setSelectedPayrollEntry(null);
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/payroll", payrollId] });
          }}
          payrollEntryId={selectedPayrollEntry.id}
          employeeId={selectedPayrollEntry.employeeId}
          currentDeductions={parseFloat(selectedPayrollEntry.otherDeductions?.toString() || "0")}
        />
      )}
    </div>
  );
}