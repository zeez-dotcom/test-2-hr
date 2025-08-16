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
import type { PayrollRunWithEntries, PayrollEntry, Employee } from "@shared/schema";

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
  const entries: (PayrollEntry & { employee?: Employee })[] =
    (payrollRun.entries ?? []).map(entry => ({
      ...entry,
      employee: employees?.find(e => e.id === entry.employeeId),
    }));

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
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "Error",
        description: "Could not open print window. Please check your popup blocker.",
        variant: "destructive",
      });
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payroll - ${locationLabel} - ${formatDate(payrollRun.startDate)} to ${formatDate(payrollRun.endDate)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .company-info { margin-bottom: 20px; }
            .payroll-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
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
              align-items: center; 
              margin-bottom: 15px;
              border-bottom: 1px solid #eee;
              padding-bottom: 10px;
            }
            .employee-name { font-size: 18px; font-weight: bold; }
            .employee-details { font-size: 12px; color: #666; }
            .pay-details { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .pay-section { }
            .pay-section h4 { margin: 0 0 8px 0; color: #333; font-size: 14px; }
            .pay-item { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px; }
            .pay-item.total { font-weight: bold; border-top: 1px solid #ddd; padding-top: 5px; margin-top: 8px; }
            .summary { 
              margin-top: 30px; 
              padding: 15px; 
              background-color: #f8f9fa; 
              border-radius: 5px;
            }
            @media print {
              .no-print { display: none; }
              .employee-card { page-break-after: auto; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>HR Pro - Payroll Summary</h1>
            <h2>${locationLabel}</h2>
            <p>Period: ${formatDate(payrollRun.startDate)} to ${formatDate(payrollRun.endDate)}</p>
          </div>
          
          <div class="payroll-info">
            <div>
              <strong>Payroll Run ID:</strong> ${payrollRun.id}<br>
              <strong>Status:</strong> ${payrollRun.status}<br>
              <strong>Generated:</strong> ${formatDate(payrollRun.createdAt ?? new Date())}
            </div>
            <div>
              <strong>Total Employees:</strong> ${filteredEntries.length}<br>
              <strong>Work Location:</strong> ${locationLabel}<br>
              <strong>Total Amount:</strong> ${formatCurrency(payrollRun.netAmount)}
            </div>
          </div>

          ${filteredEntries.map(entry => {
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
                      ${entry.employee?.firstName} ${entry.employee?.lastName}
                    </div>
                    <div class="employee-details">
                      ID: ${entry.employeeId} | Position: ${entry.employee?.position || 'N/A'} | Location: ${entry.employee?.workLocation || 'Office'}
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-size: 16px; font-weight: bold; color: #059669;">
                      Net Pay: ${formatCurrency(netPay)}
                    </div>
                  </div>
                </div>
                
                <div class="pay-details">
                  <div class="pay-section">
                    <h4>📊 Earnings</h4>
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
                    <h4>📉 Deductions</h4>
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
                      <span>Loan Deduction:</span>
                      <span>${formatCurrency(entry.loanDeduction || 0)}</span>
                    </div>
                    <div class="pay-item">
                      <span>Other Deductions:</span>
                      <span>${formatCurrency(entry.otherDeductions || 0)}</span>
                    </div>
                    <div class="pay-item total">
                      <span>Total Deductions:</span>
                      <span>${formatCurrency(totalDeductions)}</span>
                    </div>
                  </div>
                </div>
                
                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
                  Working Days: ${entry.actualWorkingDays}/${entry.workingDays} | Vacation Days: ${entry.vacationDays || 0}
                  ${entry.adjustmentReason ? `| Note: ${entry.adjustmentReason}` : ''}
                </div>
              </div>
            `;
          }).join('')}
          
          <div class="summary">
            <h3>Summary for ${locationLabel}</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
              <div>
                <strong>Total Employees:</strong> ${filteredEntries.length}<br>
                <strong>Total Gross Pay:</strong> ${formatCurrency(
                  filteredEntries.reduce((sum, entry) => 
                    sum + parseFloat(entry.grossPay?.toString() || "0"), 0
                  )
                )}
              </div>
              <div>
                <strong>Total Deductions:</strong> ${formatCurrency(
                  filteredEntries.reduce((sum, entry) => {
                    return sum + (
                      parseFloat(entry.taxDeduction?.toString() || "0") +
                      parseFloat(entry.socialSecurityDeduction?.toString() || "0") +
                      parseFloat(entry.healthInsuranceDeduction?.toString() || "0") +
                      parseFloat(entry.loanDeduction?.toString() || "0") +
                      parseFloat(entry.otherDeductions?.toString() || "0")
                    );
                  }, 0)
                )}
              </div>
              <div>
                <strong>Total Net Pay:</strong> ${formatCurrency(
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
              </div>
            </div>
          </div>
          
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
      description: `Payroll for ${locationLabel} opened in new window for printing`,
    });
  };

  const generateExcelExport = () => {
    const locationLabel = selectedLocation === "all" ? "All Locations" : selectedLocation;
    
    // Create CSV content
    const headers = [
      "Employee ID", "Employee Name", "Position", "Work Location", 
      "Base Salary", "Bonus", "Gross Pay", "Working Days", "Actual Working Days", "Vacation Days",
      "Tax Deduction", "Social Security", "Health Insurance", "Loan Deduction", "Other Deductions", 
      "Total Deductions", "Net Pay", "Adjustment Reason"
    ];

    const csvData = filteredEntries.map(entry => {
      const grossPay = parseFloat(entry.grossPay?.toString() || "0");
      const totalDeductions = (
        parseFloat(entry.taxDeduction?.toString() || "0") +
        parseFloat(entry.socialSecurityDeduction?.toString() || "0") +
        parseFloat(entry.healthInsuranceDeduction?.toString() || "0") +
        parseFloat(entry.loanDeduction?.toString() || "0") +
        parseFloat(entry.otherDeductions?.toString() || "0")
      );
      const netPay = grossPay - totalDeductions;
      
      return [
        entry.employeeId,
        `${entry.employee?.firstName} ${entry.employee?.lastName}`,
        entry.employee?.position || 'N/A',
        entry.employee?.workLocation || 'Office',
        entry.baseSalary,
        entry.bonusAmount || 0,
        grossPay,
        entry.workingDays,
        entry.actualWorkingDays,
        entry.vacationDays || 0,
        entry.taxDeduction || 0,
        entry.socialSecurityDeduction || 0,
        entry.healthInsuranceDeduction || 0,
        entry.loanDeduction || 0,
        entry.otherDeductions || 0,
        totalDeductions,
        netPay,
        entry.adjustmentReason || ''
      ];
    });

    const csvContent = [
      [`HR Pro Payroll Export - ${locationLabel}`],
      [`Period: ${formatDate(payrollRun.startDate)} to ${formatDate(payrollRun.endDate)}`],
      [`Generated: ${formatDate(new Date())}`],
      [],
      headers,
      ...csvData
    ].map(row => row.join(",")).join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `payroll_${locationLabel.replace(/\s+/g, '_')}_${formatDate(payrollRun.startDate).replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Success",
      description: `Excel file generated for ${locationLabel}`,
    });
  };

  const generateBankTransferFile = () => {
    const locationLabel = selectedLocation === "all" ? "All Locations" : selectedLocation;
    
    // Create bank transfer file (MT940 format simulation)
    const bankData = filteredEntries
      .filter(entry => entry.employee?.bankIban) // Only employees with bank details
      .map(entry => {
        const grossPay = parseFloat(entry.grossPay?.toString() || "0");
        const totalDeductions = (
          parseFloat(entry.taxDeduction?.toString() || "0") +
          parseFloat(entry.socialSecurityDeduction?.toString() || "0") +
          parseFloat(entry.healthInsuranceDeduction?.toString() || "0") +
          parseFloat(entry.loanDeduction?.toString() || "0") +
          parseFloat(entry.otherDeductions?.toString() || "0")
        );
        const netPay = grossPay - totalDeductions;
        
        return {
          employeeId: entry.employeeId,
          employeeName: `${entry.employee?.firstName} ${entry.employee?.lastName}`,
          iban: entry.employee?.bankIban,
          bankName: entry.employee?.bankName || 'Unknown Bank',
          amount: netPay.toFixed(3),
          reference: `Salary_${entry.employeeId}_${formatDate(payrollRun.startDate).replace(/\s+/g, '')}`
        };
      });

    const bankFileContent = [
      `Bank Transfer File - ${locationLabel}`,
      `Date: ${formatDate(new Date())}`,
      `Period: ${formatDate(payrollRun.startDate)} to ${formatDate(payrollRun.endDate)}`,
      `Total Transfers: ${bankData.length}`,
      `Total Amount: ${formatCurrency(bankData.reduce((sum, item) => sum + parseFloat(item.amount), 0))}`,
      '',
      'Employee ID,Employee Name,IBAN,Bank Name,Amount (KWD),Reference',
      ...bankData.map(item => 
        `${item.employeeId},"${item.employeeName}",${item.iban},"${item.bankName}",${item.amount},${item.reference}`
      )
    ].join('\n');

    const blob = new Blob([bankFileContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `bank_transfer_${locationLabel.replace(/\s+/g, '_')}_${formatDate(payrollRun.startDate).replace(/\s+/g, '_')}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Success",
      description: `Bank transfer file generated for ${locationLabel} (${bankData.length} employees with bank details)`,
    });
  };

  const handleExport = () => {
    switch (exportFormat) {
      case "pdf":
        generatePDFPayslips();
        break;
      case "excel":
        generateExcelExport();
        break;
      case "bank":
        generateBankTransferFile();
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