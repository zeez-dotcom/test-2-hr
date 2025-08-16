import type { Express, Request, Response, NextFunction } from "express";
import { HttpError } from "./errorHandler";
import passport from "passport";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { assetService } from "./assetService";
import {
  insertDepartmentSchema,
  insertEmployeeSchema,
  insertVacationRequestSchema,
  insertAssetSchema,
  insertAssetAssignmentSchema,
  insertNotificationSchema,
  insertEmailAlertSchema,
  insertEmployeeEventSchema,
  type InsertEmployeeEvent,
  type InsertEmployee
} from "@shared/schema";
import {
  sendEmail,
  generateExpiryWarningEmail,
  calculateDaysUntilExpiry,
  shouldSendAlert
} from "./emailService";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/login", passport.authenticate("local"), (req, res) => {
    res.json({ user: req.user });
  });

  app.post("/logout", (req, res, next) => {
    req.logout(err => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  const ensureAuth = (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) return next();
    next(new HttpError(401, "Unauthorized"));
  };

  const upload = multer({ storage: multer.memoryStorage() });

  app.use("/api", ensureAuth);

  app.get("/api/me", (req, res) => {
    res.json(req.user);
  });

  // Department routes
  app.get("/api/departments", async (req, res, next) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch departments"));
    }
  });

  app.get("/api/departments/:id", async (req, res, next) => {
    try {
      const department = await storage.getDepartment(req.params.id);
      if (!department) {
        return next(new HttpError(404, "Department not found"));
      }
      res.json(department);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch department"));
    }
  });

  app.post("/api/departments", async (req, res, next) => {
    try {
      const department = insertDepartmentSchema.parse(req.body);
      const newDepartment = await storage.createDepartment(department);
      res.status(201).json(newDepartment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid department data", error.errors));
      }
      next(new HttpError(500, "Failed to create department"));
    }
  });

  app.put("/api/departments/:id", async (req, res, next) => {
    try {
      const updates = insertDepartmentSchema.partial().parse(req.body);
      const updatedDepartment = await storage.updateDepartment(req.params.id, updates);
      if (!updatedDepartment) {
        return next(new HttpError(404, "Department not found"));
      }
      res.json(updatedDepartment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid department data", error.errors));
      }
      next(new HttpError(500, "Failed to update department"));
    }
  });

  app.delete("/api/departments/:id", async (req, res, next) => {
    try {
      const deleted = await storage.deleteDepartment(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Department not found"));
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete department"));
    }
  });

  // Employee routes
  app.get("/api/employees", async (req, res, next) => {
    try {
      const employees = await storage.getEmployees();
      res.json(employees);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch employees"));
    }
  });

  app.post("/api/employees/import", upload.single("file"), async (req, res, next) => {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return next(new HttpError(400, "No file uploaded"));
    }
    try {
      const workbook = XLSX.read(file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      const existing = await storage.getEmployees();
      const existingCodes = new Set(existing.map(e => e.employeeCode));
      const valid: InsertEmployee[] = [];
      let failed = 0;
      const seen = new Set<string>();

      for (const row of rows) {
        const code = row.employeeCode;
        if (!code || seen.has(code) || existingCodes.has(code)) {
          failed++;
          continue;
        }
        seen.add(code);
        try {
          const emp = insertEmployeeSchema.parse(row);
          valid.push(emp);
        } catch {
          failed++;
        }
      }

      const { success, failed: insertFailed } = await storage.createEmployeesBulk(valid);
      res.json({ success, failed: failed + insertFailed });
    } catch {
      next(new HttpError(500, "Failed to import employees"));
    }
  });

  app.get("/api/employees/:id", async (req, res, next) => {
    try {
      const employee = await storage.getEmployee(req.params.id);
      if (!employee) {
        return next(new HttpError(404, "Employee not found"));
      }
      res.json(employee);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch employee"));
    }
  });

  app.post("/api/employees", async (req, res, next) => {
    try {
      const employee = insertEmployeeSchema.parse(req.body);
      const newEmployee = await storage.createEmployee({
        ...employee,
        role: employee.role || "employee",
      });
      res.status(201).json(newEmployee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid employee data", error.errors));
      }
      next(new HttpError(500, "Failed to create employee"));
    }
  });

  app.put("/api/employees/:id", async (req, res, next) => {
    try {
      if ("employeeCode" in req.body) {
        return next(new HttpError(400, "Employee code cannot be updated"));
      }
      const updates = insertEmployeeSchema
        .omit({ employeeCode: true })
        .partial()
        .parse(req.body);
      const updatedEmployee = await storage.updateEmployee(req.params.id, updates);
      if (!updatedEmployee) {
        return next(new HttpError(404, "Employee not found"));
      }
      const changedFields = Object.keys(updates);
      if (changedFields.length > 0) {
        const documentFields = new Set([
          "visaNumber",
          "visaType",
          "visaIssueDate",
          "visaExpiryDate",
          "visaAlertDays",
          "civilId",
          "civilIdIssueDate",
          "civilIdExpiryDate",
          "civilIdAlertDays",
          "passportNumber",
          "passportIssueDate",
          "passportExpiryDate",
          "passportAlertDays",
          "visaImage",
          "civilIdImage",
          "passportImage",
        ]);
        const isDocumentUpdate = changedFields.some(field => documentFields.has(field));
        const event: InsertEmployeeEvent = {
          employeeId: updatedEmployee.id,
          eventType: isDocumentUpdate ? "document_update" : "employee_update",
          title: isDocumentUpdate
            ? `Document update for ${updatedEmployee.firstName} ${updatedEmployee.lastName}`
            : `Employee update for ${updatedEmployee.firstName} ${updatedEmployee.lastName}`,
          description: `Modified fields: ${changedFields.join(", ")}`,
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          addedBy: (req.user as any)?.id,
        };
        await storage.createEmployeeEvent(event);
      }

      res.json(updatedEmployee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid employee data", error.errors));
      }
      next(new HttpError(500, "Failed to update employee"));
    }
  });

  app.delete("/api/employees/:id", async (req, res, next) => {
    try {
      const deleted = await storage.deleteEmployee(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Employee not found"));
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete employee"));
    }
  });

  // Dashboard stats route
  app.get("/api/dashboard/stats", async (req, res, next) => {
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
      next(new HttpError(500, "Failed to fetch dashboard stats"));
    }
  });

  // Vacation request routes
  app.get("/api/vacations", async (req, res, next) => {
    try {
      const vacationRequests = await storage.getVacationRequests();
      res.json(vacationRequests);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch vacation requests"));
    }
  });

  app.get("/api/vacations/:id", async (req, res, next) => {
    try {
      const vacationRequest = await storage.getVacationRequest(req.params.id);
      if (!vacationRequest) {
        return next(new HttpError(404, "Vacation request not found"));
      }
      res.json(vacationRequest);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch vacation request"));
    }
  });

  app.post("/api/vacations", async (req, res, next) => {
    try {
      const vacationRequest = insertVacationRequestSchema.parse(req.body);
      const newVacationRequest = await storage.createVacationRequest(vacationRequest);
      res.status(201).json(newVacationRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid vacation request data", error.errors));
      }
      next(new HttpError(500, "Failed to create vacation request"));
    }
  });

  app.put("/api/vacations/:id", async (req, res, next) => {
    try {
      const updates = insertVacationRequestSchema.partial().parse(req.body);
      const updatedVacationRequest = await storage.updateVacationRequest(req.params.id, updates);
      if (!updatedVacationRequest) {
        return next(new HttpError(404, "Vacation request not found"));
      }
      res.json(updatedVacationRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid vacation request data", error.errors));
      }
      next(new HttpError(500, "Failed to update vacation request"));
    }
  });

  app.delete("/api/vacations/:id", async (req, res, next) => {
    try {
      const deleted = await storage.deleteVacationRequest(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Vacation request not found"));
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete vacation request"));
    }
  });

  // Asset routes
  app.get("/api/assets", async (req, res, next) => {
    try {
      const assets = await assetService.getAssets();
      res.json(assets);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch assets"));
    }
  });

  app.get("/api/assets/:id", async (req, res, next) => {
    try {
      const asset = await assetService.getAsset(req.params.id);
      if (!asset) {
        return next(new HttpError(404, "Asset not found"));
      }
      res.json(asset);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch asset"));
    }
  });

  app.post("/api/assets", async (req, res, next) => {
    try {
      const asset = insertAssetSchema.parse(req.body);
      const newAsset = await assetService.createAsset(asset);
      res.status(201).json(newAsset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid asset data", error.errors));
      }
      next(new HttpError(500, "Failed to create asset"));
    }
  });

  app.put("/api/assets/:id", async (req, res, next) => {
    try {
      const updates = insertAssetSchema.partial().parse(req.body);
      const updated = await assetService.updateAsset(req.params.id, updates);
      if (!updated) {
        return next(new HttpError(404, "Asset not found"));
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid asset data", error.errors));
      }
      next(new HttpError(500, "Failed to update asset"));
    }
  });

  app.delete("/api/assets/:id", async (req, res, next) => {
    try {
      const deleted = await assetService.deleteAsset(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Asset not found"));
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete asset"));
    }
  });

  // Asset assignment routes
  app.get("/api/asset-assignments", async (req, res, next) => {
    try {
      const assignments = await assetService.getAssignments();
      res.json(assignments);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch asset assignments"));
    }
  });

  app.get("/api/asset-assignments/:id", async (req, res, next) => {
    try {
      const assignment = await assetService.getAssignment(req.params.id);
      if (!assignment) {
        return next(new HttpError(404, "Asset assignment not found"));
      }
      res.json(assignment);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch asset assignment"));
    }
  });

  app.post("/api/asset-assignments", async (req, res, next) => {
    try {
      const assignment = insertAssetAssignmentSchema.parse(req.body);
      const newAssignment = await assetService.createAssignment(assignment);
      const detailed = await assetService.getAssignment(newAssignment.id);
      if (detailed?.asset?.type === "car") {
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "fleet_assignment",
          title: `Assigned vehicle ${detailed.asset?.name ?? ""}`.trim(),
          description: `Assigned vehicle ${detailed.asset?.name ?? ""} to ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          addedBy: (req.user as any)?.id,
        };
        await storage.createEmployeeEvent(event);
      }
      res.status(201).json(newAssignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid asset assignment data", error.errors));
      }
      next(new HttpError(500, "Failed to create asset assignment"));
    }
  });

  app.put("/api/asset-assignments/:id", async (req, res, next) => {
    try {
      const updates = insertAssetAssignmentSchema.partial().parse(req.body);
      const updated = await assetService.updateAssignment(req.params.id, updates);
      if (!updated) {
        return next(new HttpError(404, "Asset assignment not found"));
      }
      const detailed = await assetService.getAssignment(req.params.id);
      if (detailed?.asset?.type === "car") {
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "fleet_update",
          title: `Updated assignment for vehicle ${detailed.asset?.name ?? ""}`.trim(),
          description: `Updated vehicle ${detailed.asset?.name ?? ""} assignment for ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          addedBy: (req.user as any)?.id,
        };
        await storage.createEmployeeEvent(event);
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid asset assignment data", error.errors));
      }
      next(new HttpError(500, "Failed to update asset assignment"));
    }
  });

  app.delete("/api/asset-assignments/:id", async (req, res, next) => {
    try {
      const existing = await assetService.getAssignment(req.params.id);
      const deleted = await assetService.deleteAssignment(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Asset assignment not found"));
      }
      if (existing?.asset?.type === "car") {
        const event: InsertEmployeeEvent = {
          employeeId: existing.employeeId,
          eventType: "fleet_removal",
          title: `Removed vehicle ${existing.asset?.name ?? ""} assignment`.trim(),
          description: `Removed vehicle ${existing.asset?.name ?? ""} from ${existing.employee?.firstName ?? ""} ${existing.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          addedBy: (req.user as any)?.id,
        };
        await storage.createEmployeeEvent(event);
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete asset assignment"));
    }
  });

  // Car assignment routes (using asset service)
  app.get("/api/car-assignments", async (req, res, next) => {
    try {
      const assignments = await assetService.getAssignments();
      res.json(assignments.filter(a => a.asset?.type === "car"));
    } catch (error) {
      next(new HttpError(500, "Failed to fetch car assignments"));
    }
  });

  app.get("/api/car-assignments/:id", async (req, res, next) => {
    try {
      const assignment = await assetService.getAssignment(req.params.id);
      if (!assignment || assignment.asset?.type !== "car") {
        return next(new HttpError(404, "Car assignment not found"));
      }
      res.json(assignment);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch car assignment"));
    }
  });

  app.post("/api/car-assignments", async (req, res, next) => {
    try {
      const assignment = insertAssetAssignmentSchema.parse({
        ...req.body,
        assetId: req.body.carId,
      });
      const newAssignment = await assetService.createAssignment(assignment);
      const detailed = await assetService.getAssignment(newAssignment.id);
      if (detailed) {
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "fleet_assignment",
          title: `Assigned vehicle ${detailed.asset?.name ?? ""}`.trim(),
          description: `Assigned vehicle ${detailed.asset?.name ?? ""} to ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          addedBy: (req.user as any)?.id,
        };
        await storage.createEmployeeEvent(event);
      }
      res.status(201).json(newAssignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid car assignment data", error.errors));
      }
      next(new HttpError(500, "Failed to create car assignment"));
    }
  });

  app.put("/api/car-assignments/:id", async (req, res, next) => {
    try {
      const updates = insertAssetAssignmentSchema.partial().parse({
        ...req.body,
        assetId: req.body.carId,
      });
      const updated = await assetService.updateAssignment(req.params.id, updates);
      if (!updated) {
        return next(new HttpError(404, "Car assignment not found"));
      }
      const detailed = await assetService.getAssignment(req.params.id);
      if (detailed) {
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "fleet_update",
          title: `Updated assignment for vehicle ${detailed.asset?.name ?? ""}`.trim(),
          description: `Updated vehicle ${detailed.asset?.name ?? ""} assignment for ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          addedBy: (req.user as any)?.id,
        };
        await storage.createEmployeeEvent(event);
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid car assignment data", error.errors));
      }
      next(new HttpError(500, "Failed to update car assignment"));
    }
  });

  app.delete("/api/car-assignments/:id", async (req, res, next) => {
    try {
      const existing = await assetService.getAssignment(req.params.id);
      const deleted = await assetService.deleteAssignment(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Car assignment not found"));
      }
      if (existing) {
        const event: InsertEmployeeEvent = {
          employeeId: existing.employeeId,
          eventType: "fleet_removal",
          title: `Removed vehicle ${existing.asset?.name ?? ""} assignment`.trim(),
          description: `Removed vehicle ${existing.asset?.name ?? ""} from ${existing.employee?.firstName ?? ""} ${existing.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          addedBy: (req.user as any)?.id,
        };
        await storage.createEmployeeEvent(event);
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete car assignment"));
    }
  });

  // Notification routes
  app.get("/api/notifications", async (req, res, next) => {
    try {
      const notifications = await storage.getNotifications();
      res.json(notifications);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch notifications"));
    }
  });

  app.get("/api/notifications/unread", async (req, res, next) => {
    try {
      const notifications = await storage.getUnreadNotifications();
      res.json(notifications);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch unread notifications"));
    }
  });

  app.post("/api/notifications", async (req, res, next) => {
    try {
      const notification = insertNotificationSchema.parse(req.body);
      const newNotification = await storage.createNotification(notification);
      res.status(201).json(newNotification);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid notification data", error.errors));
      }
      next(new HttpError(500, "Failed to create notification"));
    }
  });

  app.put("/api/notifications/:id/read", async (req, res, next) => {
    try {
      const marked = await storage.markNotificationAsRead(req.params.id);
      if (!marked) {
        return next(new HttpError(404, "Notification not found"));
      }
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      next(new HttpError(500, "Failed to mark notification as read"));
    }
  });

  app.delete("/api/notifications/:id", async (req, res, next) => {
    try {
      const deleted = await storage.deleteNotification(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Notification not found"));
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete notification"));
    }
  });

  // Document expiry tracking routes
  app.get("/api/documents/expiry-check", async (req, res, next) => {
    try {
      const expiryChecks = await storage.checkDocumentExpiries();
      res.json(expiryChecks);
    } catch (error) {
      next(new HttpError(500, "Failed to check document expiries"));
    }
  });

  app.post("/api/documents/send-alerts", async (req, res, next) => {
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
      next(new HttpError(500, "Failed to send document expiry alerts"));
    }
  });

  // Email alerts routes
  app.get("/api/email-alerts", async (req, res, next) => {
    try {
      const alerts = await storage.getEmailAlerts();
      res.json(alerts);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch email alerts"));
    }
  });

  // Employee events routes
  app.get("/api/employee-events", async (req, res, next) => {
    try {
      const events = await storage.getEmployeeEvents();
      res.json(events);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch employee events"));
    }
  });

  app.get("/api/employee-events/:id", async (req, res, next) => {
    try {
      const event = await storage.getEmployeeEvent(req.params.id);
      if (!event) {
        return next(new HttpError(404, "Employee event not found"));
      }
      res.json(event);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch employee event"));
    }
  });

  app.post("/api/employee-events", async (req, res, next) => {
    try {
      const event = insertEmployeeEventSchema.parse(req.body);
      const newEvent = await storage.createEmployeeEvent(event);
      res.status(201).json(newEvent);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid employee event data", error.errors));
      }
      next(new HttpError(500, "Failed to create employee event"));
    }
  });

  app.put("/api/employee-events/:id", async (req, res, next) => {
    try {
      const updates = insertEmployeeEventSchema.partial().parse(req.body);
      const updatedEvent = await storage.updateEmployeeEvent(req.params.id, updates);
      if (!updatedEvent) {
        return next(new HttpError(404, "Employee event not found"));
      }
      res.json(updatedEvent);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid employee event data", error.errors));
      }
      next(new HttpError(500, "Failed to update employee event"));
    }
  });

  app.delete("/api/employee-events/:id", async (req, res, next) => {
    try {
      const deleted = await storage.deleteEmployeeEvent(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Employee event not found"));
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete employee event"));
    }
  });

  // Employee report route
  app.get("/api/reports/employees/:id", async (req, res, next) => {
    const querySchema = z.object({
      startDate: z
        .string()
        .refine((d) => !isNaN(Date.parse(d)), { message: "Invalid startDate" }),
      endDate: z
        .string()
        .refine((d) => !isNaN(Date.parse(d)), { message: "Invalid endDate" }),
      groupBy: z.enum(["month", "year"]).optional().default("month"),
    });

    try {
      const { startDate, endDate, groupBy } = querySchema.parse(req.query);
      const report = await storage.getEmployeeReport(req.params.id, {
        startDate,
        endDate,
        groupBy,
      });

      const response = report.map((period) => {
        const bonuses =
          period.payrollEntries.reduce(
            (sum, e) => sum + Number(e.bonusAmount || 0),
            0
          ) +
          period.employeeEvents
            .filter((e) => e.eventType === "bonus")
            .reduce((s, e) => s + Number(e.amount || 0), 0);

        const deductions =
          period.payrollEntries.reduce(
            (sum, e) =>
              sum +
              Number(e.taxDeduction || 0) +
              Number(e.socialSecurityDeduction || 0) +
              Number(e.healthInsuranceDeduction || 0) +
              Number(e.loanDeduction || 0) +
              Number(e.otherDeductions || 0),
            0
          ) +
          period.employeeEvents
            .filter((e) => e.eventType === "deduction" || e.eventType === "penalty")
            .reduce((s, e) => s + Number(e.amount || 0), 0) +
          period.loans.reduce((s, l) => s + Number(l.monthlyDeduction || 0), 0);

        const netPay = period.payrollEntries.reduce(
          (sum, e) => sum + Number(e.netPay || 0),
          0
        );

        return {
          period: period.period,
          totals: {
            bonuses,
            deductions,
            netPay,
          },
          payrollEntries: period.payrollEntries,
          employeeEvents: period.employeeEvents,
          loans: period.loans,
          vacationRequests: period.vacationRequests,
        };
      });

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid query parameters", error.errors));
      }
      next(new HttpError(500, "Failed to fetch employee report"));
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
