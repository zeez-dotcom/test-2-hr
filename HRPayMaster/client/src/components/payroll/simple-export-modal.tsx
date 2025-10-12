import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileText,
  Building,
  Users,
  DollarSign,
  Printer,
  FileSpreadsheet,
  CreditCard,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadPayrollBankFile, downloadPayrollCsv } from "@/lib/payroll-export";
import { openPdf } from "@/lib/pdf";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import type { PayrollRunWithEntries, PayrollEntry, Employee, Department } from "@shared/schema";

interface SimpleExportModalProps {
  payrollRun: PayrollRunWithEntries;
  isOpen: boolean;
  onClose: () => void;
}

export function SimpleExportModal({ payrollRun, isOpen, onClose }: SimpleExportModalProps) {
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [exportFormat, setExportFormat] = useState<string>("pdf");
  const [groupBy, setGroupBy] = useState<"location" | "department">("location");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const { toast } = useToast();

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: isOpen,
  });
  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
    enabled: isOpen,
  });

  const entries: (PayrollEntry & { employee?: Employee })[] =
    (payrollRun.entries ?? []).map(entry => ({
      ...entry,
      employee: employees?.find(e => e.id === entry.employeeId),
    }));

  if (!isOpen) return null;
  // Get unique work locations
  const workLocations = Array.from(
    new Set(
      entries
        .map(entry => entry.employee?.workLocation || "Office")
        .filter(Boolean)
    )
  );

  // Get unique department IDs present in this payroll, with names
  const departmentIds = Array.from(
    new Set(
      entries
        .map(entry => entry.employee?.departmentId)
        .filter((id): id is string => Boolean(id && id.trim() !== ""))
    )
  );
  const departmentOptions = departmentIds.map(id => ({
    id,
    name: departments?.find(d => d.id === id)?.name || id,
  }));

  // Filter entries by work location
  const filteredEntries = (() => {
    if (groupBy === "location") {
      return selectedLocation === "all"
        ? entries
        : entries.filter(entry => (entry.employee?.workLocation || "Office") === selectedLocation);
    }
    // group by department
    return selectedDepartment === "all"
      ? entries
      : entries.filter(entry => (entry.employee?.departmentId || "") === selectedDepartment);
  })();

  const getScopeLabels = () => {
    const locationLabel = selectedLocation === "all" ? "All Locations" : selectedLocation;
    const departmentLabel =
      selectedDepartment === "all"
        ? "All Departments"
        : departmentOptions.find(o => o.id === selectedDepartment)?.name || selectedDepartment;
    const scopeLabel = groupBy === "location" ? locationLabel : departmentLabel;
    return { locationLabel, departmentLabel, scopeLabel };
  };

  const generatePDFPayslips = () => {
    const { scopeLabel } = getScopeLabels();
    const docDefinition: TDocumentDefinitions = {
      info: { title: `Payroll - ${scopeLabel}`, creationDate: new Date(0) },
      styles: {
        header: { fontSize: 18, bold: true, alignment: "center" },
        subheader: { fontSize: 14, alignment: "center", margin: [0, 5, 0, 10] },
      },
      content: [
        { text: "HR Pro - Payroll Summary", style: "header" },
        { text: scopeLabel, style: "subheader" },
        {
          text: `Period: ${formatDate(payrollRun.startDate)} to ${formatDate(payrollRun.endDate)}`,
          margin: [0, 0, 0, 10],
        },
        {
          ol: filteredEntries.map(entry => {
            const grossPay = parseFloat(entry.grossPay?.toString() || "0");
            const totalDeductions =
              parseFloat(entry.taxDeduction?.toString() || "0") +
              parseFloat(entry.socialSecurityDeduction?.toString() || "0") +
              parseFloat(entry.healthInsuranceDeduction?.toString() || "0") +
              parseFloat(entry.loanDeduction?.toString() || "0") +
              parseFloat(entry.otherDeductions?.toString() || "0");
            const netPay = grossPay - totalDeductions;
            return `${entry.employee?.firstName || "Employee"} ${entry.employee?.lastName || ""} - Net Pay: ${formatCurrency(netPay)}`;
          }),
        },
      ],
    };

    openPdf(docDefinition);
    toast({
      title: "Success",
      description: `Payroll for ${scopeLabel} opened for printing`,
    });
  };
  const handleExport = () => {
    const { scopeLabel } = getScopeLabels();
    switch (exportFormat) {
      case "pdf":
        generatePDFPayslips();
        break;
      case "excel":
        downloadPayrollCsv({
          entries: filteredEntries,
          payrollRun,
          scopeLabel,
        });
        toast({
          title: "Success",
          description: `Excel file generated for ${scopeLabel}`,
        });
        break;
      case "bank":
        {
          const { entryCount } = downloadPayrollBankFile({
            entries: filteredEntries,
            payrollRun,
            scopeLabel,
          });
          toast({
            title: "Success",
            description: `Bank transfer file generated for ${scopeLabel} (${entryCount} employees with bank details)`,
          });
        }
        break;
      default:
        generatePDFPayslips();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Payroll by Work Location
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Export Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Group By</label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select grouping" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="location">Work Location</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {groupBy === "location" ? (
              <div>
                <label className="block text-sm font-medium mb-2">Work Location</label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select work location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {workLocations.map((location: string) => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-2">Department</label>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departmentOptions.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Export Format</label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger>
                  <SelectValue placeholder="Select export format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      PDF Payslips
                    </div>
                  </SelectItem>
                  <SelectItem value="excel">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      Excel Export
                    </div>
                  </SelectItem>
                  <SelectItem value="bank">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Bank Transfer File
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Users className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">{filteredEntries.length}</p>
                    <p className="text-xs text-muted-foreground">Employees</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(
                          filteredEntries.reduce((sum, entry) =>
                            sum + parseFloat(entry.grossPay?.toString() || "0"),
                            0
                          )
                        )}
                    </p>
                    <p className="text-xs text-muted-foreground">Gross Pay</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Building className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(
                          filteredEntries.reduce((sum, entry) => {
                          const grossPay = parseFloat(entry.grossPay?.toString() || "0");
                          const totalDeductions = (
                            parseFloat(entry.taxDeduction?.toString() || "0") +
                            parseFloat(entry.socialSecurityDeduction?.toString() || "0") +
                            parseFloat(entry.healthInsuranceDeduction?.toString() || "0") +
                            parseFloat(entry.loanDeduction?.toString() || "0") +
                            parseFloat(entry.otherDeductions?.toString() || "0")
                          );
                          return sum + (grossPay - totalDeductions);
                        }, 0)
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Net Pay</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Scope Preview */}
          <div>
            <h3 className="text-lg font-semibold mb-3">
              {groupBy === "location" ? "Available Work Locations" : "Available Departments"}
            </h3>
            <div className="flex flex-wrap gap-2">
              {groupBy === "location"
                ? workLocations.map((location: string) => {
                    const locationCount = entries.filter(
                      entry => (entry.employee?.workLocation || "Office") === location
                    ).length;
                    return (
                      <Badge
                        key={location}
                        variant={selectedLocation === location ? "default" : "outline"}
                        className="flex items-center gap-1"
                      >
                        <span>{location}</span>
                        <span className="text-xs">({locationCount})</span>
                      </Badge>
                    );
                  })
                : departmentOptions.map((dept) => {
                    const deptCount = entries.filter(
                      entry => (entry.employee?.departmentId || "") === dept.id
                    ).length;
                    return (
                      <Badge
                        key={dept.id}
                        variant={selectedDepartment === dept.id ? "default" : "outline"}
                        className="flex items-center gap-1"
                      >
                        <span>{dept.name}</span>
                        <span className="text-xs">({deptCount})</span>
                      </Badge>
                    );
                  })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleExport} className="flex items-center gap-2">
              {exportFormat === "pdf" && <Printer className="h-4 w-4" />}
              {exportFormat === "excel" && <FileSpreadsheet className="h-4 w-4" />}
              {exportFormat === "bank" && <CreditCard className="h-4 w-4" />}
              {groupBy === "location"
                ? `Export ${selectedLocation === "all" ? "All Locations" : selectedLocation}`
                : `Export ${
                    selectedDepartment === "all"
                      ? "All Departments"
                      : departmentOptions.find(d => d.id === selectedDepartment)?.name || selectedDepartment
                  }`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
