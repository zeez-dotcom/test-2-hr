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
  insertCarSchema,
  insertAssetAssignmentSchema,
  insertCarAssignmentSchema,
  insertNotificationSchema,
  insertEmailAlertSchema,
  insertEmployeeEventSchema,
  insertAttendanceSchema,
  type InsertEmployeeEvent,
  type InsertEmployee,
  type InsertCar,
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

  employeesRouter.post("/api/departments", requireRole(["admin", "hr"]), async (req, res, next) => {
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

  employeesRouter.put("/api/departments/:id", requireRole(["admin", "hr"]), async (req, res, next) => {
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

  employeesRouter.delete("/api/departments/:id", requireRole(["admin", "hr"]), async (req, res, next) => {
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

  // Current company (single-company app)
  employeesRouter.get("/api/company", async (_req, res, next) => {
    try {
      const list = await storage.getCompanies();
      if (list.length === 0) {
        // create default company if none exists
        const created = await storage.createCompany({ name: 'Company' });
        return res.json(created);
      }
      res.json(list[0]);
    } catch (error) {
      next(new HttpError(500, 'Failed to fetch company'));
    }
  });
  employeesRouter.put("/api/company", requireRole(['admin']), async (req, res, next) => {
    try {
      const list = await storage.getCompanies();
      const id = list[0]?.id;
      const data: any = {};
      if (typeof req.body?.name === 'string') data.name = req.body.name;
      if (typeof req.body?.logo === 'string') data.logo = req.body.logo;
      if (typeof req.body?.primaryColor === 'string') data.primaryColor = req.body.primaryColor;
      if (typeof req.body?.secondaryColor === 'string') data.secondaryColor = req.body.secondaryColor;
      if (typeof req.body?.email === 'string') data.email = req.body.email;
      if (typeof req.body?.phone === 'string') data.phone = req.body.phone;
      if (typeof req.body?.website === 'string') data.website = req.body.website;
      if (typeof req.body?.address === 'string') data.address = req.body.address;
      if (!id) {
        const created = await storage.createCompany(data);
        res.json(created);
      } else {
        const updated = await storage.updateCompany(id, data);
        if (!updated) return next(new HttpError(404, 'Company not found'));
        res.json(updated);
      }
    } catch (error) {
      next(new HttpError(500, 'Failed to update company'));
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

  employeesRouter.post("/api/companies", requireRole(["admin"]), async (req, res, next) => {
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

  employeesRouter.put("/api/companies/:id", requireRole(["admin"]), async (req, res, next) => {
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

  employeesRouter.delete("/api/companies/:id", requireRole(["admin"]), async (req, res, next) => {
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
      const basicOnlyRaw = (req.body as any)?.basicOnly;
      const basicOnly =
        typeof basicOnlyRaw === 'string'
          ? ['1','true','yes','on'].includes(basicOnlyRaw.toLowerCase())
          : Boolean(basicOnlyRaw);
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
      const excludeTargets = new Set(["englishName", "loans"]);
      if (hasFullNameOnly) excludeTargets.add("fullName");
      const customFieldNames = new Set(
        mappingTargets.filter(
          k => !employeeFieldKeys.has(k) && !excludeTargets.has(k)
        )
      );
      // If basicOnly, ignore/create no custom fields at all
      if (basicOnly) {
        customFieldNames.clear();
      }
      const fieldMap = new Map<string, any>();
      if (!basicOnly && customFieldNames.size > 0) {
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

      if (inserted && fieldMap.size > 0 && !basicOnly) {
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
      // Log employee creation into events for visibility in Logs
      try {
        const addedBy = await getAddedBy(req);
        await storage.createEmployeeEvent({
          employeeId: newEmployee.id,
          eventType: "employee_added",
          title: "Employee added",
          description: `Employee ${newEmployee.firstName ?? ""} ${newEmployee.lastName ?? ""} added`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          ...(addedBy ? { addedBy } : {}),
        });
      } catch (e) {
        // Non-fatal: creation succeeds even if event logging fails
        console.warn("Failed to log employee creation event", e);
      }
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
      // If approving a vacation, enforce department coverage threshold
      if (updates.status === 'approved') {
        const current = await storage.getVacationRequest(req.params.id);
        if (!current) return next(new HttpError(404, "Vacation request not found"));
        const employee = await storage.getEmployee(current.employeeId);
        if (employee?.departmentId) {
          const start = new Date(current.startDate);
          const end = new Date(current.endDate);
          const allVac = await storage.getVacationRequests(start, end);
          const sameDeptApproved = allVac.filter(v => v.status === 'approved')
            .filter(v => v.employee?.departmentId === employee.departmentId)
            .filter(v => v.id !== current.id);
          const maxOverlap = Number(process.env.COVERAGE_MAX_OVERLAP_PER_DEPT || '999');
          if (sameDeptApproved.length >= maxOverlap) {
            return next(new HttpError(409, "Department coverage conflict: too many overlapping vacations"));
          }
        }
      }
      const before = await storage.getVacationRequest(req.params.id);
      const updatedVacationRequest = await storage.updateVacationRequest(req.params.id, updates);
      if (!updatedVacationRequest) {
        return next(new HttpError(404, "Vacation request not found"));
      }
      // Log events for vacation approvals/returns
      try {
        const after = updatedVacationRequest;
        if (before?.status !== after.status && (after.status === 'approved' || after.status === 'completed')) {
          const employeeId = after.employeeId;
          const title = after.status === 'approved' ? `Vacation approved (${after.startDate} → ${after.endDate})` : `Vacation completed (${after.startDate} → ${after.endDate})`;
          const event: InsertEmployeeEvent = {
            employeeId,
            eventType: 'vacation',
            title,
            description: title,
            amount: '0',
            eventDate: new Date().toISOString().split('T')[0],
            affectsPayroll: true,
          };
          await storage.createEmployeeEvent(event);
        }
      } catch {}
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

  // Asset documents
  employeesRouter.get("/api/assets/:id/documents", async (req, res, next) => {
    try {
      const docs = await storage.getAssetDocuments(req.params.id);
      res.json(docs);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch asset documents"));
    }
  });
  employeesRouter.post("/api/assets/:id/documents", async (req, res, next) => {
    try {
      const { title, description, documentUrl } = req.body as any;
      if (!title || !documentUrl) return next(new HttpError(400, 'title and documentUrl are required'));
      const doc = await storage.createAssetDocument({ assetId: req.params.id, title, description, documentUrl });
      res.status(201).json(doc);
    } catch (error) {
      next(new HttpError(500, "Failed to create asset document"));
    }
  });

  // Asset repairs
  employeesRouter.get("/api/assets/:id/repairs", async (req, res, next) => {
    try {
      const rows = await storage.getAssetRepairs(req.params.id);
      res.json(rows);
    } catch (error) { next(new HttpError(500, 'Failed to fetch asset repairs')); }
  });
  employeesRouter.post("/api/assets/:id/repairs", async (req, res, next) => {
    try {
      const { repairDate, description, cost, vendor, documentUrl } = req.body as any;
      if (!repairDate || !description) return next(new HttpError(400, 'repairDate and description required'));
      const payload: any = { assetId: req.params.id, repairDate, description };
      if (cost !== undefined) payload.cost = cost;
      if (vendor) payload.vendor = vendor;
      if (documentUrl) payload.documentUrl = documentUrl;
      const row = await storage.createAssetRepair(payload);
      res.status(201).json(row);
    } catch (error) { next(new HttpError(500, 'Failed to create repair')); }
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
      const assignments = await storage.getAssetAssignments();
      res.json(assignments);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch asset assignments"));
    }
  });

  employeesRouter.get("/api/asset-assignments/:id", async (req, res, next) => {
    try {
      const assignment = await storage.getAssetAssignment(req.params.id);
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
      const newAssignment = await storage.createAssetAssignment(assignment);
      // ensure the asset reflects its new assignment
      if (newAssignment?.assetId) {
        await storage.updateAsset(newAssignment.assetId, {
          status: "assigned",
        });
      }
      const detailed = await storage.getAssetAssignment(newAssignment.id);
      if (detailed) {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "asset_assignment",
          title: `Assigned ${detailed.asset?.name ?? ""}`.trim(),
          description: `Assigned ${detailed.asset?.name ?? ""} to ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
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
      const updated = await storage.updateAssetAssignment(req.params.id, updates);
      if (!updated) {
        return next(new HttpError(404, "Asset assignment not found"));
      }
      if (updates.status) {
        await storage.updateAsset(updated.assetId, {
          status: updates.status === "completed" ? "available" : "assigned",
        });
      }
      const detailed = await storage.getAssetAssignment(req.params.id);
      if (detailed) {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "asset_update",
          title: `Updated assignment for ${detailed.asset?.name ?? ""}`.trim(),
          description: `Updated ${detailed.asset?.name ?? ""} assignment for ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
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
      const existing = await storage.getAssetAssignment(req.params.id);
      const deleted = await storage.deleteAssetAssignment(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Asset assignment not found"));
      }
      if (existing?.assetId) {
        await storage.updateAsset(existing.assetId, { status: "available" });
      }
      if (existing) {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: existing.employeeId,
          eventType: "asset_removal",
          title: `Removed ${existing.asset?.name ?? ""} assignment`.trim(),
          description: `Removed ${existing.asset?.name ?? ""} from ${existing.employee?.firstName ?? ""} ${existing.employee?.lastName ?? ""}`.trim(),
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

  // Car assignment routes
  employeesRouter.get("/api/car-assignments", async (req, res, next) => {
    try {
      const assignments = await storage.getCarAssignments();
      res.json(assignments);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch car assignments"));
    }
  });

  employeesRouter.get("/api/car-assignments/:id", async (req, res, next) => {
    try {
      const assignment = await storage.getCarAssignment(req.params.id);
      if (!assignment) {
        return next(new HttpError(404, "Car assignment not found"));
      }
      res.json(assignment);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch car assignment"));
    }
  });

  employeesRouter.get(
    "/api/car-assignments/:id/document",
    async (req, res, next) => {
      try {
        const assignment = await storage.getCarAssignment(req.params.id);
        if (!assignment || !assignment.car || !assignment.employee) {
          return next(new HttpError(404, "Car assignment not found"));
        }
        const formatDate = (d?: string | null) =>
          d ? new Date(d).toISOString().split("T")[0] : "N/A";
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Car Assignment</title><style>body{font-family:sans-serif;padding:20px;}h1{text-align:center;}section{margin-bottom:20px;}strong{display:inline-block;width:200px;}a{color:#2563eb;text-decoration:underline;}</style></head><body><h1>Car Assignment</h1><section><strong>Employee:</strong>${assignment.employee.firstName} ${assignment.employee.lastName}<br/><strong>Phone:</strong>${assignment.employee.phone ?? "N/A"}<br/><strong>Driving License:</strong>${assignment.employee.drivingLicenseNumber ?? "N/A"}</section><section><strong>Car:</strong>${assignment.car.year} ${assignment.car.make} ${assignment.car.model}<br/><strong>Plate Number:</strong>${assignment.car.plateNumber}<br/><strong>Registration Owner:</strong>${assignment.car.registrationOwner ?? "N/A"}<br/><strong>Registration Document:</strong>${assignment.car.registrationDocumentImage ? `<a href="${assignment.car.registrationDocumentImage}">View</a>` : "N/A"}</section><section><strong>Assignment Period:</strong>${formatDate(assignment.assignedDate)} - ${assignment.returnDate ? formatDate(assignment.returnDate) : "Ongoing"}</section><script>window.print&&window.print()</script></body></html>`;
        res.setHeader("Content-Type", "text/html").send(html);
      } catch (error) {
        next(
          new HttpError(500, "Failed to generate car assignment document"),
        );
      }
    },
  );

  employeesRouter.post("/api/car-assignments", async (req, res, next) => {
    try {
      const assignment = insertCarAssignmentSchema.parse(req.body);
      // Prevent assignment if employee is on approved/pending vacation for assignedDate
      if (assignment.assignedDate) {
        const vacs = await storage.getVacationRequests(new Date(assignment.assignedDate), new Date(assignment.assignedDate));
        const conflict = vacs.find(v => v.employeeId === assignment.employeeId && (v.status === 'approved' || v.status === 'pending'));
        if (conflict) {
          return next(new HttpError(409, `Employee has ${conflict.status} vacation overlapping ${assignment.assignedDate}`));
        }
      }
      const newAssignment = await storage.createCarAssignment(assignment);
      // ensure the car reflects its new assignment
      if (newAssignment?.carId) {
        await storage.updateCar(newAssignment.carId, {
          status: "assigned",
        });
      }
      const detailed = await storage.getCarAssignment(newAssignment.id);
      if (detailed) {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "asset_assignment",
          title: `Assigned ${detailed.car?.make ?? ""} ${detailed.car?.model ?? ""}`.trim(),
          description: `Assigned ${detailed.car?.make ?? ""} ${detailed.car?.model ?? ""} to ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
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
      const updates = insertCarAssignmentSchema.partial().parse(req.body);
      const updated = await storage.updateCarAssignment(req.params.id, updates);
      if (!updated) {
        return next(new HttpError(404, "Car assignment not found"));
      }
      if (updates.status) {
        await storage.updateCar(updated.carId, {
          status: updates.status === "completed" ? "available" : "assigned",
        });
      }
      const detailed = await storage.getCarAssignment(req.params.id);
      if (detailed) {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "asset_update",
          title: `Updated assignment for ${detailed.car?.make ?? ""} ${detailed.car?.model ?? ""}`.trim(),
          description: `Updated ${detailed.car?.make ?? ""} ${detailed.car?.model ?? ""} assignment for ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
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
      const existing = await storage.getCarAssignment(req.params.id);
      const deleted = await storage.deleteCarAssignment(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Car assignment not found"));
      }
      if (existing?.carId) {
        await storage.updateCar(existing.carId, { status: "available" });
      }
      if (existing) {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: existing.employeeId,
          eventType: "asset_removal",
          title: `Removed ${existing.car?.make ?? ""} ${existing.car?.model ?? ""} assignment`.trim(),
          description: `Removed ${existing.car?.make ?? ""} ${existing.car?.model ?? ""} from ${existing.employee?.firstName ?? ""} ${existing.employee?.lastName ?? ""}`.trim(),
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
      // Deduplicate by employeeId+type+title+expiryDate
      const existing = (await storage.getNotifications()).find(n =>
        n.employeeId === notification.employeeId &&
        n.type === notification.type &&
        n.title === notification.title &&
        String(n.expiryDate) === String(notification.expiryDate)
      );
      const newNotification = existing || await storage.createNotification(notification);
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

  employeesRouter.put("/api/notifications/:id/snooze", async (req, res, next) => {
    try {
      const until = (req.body?.snoozedUntil as string) || new Date(Date.now() + 7 * 86400000).toISOString();
      const updated = await storage.updateNotification(req.params.id, { snoozedUntil: new Date(until) as any, status: 'unread' });
      if (!updated) return next(new HttpError(404, "Notification not found"));
      res.json({ message: "Notification snoozed", snoozedUntil: until });
    } catch (error) {
      next(new HttpError(500, "Failed to snooze notification"));
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

  // Notification approvals for documents
  employeesRouter.put("/api/notifications/:id/approve", async (req, res, next) => {
    try {
      const all = await storage.getNotifications();
      const n = all.find(n => n.id === req.params.id);
      if (!n) return next(new HttpError(404, 'Notification not found'));
      await storage.updateNotification(req.params.id, { status: 'read' });
      // Log event
      try {
        const reason = (req.body as any)?.reason;
        await storage.createEmployeeEvent({
          employeeId: n.employeeId,
          eventType: 'document_update',
          title: `Document approved: ${n.title}`,
          description: reason ? `${n.message} | Reason: ${reason}` : n.message,
          amount: '0',
          eventDate: new Date().toISOString().split('T')[0],
          affectsPayroll: false,
        });
      } catch {}
      res.json({ message: 'Approved' });
    } catch (error) {
      next(new HttpError(500, 'Failed to approve notification'));
    }
  });
  employeesRouter.put("/api/notifications/:id/reject", async (req, res, next) => {
    try {
      const all = await storage.getNotifications();
      const n = all.find(n => n.id === req.params.id);
      if (!n) return next(new HttpError(404, 'Notification not found'));
      await storage.updateNotification(req.params.id, { status: 'read' });
      // Log event
      try {
        const reason = (req.body as any)?.reason;
        await storage.createEmployeeEvent({
          employeeId: n.employeeId,
          eventType: 'document_update',
          title: `Document rejected: ${n.title}`,
          description: reason ? `${n.message} | Reason: ${reason}` : n.message,
          amount: '0',
          eventDate: new Date().toISOString().split('T')[0],
          affectsPayroll: false,
        });
      } catch {}
      res.json({ message: 'Rejected' });
    } catch (error) {
      next(new HttpError(500, 'Failed to reject notification'));
    }
  });

  // Employee documents: save PDF into employee's file (as event with documentUrl)
  employeesRouter.post("/api/employees/:id/documents", async (req, res, next) => {
    try {
      const { title, description, pdfDataUrl, controllerNumber, createdAt } = req.body as any;
      if (!title || !pdfDataUrl) return next(new HttpError(400, "title and pdfDataUrl are required"));
      const docNo = controllerNumber || `DOC-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
      const created = createdAt ? new Date(createdAt) : new Date();
      const event: InsertEmployeeEvent = {
        employeeId: req.params.id,
        eventType: 'document_update',
        title: `${title} (${docNo})`,
        description: description ? `${description} [${docNo}]` : `${title} [${docNo}]`,
        amount: '0',
        eventDate: created.toISOString().split('T')[0],
        affectsPayroll: false,
        documentUrl: pdfDataUrl,
      };
      const newEvent = await storage.createEmployeeEvent(event);
      // If non-admin, create approval notification for admins (generic implementation)
      const role = (req.user as any)?.role || 'employee';
      if (role !== 'admin') {
        await storage.createNotification({
          employeeId: req.params.id,
          type: 'document_approval',
          title: `Document approval needed: ${title}`,
          message: `${description || title} | Doc#: ${docNo}`,
          priority: 'high',
          status: 'unread',
          expiryDate: created.toISOString().split('T')[0],
          daysUntilExpiry: 0,
          emailSent: false,
          documentEventId: newEvent.id as any,
          documentUrl: pdfDataUrl,
          documentControllerNumber: docNo,
        });
      }
      res.status(201).json(newEvent);
    } catch (error) {
      next(new HttpError(500, "Failed to save employee document"));
    }
  });

  // Generic documents management
  employeesRouter.get("/api/documents", async (_req, res, next) => {
    try {
      const docs = await storage.getGenericDocuments();
      res.json(docs);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch documents"));
    }
  });
  employeesRouter.post("/api/documents", async (req, res, next) => {
    try {
      const { title, description, pdfDataUrl, controllerNumber, employeeId } = req.body as any;
      if (!title || !pdfDataUrl) return next(new HttpError(400, "title and pdfDataUrl are required"));
      const doc = await storage.createGenericDocument({
        title,
        description,
        documentUrl: pdfDataUrl,
        controllerNumber,
        employeeId,
      } as any);
      res.status(201).json(doc);
    } catch (error) {
      next(new HttpError(500, "Failed to save document"));
    }
  });
  employeesRouter.put("/api/documents/:id", async (req, res, next) => {
    try {
      const updates: any = {};
      const allowed = ["title","description","documentUrl","controllerNumber","employeeId"];
      for (const k of allowed) if (k in req.body) updates[k] = (req.body as any)[k];
      const updated = await storage.updateGenericDocument(req.params.id, updates);
      if (!updated) return next(new HttpError(404, "Document not found"));
      res.json(updated);
    } catch (error) {
      next(new HttpError(500, "Failed to update document"));
    }
  });
  employeesRouter.delete("/api/documents/:id", async (req, res, next) => {
    try {
      const ok = await storage.deleteGenericDocument(req.params.id);
      if (!ok) return next(new HttpError(404, "Document not found"));
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete document"));
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

  // Attendance CSV import
  const uploadCsv = multer();
  employeesRouter.post("/api/attendance/import", uploadCsv.single('file'), async (req, res, next) => {
    try {
      const buf = (req.file as any)?.buffer as Buffer | undefined;
      if (!buf) return next(new HttpError(400, "file is required"));
      const text = buf.toString('utf8');
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length === 0) return res.json({ imported: 0, failed: 0 });
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const idx = (name: string) => headers.findIndex(h => h === name);
      const iEmployeeId = idx('employeeid');
      const iEmployeeCode = (iEmployeeId === -1) ? idx('employeecode') : -1;
      const iDate = idx('date');
      const iIn = idx('checkin');
      const iOut = idx('checkout');
      const iHours = idx('hours');
      const iSource = idx('source');
      const iNotes = idx('notes');
      if (iDate === -1) return next(new HttpError(400, "CSV must include date column"));
      if (iEmployeeId === -1 && iEmployeeCode === -1) return next(new HttpError(400, "CSV must include employeeId or employeeCode column"));
      const employees = await storage.getEmployees();
      const codeToId = new Map<string, string>();
      employees.forEach(e => codeToId.set(e.employeeCode, e.id));
      let imported = 0, failed = 0;
      for (let r = 1; r < lines.length; r++) {
        const cols = lines[r].split(',');
        try {
          let employeeId = (iEmployeeId >= 0) ? cols[iEmployeeId]?.trim() : '';
          if (!employeeId && iEmployeeCode >= 0) {
            const code = cols[iEmployeeCode]?.trim();
            employeeId = codeToId.get(code || '') || '';
          }
          if (!employeeId) throw new Error('Missing employeeId or employeeCode');
          const dateStr = cols[iDate]?.trim();
          if (!dateStr || isNaN(Date.parse(dateStr))) throw new Error('Invalid date');
          const record: any = {
            employeeId,
            date: dateStr,
          };
          if (iIn >= 0 && cols[iIn]) record.checkIn = new Date(cols[iIn]).toISOString();
          if (iOut >= 0 && cols[iOut]) record.checkOut = new Date(cols[iOut]).toISOString();
          if (iHours >= 0 && cols[iHours]) record.hours = Number(cols[iHours]);
          if (iSource >= 0 && cols[iSource]) record.source = String(cols[iSource]);
          if (iNotes >= 0 && cols[iNotes]) record.notes = String(cols[iNotes]);
          await storage.createAttendance(record);
          imported++;
        } catch {
          failed++;
        }
      }
      res.json({ imported, failed });
    } catch (error) {
      next(new HttpError(500, "Failed to import attendance"));
    }
  });

  // Attendance CSV template
  employeesRouter.get("/api/attendance/template", async (_req, res) => {
    const csv = [
      'employeeCode,date,checkIn,checkOut,hours,source,notes',
      'E-00001,2025-01-10,2025-01-10T08:00:00,2025-01-10T17:00:00,8,device,Regular shift'
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance-template.csv"');
    res.send(csv);
  });

  // Vacation coverage summary
  employeesRouter.get("/api/vacations/coverage", async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query as any;
      const start = startDate ? new Date(startDate) : new Date();
      const end = endDate ? new Date(endDate) : new Date(Date.now() + 30*86400000);
      const vacs = await storage.getVacationRequests(start, end);
      const employees = await storage.getEmployees();
      const departments = await storage.getDepartments();
      const deptNames = new Map<string, string>();
      departments.forEach(d => d.id && d.name && deptNames.set(d.id, d.name));
      const empDept = new Map<string, string | null>();
      employees.forEach(e => {
        if (e.departmentId) {
          empDept.set(e.id, e.departmentId);
        } else {
          empDept.set(e.id, null);
        }
      });
      // group by day -> deptId -> count
      const coverage: Record<string, Record<string, number>> = {};
      for (const v of vacs.filter(v => v.status === 'approved')) {
        const d0 = new Date(v.startDate);
        const d1 = new Date(v.endDate);
        for (let d = new Date(Math.max(+d0, +start)); d <= end && d <= d1; d = new Date(d.getTime() + 86400000)) {
          const key = d.toISOString().split('T')[0];
          const dept = empDept.get(v.employeeId) || 'unknown';
          coverage[key] = coverage[key] || {};
          coverage[key][dept] = (coverage[key][dept] || 0) + 1;
        }
      }
      const threshold = Number(process.env.COVERAGE_MAX_OVERLAP_PER_DEPT || '2');
      const departmentsMap: Record<string, string> = {};
      deptNames.forEach((name, id) => { departmentsMap[id] = name; });
      res.json({ coverage, threshold, departments: departmentsMap });
    } catch (error) {
      next(new HttpError(500, "Failed to compute coverage"));
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

        // Check driving license expiry
        // @ts-expect-error extended property from storage.checkDocumentExpiries
        if (check.drivingLicense && shouldSendAlert(check.drivingLicense.expiryDate, check.drivingLicense.alertDays)) {
          const emailContent = generateExpiryWarningEmail(
            employee,
            'driving_license',
            // @ts-expect-error extended property
            check.drivingLicense.expiryDate,
            // @ts-expect-error extended property
            check.drivingLicense.daysUntilExpiry,
            // @ts-expect-error extended property
            check.drivingLicense.number
          );

          await storage.createNotification({
            employeeId: check.employeeId,
            type: 'driving_license_expiry',
            title: emailContent.subject,
            message: `Driving License expires in ${
              // @ts-expect-error extended property
              check.drivingLicense.daysUntilExpiry
            } days`,
            priority:
              // @ts-expect-error extended property
              check.drivingLicense.daysUntilExpiry <= 7
                ? 'critical'
                : // @ts-expect-error extended property
                check.drivingLicense.daysUntilExpiry <= 30
                ? 'high'
                : 'medium',
            // @ts-expect-error extended property
            expiryDate: check.drivingLicense.expiryDate,
            // @ts-expect-error extended property
            daysUntilExpiry: check.drivingLicense.daysUntilExpiry,
            emailSent: false,
          });

          const emailSent = await sendEmail({
            to: employee.email || '',
            from: process.env.FROM_EMAIL || 'hr@company.com',
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
          });

          if (emailSent) emailsSent++;
          // @ts-expect-error extended property
          alerts.push({ type: 'driving_license', employee: check.employeeName, daysUntilExpiry: check.drivingLicense.daysUntilExpiry });
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

  // Attendance routes
  employeesRouter.get("/api/attendance", async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query as any;
      if (startDate && endDate) {
        const rows = await storage.getAttendance(new Date(startDate), new Date(endDate));
        res.json(rows);
      } else {
        const rows = await storage.getAttendance();
        res.json(rows);
      }
    } catch (error) {
      next(new HttpError(500, "Failed to fetch attendance"));
    }
  });
  employeesRouter.get("/api/attendance/summary", async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query as any;
      if (!startDate || !endDate) return next(new HttpError(400, "startDate and endDate are required"));
      const summary = await storage.getAttendanceSummary(new Date(startDate), new Date(endDate));
      res.json(summary);
    } catch (error) {
      next(new HttpError(500, "Failed to summarize attendance"));
    }
  });
  employeesRouter.post("/api/attendance", async (req, res, next) => {
    try {
      const rec = insertAttendanceSchema.parse(req.body);
      const created = await storage.createAttendance(rec);
      try {
        await storage.createEmployeeEvent({
          employeeId: created.employeeId,
          eventType: 'employee_update',
          title: 'Attendance recorded',
          description: `Attendance for ${created.date}`,
          amount: '0',
          eventDate: created.date as any,
          affectsPayroll: true,
        });
      } catch {}
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid attendance data", error.errors));
      }
      next(new HttpError(500, "Failed to create attendance record"));
    }
  });
  employeesRouter.put("/api/attendance/:id", async (req, res, next) => {
    try {
      const rec = insertAttendanceSchema.partial().parse(req.body);
      const updated = await storage.updateAttendance(req.params.id, rec);
      if (!updated) return next(new HttpError(404, "Attendance record not found"));
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid attendance data", error.errors));
      }
      next(new HttpError(500, "Failed to update attendance record"));
    }
  });
  employeesRouter.delete("/api/attendance/:id", async (req, res, next) => {
    try {
      const all = await storage.getAttendance();
      const rec = all.find(r => r.id === req.params.id);
      const deleted = await storage.deleteAttendance(req.params.id);
      if (!deleted) return next(new HttpError(404, "Attendance record not found"));
      try {
        if (rec) {
          await storage.createEmployeeEvent({
            employeeId: rec.employeeId,
            eventType: 'employee_update',
            title: 'Attendance deleted',
            description: `Attendance removed for ${rec.date}`,
            amount: '0',
            eventDate: new Date().toISOString().split('T')[0],
            affectsPayroll: true,
          });
        }
      } catch {}
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete attendance record"));
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

  employeesRouter.post("/api/employee-events", requireRole(["admin", "hr"]), async (req, res, next) => {
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

  employeesRouter.put("/api/employee-events/:id", requireRole(["admin", "hr"]), async (req, res, next) => {
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

  employeesRouter.delete("/api/employee-events/:id", requireRole(["admin", "hr"]), async (req, res, next) => {
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
