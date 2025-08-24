import { Router, type Request, type Response, type NextFunction } from "express";
import { HttpError } from "../errorHandler";
import { storage, DuplicateEmployeeCodeError } from "../storage";
import { assetService } from "../assetService";
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
  type InsertCarAssignment,
} from "@shared/schema";
import {
  sendEmail,
  generateExpiryWarningEmail,
  calculateDaysUntilExpiry,
  shouldSendAlert,
} from "../emailService";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
import type Sharp from "sharp";
import {
  emptyToUndef,
  parseNumber,
  parseBoolean,
  parseDateToISO,
  normalizeBigId,
  mapHeader,
} from "../utils/normalize";
import { requireRole } from "./auth";

export const employeesRouter = Router();

let sharp: typeof Sharp | null = null;
(async () => {
  try {
    const mod = await import("sharp");
    sharp = mod.default;
  } catch (err) {
    console.error(
      'Failed to import "sharp". Image optimization will be disabled. ' +
        'Ensure the sharp package and its native dependencies are installed.',
      err,
    );
  }
})();

const IMAGE_FIELDS = [
  "profileImage",
  "visaImage",
  "civilIdImage",
  "passportImage",
  "drivingLicenseImage",
  "otherDocs",
  "additionalDocs",
];

async function optimizeImages(data: Record<string, any>) {
  if (!sharp) return;
  const MAX_DIMENSION = 1024;
  const MAX_SIZE = 200 * 1024; // 200KB
  const MAX_PDF_SIZE = 5 * 1024 * 1024; // 5MB

  for (const field of IMAGE_FIELDS) {
    try {
      const value = data[field];
      if (!value || typeof value !== "string") continue;

      const match = value.match(/^data:(.*?);base64,(.*)$/);
      if (!match) {
        throw new HttpError(400, `Invalid image data for ${field}`);
      }
      const mime = match[1];
      const base64Data = match[2];

      if (mime === "application/pdf") {
        const pdfSize = Buffer.from(base64Data, "base64").length;
        if (pdfSize > MAX_PDF_SIZE) {
          console.warn(`${field} PDF exceeds ${MAX_PDF_SIZE} bytes`);
        }
        continue;
      }

      if (!mime.startsWith("image/")) {
        throw new HttpError(400, `Unsupported mime type for ${field}`);
      }

      const buffer = Buffer.from(base64Data, "base64");
      const image = sharp(buffer);
      const metadata = await image.metadata();
      const needsResize =
        (metadata.width ?? 0) > MAX_DIMENSION ||
        (metadata.height ?? 0) > MAX_DIMENSION;
      const needsCompress = buffer.length > MAX_SIZE;
      if (!needsResize && !needsCompress) continue;
      let pipeline = image;
      if (needsResize) {
        pipeline = pipeline.resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: "inside",
          withoutEnlargement: true,
        });
      }
      const optimized = await pipeline.jpeg({ quality: 80 }).toBuffer();
      data[field] = `data:image/jpeg;base64,${optimized.toString("base64")}`;
    } catch (err) {
      console.warn(`Failed to optimize ${field}:`, err);
      if (err instanceof HttpError) {
        throw err;
      }
      throw new HttpError(400, `Invalid image data for ${field}`);
    }
  }
}

async function getAddedBy(req: Request): Promise<string | undefined> {
  const addedById = (req.user as any)?.employeeId;
  if (!addedById) return undefined;
  const existing = await storage.getEmployee(addedById);
  return existing ? addedById : undefined;
}

