import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileText,
  TableIcon,
  Building,
  Users,
  DollarSign,
  Calendar,
  Printer,
  FileSpreadsheet,
  CreditCard,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  downloadPayrollBankFile,
  downloadPayrollCsv,
  type PayrollEntryWithEmployee,
} from "@/lib/payroll-export";
import { openPdf } from "@/lib/pdf";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import type { PayrollRunWithEntries, Employee } from "@shared/schema";

interface ExportPayrollProps {
  payrollRun: PayrollRunWithEntries;
  isOpen: boolean;
  onClose: () => void;
}

export function ExportPayroll({ payrollRun, isOpen, onClose }: ExportPayrollProps) {
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [exportFormat, setExportFormat] = useState<string>("pdf");
  const { toast } = useToast();

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  if (!isOpen) return null;
  const entries = ((payrollRun.entries ?? []).map(entry => {
    const fallback = employees?.find(e => e.id === entry.employeeId);
    if (fallback) {
      return { ...entry, employee: fallback };
    }
    return entry;
  }) as PayrollEntryWithEmployee[]);
  // Get unique work locations
  const workLocations = Array.from(
    new Set(
      entries
        .map(entry => entry.employee?.workLocation || "Office")
        .filter(Boolean)
    )
  );

  // Filter entries by work location
  const filteredEntries =
    selectedLocation === "all"
      ? entries
      : entries.filter(
          entry =>
            (entry.employee?.workLocation || "Office") === selectedLocation
        );

  const getLocationLabel = () =>
    selectedLocation === "all" ? "All Locations" : selectedLocation;

  const generatePDFPayslips = () => {
    const locationLabel = getLocationLabel();
    const docDefinition: TDocumentDefinitions = {
      info: { title: `Payroll - ${locationLabel}`, creationDate: new Date(0) },
      styles: {
        header: { fontSize: 18, bold: true, alignment: "center" },
        subheader: { fontSize: 14, alignment: "center", margin: [0, 5, 0, 10] },
      },
      content: [
        { text: "HR Pro - Payroll Summary", style: "header" },
        { text: locationLabel, style: "subheader" },
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
      description: `Payroll for ${locationLabel} opened for printing`,
    });
  };

  const handleExport = () => {
    const locationLabel = getLocationLabel();
    switch (exportFormat) {
      case "pdf":
        generatePDFPayslips();
        break;
      case "excel":
        downloadPayrollCsv({
          entries: filteredEntries,
          payrollRun,
          scopeLabel: locationLabel,
        });
        toast({
          title: "Success",
          description: `Excel file generated for ${locationLabel}`,
        });
        break;
      case "bank":
        {
          const { entryCount } = downloadPayrollBankFile({
            entries: filteredEntries,
            payrollRun,
            scopeLabel: locationLabel,
          });
          toast({
            title: "Success",
            description: `Bank transfer file generated for ${locationLabel} (${entryCount} employees with bank details)`,
          });
        }
        break;
      default:
        generatePDFPayslips();
    }
  };

  const getTotalsByLocation = () => {
    return {
      totalEmployees: filteredEntries.length,
      totalGrossPay: filteredEntries.reduce((sum, entry) => 
        sum + parseFloat(entry.grossPay?.toString() || "0"), 0
      ),
      totalNetPay: filteredEntries.reduce((sum, entry) => {
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
    };
  };

  const totals = getTotalsByLocation();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Payroll by Work Location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Export Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Work Location</label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Select work location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {workLocations.map(location => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
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
                    <p className="text-2xl font-bold">{totals.totalEmployees}</p>
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
                    <p className="text-2xl font-bold">{formatCurrency(totals.totalGrossPay)}</p>
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
                    <p className="text-2xl font-bold">{formatCurrency(totals.totalNetPay)}</p>
                    <p className="text-xs text-muted-foreground">Net Pay</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Work Locations Preview */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Available Work Locations</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {workLocations.map(location => {
                const locationCount = entries.filter(
                  entry => (entry.employee?.workLocation || "Office") === location
                ).length;
                
                return (
                  <Badge 
                    key={location} 
                    variant={selectedLocation === location ? "default" : "outline"}
                    className="justify-between p-2"
                  >
                    <span>{location}</span>
                    <span className="ml-2 text-xs">{locationCount}</span>
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
              Export {selectedLocation === "all" ? "All Locations" : selectedLocation}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
