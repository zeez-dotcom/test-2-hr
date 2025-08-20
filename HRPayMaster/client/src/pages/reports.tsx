import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  FileText, 
  Download, 
  Calendar as CalendarIcon,
  User,
  DollarSign,
  TrendingUp,
  Filter,
  BarChart3,
  PieChart,
  History,
  FileSpreadsheet,
  Search,
  Building,
  Users,
  Award,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Employee, EmployeeEvent, PayrollRun } from "@shared/schema";

export default function Reports() {
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedWorkLocation, setSelectedWorkLocation] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [searchTerm, setSearchTerm] = useState("");
  
  const { toast } = useToast();

  const { data: employees, error: employeesError } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: employeeEvents, error: employeeEventsError } = useQuery<EmployeeEvent[]>({
    queryKey: ["/api/employee-events"],
  });

  const { data: payrollRuns, error: payrollRunsError } = useQuery<PayrollRun[]>({
    queryKey: ["/api/payroll"],
  });

  if (employeesError || employeeEventsError || payrollRunsError) {
    return <div>Error loading reports data</div>;
  }

  // Generate year options (last 5 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

    // Get unique work locations without using Set iteration
    const workLocations = employees
      ? employees.reduce<string[]>((acc, emp) => {
          const loc = emp.workLocation || "Office";
          if (loc && !acc.includes(loc)) acc.push(loc);
          return acc;
        }, [])
      : [];

  // Filter employee events based on selected criteria
  const filteredEvents = employeeEvents?.filter(event => {
    const eventDate = new Date(event.eventDate);
    const eventYear = eventDate.getFullYear();
    const eventMonth = eventDate.getMonth() + 1;

    // Employee filter
    if (selectedEmployee !== "all" && event.employeeId !== selectedEmployee) return false;
    
    // Year filter
    if (selectedYear !== "all" && eventYear.toString() !== selectedYear) return false;
    
    // Month filter
    if (selectedMonth !== "all" && eventMonth.toString() !== selectedMonth) return false;
    
    // Work location filter
    if (selectedWorkLocation !== "all") {
      const employee = employees?.find(emp => emp.id === event.employeeId);
      if ((employee?.workLocation || "Office") !== selectedWorkLocation) return false;
    }
    
    // Date range filter
    if (dateRange.from && eventDate < dateRange.from) return false;
    if (dateRange.to && eventDate > dateRange.to) return false;
    
    // Search term filter
    if (searchTerm) {
      const employee = employees?.find(emp => emp.id === event.employeeId);
      const searchLower = searchTerm.toLowerCase();
      const matchesEmployee = employee?.firstName?.toLowerCase().includes(searchLower) ||
                             employee?.lastName?.toLowerCase().includes(searchLower) ||
                             employee?.position?.toLowerCase().includes(searchLower);
      const matchesEvent = event.title?.toLowerCase().includes(searchLower) ||
                          event.description?.toLowerCase().includes(searchLower) ||
                          event.eventType?.toLowerCase().includes(searchLower);
      
      if (!matchesEmployee && !matchesEvent) return false;
    }
    
    return true;
  }) || [];

  // Generate individual employee comprehensive report
  const generateIndividualEmployeeReport = async (employeeId: string) => {
    const employee = employees?.find(emp => emp.id === employeeId);
    if (!employee) {
      toast({
        title: "Error",
        description: "Employee not found",
        variant: "destructive",
      });
      return;
    }

    const employeeEvents = filteredEvents.filter(event => event.employeeId === employeeId);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "Error",
        description: "Could not open print window. Please check popup settings.",
        variant: "destructive",
      });
      return;
    }

    const totalBonuses = employeeEvents
      .filter(event => event.eventType === "bonus")
      .reduce((sum, event) => sum + parseFloat(event.amount || "0"), 0);
    const totalDeductions = employeeEvents
      .filter(event => event.eventType === "deduction")
      .reduce((sum, event) => sum + parseFloat(event.amount || "0"), 0);
    const vacationEvents = employeeEvents.filter(event => event.eventType === "vacation");

    type EmployeePayrollPeriod = {
      period: string;
      totals: { deductions: number; netPay: number };
      payrollEntries: { grossPay?: string | null }[];
    };

    let payrollHistory: EmployeePayrollPeriod[] = [];
    try {
      const now = new Date();
      const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const res = await apiRequest(
        "GET",
        `/api/reports/employees/${employeeId}?startDate=${start.toISOString()}&endDate=${now.toISOString()}`,
      );
      payrollHistory = await res.json();
    } catch (err) {
      console.error("Failed to fetch payroll history", err);
    }

    const payrollRunCount = payrollHistory.length;
    const totalGrossPaid = payrollHistory.reduce(
      (sum, p) =>
        sum + p.payrollEntries.reduce((s, e) => s + Number(e.grossPay ?? 0), 0),
      0,
    );
    const totalNetPaid = payrollHistory.reduce(
      (sum, p) => sum + Number(p.totals.netPay ?? 0),
      0,
    );
    const totalPayrollDeductions = payrollHistory.reduce(
      (sum, p) => sum + Number(p.totals.deductions ?? 0),
      0,
    );
    const recentPayrolls = payrollHistory
      .sort((a, b) => b.period.localeCompare(a.period))
      .slice(0, 5);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Employee Profile - ${employee.firstName} ${employee.lastName}</title>
          <style>
            @page {
              size: A4;
              margin: 15mm;
            }
            
            * {
              box-sizing: border-box;
            }
            
            body { 
              font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; 
              margin: 0; 
              padding: 0;
              line-height: 1.4; 
              color: #1a1a1a; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
            }
            
            .page-container {
              width: 210mm;
              min-height: 297mm;
              margin: 0 auto;
              background: white;
              box-shadow: 0 20px 40px rgba(0,0,0,0.1);
              position: relative;
              display: flex;
              flex-direction: column;
            }
            
            .header-gradient {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 20mm 15mm 15mm;
              text-align: center;
              position: relative;
              overflow: hidden;
              flex-shrink: 0;
            }
            
            .header-gradient::before {
              content: '';
              position: absolute;
              top: -50%;
              left: -50%;
              width: 200%;
              height: 200%;
              background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="50" cy="50" r="1" fill="white" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
              animation: float 20s ease-in-out infinite;
            }
            
            @keyframes float {
              0%, 100% { transform: translateY(0px) rotate(0deg); }
              50% { transform: translateY(-20px) rotate(180deg); }
            }
            
            .header-content {
              position: relative;
              z-index: 1;
            }
            
            .company-logo {
              width: 60px;
              height: 60px;
              background: rgba(255,255,255,0.2);
              border-radius: 50%;
              margin: 0 auto 20px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 24px;
              font-weight: bold;
              backdrop-filter: blur(10px);
              border: 2px solid rgba(255,255,255,0.3);
            }
            
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 300;
              letter-spacing: -0.5px;
            }
            
            .header p {
              margin: 6px 0 0;
              opacity: 0.9;
              font-size: 14px;
            }
            
            .content-area {
              padding: 15mm;
              flex: 1;
              display: flex;
              flex-direction: column;
              gap: 8mm;
            }
            
            .employee-profile {
              display: grid;
              grid-template-columns: 50mm 1fr;
              gap: 10mm;
              align-items: start;
              page-break-inside: avoid;
            }
            
            .employee-photo-container {
              position: relative;
            }
            
            .employee-photo {
              width: 45mm;
              height: 55mm;
              border-radius: 8px;
              overflow: hidden;
              position: relative;
              background: linear-gradient(145deg, #f0f4f8, #e2e8f0);
              box-shadow: 0 4px 15px rgba(0,0,0,0.1);
              display: flex;
              align-items: center;
              justify-content: center;
            }
            
            .employee-photo img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }
            
            .photo-placeholder {
              color: #64748b;
              font-size: 14px;
              text-align: center;
              font-weight: 500;
            }
            
            .status-badge {
              position: absolute;
              top: -10px;
              right: -10px;
              padding: 8px 16px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            
            .status-badge.active {
              background: linear-gradient(135deg, #10b981, #059669);
              color: white;
            }
            
            .status-badge.inactive {
              background: linear-gradient(135deg, #ef4444, #dc2626);
              color: white;
            }
            
            .employee-info {
              flex: 1;
            }
            
            .employee-name {
              font-size: 20px;
              font-weight: 600;
              color: #1e293b;
              margin: 0 0 4px;
              letter-spacing: -0.3px;
              word-wrap: break-word;
            }
            
            .employee-position {
              font-size: 14px;
              color: #667eea;
              margin: 0 0 8mm;
              font-weight: 500;
              word-wrap: break-word;
            }
            
            .info-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 4mm;
            }
            
            .info-card {
              background: linear-gradient(145deg, #f8fafc, #f1f5f9);
              border-radius: 6px;
              padding: 8px;
              border: 1px solid #e2e8f0;
              position: relative;
              overflow: hidden;
              page-break-inside: avoid;
            }
            
            .info-card::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              width: 4px;
              height: 100%;
              background: linear-gradient(135deg, #667eea, #764ba2);
            }
            
            .info-label {
              font-size: 10px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              font-weight: 600;
              margin-bottom: 3px;
            }
            
            .info-value {
              font-size: 12px;
              color: #1e293b;
              font-weight: 500;
              word-wrap: break-word;
              overflow-wrap: break-word;
            }
            
            .section {
              page-break-inside: avoid;
              margin-bottom: 6mm;
            }
            
            .section-header {
              display: flex;
              align-items: center;
              margin-bottom: 4mm;
              padding-bottom: 2mm;
              border-bottom: 1px solid #e2e8f0;
            }
            
            .section-icon {
              width: 6mm;
              height: 6mm;
              background: linear-gradient(135deg, #667eea, #764ba2);
              border-radius: 3mm;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-right: 3mm;
              font-size: 12px;
            }
            
            .section-title {
              font-size: 16px;
              font-weight: 600;
              color: #1e293b;
              margin: 0;
            }
            
            .documents-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
              gap: 4mm;
            }
            
            .document-card {
              background: white;
              border-radius: 6px;
              padding: 6mm;
              text-align: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.08);
              border: 1px solid transparent;
              position: relative;
              overflow: hidden;
              page-break-inside: avoid;
            }
            
            .document-card::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              height: 4px;
              background: #e2e8f0;
            }
            
            .document-card.valid::before { background: linear-gradient(135deg, #10b981, #059669); }
            .document-card.expiring::before { background: linear-gradient(135deg, #f59e0b, #d97706); }
            .document-card.expired::before { background: linear-gradient(135deg, #ef4444, #dc2626); }
            
            .document-icon {
              width: 8mm;
              height: 8mm;
              background: linear-gradient(145deg, #f0f4f8, #e2e8f0);
              border-radius: 50%;
              margin: 0 auto 2mm;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 14px;
            }
            
            .document-title {
              font-size: 12px;
              font-weight: 600;
              color: #1e293b;
              margin-bottom: 2mm;
            }
            
            .document-number {
              font-size: 10px;
              color: #64748b;
              margin-bottom: 2mm;
              font-family: 'Courier New', monospace;
              word-wrap: break-word;
              overflow-wrap: break-word;
            }

            .document-number a {
              color: #2563eb;
              text-decoration: underline;
            }
            
            .document-expiry {
              font-size: 10px;
              font-weight: 500;
            }
            
            .document-card.valid .document-expiry { color: #059669; }
            .document-card.expiring .document-expiry { color: #d97706; }
            .document-card.expired .document-expiry { color: #dc2626; }
            
            .events-summary {
              background: linear-gradient(135deg, #667eea, #764ba2);
              border-radius: 8px;
              padding: 8mm;
              margin-bottom: 4mm;
              color: white;
              position: relative;
              overflow: hidden;
              page-break-inside: avoid;
            }
            
            .events-summary::before {
              content: '';
              position: absolute;
              top: -50%;
              right: -20%;
              width: 100%;
              height: 200%;
              background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="none" stroke="white" opacity="0.1" stroke-width="2"/></svg>');
              transform: rotate(45deg);
            }
            
            .summary-title {
              font-size: 14px;
              font-weight: 600;
              margin: 0 0 4mm;
              position: relative;
              z-index: 1;
            }
            
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 3mm;
              position: relative;
              z-index: 1;
            }
            
            .summary-card {
              text-align: center;
              background: rgba(255,255,255,0.1);
              border-radius: 4px;
              padding: 3mm;
              backdrop-filter: blur(10px);
            }
            
            .summary-value {
              font-size: 16px;
              font-weight: 700;
              margin-bottom: 2px;
              display: block;
              word-wrap: break-word;
            }
            
            .summary-label {
              font-size: 10px;
              opacity: 0.9;
              font-weight: 500;
            }

            .salary-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10px;
              margin-top: 4mm;
            }

            .salary-table th,
            .salary-table td {
              padding: 2mm;
              border-bottom: 1px solid #e2e8f0;
            }

            .salary-table th {
              background: #f8fafc;
              text-align: left;
            }

            .salary-table td {
              text-align: right;
            }

            .salary-table td:first-child,
            .salary-table th:first-child {
              text-align: left;
            }

            .events-timeline {
              background: #f8fafc;
              border-radius: 6px;
              padding: 6mm;
            }
            
            .timeline-header {
              font-size: 14px;
              font-weight: 600;
              color: #1e293b;
              margin: 0 0 4mm;
              text-align: center;
            }
            
            .event-item {
              display: grid;
              grid-template-columns: 20mm 15mm 1fr 18mm 12mm;
              gap: 3mm;
              align-items: center;
              padding: 3mm;
              margin-bottom: 2mm;
              background: white;
              border-radius: 4px;
              box-shadow: 0 1px 4px rgba(0,0,0,0.05);
              border-left: 2px solid #e2e8f0;
              page-break-inside: avoid;
            }
            
            .event-item:hover {
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(0,0,0,0.1);
            }
            
            .event-item.bonus { border-left-color: #10b981; }
            .event-item.deduction { border-left-color: #ef4444; }
            .event-item.vacation { border-left-color: #8b5cf6; }
            
            .event-date {
              font-size: 9px;
              color: #64748b;
              font-weight: 600;
            }
            
            .event-badge {
              padding: 2px 4px;
              border-radius: 8px;
              font-size: 8px;
              font-weight: 600;
              text-transform: uppercase;
              text-align: center;
            }
            
            .event-badge.bonus { background: #d1fae5; color: #065f46; }
            .event-badge.deduction { background: #fee2e2; color: #991b1b; }
            .event-badge.vacation { background: #e0e7ff; color: #3730a3; }
            
            .event-details {
              font-size: 11px;
            }
            
            .event-title {
              font-weight: 600;
              color: #1e293b;
              margin-bottom: 1px;
              word-wrap: break-word;
              overflow-wrap: break-word;
            }
            
            .event-description {
              font-size: 9px;
              color: #64748b;
              word-wrap: break-word;
              overflow-wrap: break-word;
            }
            
            .event-amount {
              font-size: 10px;
              font-weight: 700;
              text-align: right;
              word-wrap: break-word;
            }
            
            .event-amount.bonus { color: #059669; }
            .event-amount.deduction { color: #dc2626; }
            
            .event-status {
              font-size: 8px;
              text-transform: uppercase;
              color: #64748b;
              text-align: center;
            }
            
            .no-events {
              text-align: center;
              padding: 10mm;
              color: #64748b;
              background: white;
              border-radius: 6px;
            }
            
            .no-events-icon {
              font-size: 24px;
              margin-bottom: 4mm;
              opacity: 0.3;
            }
            
            .footer {
              margin-top: auto;
              padding: 8mm 15mm;
              border-top: 1px solid #e2e8f0;
              background: #f8fafc;
              text-align: center;
              font-size: 10px;
              color: #64748b;
              flex-shrink: 0;
            }
            
            @media print {
              body { background: white !important; }
              .page-container { 
                box-shadow: none; 
                width: 180mm; 
                min-height: 267mm;
                margin: 0;
              }
              .no-print { display: none !important; }
              .event-item:hover { transform: none; }
              .header-gradient { padding: 10mm 15mm 8mm; }
              .content-area { padding: 10mm; }
              .footer { page-break-inside: avoid; }
            }
            
            .print-actions {
              position: fixed;
              bottom: 30px;
              right: 30px;
              display: flex;
              gap: 15px;
              z-index: 1000;
            }
            
            .btn {
              padding: 12px 24px;
              border: none;
              border-radius: 25px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.3s ease;
              text-decoration: none;
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }
            
            .btn-primary {
              background: linear-gradient(135deg, #667eea, #764ba2);
              color: white;
              box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            }
            
            .btn-secondary {
              background: #64748b;
              color: white;
              box-shadow: 0 4px 15px rgba(100, 116, 139, 0.4);
            }
            
            .btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(0,0,0,0.2);
            }
          </style>
        </head>
        <body>
          <div class="page-container">
            <div class="header-gradient">
              <div class="header-content">
                <div class="company-logo">HR</div>
                <h1>Employee Profile Report</h1>
                <p>Generated: ${formatDate(new Date())}</p>
              </div>
            </div>

            <div class="content-area">
              <div class="employee-profile">
                <div class="employee-photo-container">
                  <div class="employee-photo">
                    ${employee.profileImage ?
                      `<img src="${employee.profileImage}" alt="Employee Photo">` :
                      '<div class="photo-placeholder">No Photo<br>Available</div>'
                    }
                  </div>
                  <div class="status-badge ${employee.status}">
                    ${employee.status?.toUpperCase()}
                  </div>
                </div>
                
                <div class="employee-info">
                  <h2 class="employee-name">${employee.firstName} ${employee.lastName}</h2>
                  <p class="employee-position">${employee.position}</p>
                  
                  <div class="info-grid">
                    <div class="info-card">
                      <div class="info-label">Employee ID</div>
                      <div class="info-value">${employee.id}</div>
                    </div>
                    <div class="info-card">
                      <div class="info-label">Department</div>
                      <div class="info-value">${employee.departmentId || 'Unassigned'}</div>
                    </div>
                    <div class="info-card">
                      <div class="info-label">Work Location</div>
                      <div class="info-value">${employee.workLocation || 'Office'}</div>
                    </div>
                    <div class="info-card">
                      <div class="info-label">Email Address</div>
                      <div class="info-value">${employee.email || 'N/A'}</div>
                    </div>
                    <div class="info-card">
                      <div class="info-label">Phone Number</div>
                      <div class="info-value">${employee.phone || 'N/A'}</div>
                    </div>
                    <div class="info-card">
                      <div class="info-label">Start Date</div>
                      <div class="info-value">${formatDate(employee.startDate)}</div>
                    </div>
                    <div class="info-card">
                      <div class="info-label">Current Salary</div>
                      <div class="info-value">${formatCurrency(employee.salary)}</div>
                    </div>
                    <div class="info-card">
                      <div class="info-label">Standard Working Days</div>
                      <div class="info-value">${employee.standardWorkingDays ?? 26} days/month</div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="section">
                <div class="section-header">
                  <div class="section-icon">📋</div>
                  <h3 class="section-title">Identity Documents</h3>
                </div>
                <div class="documents-grid">
                  <div class="document-card ${
                    employee.civilIdExpiryDate ?
                      (new Date(employee.civilIdExpiryDate) < new Date() ? 'expired' :
                       new Date(employee.civilIdExpiryDate) < new Date(Date.now() + 30*24*60*60*1000) ? 'expiring' : 'valid') :
                      'expired'
                  }">
                    <div class="document-icon">🆔</div>
                    <div class="document-title">Civil ID</div>
                    <div class="document-number">${employee.civilId || 'Not Provided'}</div>
                    <div class="document-expiry">
                      ${employee.civilIdExpiryDate ? `Expires: ${formatDate(employee.civilIdExpiryDate)}` : 'No expiry date'}
                    </div>
                  </div>

                  <div class="document-card ${
                    employee.passportExpiryDate ?
                      (new Date(employee.passportExpiryDate) < new Date() ? 'expired' :
                       new Date(employee.passportExpiryDate) < new Date(Date.now() + 30*24*60*60*1000) ? 'expiring' : 'valid') :
                      'expired'
                  }">
                    <div class="document-icon">📘</div>
                    <div class="document-title">Passport</div>
                    <div class="document-number">${employee.passportNumber || 'Not Provided'}</div>
                    <div class="document-expiry">
                      ${employee.passportExpiryDate ? `Expires: ${formatDate(employee.passportExpiryDate)}` : 'No expiry date'}
                    </div>
                  </div>

                  <div class="document-card ${
                    employee.visaExpiryDate ?
                      (new Date(employee.visaExpiryDate) < new Date() ? 'expired' :
                       new Date(employee.visaExpiryDate) < new Date(Date.now() + 30*24*60*60*1000) ? 'expiring' : 'valid') :
                      'expired'
                  }">
                    <div class="document-icon">🎫</div>
                    <div class="document-title">Visa</div>
                    <div class="document-number">${employee.visaNumber || 'Not Provided'}</div>
                    <div class="document-expiry">
                      ${employee.visaExpiryDate ? `Expires: ${formatDate(employee.visaExpiryDate)}` : 'No expiry date'}
                    </div>
                  </div>

                  ${employee.drivingLicenseImage ? `
                  <div class="document-card valid">
                    <div class="document-icon">🚗</div>
                    <div class="document-title">Driving License</div>
                    <div class="document-number"><a href="${employee.drivingLicenseImage}" target="_blank" rel="noopener noreferrer">View</a></div>
                  </div>
                  ` : ''}

                  ${employee.civilIdImage ? `
                  <div class="document-card valid">
                    <div class="document-icon">🆔</div>
                    <div class="document-title">Civil ID Copy</div>
                    <div class="document-number"><a href="${employee.civilIdImage}" target="_blank" rel="noopener noreferrer">View</a></div>
                  </div>
                  ` : ''}

                  ${employee.passportImage ? `
                  <div class="document-card valid">
                    <div class="document-icon">📘</div>
                    <div class="document-title">Passport Copy</div>
                    <div class="document-number"><a href="${employee.passportImage}" target="_blank" rel="noopener noreferrer">View</a></div>
                  </div>
                  ` : ''}

                  ${employee.visaImage ? `
                  <div class="document-card valid">
                    <div class="document-icon">🎫</div>
                    <div class="document-title">Visa Copy</div>
                    <div class="document-number"><a href="${employee.visaImage}" target="_blank" rel="noopener noreferrer">View</a></div>
                  </div>
                  ` : ''}

                  ${employee.profileImage ? `
                  <div class="document-card valid">
                    <div class="document-icon">👤</div>
                    <div class="document-title">Profile Photo</div>
                    <div class="document-number"><a href="${employee.profileImage}" target="_blank" rel="noopener noreferrer">View</a></div>
                  </div>
                  ` : ''}

                  ${employee.additionalDocs ? `
                  <div class="document-card valid">
                    <div class="document-icon">📄</div>
                    <div class="document-title">Additional Documents</div>
                    <div class="document-number"><a href="${employee.additionalDocs}" target="_blank" rel="noopener noreferrer">View</a></div>
                  </div>
                  ` : ''}

                  ${employee.otherDocs ? `
                  <div class="document-card valid">
                    <div class="document-icon">📁</div>
                    <div class="document-title">Other Documents</div>
                    <div class="document-number"><a href="${employee.otherDocs}" target="_blank" rel="noopener noreferrer">View</a></div>
                  </div>
                  ` : ''}
                </div>
              </div>

              <div class="section">
                <div class="section-header">
                  <div class="section-icon">💰</div>
                  <h3 class="section-title">Salary History</h3>
                </div>

                <div class="events-summary">
                  <h3 class="summary-title">Payroll Overview</h3>
                  <div class="summary-grid">
                    <div class="summary-card">
                      <span class="summary-value">${formatCurrency(totalGrossPaid)}</span>
                      <span class="summary-label">Total Gross</span>
                    </div>
                    <div class="summary-card">
                      <span class="summary-value">${formatCurrency(totalNetPaid)}</span>
                      <span class="summary-label">Total Net</span>
                    </div>
                    <div class="summary-card">
                      <span class="summary-value">${formatCurrency(totalPayrollDeductions)}</span>
                      <span class="summary-label">Deductions</span>
                    </div>
                    <div class="summary-card">
                      <span class="summary-value">${payrollRunCount}</span>
                      <span class="summary-label">Payroll Runs</span>
                    </div>
                  </div>
                </div>

                <div class="events-timeline">
                  <h4 class="timeline-header">Recent Payroll Periods</h4>
                  ${recentPayrolls.length > 0 ? `
                    <table class="salary-table">
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th>Gross</th>
                          <th>Deductions</th>
                          <th>Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${recentPayrolls.map(p => `
                          <tr>
                            <td>${p.period}</td>
                            <td>${formatCurrency(p.payrollEntries.reduce((s, e) => s + Number(e.grossPay ?? 0), 0))}</td>
                            <td>${formatCurrency(p.totals.deductions)}</td>
                            <td>${formatCurrency(p.totals.netPay)}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  ` : `
                    <div class="no-events">
                      <div class="no-events-icon">📄</div>
                      <p>No payroll history available</p>
                    </div>
                  `}
                </div>
              </div>

              ${employeeEvents.length > 0 ? `
                <div class="section">
                  <div class="section-header">
                    <div class="section-icon">📊</div>
                    <h3 class="section-title">Employee Events & History</h3>
                  </div>
                  
                  <div class="events-summary">
                    <h3 class="summary-title">Performance Summary</h3>
                    <div class="summary-grid">
                      <div class="summary-card">
                        <span class="summary-value">${formatCurrency(totalBonuses)}</span>
                        <span class="summary-label">Total Bonuses</span>
                      </div>
                      <div class="summary-card">
                        <span class="summary-value">${formatCurrency(totalDeductions)}</span>
                        <span class="summary-label">Total Deductions</span>
                      </div>
                      <div class="summary-card">
                        <span class="summary-value">${vacationEvents.length}</span>
                        <span class="summary-label">Vacation Events</span>
                      </div>
                      <div class="summary-card">
                        <span class="summary-value">${formatCurrency(totalBonuses - totalDeductions)}</span>
                        <span class="summary-label">Net Impact</span>
                      </div>
                    </div>
                  </div>

                  <div class="events-timeline">
                    <h4 class="timeline-header">Complete Event Timeline</h4>
                    ${employeeEvents
                      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
                      .map(event => `
                        <div class="event-item ${event.eventType}">
                          <div class="event-date">${formatDate(event.eventDate)}</div>
                          <div class="event-badge ${event.eventType}">${event.eventType}</div>
                          <div class="event-details">
                            <div class="event-title">${event.title}</div>
                            <div class="event-description">${event.description || 'No description'}</div>
                          </div>
                          <div class="event-amount ${event.eventType}">
                            ${event.amount ? formatCurrency(event.amount) : 'N/A'}
                          </div>
                          <div class="event-status">${event.status?.toUpperCase() || 'N/A'}</div>
                        </div>
                      `).join('')}
                  </div>
                </div>
              ` : `
                <div class="section">
                  <div class="section-header">
                    <div class="section-icon">📊</div>
                    <h3 class="section-title">Employee Events & History</h3>
                  </div>
                  <div class="no-events">
                    <div class="no-events-icon">📋</div>
                    <p>No events recorded for this employee</p>
                  </div>
                </div>
              `}
            </div>
            
            <div class="footer">
              <div>HR Pro - Human Resources Management System</div>
              <div>Employee Profile Report - Generated on ${formatDate(new Date())}</div>
              <div>Confidential Document - For Internal Use Only</div>
            </div>
          </div>

          <div class="print-actions no-print">
            <button onclick="window.print()" class="btn btn-primary">
              🖨️ Print Report
            </button>
            <button onclick="window.close()" class="btn btn-secondary">
              ✕ Close
            </button>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    toast({
      title: "Success",
      description: `Individual employee report for ${employee.firstName} ${employee.lastName} generated successfully`,
    });
  };

  // Generate employee history report (for multiple employees)
  const generateEmployeeHistoryReport = () => {
    const filteredEmployees = selectedEmployee === "all" 
      ? employees 
      : employees?.filter(emp => emp.id === selectedEmployee);

    if (!filteredEmployees || filteredEmployees.length === 0) {
      toast({
        title: "No Data",
        description: "No employees found matching the selected criteria",
        variant: "destructive",
      });
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "Error",
        description: "Could not open print window. Please check popup settings.",
        variant: "destructive",
      });
      return;
    }

    const reportTitle = selectedEmployee === "all" 
      ? `Employee History Report - All Employees` 
      : `Employee History Report - ${filteredEmployees[0]?.firstName} ${filteredEmployees[0]?.lastName}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${reportTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #333; padding-bottom: 20px; }
            .employee-section { 
              page-break-inside: avoid; 
              margin-bottom: 40px; 
              border: 1px solid #ddd; 
              padding: 25px; 
              border-radius: 8px;
              background-color: #fafafa;
            }
            .employee-header { 
              display: flex; 
              justify-content: space-between; 
              margin-bottom: 20px;
              padding-bottom: 15px;
              border-bottom: 2px solid #eee;
            }
            .employee-info { font-size: 16px; }
            .employee-info h3 { margin: 0; color: #2563eb; font-size: 20px; }
            .employee-info p { margin: 5px 0; color: #666; }
            .events-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .events-table th, .events-table td { 
              border: 1px solid #ddd; 
              padding: 12px; 
              text-align: left; 
              font-size: 13px;
            }
            .events-table th { 
              background-color: #f8f9fa; 
              font-weight: bold; 
              color: #333;
            }
            .events-table tr:nth-child(even) { background-color: #f9f9f9; }
            .event-bonus { color: #059669; font-weight: bold; }
            .event-deduction { color: #dc2626; font-weight: bold; }
            .event-vacation { color: #7c3aed; font-weight: bold; }
            .summary-box { 
              background-color: #e0f2fe; 
              padding: 15px; 
              border-radius: 5px; 
              margin-top: 20px;
              border-left: 4px solid #0284c7;
            }
            .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 10px; }
            .summary-item { text-align: center; }
            .summary-item strong { display: block; font-size: 18px; color: #0284c7; }
            @media print { 
              .no-print { display: none; }
              .employee-section { page-break-after: auto; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${reportTitle}</h1>
            <p><strong>Report Generated:</strong> ${formatDate(new Date())}</p>
            <p><strong>Period:</strong> ${selectedYear !== "all" ? selectedYear : "All Years"} ${selectedMonth !== "all" ? `- Month ${selectedMonth}` : ""}</p>
            <p><strong>Work Location:</strong> ${selectedWorkLocation !== "all" ? selectedWorkLocation : "All Locations"}</p>
          </div>

          ${filteredEmployees.map(employee => {
            const employeeEvents = filteredEvents.filter(event => event.employeeId === employee.id);
            const totalBonuses = employeeEvents
              .filter(event => event.eventType === "bonus")
              .reduce((sum, event) => sum + parseFloat(event.amount || "0"), 0);
            const totalDeductions = employeeEvents
              .filter(event => event.eventType === "deduction")
              .reduce((sum, event) => sum + parseFloat(event.amount || "0"), 0);
            const vacationDays = employeeEvents
              .filter(event => event.eventType === "vacation")
              .length;

            return `
              <div class="employee-section">
                <div class="employee-header">
                  <div class="employee-info">
                    <h3>${employee.firstName} ${employee.lastName}</h3>
                    <p><strong>ID:</strong> ${employee.id}</p>
                    <p><strong>Position:</strong> ${employee.position}</p>
                    <p><strong>Work Location:</strong> ${employee.workLocation || 'Office'}</p>
                    <p><strong>Start Date:</strong> ${formatDate(employee.startDate)}</p>
                    <p><strong>Current Salary:</strong> ${formatCurrency(employee.salary)}</p>
                  </div>
                  <div style="text-align: right;">
                    <p><strong>Status:</strong> <span style="color: ${employee.status === 'active' ? '#059669' : '#dc2626'};">${employee.status?.toUpperCase()}</span></p>
                    <p><strong>Email:</strong> ${employee.email || 'N/A'}</p>
                    <p><strong>Phone:</strong> ${employee.phone || 'N/A'}</p>
                  </div>
                </div>

                <div class="summary-box">
                  <h4 style="margin: 0 0 10px 0;">Summary for Selected Period</h4>
                  <div class="summary-grid">
                    <div class="summary-item">
                      <strong class="event-bonus">${formatCurrency(totalBonuses)}</strong>
                      <span>Total Bonuses</span>
                    </div>
                    <div class="summary-item">
                      <strong class="event-deduction">${formatCurrency(totalDeductions)}</strong>
                      <span>Total Deductions</span>
                    </div>
                    <div class="summary-item">
                      <strong class="event-vacation">${vacationDays}</strong>
                      <span>Vacation Events</span>
                    </div>
                  </div>
                </div>

                ${employeeEvents.length > 0 ? `
                  <table class="events-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Event Type</th>
                        <th>Title</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${employeeEvents
                        .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())
                        .map(event => `
                          <tr>
                            <td>${formatDate(event.eventDate)}</td>
                            <td>
                              <span class="event-${event.eventType}">
                                ${event.eventType?.toUpperCase()}
                              </span>
                            </td>
                            <td>${event.title}</td>
                            <td>${event.description || 'N/A'}</td>
                            <td class="event-${event.eventType}">
                              ${event.amount ? formatCurrency(event.amount) : 'N/A'}
                            </td>
                            <td>${event.status?.toUpperCase()}</td>
                          </tr>
                        `).join('')}
                    </tbody>
                  </table>
                ` : `
                  <p style="text-align: center; color: #666; margin-top: 20px; font-style: italic;">
                    No events found for the selected period
                  </p>
                `}
              </div>
            `;
          }).join('')}

          <div class="no-print" style="margin-top: 30px; text-align: center; page-break-inside: avoid;">
            <button onclick="window.print()" style="padding: 12px 24px; background-color: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; margin-right: 10px; font-size: 14px;">
              Print Report
            </button>
            <button onclick="window.close()" style="padding: 12px 24px; background-color: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
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
      description: "Employee history report generated successfully",
    });
  };

  // Generate salary trends report
  const generateSalaryReport = () => {
    if (!payrollRuns || payrollRuns.length === 0) {
      toast({
        title: "No Data",
        description: "No payroll data available for salary report",
        variant: "destructive",
      });
      return;
    }

    // Add salary report generation logic here
    toast({
      title: "Feature Coming Soon",
      description: "Salary trends report will be available in the next update",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive employee history and salary reports
          </p>
        </div>
      </div>

      <Tabs defaultValue="employee-history" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="employee-history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Employee History
          </TabsTrigger>
          <TabsTrigger value="salary-reports" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Salary Reports
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employee-history" className="space-y-6">
          {/* Filter Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Report Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Employee</label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees?.map(employee => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.firstName} {employee.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Year</label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      {yearOptions.map(year => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Month</label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Months</SelectItem>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Work Location</label>
                  <Select value={selectedWorkLocation} onValueChange={setSelectedWorkLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
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
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search by employee name, position, or event..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center mt-6 pt-4 border-t">
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <span>Found {filteredEvents.length} events</span>
                  <span>•</span>
                  <span>{selectedEmployee === "all" ? employees?.length || 0 : 1} employees</span>
                </div>
                <Button onClick={generateEmployeeHistoryReport} className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Generate Report
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Users className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {selectedEmployee === "all" ? employees?.length || 0 : 1}
                    </p>
                    <p className="text-xs text-muted-foreground">Employees</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Award className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(
                        filteredEvents
                          .filter(event => event.eventType === "bonus")
                          .reduce((sum, event) => sum + parseFloat(event.amount || "0"), 0)
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Bonuses</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(
                        filteredEvents
                          .filter(event => event.eventType === "deduction")
                          .reduce((sum, event) => sum + parseFloat(event.amount || "0"), 0)
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Deductions</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <CalendarIcon className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {filteredEvents.filter(event => event.eventType === "vacation").length}
                    </p>
                    <p className="text-xs text-muted-foreground">Vacation Events</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Employee List for Individual Reports */}
          <Card>
            <CardHeader>
              <CardTitle>Individual Employee Reports</CardTitle>
              <p className="text-sm text-muted-foreground">
                Generate comprehensive individual employee profiles with all documents and event history
              </p>
            </CardHeader>
            <CardContent>
              {employees && employees.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {employees
                    .filter(employee => {
                      if (selectedWorkLocation !== "all" && (employee.workLocation || "Office") !== selectedWorkLocation) return false;
                      if (searchTerm) {
                        const searchLower = searchTerm.toLowerCase();
                        return employee.firstName?.toLowerCase().includes(searchLower) ||
                               employee.lastName?.toLowerCase().includes(searchLower) ||
                               employee.position?.toLowerCase().includes(searchLower);
                      }
                      return true;
                    })
                    .map(employee => {
                      const employeeEventCount = filteredEvents.filter(event => event.employeeId === employee.id).length;
                      return (
                        <div key={employee.id} className="p-4 bg-gray-50 rounded-lg border">
                          <div className="flex items-center space-x-3 mb-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="h-6 w-6 text-blue-600" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">
                                {employee.firstName} {employee.lastName}
                              </h4>
                              <p className="text-sm text-gray-600">{employee.position}</p>
                              <p className="text-xs text-gray-500">{employee.workLocation || 'Office'}</p>
                            </div>
                            <Badge variant={employee.status === 'active' ? 'default' : 'secondary'}>
                              {employee.status}
                            </Badge>
                          </div>
                          
                          <div className="flex justify-between items-center text-sm text-gray-600 mb-3">
                            <span>{employeeEventCount} events</span>
                            <span>{formatCurrency(employee.salary)}</span>
                          </div>
                          
                          <Button 
                            onClick={() => generateIndividualEmployeeReport(employee.id)}
                            size="sm" 
                            className="w-full flex items-center gap-2"
                          >
                            <FileText className="h-4 w-4" />
                            Generate Profile Report
                          </Button>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No employees found</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Events Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Events Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredEvents.length > 0 ? (
                <div className="space-y-3">
                  {filteredEvents.slice(0, 10).map(event => {
                    const employee = employees?.find(emp => emp.id === event.employeeId);
                    return (
                      <div key={event.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Badge variant={
                            event.eventType === "bonus" ? "default" :
                            event.eventType === "deduction" ? "destructive" :
                            event.eventType === "vacation" ? "secondary" : "outline"
                          }>
                            {event.eventType}
                          </Badge>
                          <div>
                            <p className="font-medium">
                              {employee?.firstName} {employee?.lastName}
                            </p>
                            <p className="text-sm text-gray-600">{event.title}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            {event.amount ? formatCurrency(event.amount) : 'N/A'}
                          </p>
                          <p className="text-sm text-gray-600">
                            {formatDate(event.eventDate)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No events found matching the selected criteria</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salary-reports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Salary Trends & Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <TrendingUp className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">Salary Reports Coming Soon</h3>
                <p className="text-gray-600 mb-6">
                  Advanced salary analytics, trends, and comparison reports will be available in the next update.
                </p>
                <Button onClick={generateSalaryReport} disabled>
                  Generate Salary Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                HR Analytics Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <BarChart3 className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">Analytics Dashboard Coming Soon</h3>
                <p className="text-gray-600">
                  Interactive charts, workforce analytics, and performance metrics will be available soon.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}