const upload = multer({ storage: multer.memoryStorage() });

  // Department routes
  employeesRouter.get("/api/departments", async (req, res, next) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch departments"));
    }
  });

  employeesRouter.get("/api/departments/:id", async (req, res, next) => {
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

  employeesRouter.post("/api/departments", async (req, res, next) => {
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

  employeesRouter.put("/api/departments/:id", async (req, res, next) => {
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

  employeesRouter.delete("/api/departments/:id", async (req, res, next) => {
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
  employeesRouter.get("/api/companies", async (_req, res, next) => {
    try {
      const companies = await storage.getCompanies();
      res.json(companies);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch companies"));
    }
  });

  employeesRouter.get("/api/companies/:id", async (req, res, next) => {
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

  employeesRouter.post("/api/companies", async (req, res, next) => {
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

  employeesRouter.put("/api/companies/:id", async (req, res, next) => {
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

  employeesRouter.delete("/api/companies/:id", async (req, res, next) => {
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
  employeesRouter.get("/api/employees", async (req, res, next) => {
    try {
      const employees = await storage.getEmployees();
      res.json(employees);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch employees"));
    }
  });

  employeesRouter.get("/api/employees/import/template", (_req, res) => {
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
    status: z.preprocess(v => (emptyToUndef(v) as string | undefined)?.toLowerCase(),
      z.enum(["active", "on_leave", "resigned"]).optional()),
    paymentMethod: z.preprocess(v => (emptyToUndef(v) as string | undefined)?.toLowerCase(),
      z.enum(["bank", "cash", "link"]).optional()),
  });

  employeesRouter.post("/api/employees/import", upload.single("file"), async (req, res, next) => {
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

      const requiredTargets = [
        "firstName",
        "position",
        "salary",
        "startDate",
      ];
      const requiredColumns = Object.entries(mapping).filter(([_, target]) =>
        requiredTargets.includes(target) ||
        target === "fullName" ||
        target === "englishName"
      );
      for (const [source] of requiredColumns) {
        const hasData = rows.some(r => emptyToUndef(r[source]) !== undefined);
        if (!hasData) {
          return next(new HttpError(400, `Column '${source}' is empty`));
        }
      }

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
      const errors: {
        row: number;
        message?: string;
        column?: string;
        value?: unknown;
        reason?: string;
      }[] = [];
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
        if (code) {
          if (seen.has(code) || existingCodes.has(code)) {
            errors.push({ row: idx + 2, message: "Duplicate employeeCode" });
            return;
          }
          seen.add(code);
        }

        function parseField<T>(
          parser: (v: unknown) => T | { value: T; error: string | null },
          value: unknown,
          type: string
        ): { value: T; error: string | null } {
          let parsed: T;
          let error: string | null = null;
          try {
            const result = parser(value as any) as any;
            if (result && typeof result === "object" && "value" in result) {
              parsed = result.value as T;
              error = result.error ?? null;
            } else {
              parsed = result as T;
            }
          } catch (e: any) {
            parsed = undefined as any;
            error = e?.message || `Invalid ${type}`;
          }
          const empty =
            value === undefined ||
            value === null ||
            (typeof value === "string" && value.trim() === "");
          if ((parsed === undefined || parsed === null) && !empty) {
            return { value: parsed, error: error ?? `Invalid ${type}` };
          }
          if (error) return { value: parsed, error };
          return { value: parsed, error: null };
        }

        let parseError = false;

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
        for (const f of dateFields) {
          if (f in base) {
            const original = base[f];
            const { value, error } = parseField(parseDateToISO, original, "date");
            base[f] = value;
            if (error) {
              errors.push({
                row: idx + 2,
                column: f,
                value: original,
                reason: error,
              });
              parseError = true;
            }
          }
        }

        const numberFields = [
          "salary",
          "additions",
          "salaryDeductions",
          "fines",
          "bonuses",
          "totalLoans",
          "loans",
        ];
        for (const f of numberFields) {
          if (f in base) {
            const original = base[f];
            const { value, error } = parseField(parseNumber, original, "number");
            base[f] = value;
            if (error) {
              errors.push({
                row: idx + 2,
                column: f,
                value: original,
                reason: error,
              });
              parseError = true;
            }
          }
        }

        const booleanFields = ["transferable", "residencyOnCompany"];
        for (const f of booleanFields) {
          if (f in base) {
            const original = base[f];
            const { value, error } = parseField(
              parseBoolean,
              original,
              "boolean"
            );
            base[f] = value;
            if (error) {
              errors.push({
                row: idx + 2,
                column: f,
                value: original,
                reason: error,
              });
              parseError = true;
            }
          }
        }

        if (parseError) return;

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
            const message = err.errors.map(i => i.message).join(", ");
            errors.push({ row: idx + 2, message });
          } else {
            errors.push({ row: idx + 2, message: "Invalid data" });
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

      const uniqueErrorRows = new Set(errors.map(e => e.row)).size;
      res.json({ success, failed: uniqueErrorRows + insertFailed, errors });
    } catch {
      next(new HttpError(500, "Failed to import employees"));
    }
  });

  employeesRouter.get("/api/employees/:id", async (req, res, next) => {
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

  employeesRouter.post("/api/employees", async (req, res, next) => {
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

      await optimizeImages(employee);
      const newEmployee = await storage.createEmployee({
        ...employee,
        role: employee.role || "employee",
      });
      res.status(201).json(newEmployee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid employee data", error.errors));
      }
      if (error instanceof HttpError) {
        return next(error);
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

  employeesRouter.put("/api/employees/:id", async (req, res, next) => {
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
      await optimizeImages(updates);
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
        const addedBy = await getAddedBy(req);
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
          ...(addedBy ? { addedBy } : {}),
        };
        await storage.createEmployeeEvent(event);
      }

      res.json(updatedEmployee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid employee data", error.errors));
      }
      if (error instanceof HttpError) {
        return next(error);
      }
      console.error("Failed to update employee:", error);
      next(new HttpError(500, "Failed to update employee"));
    }
  });

  employeesRouter.delete("/api/employees/:id", async (req, res, next) => {
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
  employeesRouter.get("/api/dashboard/stats", async (req, res, next) => {
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
  employeesRouter.get("/api/vacations", async (req, res, next) => {
    try {
      const vacationRequests = await storage.getVacationRequests();
      res.json(vacationRequests);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch vacation requests"));
    }
  });

  employeesRouter.get("/api/vacations/:id", async (req, res, next) => {
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

  employeesRouter.post("/api/vacations", async (req, res, next) => {
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

  employeesRouter.put("/api/vacations/:id", async (req, res, next) => {
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

  employeesRouter.delete("/api/vacations/:id", async (req, res, next) => {
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
  employeesRouter.get("/api/assets", async (req, res, next) => {
    try {
      const assets = await assetService.getAssets();
      res.json(assets);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch assets"));
    }
  });

  employeesRouter.get("/api/assets/:id", async (req, res, next) => {
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

  employeesRouter.post("/api/assets", async (req, res, next) => {
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

  employeesRouter.put("/api/assets/:id", async (req, res, next) => {
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

  employeesRouter.delete(
    "/api/assets/:id",
    requireRole(["admin"]),
    async (req, res, next) => {
      try {
        const deleted = await assetService.deleteAsset(req.params.id);
        if (!deleted) {
          return next(new HttpError(404, "Asset not found"));
        }
        res.status(204).send();
      } catch (error) {
        next(new HttpError(500, "Failed to delete asset"));
      }
    },
  );

  // Asset assignment routes
  employeesRouter.get("/api/asset-assignments", async (req, res, next) => {
    try {
      const assignments = await assetService.getAssignments();
      res.json(assignments);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch asset assignments"));
    }
  });

  employeesRouter.get("/api/asset-assignments/:id", async (req, res, next) => {
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

  employeesRouter.post("/api/asset-assignments", async (req, res, next) => {
    try {
      const assignment = insertAssetAssignmentSchema.parse(req.body);
      const newAssignment = await assetService.createAssignment(assignment);
      await assetService.updateAsset(assignment.assetId, { status: "assigned" });
      const detailed = await assetService.getAssignment(newAssignment.id);
      if (detailed?.asset?.type === "car") {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "fleet_assignment",
          title: `Assigned vehicle ${detailed.asset?.name ?? ""}`.trim(),
          description: `Assigned vehicle ${detailed.asset?.name ?? ""} to ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          ...(addedBy ? { addedBy } : {}),
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

  employeesRouter.put("/api/asset-assignments/:id", async (req, res, next) => {
    try {
      const updates = insertAssetAssignmentSchema.partial().parse(req.body);
      const updated = await assetService.updateAssignment(req.params.id, updates);
      if (!updated) {
        return next(new HttpError(404, "Asset assignment not found"));
      }
      if (updates.status) {
        await assetService.updateAsset(updated.assetId, {
          status: updates.status === "completed" ? "available" : "assigned",
        });
      }
      const detailed = await assetService.getAssignment(req.params.id);
      if (detailed?.asset?.type === "car") {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "fleet_update",
          title: `Updated assignment for vehicle ${detailed.asset?.name ?? ""}`.trim(),
          description: `Updated vehicle ${detailed.asset?.name ?? ""} assignment for ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          ...(addedBy ? { addedBy } : {}),
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

  employeesRouter.delete("/api/asset-assignments/:id", async (req, res, next) => {
    try {
      const existing = await assetService.getAssignment(req.params.id);
      const deleted = await assetService.deleteAssignment(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Asset assignment not found"));
      }
      if (existing) {
        await assetService.updateAsset(existing.assetId, { status: "available" });
      }
      if (existing?.asset?.type === "car") {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: existing.employeeId,
          eventType: "fleet_removal",
          title: `Removed vehicle ${existing.asset?.name ?? ""} assignment`.trim(),
          description: `Removed vehicle ${existing.asset?.name ?? ""} from ${existing.employee?.firstName ?? ""} ${existing.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          ...(addedBy ? { addedBy } : {}),
        };
        await storage.createEmployeeEvent(event);
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete asset assignment"));
    }
  });

  employeesRouter.get("/api/cars/import/template", (_req, res) => {
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

  employeesRouter.post(
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
  employeesRouter.get("/api/car-assignments", async (req, res, next) => {
    try {
      const assignments = await assetService.getAssignments();
      res.json(assignments.filter(a => a.asset?.type === "car"));
    } catch (error) {
      next(new HttpError(500, "Failed to fetch car assignments"));
    }
  });

  employeesRouter.get("/api/car-assignments/:id", async (req, res, next) => {
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

  employeesRouter.post("/api/car-assignments", async (req, res, next) => {
    try {
      const assignment = insertAssetAssignmentSchema.parse({
        ...req.body,
        assetId: req.body.carId,
      });
      const newAssignment = await assetService.createAssignment(assignment);
      await assetService.updateAsset(assignment.assetId, { status: "assigned" });
      const detailed = await assetService.getAssignment(newAssignment.id);
      if (detailed) {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "fleet_assignment",
          title: `Assigned vehicle ${detailed.asset?.name ?? ""}`.trim(),
          description: `Assigned vehicle ${detailed.asset?.name ?? ""} to ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          ...(addedBy ? { addedBy } : {}),
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

  employeesRouter.put("/api/car-assignments/:id", async (req, res, next) => {
    try {
      const updates = insertAssetAssignmentSchema.partial().parse({
        ...req.body,
        assetId: req.body.carId,
      });
      const updated = await assetService.updateAssignment(req.params.id, updates);
      if (!updated) {
        return next(new HttpError(404, "Car assignment not found"));
      }
      if (updates.status) {
        await assetService.updateAsset(updated.assetId, {
          status: updates.status === "completed" ? "available" : "assigned",
        });
      }
      const detailed = await assetService.getAssignment(req.params.id);
      if (detailed) {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "fleet_update",
          title: `Updated assignment for vehicle ${detailed.asset?.name ?? ""}`.trim(),
          description: `Updated vehicle ${detailed.asset?.name ?? ""} assignment for ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          ...(addedBy ? { addedBy } : {}),
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

  employeesRouter.delete("/api/car-assignments/:id", async (req, res, next) => {
    try {
      const existing = await assetService.getAssignment(req.params.id);
      const deleted = await assetService.deleteAssignment(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Car assignment not found"));
      }
      if (existing) {
        await assetService.updateAsset(existing.assetId, { status: "available" });
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: existing.employeeId,
          eventType: "fleet_removal",
          title: `Removed vehicle ${existing.asset?.name ?? ""} assignment`.trim(),
          description: `Removed vehicle ${existing.asset?.name ?? ""} from ${existing.employee?.firstName ?? ""} ${existing.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          ...(addedBy ? { addedBy } : {}),
        };
        await storage.createEmployeeEvent(event);
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete car assignment"));
    }
  });

  // Notification routes
  employeesRouter.get("/api/notifications", async (req, res, next) => {
    try {
      const notifications = await storage.getNotifications();
      res.json(notifications);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch notifications"));
    }
  });

  employeesRouter.get("/api/notifications/unread", async (req, res, next) => {
    try {
      const notifications = await storage.getUnreadNotifications();
      res.json(notifications);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch unread notifications"));
    }
  });

  employeesRouter.post("/api/notifications", async (req, res, next) => {
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

  employeesRouter.put("/api/notifications/:id/read", async (req, res, next) => {
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

  employeesRouter.delete("/api/notifications/:id", async (req, res, next) => {
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
  employeesRouter.get("/api/documents/expiry-check", async (req, res, next) => {
    try {
      const expiryChecks = await storage.checkDocumentExpiries();
      res.json(expiryChecks);
    } catch (error) {
      next(new HttpError(500, "Failed to check document expiries"));
    }
  });

  employeesRouter.post("/api/documents/send-alerts", async (req, res, next) => {
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
  employeesRouter.get("/api/email-alerts", async (req, res, next) => {
    try {
      const alerts = await storage.getEmailAlerts();
      res.json(alerts);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch email alerts"));
    }
  });

  // Employee events routes
  employeesRouter.get("/api/employee-events", async (req, res, next) => {
    try {
      const events = await storage.getEmployeeEvents();
      res.json(events);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch employee events"));
    }
  });

  employeesRouter.get("/api/employee-events/:id", async (req, res, next) => {
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

  employeesRouter.post("/api/employee-events", async (req, res, next) => {
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

  employeesRouter.put("/api/employee-events/:id", async (req, res, next) => {
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

  employeesRouter.delete("/api/employee-events/:id", async (req, res, next) => {
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


