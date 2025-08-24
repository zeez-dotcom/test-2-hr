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
import { openPdf } from "@/lib/pdf";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import type { PayrollRunWithEntries, PayrollEntry, Employee } from "@shared/schema";

interface SimpleExportModalProps {
  payrollRun: PayrollRunWithEntries;
  isOpen: boolean;
  onClose: () => void;
}

export function SimpleExportModal({ payrollRun, isOpen, onClose }: SimpleExportModalProps) {
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [exportFormat, setExportFormat] = useState<string>("pdf");
  const { toast } = useToast();

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
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

  // Filter entries by work location
  const filteredEntries =
    selectedLocation === "all"
      ? entries
      : entries.filter(
          entry =>
            (entry.employee?.workLocation || "Office") === selectedLocation
        );

  const generatePDFPayslips = () => {
    const locationLabel = selectedLocation === "all" ? "All Locations" : selectedLocation;

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
    if (exportFormat === "pdf") {
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          {/* Work Locations Preview */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Available Work Locations</h3>
            <div className="flex flex-wrap gap-2">
                {workLocations.map((location: string) => {
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
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleExport} className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Export {selectedLocation === "all" ? "All Locations" : selectedLocation}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}