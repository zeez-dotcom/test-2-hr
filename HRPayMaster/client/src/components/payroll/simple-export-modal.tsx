import { useState } from "react";
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

interface SimpleExportModalProps {
  payrollRun: any;
  isOpen: boolean;
  onClose: () => void;
}

export function SimpleExportModal({ payrollRun, isOpen, onClose }: SimpleExportModalProps) {
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [exportFormat, setExportFormat] = useState<string>("pdf");
  const { toast } = useToast();

  if (!payrollRun || !payrollRun.entries) return null;

  // Get unique work locations
  const workLocations = [...new Set(
    payrollRun.entries
      .map((entry: any) => entry.employee?.workLocation || "Office")
      .filter(Boolean)
  )];

  // Filter entries by work location
  const filteredEntries = selectedLocation === "all" 
    ? payrollRun.entries 
    : payrollRun.entries.filter((entry: any) => 
        (entry.employee?.workLocation || "Office") === selectedLocation
      );

  const generatePDFPayslips = () => {
    const locationLabel = selectedLocation === "all" ? "All Locations" : selectedLocation;
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "Error",
        description: "Could not open print window. Please check popup settings.",
        variant: "destructive",
      });
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payroll - ${locationLabel}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .employee-card { 
              page-break-inside: avoid; 
              margin-bottom: 25px; 
              border: 1px solid #ddd; 
              padding: 20px; 
              border-radius: 8px;
            }
            .employee-header { 
              display: flex; 
              justify-content: space-between; 
              margin-bottom: 15px;
              border-bottom: 1px solid #eee;
              padding-bottom: 10px;
            }
            .employee-name { font-size: 18px; font-weight: bold; }
            .pay-details { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .pay-section h4 { margin: 0 0 8px 0; color: #333; }
            .pay-item { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .pay-item.total { font-weight: bold; border-top: 1px solid #ddd; padding-top: 5px; margin-top: 8px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>HR Pro - Payroll Summary</h1>
            <h2>${locationLabel}</h2>
            <p>Period: ${formatDate(payrollRun.periodStart)} to ${formatDate(payrollRun.periodEnd)}</p>
          </div>

          ${filteredEntries.map((entry: any) => {
            const grossPay = parseFloat(entry.grossPay?.toString() || "0");
            const totalDeductions = (
              parseFloat(entry.taxDeduction?.toString() || "0") +
              parseFloat(entry.socialSecurityDeduction?.toString() || "0") +
              parseFloat(entry.healthInsuranceDeduction?.toString() || "0") +
              parseFloat(entry.loanDeduction?.toString() || "0") +
              parseFloat(entry.otherDeductions?.toString() || "0")
            );
            const netPay = grossPay - totalDeductions;

            return `
              <div class="employee-card">
                <div class="employee-header">
                  <div>
                    <div class="employee-name">
                      ${entry.employee?.firstName || 'Employee'} ${entry.employee?.lastName || entry.employeeId}
                    </div>
                    <div>ID: ${entry.employeeId} | Location: ${entry.employee?.workLocation || 'Office'}</div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-size: 16px; font-weight: bold; color: #059669;">
                      Net Pay: ${formatCurrency(netPay)}
                    </div>
                  </div>
                </div>
                
                <div class="pay-details">
                  <div class="pay-section">
                    <h4>Earnings</h4>
                    <div class="pay-item">
                      <span>Base Salary:</span>
                      <span>${formatCurrency(entry.baseSalary)}</span>
                    </div>
                    <div class="pay-item">
                      <span>Bonus:</span>
                      <span>${formatCurrency(entry.bonusAmount || 0)}</span>
                    </div>
                    <div class="pay-item total">
                      <span>Gross Pay:</span>
                      <span>${formatCurrency(grossPay)}</span>
                    </div>
                  </div>
                  
                  <div class="pay-section">
                    <h4>Deductions</h4>
                    <div class="pay-item">
                      <span>Tax:</span>
                      <span>${formatCurrency(entry.taxDeduction || 0)}</span>
                    </div>
                    <div class="pay-item">
                      <span>Social Security:</span>
                      <span>${formatCurrency(entry.socialSecurityDeduction || 0)}</span>
                    </div>
                    <div class="pay-item">
                      <span>Health Insurance:</span>
                      <span>${formatCurrency(entry.healthInsuranceDeduction || 0)}</span>
                    </div>
                    <div class="pay-item">
                      <span>Loan:</span>
                      <span>${formatCurrency(entry.loanDeduction || 0)}</span>
                    </div>
                    <div class="pay-item">
                      <span>Other:</span>
                      <span>${formatCurrency(entry.otherDeductions || 0)}</span>
                    </div>
                    <div class="pay-item total">
                      <span>Total Deductions:</span>
                      <span>${formatCurrency(totalDeductions)}</span>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
          
          <div class="no-print" style="margin-top: 30px; text-align: center;">
            <button onclick="window.print()" style="padding: 10px 20px; background-color: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer;">
              Print Payroll
            </button>
            <button onclick="window.close()" style="padding: 10px 20px; background-color: #6b7280; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">
              Close
            </button>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
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
                        filteredEntries.reduce((sum: number, entry: any) => 
                          sum + parseFloat(entry.grossPay?.toString() || "0"), 0
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
                        filteredEntries.reduce((sum: number, entry: any) => {
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
                const locationCount = payrollRun.entries.filter((entry: any) => 
                  (entry.employee?.workLocation || "Office") === location
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