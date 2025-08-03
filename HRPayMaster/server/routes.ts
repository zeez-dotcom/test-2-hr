import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertDepartmentSchema,
  insertEmployeeSchema,
  insertPayrollRunSchema,
  insertPayrollEntrySchema,
  insertVacationRequestSchema,
  insertLoanSchema,
  insertCarSchema,
  insertCarAssignmentSchema,
  insertNotificationSchema,
  insertEmailAlertSchema,
  insertEmployeeEventSchema
} from "@shared/schema";
import { 
  sendEmail, 
  generateExpiryWarningEmail, 
  calculateDaysUntilExpiry, 
  shouldSendAlert 
} from "./emailService";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Department routes
  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

  app.get("/api/departments/:id", async (req, res) => {
    try {
      const department = await storage.getDepartment(req.params.id);
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }
      res.json(department);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch department" });
    }
  });

  app.post("/api/departments", async (req, res) => {
    try {
      const department = insertDepartmentSchema.parse(req.body);
      const newDepartment = await storage.createDepartment(department);
      res.status(201).json(newDepartment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid department data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create department" });
    }
  });

  app.put("/api/departments/:id", async (req, res) => {
    try {
      const updates = insertDepartmentSchema.partial().parse(req.body);
      const updatedDepartment = await storage.updateDepartment(req.params.id, updates);
      if (!updatedDepartment) {
        return res.status(404).json({ message: "Department not found" });
      }
      res.json(updatedDepartment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid department data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update department" });
    }
  });

  app.delete("/api/departments/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteDepartment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Department not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete department" });
    }
  });

  // Employee routes
  app.get("/api/employees", async (req, res) => {
    try {
      const employees = await storage.getEmployees();
      res.json(employees);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.get("/api/employees/:id", async (req, res) => {
    try {
      const employee = await storage.getEmployee(req.params.id);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }
      res.json(employee);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch employee" });
    }
  });

  app.post("/api/employees", async (req, res) => {
    try {
      const employee = insertEmployeeSchema.parse(req.body);
      const newEmployee = await storage.createEmployee({
        ...employee,
        role: employee.role || "employee",
      });
      res.status(201).json(newEmployee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid employee data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create employee" });
    }
  });

  app.put("/api/employees/:id", async (req, res) => {
    try {
      const updates = insertEmployeeSchema.partial().parse(req.body);
      const updatedEmployee = await storage.updateEmployee(req.params.id, updates);
      if (!updatedEmployee) {
        return res.status(404).json({ message: "Employee not found" });
      }
      res.json(updatedEmployee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid employee data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update employee" });
    }
  });

  app.delete("/api/employees/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEmployee(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Employee not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete employee" });
    }
  });

  // Payroll routes
  app.get("/api/payroll", async (req, res) => {
    try {
      const payrollRuns = await storage.getPayrollRuns();
      res.json(payrollRuns);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payroll runs" });
    }
  });

  app.get("/api/payroll/:id", async (req, res) => {
    try {
      const payrollRun = await storage.getPayrollRun(req.params.id);
      if (!payrollRun) {
        return res.status(404).json({ message: "Payroll run not found" });
      }
      res.json(payrollRun);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payroll run" });
    }
  });

  app.post("/api/payroll", async (req, res) => {
    try {
      const payrollRun = insertPayrollRunSchema.parse(req.body);
      const newPayrollRun = await storage.createPayrollRun(payrollRun);
      res.status(201).json(newPayrollRun);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid payroll data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create payroll run" });
    }
  });

  app.post("/api/payroll/generate", async (req, res) => {
    try {
      const { period, startDate, endDate } = req.body;
      
      if (!period || !startDate || !endDate) {
        return res.status(400).json({ message: "Period, start date, and end date are required" });
      }

      // Get all active employees
      const employees = await storage.getEmployees();
      const activeEmployees = employees.filter(emp => emp.status === "active");

      if (activeEmployees.length === 0) {
        return res.status(400).json({ message: "No active employees found" });
      }

      // Get loans, vacation requests, and employee events for the period
      const loans = await storage.getLoans();
      const vacationRequests = await storage.getVacationRequests();
      const employeeEvents = await storage.getEmployeeEvents();
      
      // Calculate working days in the period
      const start = new Date(startDate);
      const end = new Date(endDate);
      const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const workingDays = Math.max(1, totalDays - Math.floor(totalDays / 7) * 2); // Approximate working days

      // Calculate totals
      let grossAmount = 0;
      let totalDeductions = 0;

      const payrollEntries = await Promise.all(activeEmployees.map(async employee => {
        const monthlySalary = parseFloat(employee.salary);
        
        // Calculate vacation days for this employee in the period
        const employeeVacations = vacationRequests.filter(v => 
          v.employeeId === employee.id && 
          v.status === "approved" &&
          new Date(v.startDate) <= end && 
          new Date(v.endDate) >= start
        );
        
        const vacationDays = employeeVacations.reduce((total, vacation) => {
          const vacStart = new Date(Math.max(new Date(vacation.startDate).getTime(), start.getTime()));
          const vacEnd = new Date(Math.min(new Date(vacation.endDate).getTime(), end.getTime()));
          return total + Math.ceil((vacEnd.getTime() - vacStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }, 0);

        // Use employee's standard working days (default 26 if not set)
        const employeeWorkingDays = employee.standardWorkingDays || 26;
        
        // Calculate actual working days for this employee
        const actualWorkingDays = Math.max(0, employeeWorkingDays - vacationDays);
        
        // Calculate pro-rated salary based on employee's standard working days
        const baseSalary = employee.status === "active" ? 
          (monthlySalary * actualWorkingDays / employeeWorkingDays) : 0;

        // Calculate loan deductions for this employee
        const employeeLoans = loans.filter(l => 
          l.employeeId === employee.id && 
          l.status === "active" &&
          parseFloat(l.remainingAmount) > 0
        );
        
        const loanDeduction = employeeLoans.reduce((total, loan) => {
          return total + Math.min(parseFloat(loan.monthlyDeduction), parseFloat(loan.remainingAmount));
        }, 0);

        // Calculate employee events (bonuses, deductions, etc.) for this period
        const periodStart = new Date(startDate);
        const periodEnd = new Date(endDate);
        
        const employeeEventsInPeriod = employeeEvents.filter(event => 
          event.employeeId === employee.id && 
          event.affectsPayroll &&
          event.status === "active" &&
          new Date(event.eventDate) >= periodStart && 
          new Date(event.eventDate) <= periodEnd
        );

        const bonusAmount = employeeEventsInPeriod
          .filter(event => ['bonus', 'allowance', 'overtime'].includes(event.eventType))
          .reduce((total, event) => total + parseFloat(event.amount), 0);

        const eventDeductions = employeeEventsInPeriod
          .filter(event => ['deduction', 'penalty'].includes(event.eventType))
          .reduce((total, event) => total + parseFloat(event.amount), 0);

        // Add bonuses to get gross pay
        const grossPay = baseSalary + bonusAmount;

        // Calculate standard deductions (optional - can be configured per company)
        const taxDeduction = 0; // No automatic tax deduction
        const socialSecurityDeduction = 0; // No automatic social security deduction
        const healthInsuranceDeduction = 0; // No automatic health insurance deduction

        const otherDeductions = eventDeductions;
        
        const totalEmpDeductions = taxDeduction + socialSecurityDeduction + healthInsuranceDeduction + loanDeduction + otherDeductions;
        const netPay = Math.max(0, grossPay - totalEmpDeductions);

        grossAmount += grossPay;
        totalDeductions += totalEmpDeductions;

        // Create notifications for significant payroll events
        let adjustmentReason = "";
        if (vacationDays > 0) {
          adjustmentReason += `${vacationDays} vacation days. `;
          
          // Create notification for vacation impact
          await storage.createNotification({
            employeeId: employee.id,
            type: "vacation_approved",
            title: "Vacation Deduction Applied",
            message: `${vacationDays} vacation days deducted from ${period} payroll`,
            priority: "medium",
            status: "unread",
            expiryDate: endDate,
            daysUntilExpiry: 0,
            emailSent: false
          });
        }
        
        if (loanDeduction > 0) {
          adjustmentReason += `Loan deduction: ${loanDeduction.toFixed(2)} KWD. `;
          
          // Create notification for loan deduction
          await storage.createNotification({
            employeeId: employee.id,
            type: "loan_deduction",
            title: "Loan Deduction Applied",
            message: `${loanDeduction.toFixed(2)} KWD deducted for loan repayment in ${period}`,
            priority: "low",
            status: "unread",
            expiryDate: endDate,
            daysUntilExpiry: 0,
            emailSent: false
          });
        }

        return {
          employeeId: employee.id,
          grossPay: grossPay.toString(),
          baseSalary: baseSalary.toString(),
          bonusAmount: bonusAmount.toString(),
          workingDays: employeeWorkingDays,
          actualWorkingDays: actualWorkingDays,
          vacationDays: vacationDays,
          taxDeduction: taxDeduction.toString(),
          socialSecurityDeduction: socialSecurityDeduction.toString(),
          healthInsuranceDeduction: healthInsuranceDeduction.toString(),
          loanDeduction: loanDeduction.toString(),
          otherDeductions: otherDeductions.toString(),
          netPay: netPay.toString(),
          adjustmentReason: adjustmentReason.trim() || null,
        };
      }));

      const netAmount = grossAmount - totalDeductions;

      // Create payroll run
      const payrollRun = await storage.createPayrollRun({
        period,
        startDate,
        endDate,
        grossAmount: grossAmount.toString(),
        totalDeductions: totalDeductions.toString(),
        netAmount: netAmount.toString(),
        status: "completed"
      });

      // Create payroll entries
      for (const entry of payrollEntries) {
        await storage.createPayrollEntry({
          ...entry,
          payrollRunId: payrollRun.id
        });
      }

      // Update loan remaining amounts
      for (const loan of loans.filter(l => l.status === "active")) {
        const loanDeduction = payrollEntries.find(entry => entry.employeeId === loan.employeeId)?.loanDeduction;
        if (loanDeduction && parseFloat(loanDeduction) > 0) {
          const newRemaining = Math.max(0, parseFloat(loan.remainingAmount) - parseFloat(loanDeduction));
          await storage.updateLoan(loan.id, {
            remainingAmount: newRemaining.toString(),
            status: newRemaining <= 0 ? "completed" : "active"
          });
        }
      }

      res.status(201).json(payrollRun);
    } catch (error) {
      console.error("Payroll generation error:", error);
      res.status(500).json({ message: "Failed to generate payroll" });
    }
  });

  app.put("/api/payroll/:id", async (req, res) => {
    try {
      const updates = insertPayrollRunSchema.partial().parse(req.body);
      const updatedPayrollRun = await storage.updatePayrollRun(req.params.id, updates);
      if (!updatedPayrollRun) {
        return res.status(404).json({ message: "Payroll run not found" });
      }
      res.json(updatedPayrollRun);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid payroll data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update payroll run" });
    }
  });

  app.delete("/api/payroll/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePayrollRun(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Payroll run not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete payroll run" });
    }
  });

  // Dashboard stats route
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const employees = await storage.getEmployees();
      const payrollRuns = await storage.getPayrollRuns();
      const departments = await storage.getDepartments();

      const totalEmployees = employees.length;
      const activeDepartments = departments.length;
      
      // Get latest payroll run for monthly payroll
      const latestPayroll = payrollRuns[0];
      const monthlyPayroll = latestPayroll ? parseFloat(latestPayroll.grossAmount) : 0;
      
      // Count pending reviews (employees with status 'on_leave' for this example)
      const pendingReviews = employees.filter(emp => emp.status === "on_leave").length;

      res.json({
        totalEmployees,
        monthlyPayroll,
        departments: activeDepartments,
        pendingReviews
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Vacation request routes
  app.get("/api/vacations", async (req, res) => {
    try {
      const vacationRequests = await storage.getVacationRequests();
      res.json(vacationRequests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch vacation requests" });
    }
  });

  app.get("/api/vacations/:id", async (req, res) => {
    try {
      const vacationRequest = await storage.getVacationRequest(req.params.id);
      if (!vacationRequest) {
        return res.status(404).json({ message: "Vacation request not found" });
      }
      res.json(vacationRequest);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch vacation request" });
    }
  });

  app.post("/api/vacations", async (req, res) => {
    try {
      const vacationRequest = insertVacationRequestSchema.parse(req.body);
      const newVacationRequest = await storage.createVacationRequest(vacationRequest);
      res.status(201).json(newVacationRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vacation request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create vacation request" });
    }
  });

  app.put("/api/vacations/:id", async (req, res) => {
    try {
      const updates = insertVacationRequestSchema.partial().parse(req.body);
      const updatedVacationRequest = await storage.updateVacationRequest(req.params.id, updates);
      if (!updatedVacationRequest) {
        return res.status(404).json({ message: "Vacation request not found" });
      }
      res.json(updatedVacationRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vacation request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update vacation request" });
    }
  });

  app.delete("/api/vacations/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteVacationRequest(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Vacation request not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete vacation request" });
    }
  });

  // Loan routes
  app.get("/api/loans", async (req, res) => {
    try {
      const loans = await storage.getLoans();
      res.json(loans);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch loans" });
    }
  });

  app.get("/api/loans/:id", async (req, res) => {
    try {
      const loan = await storage.getLoan(req.params.id);
      if (!loan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      res.json(loan);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch loan" });
    }
  });

  app.post("/api/loans", async (req, res) => {
    try {
      const loan = insertLoanSchema.parse(req.body);
      const newLoan = await storage.createLoan(loan);
      res.status(201).json(newLoan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid loan data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create loan" });
    }
  });

  app.put("/api/loans/:id", async (req, res) => {
    try {
      const updates = insertLoanSchema.partial().parse(req.body);
      const updatedLoan = await storage.updateLoan(req.params.id, updates);
      if (!updatedLoan) {
        return res.status(404).json({ message: "Loan not found" });
      }
      res.json(updatedLoan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid loan data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update loan" });
    }
  });

  app.delete("/api/loans/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteLoan(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Loan not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete loan" });
    }
  });

  // Car routes
  app.get("/api/cars", async (req, res) => {
    try {
      const cars = await storage.getCars();
      res.json(cars);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cars" });
    }
  });

  app.get("/api/cars/:id", async (req, res) => {
    try {
      const car = await storage.getCar(req.params.id);
      if (!car) {
        return res.status(404).json({ message: "Car not found" });
      }
      res.json(car);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch car" });
    }
  });

  app.post("/api/cars", async (req, res) => {
    try {
      const car = insertCarSchema.parse(req.body);
      const newCar = await storage.createCar(car);
      res.status(201).json(newCar);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid car data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create car" });
    }
  });

  app.put("/api/cars/:id", async (req, res) => {
    try {
      const updates = insertCarSchema.partial().parse(req.body);
      const updatedCar = await storage.updateCar(req.params.id, updates);
      if (!updatedCar) {
        return res.status(404).json({ message: "Car not found" });
      }
      res.json(updatedCar);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid car data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update car" });
    }
  });

  app.delete("/api/cars/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCar(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Car not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete car" });
    }
  });

  // Car assignment routes
  app.get("/api/car-assignments", async (req, res) => {
    try {
      const carAssignments = await storage.getCarAssignments();
      res.json(carAssignments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch car assignments" });
    }
  });

  app.get("/api/car-assignments/:id", async (req, res) => {
    try {
      const carAssignment = await storage.getCarAssignment(req.params.id);
      if (!carAssignment) {
        return res.status(404).json({ message: "Car assignment not found" });
      }
      res.json(carAssignment);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch car assignment" });
    }
  });

  app.post("/api/car-assignments", async (req, res) => {
    try {
      const carAssignment = insertCarAssignmentSchema.parse(req.body);
      const newCarAssignment = await storage.createCarAssignment(carAssignment);
      res.status(201).json(newCarAssignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid car assignment data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create car assignment" });
    }
  });

  app.put("/api/car-assignments/:id", async (req, res) => {
    try {
      const updates = insertCarAssignmentSchema.partial().parse(req.body);
      const updatedCarAssignment = await storage.updateCarAssignment(req.params.id, updates);
      if (!updatedCarAssignment) {
        return res.status(404).json({ message: "Car assignment not found" });
      }
      res.json(updatedCarAssignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid car assignment data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update car assignment" });
    }
  });

  app.delete("/api/car-assignments/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCarAssignment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Car assignment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete car assignment" });
    }
  });

  // Notification routes
  app.get("/api/notifications", async (req, res) => {
    try {
      const notifications = await storage.getNotifications();
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread", async (req, res) => {
    try {
      const notifications = await storage.getUnreadNotifications();
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch unread notifications" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const notification = insertNotificationSchema.parse(req.body);
      const newNotification = await storage.createNotification(notification);
      res.status(201).json(newNotification);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid notification data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create notification" });
    }
  });

  app.put("/api/notifications/:id/read", async (req, res) => {
    try {
      const marked = await storage.markNotificationAsRead(req.params.id);
      if (!marked) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteNotification(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // Document expiry tracking routes
  app.get("/api/documents/expiry-check", async (req, res) => {
    try {
      const expiryChecks = await storage.checkDocumentExpiries();
      res.json(expiryChecks);
    } catch (error) {
      res.status(500).json({ message: "Failed to check document expiries" });
    }
  });

  app.post("/api/documents/send-alerts", async (req, res) => {
    try {
      const expiryChecks = await storage.checkDocumentExpiries();
      const alerts = [];
      let emailsSent = 0;

      for (const check of expiryChecks) {
        const employee = await storage.getEmployee(check.employeeId);
        if (!employee) continue;

        // Check visa expiry
        if (check.visa && shouldSendAlert(check.visa.expiryDate, check.visa.alertDays)) {
          const emailContent = generateExpiryWarningEmail(
            employee,
            'visa',
            check.visa.expiryDate,
            check.visa.daysUntilExpiry,
            check.visa.number
          );

          // Create notification
          await storage.createNotification({
            employeeId: check.employeeId,
            type: 'visa_expiry',
            title: emailContent.subject,
            message: `Visa expires in ${check.visa.daysUntilExpiry} days`,
            priority: check.visa.daysUntilExpiry <= 7 ? 'critical' : check.visa.daysUntilExpiry <= 30 ? 'high' : 'medium',
            expiryDate: check.visa.expiryDate,
            daysUntilExpiry: check.visa.daysUntilExpiry,
            emailSent: false
          });

          // Send email if configured
          const emailSent = await sendEmail({
            to: employee.email || '',
            from: process.env.FROM_EMAIL || 'hr@company.com',
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text
          });

          if (emailSent) emailsSent++;
          alerts.push({ type: 'visa', employee: check.employeeName, daysUntilExpiry: check.visa.daysUntilExpiry });
        }

        // Check civil ID expiry
        if (check.civilId && shouldSendAlert(check.civilId.expiryDate, check.civilId.alertDays)) {
          const emailContent = generateExpiryWarningEmail(
            employee,
            'civil_id',
            check.civilId.expiryDate,
            check.civilId.daysUntilExpiry,
            check.civilId.number
          );

          await storage.createNotification({
            employeeId: check.employeeId,
            type: 'civil_id_expiry',
            title: emailContent.subject,
            message: `Civil ID expires in ${check.civilId.daysUntilExpiry} days`,
            priority: check.civilId.daysUntilExpiry <= 7 ? 'critical' : check.civilId.daysUntilExpiry <= 30 ? 'high' : 'medium',
            expiryDate: check.civilId.expiryDate,
            daysUntilExpiry: check.civilId.daysUntilExpiry,
            emailSent: false
          });

          const emailSent = await sendEmail({
            to: employee.email || '',
            from: process.env.FROM_EMAIL || 'hr@company.com',
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text
          });

          if (emailSent) emailsSent++;
          alerts.push({ type: 'civil_id', employee: check.employeeName, daysUntilExpiry: check.civilId.daysUntilExpiry });
        }

        // Check passport expiry
        if (check.passport && shouldSendAlert(check.passport.expiryDate, check.passport.alertDays)) {
          const emailContent = generateExpiryWarningEmail(
            employee,
            'passport',
            check.passport.expiryDate,
            check.passport.daysUntilExpiry,
            check.passport.number
          );

          await storage.createNotification({
            employeeId: check.employeeId,
            type: 'passport_expiry',
            title: emailContent.subject,
            message: `Passport expires in ${check.passport.daysUntilExpiry} days`,
            priority: check.passport.daysUntilExpiry <= 7 ? 'critical' : check.passport.daysUntilExpiry <= 30 ? 'high' : 'medium',
            expiryDate: check.passport.expiryDate,
            daysUntilExpiry: check.passport.daysUntilExpiry,
            emailSent: false
          });

          const emailSent = await sendEmail({
            to: employee.email || '',
            from: process.env.FROM_EMAIL || 'hr@company.com',
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text
          });

          if (emailSent) emailsSent++;
          alerts.push({ type: 'passport', employee: check.employeeName, daysUntilExpiry: check.passport.daysUntilExpiry });
        }
      }

      res.json({ 
        message: `Document expiry alerts processed`,
        alertsGenerated: alerts.length,
        emailsSent,
        alerts
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to send document expiry alerts" });
    }
  });

  // Email alerts routes
  app.get("/api/email-alerts", async (req, res) => {
    try {
      const alerts = await storage.getEmailAlerts();
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch email alerts" });
    }
  });

  // Employee events routes
  app.get("/api/employee-events", async (req, res) => {
    try {
      const events = await storage.getEmployeeEvents();
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch employee events" });
    }
  });

  app.get("/api/employee-events/:id", async (req, res) => {
    try {
      const event = await storage.getEmployeeEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Employee event not found" });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch employee event" });
    }
  });

  app.post("/api/employee-events", async (req, res) => {
    try {
      const event = insertEmployeeEventSchema.parse(req.body);
      const newEvent = await storage.createEmployeeEvent(event);
      res.status(201).json(newEvent);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid employee event data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create employee event" });
    }
  });

  app.put("/api/employee-events/:id", async (req, res) => {
    try {
      const updates = insertEmployeeEventSchema.partial().parse(req.body);
      const updatedEvent = await storage.updateEmployeeEvent(req.params.id, updates);
      if (!updatedEvent) {
        return res.status(404).json({ message: "Employee event not found" });
      }
      res.json(updatedEvent);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid employee event data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update employee event" });
    }
  });

  app.delete("/api/employee-events/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEmployeeEvent(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Employee event not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete employee event" });
    }
  });

  // Payroll entry routes
  app.put("/api/payroll/entries/:id", async (req, res) => {
    try {
      const updates = insertPayrollEntrySchema.partial().parse(req.body);
      const updatedEntry = await storage.updatePayrollEntry(req.params.id, updates);
      if (!updatedEntry) {
        return res.status(404).json({ message: "Payroll entry not found" });
      }
      res.json(updatedEntry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid payroll entry data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update payroll entry" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
