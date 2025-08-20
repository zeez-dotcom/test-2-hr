import type { Express, Request, Response, NextFunction } from "express";
import { HttpError } from "./errorHandler";
import passport from "passport";
import { createServer, type Server } from "http";
import { storage, DuplicateEmployeeCodeError } from "./storage";
import { assetService } from "./assetService";
import {
  insertDepartmentSchema,
  insertCompanySchema,
  insertEmployeeSchema,
  insertVacationRequestSchema,
  insertAssetSchema,
  insertAssetAssignmentSchema,
  insertCarSchema,
  insertCarAssignmentSchema,
  insertNotificationSchema,
  insertEmailAlertSchema,
  insertEmployeeEventSchema,
  type InsertEmployeeEvent,
  type InsertEmployee,
  type InsertCar,
  type InsertCarAssignment
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
import {
  emptyToUndef,
  parseNumber,
  parseBoolean,
  parseDateToISO,
  normalizeBigId,
  mapHeader,
} from "./utils/normalize";

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

  // Company routes
  app.get("/api/companies", async (_req, res, next) => {
    try {
      const companies = await storage.getCompanies();
      res.json(companies);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch companies"));
    }
  });

  app.get("/api/companies/:id", async (req, res, next) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return next(new HttpError(404, "Company not found"));
      }
      res.json(company);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch company"));
    }
  });

  app.post("/api/companies", async (req, res, next) => {
    try {
      const company = insertCompanySchema.parse(req.body);
      const newCompany = await storage.createCompany(company);
      res.status(201).json(newCompany);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid company data", error.errors));
      }
      next(new HttpError(500, "Failed to create company"));
    }
  });

  app.put("/api/companies/:id", async (req, res, next) => {
    try {
      const updates = insertCompanySchema.partial().parse(req.body);
      const updatedCompany = await storage.updateCompany(req.params.id, updates);
      if (!updatedCompany) {
        return next(new HttpError(404, "Company not found"));
      }
      res.json(updatedCompany);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid company data", error.errors));
      }
      next(new HttpError(500, "Failed to update company"));
    }
  });

  app.delete("/api/companies/:id", async (req, res, next) => {
    try {
      const deleted = await storage.deleteCompany(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Company not found"));
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete company"));
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

  app.get("/api/employees/import/template", (_req, res) => {
    const headers = [
      "id/معرف",
      "English Name/اسم الانجليزي",
      "Image URL/رابط الصورة",
      "Arabic Name/اسم المؤظف",
      "Job Title/لقب",
      "Work Location/مكان العمل",
      "Nationality/الجنسية",
      "Profession/المهنة",
      "Employment Date/تاريخ التوظيف",
      "Status/الحالة",
      "Civil ID Number/رقم البطاقة المدنية",
      "civil id issue date",
      "Civil ID Expiry Date/تاريخ انتهاء البطاقة المدنية",
      "Passport Number/رقم جواز السفر",
      "Passport Issue Date/تاريخ اصدار جواز السفر",
      "Passport Expiry Date/تاريخ انتهاء جواز السفر",
      "Salaries/رواتب",
      "loans",
      "Transferable/تحويل",
      "Payment Method/طريقة الدفع",
      "Documents/مستندات or izenamal",
      "Days Worked/أيام العمل",
      "phonenumber",
      "civil id pic",
      "passport pic",
      "driving license",
      "driving license issue date",
      "driving license expiry date",
      "other docs",
      "iban",
      "SWIFTCODE",
      "residency name",
      "residency on company or not",
      "profession department",
      "profession code",
      "profession category",
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="employee-import-template.xlsx"'
    );
    res.send(buffer);
  });

  const employeeSchema = insertEmployeeSchema.extend({
    status: z.preprocess(v => emptyToUndef(v)?.toLowerCase(),
      z.enum(["active", "on_leave", "resigned"]).optional()),
    paymentMethod: z.preprocess(v => emptyToUndef(v)?.toLowerCase(),
      z.enum(["bank", "cash", "link"]).optional()),
  });

  app.post("/api/employees/import", upload.single("file"), async (req, res, next) => {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return next(new HttpError(400, "No file uploaded"));
    }
    try {
      const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || []) as string[];
      const mappingRaw = (req.body as any)?.mapping;
      if (!mappingRaw) {
        const auto: Record<string, string> = {};
        for (const h of headerRow) {
          const m = mapHeader(h);
          if (m) auto[h] = m;
        }
        return res.json({ headers: headerRow, mapping: auto });
      }

      let mapping: Record<string, string>;
      try {
        mapping = JSON.parse(mappingRaw);
      } catch {
        return next(new HttpError(400, "Invalid mapping JSON"));
      }

      for (const source of Object.keys(mapping)) {
        if (!headerRow.includes(source)) {
          return next(new HttpError(400, `Column '${source}' not found in uploaded file`));
        }
      }

      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
        raw: false,
        defval: null,
      });

      const employeeFieldKeys = new Set(Object.keys(insertEmployeeSchema.shape));
      const mappingTargets = Object.values(mapping);
      const hasFullNameOnly =
        mappingTargets.includes("fullName") &&
        !mappingTargets.includes("firstName") &&
        !mappingTargets.includes("lastName");
      const excludeTargets = new Set(["englishName"]);
      if (hasFullNameOnly) excludeTargets.add("fullName");
      const customFieldNames = new Set(
        mappingTargets.filter(
          k => !employeeFieldKeys.has(k) && !excludeTargets.has(k)
        )
      );
      const fieldMap = new Map<string, any>();
      if (customFieldNames.size > 0) {
        const existingFields = await storage.getEmployeeCustomFields();
        for (const f of existingFields) fieldMap.set(f.name, f);
        for (const name of Array.from(customFieldNames)) {
          if (!fieldMap.has(name)) {
            const created = await storage.createEmployeeCustomField({ name });
            fieldMap.set(name, created);
          }
        }
      }

      const existing = await storage.getEmployees();
      const existingCodes = new Set(existing.map(e => e.employeeCode));
      const valid: InsertEmployee[] = [];
      const customValues: Record<string, any>[] = [];
      const errors: { row: number; column: string; value: any; reason: string }[] = [];
      const seen = new Set<string>();

      rows.forEach((row, idx) => {
        const base: Record<string, any> = {};
        const custom: Record<string, any> = {};
        for (const [source, target] of Object.entries(mapping)) {
          const raw = row[source];
          if (target === "englishName" || (hasFullNameOnly && target === "fullName")) {
            if (typeof raw === "string") {
              const parts = raw.trim().split(/\s+/);
              base.firstName = parts.shift() || "";
              base.lastName = parts.join(" ");
            }
            continue;
          }
          if (employeeFieldKeys.has(target)) base[target] = raw;
          else custom[target] = raw;
        }

        base.employeeCode = base.employeeCode
          ? String(base.employeeCode).trim()
          : undefined;
        const code = base.employeeCode as string | undefined;
        if (!code) {
          errors.push({ row: idx + 2, column: "employeeCode", value: "", reason: "Missing employeeCode" });
          return;
        }
        if (seen.has(code) || existingCodes.has(code)) {
          errors.push({ row: idx + 2, column: "employeeCode", value: code, reason: "Duplicate employeeCode" });
          return;
        }
        seen.add(code);

        const dateFields = [
          "startDate",
          "civilIdIssueDate",
          "civilIdExpiryDate",
          "passportIssueDate",
          "passportExpiryDate",
          "drivingLicenseExpiryDate",
          "visaIssueDate",
          "visaExpiryDate",
          "dateOfBirth",
          "vacationReturnDate",
        ];
        for (const f of dateFields) if (f in base) base[f] = parseDateToISO(base[f]);

        const numberFields = [
          "salary",
          "additions",
          "salaryDeductions",
          "fines",
          "bonuses",
          "totalLoans",
          "loans",
        ];
        for (const f of numberFields) if (f in base) base[f] = parseNumber(base[f]);

        const booleanFields = ["transferable", "residencyOnCompany"];
        for (const f of booleanFields) if (f in base) base[f] = parseBoolean(base[f]);

        if ("civilId" in base) base.civilId = normalizeBigId(base.civilId);
        if ("passportNumber" in base) base.passportNumber = normalizeBigId(base.passportNumber);
        if ("iban" in base) base.iban = emptyToUndef(base.iban)?.replace(/\s+/g, "").toUpperCase();
        if ("phone" in base) base.phone = emptyToUndef(base.phone) ? String(emptyToUndef(base.phone)) : undefined;
        if ("status" in base) {
          const val = String(base.status || "").toLowerCase();
          const smap: Record<string, string> = {
            active: "active",
            "نشط": "active",
            "on-vacation": "on_leave",
            "on vacation": "on_leave",
            "في اجازة": "on_leave",
            "في إجازة": "on_leave",
            resigned: "resigned",
            "استقال": "resigned",
          };
          base.status = smap[val] || "active";
        }
        if ("paymentMethod" in base) {
          const val = String(base.paymentMethod || "").toLowerCase();
          const pmap: Record<string, string> = {
            bank: "bank",
            cash: "cash",
            link: "link",
          };
          base.paymentMethod = pmap[val];
        }

        const cleanedBase = Object.fromEntries(
          Object.entries(base).filter(([_, v]) => v !== undefined)
        );
        try {
          const emp = employeeSchema.parse(cleanedBase);
          valid.push(emp as InsertEmployee);
          customValues.push(custom);
        } catch (err) {
          if (err instanceof z.ZodError) {
            for (const issue of err.issues) {
              errors.push({
                row: idx + 2,
                column: issue.path.join("."),
                value: (cleanedBase as any)[issue.path[0]],
                reason: issue.message,
              });
            }
          } else {
            errors.push({ row: idx + 2, column: "unknown", value: "", reason: "Invalid data" });
          }
        }
      });

      const { success, failed: insertFailed, employees: inserted } =
        await storage.createEmployeesBulk(valid);

      if (inserted && fieldMap.size > 0) {
        for (let i = 0; i < inserted.length; i++) {
          const emp = inserted[i];
          const custom = customValues[i] || {};
          for (const [key, value] of Object.entries(custom)) {
            const field = fieldMap.get(key);
            const val = emptyToUndef(value);
            if (field && val !== undefined) {
              await storage.createEmployeeCustomValue({
                employeeId: emp.id,
                fieldId: field.id,
                value: String(val),
              });
            }
          }
        }
      }

      res.json({ success, failed: errors.length + insertFailed, errors });
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
      const parsed = employeeSchema.parse(req.body);
      const employee: any = Object.fromEntries(
        Object.entries(parsed).filter(([_, v]) => v !== undefined)
      );
      if (!employee.employeeCode?.trim()) {
        delete employee.employeeCode;
      } else {
        employee.employeeCode = employee.employeeCode.trim();
      }

      const newEmployee = await storage.createEmployee({
        ...employee,
        role: employee.role || "employee",
      });
      res.status(201).json(newEmployee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid employee data", error.errors));
      }
      // Surface duplicate employee code errors as a 409 conflict
      if (
        error instanceof DuplicateEmployeeCodeError ||
        (error as any)?.code === "23505"
      ) {
        return next(new HttpError(409, "Employee code already exists"));
      }
      console.error("Failed to create employee:", error);
      return next(
        new HttpError(
          500,
          "Failed to create employee",
          error instanceof Error ? error.message : error,
        ),
      );
    }
  });

  app.put("/api/employees/:id", async (req, res, next) => {
    try {
      if ("employeeCode" in req.body) {
        return next(new HttpError(400, "Employee code cannot be updated"));
      }
      const parsed = employeeSchema
        .omit({ employeeCode: true })
        .partial()
        .parse(req.body) as any;
      const updates: any = Object.fromEntries(
        Object.entries(parsed).filter(([_, v]) => v !== undefined)
      );
      const updatedEmployee = await storage.updateEmployee(
        req.params.id,
        updates,
      );
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
          "drivingLicenseNumber",
          "drivingLicenseIssueDate",
          "drivingLicenseExpiryDate",
          "drivingLicenseImage",
          "otherDocs",
          "additionalDocs",
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

  app.get("/api/cars/import/template", (_req, res) => {
    const headers = [
      "Serial",
      "emp",
      "Driver",
      "Company",
      "Registration Book in Name of",
      "Car Model",
      "Plate Number",
      "Registration Expiry Date",
      "Notes",
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cars");
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="car-import-template.xlsx"'
    );
    res.send(buffer);
  });

  app.post(
    "/api/cars/import",
    upload.single("file"),
    async (req, res, next) => {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        return next(new HttpError(400, "No file uploaded"));
      }
      try {
        const workbook = XLSX.read(file.buffer, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || []) as string[];

        const mappingRaw = (req.body as any)?.mapping;
        if (!mappingRaw) {
          return res.json({ headers: headerRow });
        }

        let mapping: Record<string, string>;
        try {
          mapping = JSON.parse(mappingRaw);
        } catch {
          return next(new HttpError(400, "Invalid mapping JSON"));
        }

        const carFieldKeys = new Set(Object.keys(insertCarSchema.shape));
        const assignmentFieldKeys = new Set(Object.keys(insertCarAssignmentSchema.shape));
        assignmentFieldKeys.add("employeeCode");

        for (const target of Object.values(mapping)) {
          if (!carFieldKeys.has(target) && !assignmentFieldKeys.has(target)) {
            return next(new HttpError(400, `Unknown field '${target}' in mapping`));
          }
        }

        const requiredFields = ["plateNumber", "model"];
        const mappedFields = new Set(Object.values(mapping));
        const missingMappings = requiredFields.filter(f => !mappedFields.has(f));
        if (missingMappings.length > 0) {
          return next(
            new HttpError(
              400,
              `Missing mapping for required fields: ${missingMappings.join(", ")}`
            )
          );
        }

        for (const source of Object.keys(mapping)) {
          if (!headerRow.includes(source)) {
            return next(
              new HttpError(400, `Column '${source}' not found in uploaded file`)
            );
          }
        }

        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);
        const existingCars = await storage.getCars();
        const carMap = new Map<string, InsertCar & { id: string; currentAssignment?: any }>();
        for (const car of existingCars) {
          carMap.set(car.plateNumber, car as any);
        }

        const needEmployees = mappedFields.has("employeeId") || mappedFields.has("employeeCode");
        let employeeMap = new Map<string, string>();
        if (needEmployees) {
          const employees = await storage.getEmployees();
          for (const emp of employees) {
            employeeMap.set(emp.employeeCode, emp.id);
          }
        }

        let success = 0;
        let failed = 0;
        for (const row of rows) {
          const translated: Record<string, any> = {};
          for (const [source, target] of Object.entries(mapping)) {
            translated[target] = row[source];
          }

          const carData: Record<string, any> = {};
          const assignData: Record<string, any> = {};
          for (const [key, value] of Object.entries(translated)) {
            if (carFieldKeys.has(key)) carData[key] = value;
            else if (assignmentFieldKeys.has(key)) assignData[key] = value;
          }

          carData.make = carData.make || "Unknown";
          carData.year = carData.year ? Number(carData.year) : new Date().getFullYear();
          const plate = carData.plateNumber as string | undefined;
          if (!plate) {
            failed++;
            continue;
          }

          try {
            const parsedCar = insertCarSchema.parse(carData);
            let car = carMap.get(plate);
            if (car) {
              await storage.updateCar(car.id, parsedCar);
            } else {
              const created = await storage.createCar(parsedCar);
              car = { ...created } as any;
              carMap.set(plate, car!);
            }

            if (assignData.employeeId || assignData.employeeCode) {
              let employeeId = assignData.employeeId as string | undefined;
              if (!employeeId && assignData.employeeCode) {
                employeeId = employeeMap.get(String(assignData.employeeCode));
              }
              if (employeeId) {
                const current = (car as any).currentAssignment;
                if (!current || current.employeeId !== employeeId) {
                  await storage.createCarAssignment({
                    carId: car!.id,
                    employeeId,
                    assignedDate: new Date().toISOString().split("T")[0],
                    status: "active",
                    notes: assignData.notes ? String(assignData.notes) : undefined,
                  });
                }
              }
            }

            success++;
          } catch {
            failed++;
          }
        }

        res.json({ success, failed });
      } catch {
        next(new HttpError(500, "Failed to import cars"));
      }
    }
  );

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
