import { Router, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { HttpError } from "../errorHandler";
import { storage, DuplicateEmployeeCodeError, type EmployeeFilters } from "../storage";
import { assetService } from "../assetService";
import {
  insertDepartmentSchema,
  insertCompanySchema,
  insertEmployeeSchema,
  insertVacationRequestSchema,
  insertAssetSchema,
  insertCarSchema,
  insertAssetAssignmentSchema,
  updateAssetAssignmentSchema,
  insertCarAssignmentSchema,
  insertNotificationSchema,
  insertEmailAlertSchema,
  insertEmployeeEventSchema,
  upsertNotificationRoutingRuleSchema,
  notificationEscalationStepInputSchema,
  insertAttendanceSchema,
  insertAllowanceTypeSchema,
  insertEmployeeCustomFieldSchema,
  employeeCustomValuePayloadSchema,
  insertEmployeeWorkflowSchema,
  insertLeaveAccrualPolicySchema,
  insertEmployeeLeavePolicySchema,
  payrollFrequencyConfigSchema,
  payrollCalendarConfigSchema,
  payrollExportFormatConfigSchema,
  type InsertEmployeeEvent,
  type InsertEmployee,
  type InsertCar,
  type InsertAssetAssignment,
  type InsertSickLeaveTracking,
  type EmployeeCustomValueMap,
  type InsertEmployeeWorkflowStep,
  type VacationApprovalStep,
  type VacationAuditLogEntry,
  type LeaveAccrualPolicy,
  type SessionUser,
  type LeaveBalance,
  type EmployeeLeavePolicy,
  type VacationRequestWithEmployee,
  type PayrollFrequencyConfig,
  type PayrollCalendarConfig,
  type PayrollExportFormatConfig,
} from "@shared/schema";
import {
  sendEmail,
  generateExpiryWarningEmail,
  calculateDaysUntilExpiry,
  shouldSendAlert,
  sendNotificationDigest,
  escalateNotification as escalateNotificationService,
  escalateOverdueNotifications,
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
import { requireRole, requirePermission } from "./auth";

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

const omitUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

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

const createJsonArrayParser = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(value => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return undefined;
      }
    }
    return value;
  }, schema.array());

const payrollFrequenciesParser = createJsonArrayParser(payrollFrequencyConfigSchema);
const payrollCalendarsParser = createJsonArrayParser(payrollCalendarConfigSchema);
const payrollExportFormatsParser = createJsonArrayParser(payrollExportFormatConfigSchema);

const parsePayrollFrequenciesInput = (
  value: unknown,
): PayrollFrequencyConfig[] | undefined => {
  const parsed = payrollFrequenciesParser.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const parsePayrollCalendarsInput = (
  value: unknown,
): PayrollCalendarConfig[] | undefined => {
  const parsed = payrollCalendarsParser.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const parsePayrollExportFormatsInput = (
  value: unknown,
): PayrollExportFormatConfig[] | undefined => {
  const parsed = payrollExportFormatsParser.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const defaultFrequency: PayrollFrequencyConfig = {
  id: "default",
  name: "Monthly Cycle",
  cadence: "monthly",
};

const defaultCalendars: PayrollCalendarConfig[] = [
  { id: "default", frequencyId: defaultFrequency.id, name: "Default Calendar" },
];

const defaultExportFormats: PayrollExportFormatConfig[] = [
  { id: "bank-default", type: "bank", format: "csv", name: "Default Bank Export", enabled: true },
  { id: "gl-default", type: "gl", format: "xlsx", name: "Default GL Export", enabled: true },
  { id: "statutory-default", type: "statutory", format: "pdf", name: "Default Statutory Export", enabled: true },
];

const capitalize = (value: string): string => {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const normalizeLegacyPayrollSettings = (
  raw: unknown,
):
  | {
      frequencies: PayrollFrequencyConfig[];
      calendars: PayrollCalendarConfig[];
      exportFormats: PayrollExportFormatConfig[];
    }
  | undefined => {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }

  let parsedValue: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsedValue = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  if (typeof parsedValue !== "object" || parsedValue === null) {
    return undefined;
  }

  const legacy = parsedValue as Record<string, unknown>;

  let frequencies = parsePayrollFrequenciesInput(legacy.frequencies);
  if (!frequencies || frequencies.length === 0) {
    const rawCadence =
      typeof legacy.frequency === "string" && legacy.frequency.trim() !== ""
        ? legacy.frequency.trim()
        : defaultFrequency.cadence;
    const cadenceResult = payrollFrequencyConfigSchema.shape.cadence.safeParse(rawCadence);
    const cadence = cadenceResult.success ? cadenceResult.data : defaultFrequency.cadence;
    const freqId =
      typeof legacy.frequencyId === "string" && legacy.frequencyId.trim() !== ""
        ? legacy.frequencyId.trim()
        : defaultFrequency.id;
    const label =
      typeof legacy.frequencyLabel === "string" && legacy.frequencyLabel.trim() !== ""
        ? legacy.frequencyLabel.trim()
        : defaultFrequency.name;
    frequencies = [
      {
        id: freqId,
        name: label,
        cadence: cadence as PayrollFrequencyConfig["cadence"],
      },
    ];
  }

  let calendars = parsePayrollCalendarsInput(legacy.calendars);
  if (!calendars || calendars.length === 0) {
    const calendarId =
      typeof legacy.calendarId === "string" && legacy.calendarId.trim() !== ""
        ? legacy.calendarId.trim()
        : defaultCalendars[0]?.id ?? "default";
    const calendarName =
      typeof legacy.calendarName === "string" && legacy.calendarName.trim() !== ""
        ? legacy.calendarName.trim()
        : defaultCalendars[0]?.name ?? "Default Calendar";
    const frequencyId = frequencies[0]?.id ?? defaultCalendars[0]?.frequencyId ?? defaultFrequency.id;
    calendars = [
      {
        id: calendarId,
        frequencyId,
        name: calendarName,
      },
    ];
  }

  let exportFormats = parsePayrollExportFormatsInput(legacy.exportFormats);
  if (!exportFormats || exportFormats.length === 0) {
    exportFormats = defaultExportFormats;
  }

  return { frequencies, calendars, exportFormats };
};

const upload = multer({ storage: multer.memoryStorage() });

const DEFAULT_SICK_LEAVE_DAYS = 14;

const vacationUpdateSchema = insertVacationRequestSchema.partial().extend({
  approvalAction: z.enum(["approve", "reject", "delegate"]).optional(),
  actingApproverId: z.string().optional(),
  delegateToId: z.string().optional(),
  approvalNote: z.string().optional(),
});

const leaveBalanceQuerySchema = z.object({
  employeeId: z.string().optional(),
  year: z
    .union([z.string(), z.number()])
    .optional()
    .transform(value => {
      if (value === undefined) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }),
});

const leaveLedgerQuerySchema = z.object({
  employeeId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const parseDateParam = (value: unknown): Date | undefined => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const sickLeaveBalanceUpdateSchema = z
  .object({
    year: z.coerce.number().int().min(1900).max(9999),
    daysUsed: z.coerce.number().int().min(1).optional(),
    totalSickDaysUsed: z.coerce.number().int().min(0).optional(),
    remainingSickDays: z.coerce.number().int().min(0).optional(),
  })
  .refine(
    (data) =>
      typeof data.daysUsed === "number" ||
      typeof data.totalSickDaysUsed === "number" ||
      typeof data.remainingSickDays === "number",
    {
      message: "At least one update field must be provided",
      path: ["daysUsed"],
    },
  );

const employeeCustomFieldSchema = insertEmployeeCustomFieldSchema.extend({
  name: z.string().trim().min(1, "Name is required"),
});

const workflowTypeSchema = z.enum(["onboarding", "offboarding"]);
type WorkflowType = z.infer<typeof workflowTypeSchema>;
type WorkflowStepInput = Omit<
  InsertEmployeeWorkflowStep,
  "workflowId" | "id" | "createdAt" | "updatedAt" | "completedAt"
>;

const workflowProgressSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "skipped"]).default("completed"),
  payload: z.record(z.any()).optional(),
});

function buildDefaultWorkflowSteps(type: WorkflowType): WorkflowStepInput[] {
  if (type === "offboarding") {
    return [
      {
        title: "Collect company assets",
        description: "Ensure all assigned equipment is returned.",
        stepType: "asset",
        status: "pending",
        orderIndex: 0,
        metadata: { collectAssets: true },
      },
      {
        title: "Settle outstanding loans",
        description: "Close any remaining loan balances before exit.",
        stepType: "loan",
        status: "pending",
        orderIndex: 1,
        metadata: { settleLoans: true },
      },
      {
        title: "Close pending vacations",
        description: "Cancel or complete pending vacation requests.",
        stepType: "vacation",
        status: "pending",
        orderIndex: 2,
        metadata: { cancelVacations: true },
      },
      {
        title: "Deactivate employee",
        description: "Update employment status to terminated once tasks are complete.",
        stepType: "task",
        status: "pending",
        orderIndex: 3,
        metadata: { setStatus: "terminated" },
      },
    ];
  }

  return [
    {
      title: "Collect identity documents",
      description: "Upload passport and civil ID copies for the employee.",
      stepType: "document",
      status: "pending",
      orderIndex: 0,
      metadata: { requiredFields: ["passportImage", "civilIdImage"] },
    },
    {
      title: "Assign starter asset",
      description: "Provide the employee with their initial equipment.",
      stepType: "asset",
      status: "pending",
      orderIndex: 1,
      metadata: { autoAssign: true },
    },
    {
      title: "Schedule orientation",
      description: "Coordinate the employee's first-day orientation.",
      stepType: "task",
      status: "pending",
      orderIndex: 2,
      metadata: {},
    },
    {
      title: "Activate employee",
      description: "Set the employee's status to active once onboarding is complete.",
      stepType: "task",
      status: "pending",
      orderIndex: 3,
      metadata: { setStatus: "active" },
    },
  ];
}

function normalizeCustomFieldValue(raw: unknown): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return null;
    }
    return trimmed;
  }
  if (raw instanceof Date) {
    return raw.toISOString();
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  return String(raw);
}

function mapCustomValuesToRecord(values: { fieldId: string; value: string | null }[]) {
  const record: EmployeeCustomValueMap = {};
  for (const value of values) {
    record[value.fieldId] = value.value ?? null;
  }
  return record;
}

async function syncEmployeeCustomValues(
  employeeId: string,
  incoming?: Record<string, unknown>,
): Promise<EmployeeCustomValueMap> {
  if (!incoming || Object.keys(incoming).length === 0) {
    const existing = await storage.getEmployeeCustomValues(employeeId);
    return mapCustomValuesToRecord(existing);
  }

  const fields = await storage.getEmployeeCustomFields();
  if (fields.length === 0) {
    return {};
  }
  const validFieldIds = new Set(fields.map(field => field.id));

  const existing = await storage.getEmployeeCustomValues(employeeId);
  const existingByField = new Map(existing.map(value => [value.fieldId, value]));

  for (const [fieldId, raw] of Object.entries(incoming)) {
    if (!validFieldIds.has(fieldId)) {
      throw new HttpError(400, `Unknown custom field: ${fieldId}`);
    }

    const normalized = normalizeCustomFieldValue(raw);
    const existingValue = existingByField.get(fieldId);

    if (normalized === null) {
      if (existingValue) {
        await storage.deleteEmployeeCustomValue(existingValue.id);
        existingByField.delete(fieldId);
      }
      continue;
    }

    if (!existingValue) {
      const created = await storage.createEmployeeCustomValue({
        employeeId,
        fieldId,
        value: normalized,
      });
      existingByField.set(fieldId, created);
      continue;
    }

    if (existingValue.value !== normalized) {
      const updated = await storage.updateEmployeeCustomValue(existingValue.id, {
        value: normalized,
      });
      existingByField.set(fieldId, updated ?? { ...existingValue, value: normalized });
    }
  }

  const finalValues = await storage.getEmployeeCustomValues(employeeId);
  return mapCustomValuesToRecord(finalValues);
}

export const EMPLOYEE_IMPORT_TEMPLATE_HEADERS: string[] = [
  "Employee Code/معرف الموظف",
  "First Name (English)/الاسم الأول",
  "Last Name/اسم العائلة",
  "Arabic Name/الاسم العربي",
  "Nickname/الاسم المستعار",
  "Email/البريد الإلكتروني",
  "Phone Number/رقم الهاتف",
  "Emergency Phone/هاتف الطوارئ",
  "Job Title/المسمى الوظيفي",
  "Role/الدور",
  "Work Location/مكان العمل",
  "Department ID/معرف القسم",
  "Company ID/معرف الشركة",
  "Status/الحالة",
  "Start Date/تاريخ التوظيف",
  "Date of Birth/تاريخ الميلاد",
  "Nationality/الجنسية",
  "National ID/الرقم الوطني",
  "Civil ID Number/رقم البطاقة المدنية",
  "Civil ID Alert Days/أيام تنبيه البطاقة المدنية",
  "Civil ID Issue Date/تاريخ إصدار البطاقة المدنية",
  "Civil ID Expiry Date/تاريخ انتهاء البطاقة المدنية",
  "Passport Number/رقم جواز السفر",
  "Passport Alert Days/أيام تنبيه جواز السفر",
  "Passport Issue Date/تاريخ إصدار جواز السفر",
  "Passport Expiry Date/تاريخ انتهاء جواز السفر",
  "Visa Number/رقم التأشيرة",
  "Visa Type/نوع التأشيرة",
  "Visa Alert Days/أيام تنبيه التأشيرة",
  "Visa Issue Date/تاريخ إصدار التأشيرة",
  "Visa Expiry Date/تاريخ انتهاء التأشيرة",
  "Salary/الراتب",
  "Additions/إضافات",
  "Payment Method/طريقة الدفع",
  "Transferable/تحويل",
  "Standard Working Days/أيام العمل",
  "Address/العنوان",
  "Bank IBAN/آيبان البنك",
  "Bank Name/اسم البنك",
  "SWIFT Code/رمز السويفت",
  "Residency On Company/الإقامة على الشركة",
  "Residency Name/اسم الإقامة",
  "Profession Category/تصنيف المهنة",
  "Profile Image/صورة الملف الشخصي",
  "Visa Image/صورة التأشيرة",
  "Civil ID Image/صورة البطاقة المدنية",
  "Passport Image/صورة جواز السفر",
  "Driving License Number/رقم رخصة القيادة",
  "Driving License Issue Date/تاريخ إصدار رخصة القيادة",
  "Driving License Expiry Date/تاريخ انتهاء رخصة القيادة",
  "Driving License Image/صورة رخصة القيادة",
  "Additional Documents/مستندات إضافية",
  "Other Documents/مستندات أخرى",
];

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
      // Include original error for better diagnostics in development
      next(new HttpError(500, "Failed to fetch companies", error));
    }
  });

  // Current company (single-company app)
  employeesRouter.get("/api/company", async (_req, res, next) => {
    try {
      const list = await storage.getCompanies();
      if (list.length === 0) {
        // create default company if none exists
        const created = await storage.createCompany({
          name: 'Company',
          currencyCode: 'KWD',
          locale: 'en-KW',
          payrollFrequencies: [{ ...defaultFrequency }],
          payrollCalendars: defaultCalendars.map(calendar => ({ ...calendar })),
          payrollExportFormats: defaultExportFormats.map(format => ({ ...format })),
          useAttendanceForDeductions: false,
        });
        return res.json(created);
      }
      res.json(list[0]);
    } catch (error) {
      next(new HttpError(500, 'Failed to fetch company', error));
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
      if (typeof req.body?.currencyCode === 'string') {
        const currencyCode = req.body.currencyCode.trim();
        if (currencyCode) data.currencyCode = currencyCode;
      }
      if (typeof req.body?.locale === 'string') {
        const locale = req.body.locale.trim();
        if (locale) data.locale = locale;
      }
      const parsedFrequencies = parsePayrollFrequenciesInput(req.body?.payrollFrequencies);
      if (parsedFrequencies) {
        data.payrollFrequencies = parsedFrequencies;
      }

      const parsedCalendars = parsePayrollCalendarsInput(req.body?.payrollCalendars);
      if (parsedCalendars) {
        data.payrollCalendars = parsedCalendars;
      }

      const parsedExportFormats = parsePayrollExportFormatsInput(req.body?.payrollExportFormats);
      if (parsedExportFormats) {
        data.payrollExportFormats = parsedExportFormats;
      }

      const legacyPayroll = normalizeLegacyPayrollSettings(req.body?.payrollSettings);
      if (legacyPayroll) {
        if (!data.payrollFrequencies) {
          data.payrollFrequencies = legacyPayroll.frequencies;
        }
        if (!data.payrollCalendars) {
          data.payrollCalendars = legacyPayroll.calendars;
        }
        if (!data.payrollExportFormats) {
          data.payrollExportFormats = legacyPayroll.exportFormats;
        }
      }
      if (!id) {
        if (!data.payrollFrequencies) {
          data.payrollFrequencies = [{ ...defaultFrequency }];
        }
        if (!data.payrollCalendars) {
          data.payrollCalendars = defaultCalendars.map(calendar => ({ ...calendar }));
        }
        if (!data.payrollExportFormats) {
          data.payrollExportFormats = defaultExportFormats.map(format => ({ ...format }));
        }
        const created = await storage.createCompany(data);
        res.json(created);
      } else {
        const updated = await storage.updateCompany(id, data);
        if (!updated) return next(new HttpError(404, 'Company not found'));
        res.json(updated);
      }
    } catch (error) {
      next(new HttpError(500, 'Failed to update company', error));
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

  employeesRouter.get("/api/allowance-types", async (_req, res, next) => {
    try {
      const types = await storage.getAllowanceTypes();
      res.json(types);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch allowance types", error));
    }
  });

  employeesRouter.post(
    "/api/allowance-types",
    requireRole(["admin", "hr"]),
    async (req, res, next) => {
      try {
        const payload = insertAllowanceTypeSchema.parse(req.body);
        const created = await storage.createAllowanceType(payload);
        res.status(201).json(created);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(new HttpError(400, "Invalid allowance type", error.errors));
        }
        if (error instanceof Error && error.message.includes("Allowance type name")) {
          return next(new HttpError(400, error.message));
        }
        next(new HttpError(500, "Failed to create allowance type", error));
      }
    },
  );

  // Employee routes
  employeesRouter.get("/api/employees", async (req, res, next) => {
    try {
      const { page, limit, status, department, company, name, search, sort, order, includeTerminated } = req.query;

      const limitNum = typeof limit === "string" ? Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 0)) : undefined;
      const pageNum = typeof page === "string" ? Math.max(1, Number.parseInt(page, 10) || 1) : 1;
      const offset = limitNum ? (pageNum - 1) * limitNum : undefined;

      const statusValues = Array.isArray(status)
        ? status.reduce<string[]>((acc, value) => {
            if (typeof value === "string") {
              acc.push(...value.split(","));
            }
            return acc;
          }, [])
        : typeof status === "string"
          ? status.split(",")
          : [];
      const normalizedStatuses = statusValues
        .map(value => value.trim().toLowerCase())
        .filter(value => value.length > 0);

      const allowedStatuses = new Set(["active", "inactive", "on_leave", "resigned", "terminated"]);
      const hasAllStatuses = normalizedStatuses.includes("all");
      let includeTerminatedFlag = normalizedStatuses.includes("terminated") || hasAllStatuses;
      if (typeof includeTerminated === "string") {
        includeTerminatedFlag = includeTerminated.toLowerCase() === "true";
      }
      if (!status && typeof includeTerminated !== "string") {
        includeTerminatedFlag = false;
      }
      const filteredStatuses = normalizedStatuses
        .filter(value => value !== "all")
        .filter(value => allowedStatuses.has(value));

      const filters: EmployeeFilters = {
        limit: limitNum,
        offset,
        includeTerminated: includeTerminatedFlag,
      };

      if (filteredStatuses.length > 0) {
        filters.status = filteredStatuses;
      }

      if (typeof department === "string" && department.trim() !== "") {
        filters.departmentId = department;
      }

      if (typeof company === "string" && company.trim() !== "") {
        filters.companyId = company;
      }

      const searchTerm = typeof name === "string" && name.trim() !== ""
        ? name
        : typeof search === "string" && search.trim() !== ""
          ? search
          : undefined;
      if (searchTerm) {
        filters.search = searchTerm;
      }

      const sortMap: Record<string, import("../storage").EmployeeFilters["sort"]> = {
        name: "name",
        position: "position",
        department: "department",
        salary: "salary",
        status: "status",
        startdate: "startDate",
        start_date: "startDate",
      };

      if (typeof sort === "string") {
        const normalizedSort = sort.toLowerCase();
        if (sortMap[normalizedSort]) {
          filters.sort = sortMap[normalizedSort];
        }
      }

      if (typeof order === "string") {
        const normalizedOrder = order.toLowerCase();
        if (normalizedOrder === "asc" || normalizedOrder === "desc") {
          filters.order = normalizedOrder;
        }
      }

      const [employees, total] = await Promise.all([
        storage.getEmployees(filters),
        storage.countEmployees({ ...filters, limit: undefined, offset: undefined }),
      ]);

      res.setHeader("X-Total-Count", total.toString());
      res.json(employees);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch employees"));
    }
  });

  employeesRouter.get("/api/employees/import/template", (_req, res) => {
    const ws = XLSX.utils.aoa_to_sheet([EMPLOYEE_IMPORT_TEMPLATE_HEADERS]);
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
    status: z.preprocess(
      v => (emptyToUndef(v) as string | undefined)?.toLowerCase(),
      z.enum(["active", "inactive", "on_leave", "resigned", "terminated"]).optional(),
    ),
    paymentMethod: z.preprocess(v => (emptyToUndef(v) as string | undefined)?.toLowerCase(),
      z.enum(["bank", "cash", "link"]).optional()),
    customFieldValues: employeeCustomValuePayloadSchema.optional(),
  });

  employeesRouter.get("/api/employees/custom-fields", async (_req, res, next) => {
    try {
      const fields = await storage.getEmployeeCustomFields();
      res.json(fields);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch custom fields"));
    }
  });

  const logCustomFieldAudit = async (
    req: Request,
    summary: string,
    fieldId: string | null,
    metadata?: Record<string, unknown>,
  ) => {
    const actorId = (req.user as SessionUser | undefined)?.id;
    if (!actorId) return;
    try {
      await storage.logSecurityEvent({
        actorId,
        eventType: "custom_field_edit",
        entityType: "employee_custom_field",
        entityId: fieldId,
        summary,
        metadata: metadata ?? null,
      });
    } catch (error) {
      console.error("Failed to log custom field audit", error);
    }
  };

  employeesRouter.post(
    "/api/employees/custom-fields",
    requirePermission("employees:custom-field"),
    async (req, res, next) => {
      try {
        const payload = employeeCustomFieldSchema.parse(req.body);
        const created = await storage.createEmployeeCustomField(payload);
        await logCustomFieldAudit(req, "Created custom field", created.id, {
          name: created.name,
        });
        res.status(201).json(created);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(new HttpError(400, "Invalid custom field data", error.errors));
        }
        if ((error as any)?.code === "23505") {
          return next(new HttpError(409, "Custom field with this name already exists"));
        }
        next(new HttpError(500, "Failed to create custom field"));
      }
    },
  );

  employeesRouter.put(
    "/api/employees/custom-fields/:id",
    requirePermission("employees:custom-field"),
    async (req, res, next) => {
      try {
        const payload = employeeCustomFieldSchema.parse(req.body);
        const updated = await storage.updateEmployeeCustomField(req.params.id, payload);
        if (!updated) {
          return next(new HttpError(404, "Custom field not found"));
        }
        await logCustomFieldAudit(req, "Updated custom field", updated.id, {
          name: updated.name,
        });
        res.json(updated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(new HttpError(400, "Invalid custom field data", error.errors));
        }
        if ((error as any)?.code === "23505") {
          return next(new HttpError(409, "Custom field with this name already exists"));
        }
        next(new HttpError(500, "Failed to update custom field"));
      }
    },
  );

  employeesRouter.delete(
    "/api/employees/custom-fields/:id",
    requirePermission("employees:custom-field"),
    async (req, res, next) => {
      try {
        const deleted = await storage.deleteEmployeeCustomField(req.params.id);
        if (!deleted) {
          return next(new HttpError(404, "Custom field not found"));
        }
        await logCustomFieldAudit(req, "Deleted custom field", req.params.id);
        res.status(204).send();
      } catch (error) {
        next(new HttpError(500, "Failed to delete custom field"));
      }
    },
  );

  employeesRouter.get(
    "/api/employees/:id/custom-fields",
    async (req, res, next) => {
      try {
        const employee = await storage.getEmployee(req.params.id);
        if (!employee) {
          return next(new HttpError(404, "Employee not found"));
        }
        const [fields, values] = await Promise.all([
          storage.getEmployeeCustomFields(),
          storage.getEmployeeCustomValues(employee.id),
        ]);
        res.json({
          fields,
          values: mapCustomValuesToRecord(values),
        });
      } catch (error) {
        next(new HttpError(500, "Failed to fetch employee custom fields"));
      }
    },
  );

  employeesRouter.post("/api/employees/import", upload.single("file"), async (req, res, next) => {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return next(new HttpError(400, "No file uploaded"));
    }
    try {
      const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
      const sheetPref = (req.body as any)?.sheet || (req.body as any)?.sheetName;
      const sheetName = typeof sheetPref === 'string' && sheetPref.trim()
        ? sheetPref.trim()
        : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        return next(new HttpError(400, `Sheet '${sheetName}' not found in workbook`));
      }
      const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || []) as string[];
      const mappingRaw = (req.body as any)?.mapping;
      const basicOnlyRaw = (req.body as any)?.basicOnly;
      const dateFormatPrefRaw = (req.body as any)?.dateFormat;
      const envDatePref = (process.env.IMPORT_DATE_FORMAT || process.env.HR_IMPORT_DATE_FORMAT || '').toUpperCase();
      const dateFormatPref = typeof dateFormatPrefRaw === 'string'
        ? dateFormatPrefRaw.trim().toUpperCase()
        : (envDatePref || undefined); // expected values: 'DMY' | 'MDY' | 'YMD'
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
        const requiredSet = new Set<string>(["startDate", "salary", "position", "firstName"]);
        const fieldLabel = (f: string): string => {
          const map: Record<string, string> = {
            firstName: 'Name',
            lastName: 'Last Name',
            englishName: 'English Name',
            fullName: 'Name',
            position: 'Position/Profession',
            salary: 'Salary',
            startDate: 'Employment Date',
            civilId: 'Civil ID Number',
            civilIdIssueDate: 'Civil ID Issue Date',
            civilIdExpiryDate: 'Civil ID Expiry Date',
            passportNumber: 'Passport Number',
            passportIssueDate: 'Passport Issue Date',
            passportExpiryDate: 'Passport Expiry Date',
            drivingLicenseExpiryDate: 'Driving License Expiry Date',
          };
          return map[f] || f;
        };

        function preferAmbiguousDate(value: unknown): { value: string | null; error: string | null } {
          const r = parseDateToISO(value as any);
          if (r.error !== 'Ambiguous date format' || typeof value !== 'string') return r;

          const t = value.trim();
          const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
          if (!m) return r;
          let [_, a, b, c] = m;
          if (c.length === 2) c = '20' + c;
          const isoDMY = `${c.padStart(4, '0')}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
          const isoMDY = `${c.padStart(4, '0')}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
          const validDMY = !isNaN(Date.parse(isoDMY));
          const validMDY = !isNaN(Date.parse(isoMDY));
          const pref = (dateFormatPref === 'MDY' || dateFormatPref === 'YMD') ? 'MDY' : 'DMY';
          if (validDMY && validMDY && isoDMY !== isoMDY) {
            return { value: pref === 'MDY' ? isoMDY : isoDMY, error: null };
          }
          // If only one is valid, return it; otherwise keep original error
          if (validDMY && !validMDY) return { value: isoDMY, error: null };
          if (validMDY && !validDMY) return { value: isoMDY, error: null };
          return r;
        }

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
            const { value, error } = parseField(preferAmbiguousDate as any, original, "date");
            base[f] = value;
            if (error) {
              const needsAttention = requiredSet.has(f);
              const friendly = `${fieldLabel(f)} needs attention (missing or invalid)`;
              errors.push({
                row: idx + 2,
                column: f,
                value: original,
                reason: error,
                ...(needsAttention ? { message: friendly } : {}),
              });
              if (needsAttention) parseError = true;
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
              const needsAttention = requiredSet.has(f);
              const friendly = `${fieldLabel(f)} needs attention (missing or invalid)`;
              errors.push({
                row: idx + 2,
                column: f,
                value: original,
                reason: error,
                ...(needsAttention ? { message: friendly } : {}),
              });
              if (needsAttention) parseError = true;
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
              // booleans are optional here; do not mark fatal
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
            const parts = err.errors.map(i => {
              const key = Array.isArray(i.path) && i.path.length ? String(i.path[0]) : '';
              if (key && requiredSet.has(key)) {
                return `${fieldLabel(key)} needs attention (missing or invalid)`;
              }
              return (i.path?.length ? `[${i.path.join('.')}] ` : '') + i.message;
            });
            const message = Array.from(new Set(parts)).join(', ');
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

  employeesRouter.get(
    "/api/employees/:id/workflows",
    requireRole(["admin", "hr"]),
    async (req, res, next) => {
      try {
        const employee = await storage.getEmployee(req.params.id);
        if (!employee) {
          return next(new HttpError(404, "Employee not found"));
        }

        const rawType = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
        let workflowType: WorkflowType | undefined;
        if (rawType) {
          workflowType = workflowTypeSchema.parse(rawType);
        }

        const workflows = await storage.getEmployeeWorkflows(employee.id, workflowType);
        const activeWorkflow =
          workflows.find(workflow => workflow.status === "in_progress" || workflow.status === "pending") ?? null;

        res.json({ workflows, activeWorkflow });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(new HttpError(400, "Invalid workflow type", error.errors));
        }
        next(new HttpError(500, "Failed to load workflows", error));
      }
    },
  );

  employeesRouter.post(
    "/api/employees/:id/workflows/:type/start",
    requireRole(["admin", "hr"]),
    async (req, res, next) => {
      try {
        const employee = await storage.getEmployee(req.params.id);
        if (!employee) {
          return next(new HttpError(404, "Employee not found"));
        }

        const workflowType = workflowTypeSchema.parse(req.params.type);
        const existing = await storage.getActiveEmployeeWorkflow(employee.id, workflowType);
        if (existing) {
          return res.json({ workflow: existing });
        }

        const baseWorkflow = insertEmployeeWorkflowSchema.parse({
          employeeId: employee.id,
          workflowType,
          status: "in_progress",
        });
        const steps = buildDefaultWorkflowSteps(workflowType);
        const workflow = await storage.createEmployeeWorkflow(baseWorkflow, steps);
        const addedBy = await getAddedBy(req);
        try {
          await storage.createEmployeeEvent({
            employeeId: employee.id,
            eventType: "workflow",
            title: `${workflowType === "offboarding" ? "Offboarding" : "Onboarding"} workflow started`,
            description: `Workflow created with ${steps.length} step${steps.length === 1 ? "" : "s"}.`,
            amount: "0",
            eventDate: new Date().toISOString().split("T")[0],
            affectsPayroll: false,
            recurrenceType: "none",
            ...(addedBy ? { addedBy } : {}),
          });
        } catch (err) {
          console.warn("Failed to log workflow start event", err);
        }

        res.status(201).json({ workflow });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(new HttpError(400, "Invalid workflow type", error.errors));
        }
        next(new HttpError(500, "Failed to start workflow", error));
      }
    },
  );

  employeesRouter.post(
    "/api/employees/:employeeId/workflows/:workflowId/steps/:stepId/progress",
    requireRole(["admin", "hr"]),
    async (req, res, next) => {
      try {
        const { employeeId, workflowId, stepId } = req.params;
        const employee = await storage.getEmployee(employeeId);
        if (!employee) {
          return next(new HttpError(404, "Employee not found"));
        }

        const { status, payload } = workflowProgressSchema.parse(req.body ?? {});
        const workflow = await storage.getEmployeeWorkflowById(workflowId);
        if (!workflow || workflow.employeeId !== employee.id) {
          return next(new HttpError(404, "Workflow not found"));
        }

        const step = workflow.steps.find(s => s.id === stepId);
        if (!step) {
          return next(new HttpError(404, "Workflow step not found"));
        }

        const payloadData = (payload ?? {}) as Record<string, unknown>;
        const metadataResult: Record<string, unknown> = {};
        const stepMetadata: Record<string, unknown> = { ...(step.metadata ?? {}) };
        const today = new Date().toISOString().split("T")[0];
        const addedBy = await getAddedBy(req);
        let eventDescription: string | null = null;
        let eventType: InsertEmployeeEvent["eventType"] = "employee_update";

        if (step.stepType === "document") {
          const required = Array.isArray((step.metadata as any)?.requiredFields)
            ? ((step.metadata as any)?.requiredFields as string[])
            : [];
          const documentsRaw = payloadData.documents;
          if (!documentsRaw || typeof documentsRaw !== "object") {
            return next(new HttpError(400, "Document payload is required"));
          }
          const documents = documentsRaw as Record<string, unknown>;
          const updates: Record<string, unknown> = {};
          for (const field of required) {
            const value = documents[field];
            if (typeof value !== "string" || value.trim() === "") {
              return next(new HttpError(400, `Missing document value for ${field}`));
            }
            updates[field] = value;
          }
          if (Object.keys(updates).length > 0) {
            await storage.updateEmployee(employee.id, updates as any);
            metadataResult.documents = Object.keys(updates);
            eventType = "document_update";
            eventDescription = `Updated ${Object.keys(updates).length} document field${
              Object.keys(updates).length === 1 ? "" : "s"
            }.`;
          }
        } else if (step.stepType === "asset") {
          if ((step.metadata as any)?.collectAssets) {
            const assignments = await assetService.getAssignments();
            const activeAssignments = assignments.filter(
              assignment =>
                assignment.employeeId === employee.id &&
                (assignment.status === "active" || assignment.status === "assigned"),
            );
            const returned: string[] = [];
            for (const assignment of activeAssignments) {
              await assetService.updateAssignment(assignment.id, {
                status: "returned",
                returnDate: today,
              });
              returned.push(assignment.id);
            }
            metadataResult.returnedAssignments = returned;
            eventType = "asset_update";
            eventDescription = returned.length
              ? `Collected ${returned.length} asset${returned.length === 1 ? "" : "s"}.`
              : "No assets were assigned to this employee.";
          } else if ((step.metadata as any)?.autoAssign) {
            const assets = await storage.getAssets();
            const available = assets.find(asset => {
              const status = (asset.status || "").toLowerCase();
              const hasActiveAssignment = Boolean(asset.currentAssignment);
              return status === "available" && !hasActiveAssignment;
            });
            if (!available) {
              return next(new HttpError(409, "No available assets to assign"));
            }
            const assignment = await assetService.createAssignment({
              assetId: available.id,
              employeeId: employee.id,
              assignedDate: today,
              status: "active",
            });
            metadataResult.assignedAsset = {
              assetId: available.id,
              assignmentId: assignment.id,
            };
            eventType = "asset_assignment";
            eventDescription = `Assigned asset ${available.name || available.id} to the employee.`;
          }
        } else if (step.stepType === "loan") {
          const loans = await storage.getLoans();
          const outstanding = loans.filter(loan =>
            loan.employeeId === employee.id && ["pending", "active"].includes((loan.status || "").toLowerCase()),
          );
          const settled: string[] = [];
          for (const loan of outstanding) {
            await storage.updateLoan(loan.id, { status: "settled", remainingAmount: 0 });
            settled.push(loan.id);
          }
          metadataResult.settledLoans = settled;
          eventDescription = settled.length
            ? `Settled ${settled.length} loan${settled.length === 1 ? "" : "s"}.`
            : "No loans required settlement.";
        } else if (step.stepType === "vacation") {
          const vacations = await storage.getVacationRequests();
          const relevant = vacations.filter(vacation =>
            vacation.employeeId === employee.id &&
            ["pending", "approved"].includes((vacation.status || "").toLowerCase()),
          );
          const closed: string[] = [];
          for (const vacation of relevant) {
            await storage.updateVacationRequest(vacation.id, { status: "cancelled" });
            closed.push(vacation.id);
          }
          metadataResult.closedVacations = closed;
          eventDescription = closed.length
            ? `Cancelled ${closed.length} vacation request${closed.length === 1 ? "" : "s"}.`
            : "No pending vacations to close.";
        } else if (step.stepType === "task") {
          const note = typeof payloadData.notes === "string" ? payloadData.notes.trim() : "";
          if (note) {
            metadataResult.notes = note;
          }
          const targetStatus = (step.metadata as any)?.setStatus;
          if (status === "completed" && typeof targetStatus === "string" && targetStatus.trim()) {
            if (targetStatus === "terminated") {
              await storage.terminateEmployee(employee.id);
            } else {
              await storage.updateEmployee(employee.id, { status: targetStatus });
            }
            eventDescription = `Updated employee status to ${targetStatus}.`;
          } else if (status === "completed") {
            eventDescription = `Completed workflow task: ${step.title}.`;
          }
        }

        if (!eventDescription && status === "completed") {
          eventType = "workflow";
          eventDescription = `Completed workflow step: ${step.title}.`;
        }

        stepMetadata.lastRunAt = new Date().toISOString();
        if (Object.keys(metadataResult).length > 0) {
          stepMetadata.result = metadataResult;
        }

        const updatedStep = await storage.updateEmployeeWorkflowStep(step.id, {
          status,
          completedAt: status === "completed" ? new Date() : null,
          metadata: stepMetadata,
        });
        if (!updatedStep) {
          throw new Error("Failed to update workflow step");
        }

        const updatedWorkflow = await storage.getEmployeeWorkflowById(workflowId);
        if (!updatedWorkflow) {
          throw new Error("Failed to reload workflow after update");
        }

        if (eventDescription) {
          try {
            await storage.createEmployeeEvent({
              employeeId: employee.id,
              eventType,
              title: `${updatedWorkflow.workflowType === "offboarding" ? "Offboarding" : "Onboarding"}: ${step.title}`,
              description: eventDescription,
              amount: "0",
              eventDate: today,
              affectsPayroll: false,
              recurrenceType: "none",
              ...(addedBy ? { addedBy } : {}),
            });
          } catch (err) {
            console.warn("Failed to log workflow step event", err);
          }
        }

        res.json({ workflow: updatedWorkflow, step: updatedStep });
      } catch (error) {
        if (error instanceof HttpError) {
          return next(error);
        }
        if (error instanceof z.ZodError) {
          return next(new HttpError(400, "Invalid workflow step payload", error.errors));
        }
        next(new HttpError(500, "Failed to progress workflow", error));
      }
    },
  );

  employeesRouter.post(
    "/api/employees/:employeeId/workflows/:workflowId/complete",
    requireRole(["admin", "hr"]),
    async (req, res, next) => {
      try {
        const { employeeId, workflowId } = req.params;
        const employee = await storage.getEmployee(employeeId);
        if (!employee) {
          return next(new HttpError(404, "Employee not found"));
        }

        const workflow = await storage.getEmployeeWorkflowById(workflowId);
        if (!workflow || workflow.employeeId !== employee.id) {
          return next(new HttpError(404, "Workflow not found"));
        }

        const hasIncomplete = workflow.steps.some(
          step => step.status !== "completed" && step.status !== "skipped",
        );
        if (hasIncomplete) {
          return next(new HttpError(400, "All workflow steps must be completed before closing the workflow"));
        }

        const addedBy = await getAddedBy(req);
        const metadata = {
          ...(workflow.metadata ?? {}),
          completedBy: addedBy ?? null,
        };
        await storage.updateEmployeeWorkflow(workflow.id, {
          status: "completed",
          completedAt: new Date(),
          metadata,
        });

        if (workflow.workflowType === "offboarding") {
          await storage.terminateEmployee(employee.id);
        } else if (workflow.workflowType === "onboarding") {
          await storage.updateEmployee(employee.id, { status: "active" });
        }

        try {
          await storage.createEmployeeEvent({
            employeeId: employee.id,
            eventType: "workflow",
            title: `${workflow.workflowType === "offboarding" ? "Offboarding" : "Onboarding"} workflow completed`,
            description: `Workflow completed on ${new Date().toISOString().split("T")[0]}.`,
            amount: "0",
            eventDate: new Date().toISOString().split("T")[0],
            affectsPayroll: false,
            recurrenceType: "none",
            ...(addedBy ? { addedBy } : {}),
          });
        } catch (err) {
          console.warn("Failed to log workflow completion event", err);
        }

        const freshWorkflow = await storage.getEmployeeWorkflowById(workflow.id);
        res.json({ workflow: freshWorkflow ?? workflow });
      } catch (error) {
        next(new HttpError(500, "Failed to complete workflow", error));
      }
    },
  );

  employeesRouter.get("/api/employees/:id", async (req, res, next) => {
    try {
      const employee = await storage.getEmployee(req.params.id);
      if (!employee) {
        return next(new HttpError(404, "Employee not found"));
      }
      const customValues = await storage.getEmployeeCustomValues(employee.id);
      res.json({
        ...employee,
        customFieldValues: mapCustomValuesToRecord(customValues),
      });
    } catch (error) {
      next(new HttpError(500, "Failed to fetch employee"));
    }
  });

  employeesRouter.get(
    "/api/employees/:id/sick-leave-balance",
    async (req, res, next) => {
      try {
        const employee = await storage.getEmployee(req.params.id);
        if (!employee) {
          return next(new HttpError(404, "Employee not found"));
        }

        const rawYear = req.query.year;
        const yearParam = Array.isArray(rawYear) ? rawYear[0] : rawYear;
        const parsedYear =
          yearParam === undefined || yearParam === null || yearParam === ""
            ? new Date().getFullYear()
            : Number.parseInt(String(yearParam), 10);

        if (!Number.isInteger(parsedYear)) {
          return next(new HttpError(400, "Invalid year parameter"));
        }

        let balance = await storage.getSickLeaveBalance(employee.id, parsedYear);
        if (!balance) {
          balance = await storage.createSickLeaveBalance({
            employeeId: employee.id,
            year: parsedYear,
            totalSickDaysUsed: 0,
            remainingSickDays: DEFAULT_SICK_LEAVE_DAYS,
          });
        }

        res.json(balance);
      } catch (error) {
        console.error("Failed to fetch sick leave balance:", error);
        next(new HttpError(500, "Failed to fetch sick leave balance"));
      }
    },
  );

  employeesRouter.post(
    "/api/employees/:id/sick-leave-balance",
    async (req, res, next) => {
      try {
        const employee = await storage.getEmployee(req.params.id);
        if (!employee) {
          return next(new HttpError(404, "Employee not found"));
        }

        const payload = sickLeaveBalanceUpdateSchema.parse(req.body);

        let balance = await storage.getSickLeaveBalance(employee.id, payload.year);
        if (!balance) {
          balance = await storage.createSickLeaveBalance({
            employeeId: employee.id,
            year: payload.year,
            totalSickDaysUsed: 0,
            remainingSickDays: DEFAULT_SICK_LEAVE_DAYS,
          });
        }

        const updates: Partial<InsertSickLeaveTracking> = {};

        if (typeof payload.daysUsed === "number") {
          if (payload.daysUsed > balance.remainingSickDays) {
            return next(
              new HttpError(
                400,
                `Requested sick leave days (${payload.daysUsed}) exceed remaining balance (${balance.remainingSickDays})`,
              ),
            );
          }
          updates.totalSickDaysUsed = balance.totalSickDaysUsed + payload.daysUsed;
          updates.remainingSickDays = balance.remainingSickDays - payload.daysUsed;
        }

        if (typeof payload.totalSickDaysUsed === "number") {
          updates.totalSickDaysUsed = payload.totalSickDaysUsed;
        }

        if (typeof payload.remainingSickDays === "number") {
          updates.remainingSickDays = payload.remainingSickDays;
        }

        if (
          updates.remainingSickDays !== undefined &&
          updates.remainingSickDays < 0
        ) {
          return next(new HttpError(400, "Remaining sick days cannot be negative"));
        }

        if (
          updates.totalSickDaysUsed !== undefined &&
          updates.totalSickDaysUsed < 0
        ) {
          return next(new HttpError(400, "Total sick days used cannot be negative"));
        }

        if (Object.keys(updates).length === 0) {
          return res.json(balance);
        }

        const updated = await storage.updateSickLeaveBalance(balance.id, updates);
        if (updated) {
          return res.json(updated);
        }

        const refreshed = await storage.getSickLeaveBalance(
          employee.id,
          payload.year,
        );
        res.json(refreshed ?? balance);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(new HttpError(400, "Invalid sick leave update", error.errors));
        }
        console.error("Failed to update sick leave balance:", error);
        next(new HttpError(500, "Failed to update sick leave balance"));
      }
    },
  );

  employeesRouter.post("/api/employees", async (req, res, next) => {
    try {
      const { customFieldValues, ...parsed } = employeeSchema.parse(req.body);
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
      const customValues = await syncEmployeeCustomValues(
        newEmployee.id,
        customFieldValues ?? undefined,
      );
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
          recurrenceType: "none",
          ...(addedBy ? { addedBy } : {}),
        });
      } catch (e) {
        // Non-fatal: creation succeeds even if event logging fails
        console.warn("Failed to log employee creation event", e);
      }
      res.status(201).json({
        ...newEmployee,
        customFieldValues: customValues,
      });
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
      const { customFieldValues, ...rawUpdates } = parsed;
      const updates: any = Object.fromEntries(
        Object.entries(rawUpdates).filter(([_, v]) => v !== undefined)
      );
      await optimizeImages(updates);
      const updatedEmployee = await storage.updateEmployee(
        req.params.id,
        updates,
      );
      if (!updatedEmployee) {
        return next(new HttpError(404, "Employee not found"));
      }
      const customValues = await syncEmployeeCustomValues(
        updatedEmployee.id,
        customFieldValues ?? undefined,
      );
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
          recurrenceType: "none",
          ...(addedBy ? { addedBy } : {}),
        };
        await storage.createEmployeeEvent(event);
      }

      res.json({
        ...updatedEmployee,
        customFieldValues: customValues,
      });
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

  employeesRouter.post("/api/employees/:id/terminate", async (req, res, next) => {
    try {
      const terminated = await storage.terminateEmployee(req.params.id);
      if (!terminated) {
        return next(new HttpError(404, "Employee not found"));
      }
      res.json(terminated);
    } catch (error) {
      next(new HttpError(500, "Failed to delete employee"));
    }
  });

  employeesRouter.delete("/api/employees/:id", async (req, res, next) => {
    try {
      const terminatedEmployee = await storage.deleteEmployee(req.params.id);
      if (!terminatedEmployee) {
        return next(new HttpError(404, "Employee not found"));
      }
      res.json(terminatedEmployee);
    } catch (error) {
      next(new HttpError(500, "Failed to delete employee"));
    }
  });

  // Dashboard stats route
  employeesRouter.get("/api/dashboard/stats", async (_req, res, next) => {
    try {
      const [allEmployees, departments] = await Promise.all([
        storage.getEmployees(),
        storage.getDepartments(),
      ]);

      const activeEmployees = allEmployees.filter(e => (e.status || '').toLowerCase() === 'active');
      const activeEmployeeCount = activeEmployees.length;

      // Month range
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

      // Forecasted gross = sum of active salaries + additions
      const forecastGross = activeEmployees.reduce((sum, e) => sum + Number(e.salary || 0) + Number((e as any).additions || 0), 0);

      // Forecasted deductions from employee events (deduction/penalty) this month
      const events = await storage.getEmployeeEvents(start, end);
      const deductionTypes = new Set(['deduction', 'penalty']);
      const dedEvents = events.filter(ev => (ev as any).affectsPayroll !== false && deductionTypes.has((ev as any).eventType));
      const forecastDeductions = dedEvents.reduce((sum, ev) => sum + Number((ev as any).amount || 0), 0);
      const deductionsByType: Record<string, number> = { deduction: 0, penalty: 0 };
      for (const ev of dedEvents) {
        const t = (ev as any).eventType;
        deductionsByType[t] = (deductionsByType[t] || 0) + Number((ev as any).amount || 0);
      }

      // Forecasted loan returns = sum of active loans' monthlyDeduction in range
      const loans = await storage.getLoans(start, end);
      const forecastLoanReturns = loans
        .filter(l => (l.status || '').toLowerCase() === 'active')
        .reduce((sum, l) => sum + Number(l.monthlyDeduction || 0), 0);

      // Forecasted net = gross - deductions - loan returns
      const forecastNet = Math.max(0, forecastGross - forecastDeductions - forecastLoanReturns);

      // Vacations overlapping this month (approved)
      const vacations = await storage.getVacationRequests(start, end);
      const onVacation = new Set(
        vacations
          .filter(v => (v.status || '').toLowerCase() === 'approved')
          .map(v => v.employeeId)
      ).size;

      res.json({
        totalEmployees: allEmployees.length,
        activeEmployees: activeEmployeeCount,
        departments: departments.length,
        forecastPayroll: {
          gross: forecastGross,
          net: forecastNet,
          breakdown: {
            salaries: activeEmployees.reduce((s, e) => s + Number(e.salary || 0), 0),
            additions: activeEmployees.reduce((s, e) => s + Number((e as any).additions || 0), 0),
            deductions: forecastDeductions,
            deductionsByType,
            loanReturns: forecastLoanReturns,
          }
        },
        forecastDeductions,
        forecastLoanReturns,
        onVacation,
      });
    } catch (error) {
      next(new HttpError(500, "Failed to fetch dashboard stats", error));
    }
  });

  // Vacation request routes
  employeesRouter.get("/api/vacations", async (req, res, next) => {
    try {
      const start = parseDateParam(req.query.startDate);
      const end = parseDateParam(req.query.endDate);
      const vacationRequests = await storage.getVacationRequests(start, end);
      res.json(vacationRequests);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch vacation requests"));
    }
  });

  employeesRouter.get("/api/vacations/balances", async (req, res, next) => {
    try {
      const { employeeId, year } = leaveBalanceQuerySchema.parse(req.query);
      const balances = await storage.getLeaveBalances(
        omitUndefined({ employeeId, year }),
      );
      res.json(balances);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid balance filters", error.errors));
      }
      next(new HttpError(500, "Failed to fetch leave balances"));
    }
  });

  employeesRouter.get("/api/vacations/policies", async (_req, res, next) => {
    try {
      const [policies, assignments, balances] = await Promise.all([
        storage.getLeaveAccrualPolicies(),
        storage.getEmployeeLeavePolicies(),
        storage.getLeaveBalances(),
      ]);
      res.json({ policies, assignments, balances });
    } catch (error) {
      next(new HttpError(500, "Failed to fetch leave policies"));
    }
  });

  employeesRouter.post("/api/vacations/policies", async (req, res, next) => {
    try {
      const payload = insertLeaveAccrualPolicySchema.parse(req.body);
      const policy = await storage.createLeaveAccrualPolicy(payload);
      res.status(201).json(policy);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid leave policy data", error.errors));
      }
      next(new HttpError(500, "Failed to create leave policy"));
    }
  });

  employeesRouter.put("/api/vacations/policies/:id", async (req, res, next) => {
    try {
      const payload = insertLeaveAccrualPolicySchema.partial().parse(req.body);
      const policy = await storage.updateLeaveAccrualPolicy(req.params.id, payload);
      if (!policy) {
        return next(new HttpError(404, "Leave policy not found"));
      }
      res.json(policy);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid leave policy data", error.errors));
      }
      next(new HttpError(500, "Failed to update leave policy"));
    }
  });

  employeesRouter.post("/api/vacations/policies/:id/assignments", async (req, res, next) => {
    try {
      const payload = insertEmployeeLeavePolicySchema.parse({
        ...req.body,
        policyId: req.params.id,
      });
      const assignment = await storage.assignEmployeeLeavePolicy(payload);
      res.status(201).json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid policy assignment", error.errors));
      }
      next(new HttpError(500, "Failed to assign leave policy"));
    }
  });

  employeesRouter.get("/api/vacations/policies/:id/ledger", async (req, res, next) => {
    try {
      const { employeeId, startDate, endDate } = leaveLedgerQuerySchema.parse(req.query);
      const ledger = await storage.getLeaveAccrualLedger(
        omitUndefined({
          policyId: req.params.id,
          employeeId,
          startDate,
          endDate,
        }),
      );
      res.json(ledger);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid ledger filters", error.errors));
      }
      next(new HttpError(500, "Failed to fetch policy ledger"));
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
      const parsed = vacationUpdateSchema.parse(req.body);
      const { approvalAction, actingApproverId, delegateToId, approvalNote, ...rest } = parsed;

      const before = await storage.getVacationRequest(req.params.id);
      if (!before) {
        return next(new HttpError(404, "Vacation request not found"));
      }

      const {
        approvalChain: providedApprovalChain,
        auditLog: providedAuditLog,
        delegateApproverId: providedDelegate,
        approvedBy: providedApprovedBy,
        ...otherUpdates
      } = rest;

      const normalizeSteps = (steps: VacationApprovalStep[] | undefined | null): VacationApprovalStep[] => {
        if (!Array.isArray(steps)) {
          return [];
        }
        return steps.map(step => ({
          approverId: step.approverId,
          status: step.status ?? "pending",
          actedAt: step.actedAt ?? null,
          notes: step.notes ?? null,
          delegatedToId: step.delegatedToId ?? null,
        }));
      };

      let approvalChain: VacationApprovalStep[] = normalizeSteps(providedApprovalChain);
      if (approvalChain.length === 0) {
        approvalChain = normalizeSteps(before.approvalChain);
      }

      let auditLog: VacationAuditLogEntry[] = Array.isArray(providedAuditLog)
        ? [...providedAuditLog]
        : Array.isArray(before.auditLog)
          ? [...before.auditLog]
          : [];

      let currentStep = before.currentApprovalStep ?? 0;
      let delegateApproverId: string | null | undefined =
        providedDelegate ?? before.delegateApproverId ?? undefined;
      let approvedBy = providedApprovedBy ?? before.approvedBy ?? undefined;
      let status = otherUpdates.status ?? before.status ?? "pending";

      const normalizedActingId = actingApproverId ? normalizeBigId(actingApproverId) : undefined;
      const normalizedDelegateTarget = delegateToId ? normalizeBigId(delegateToId) : undefined;
      const requestActorId =
        normalizedActingId ??
        (typeof (req.user as any)?.employeeId === "string"
          ? (req.user as any).employeeId
          : (req.user as any)?.id ?? before.employeeId);

      const appendAuditLog = (
        action: VacationAuditLogEntry["action"],
        actor: string,
        notes?: string | null,
        metadata?: Record<string, unknown> | null,
      ) => {
        auditLog.push({
          id: randomUUID(),
          actorId: actor,
          action,
          actionAt: new Date().toISOString(),
          notes: notes ?? null,
          metadata: metadata ?? null,
        });
      };

      if (approvalAction) {
        if (!normalizedActingId) {
          return next(new HttpError(400, "actingApproverId is required for approval actions"));
        }
        if (approvalChain.length === 0) {
          return next(new HttpError(400, "Approval chain is not configured for this request"));
        }

        currentStep = Math.min(currentStep, approvalChain.length - 1);
        const stepIndex = currentStep;
        const step = { ...approvalChain[stepIndex] };
        const allowedApprovers = new Set(
          [step.approverId, delegateApproverId ?? undefined, step.delegatedToId ?? undefined]
            .filter((value): value is string => typeof value === "string" && value.length > 0),
        );
        if (!allowedApprovers.has(normalizedActingId)) {
          return next(new HttpError(403, "Acting approver is not authorized for the current step"));
        }

        const nowIso = new Date().toISOString();

        let nextStepIndex: number | null = null;

        if (approvalAction === "delegate") {
          if (!normalizedDelegateTarget) {
            return next(new HttpError(400, "delegateToId is required to delegate a request"));
          }
          step.status = "delegated";
          step.delegatedToId = normalizedDelegateTarget;
          step.actedAt = nowIso;
          step.notes = approvalNote ?? step.notes ?? null;
          delegateApproverId = normalizedDelegateTarget;
          status = "pending";
          appendAuditLog("delegated", normalizedActingId, approvalNote ?? null, { step: currentStep });
        } else if (approvalAction === "reject") {
          step.status = "rejected";
          step.delegatedToId = null;
          step.actedAt = nowIso;
          step.notes = approvalNote ?? step.notes ?? null;
          delegateApproverId = null;
          status = "rejected";
          approvedBy = undefined;
          appendAuditLog("rejected", normalizedActingId, approvalNote ?? null, { step: currentStep });
        } else {
          step.status = "approved";
          step.delegatedToId = null;
          step.actedAt = nowIso;
          step.notes = approvalNote ?? step.notes ?? null;
          delegateApproverId = null;
          appendAuditLog("approved", normalizedActingId, approvalNote ?? null, { step: currentStep });

          nextStepIndex = approvalChain.findIndex(
            (candidate, index) => index > currentStep && candidate.status !== "approved",
          );
          if (nextStepIndex >= 0) {
            status = otherUpdates.status ?? "pending";
          } else {
            status = "approved";
            approvedBy = normalizedActingId;
          }
        }

        approvalChain[stepIndex] = step;

        if (approvalAction === "approve") {
          if (nextStepIndex !== null && nextStepIndex !== undefined && nextStepIndex >= 0) {
            currentStep = nextStepIndex;
            if (approvalChain[currentStep].status === "delegated") {
              approvalChain[currentStep] = { ...approvalChain[currentStep], status: "pending" };
            }
          } else {
            currentStep = approvalChain.length > 0 ? approvalChain.length - 1 : 0;
          }
        }
      } else if (providedApprovalChain) {
        appendAuditLog("updated", requestActorId, approvalNote ?? null, { scope: "approval_chain" });
      }

      const startDate = parseDateParam(otherUpdates.startDate ?? before.startDate);
      const endDate = parseDateParam(otherUpdates.endDate ?? before.endDate);

      if (status === "approved" && before.status !== "approved" && startDate && endDate) {
        const employee = await storage.getEmployee(before.employeeId);
        if (employee?.departmentId) {
          const overlapping = await storage.getVacationRequests(startDate, endDate);
          const sameDeptApproved = overlapping
            .filter(v => v.id !== before.id)
            .filter(v => v.status === 'approved')
            .filter(v => v.employee?.departmentId === employee.departmentId);
          const maxOverlap = Number(process.env.COVERAGE_MAX_OVERLAP_PER_DEPT || '999');
          if (sameDeptApproved.length >= maxOverlap) {
            return next(new HttpError(409, "Department coverage conflict: too many overlapping vacations"));
          }
        }
      }

      const updatePayload = omitUndefined({
        ...otherUpdates,
        status,
        approvalChain: approvalChain.length > 0 ? approvalChain : undefined,
        currentApprovalStep: approvalChain.length > 0 ? currentStep : undefined,
        delegateApproverId: delegateApproverId ?? null,
        auditLog,
        approvedBy,
      });

      const updatedVacationRequest = await storage.updateVacationRequest(req.params.id, updatePayload);
      if (!updatedVacationRequest) {
        return next(new HttpError(404, "Vacation request not found"));
      }

      const after = updatedVacationRequest;
      const previousStatus = before.status ?? "pending";
      const newStatus = after.status ?? status;

      if (previousStatus !== newStatus) {
        if (newStatus === "approved") {
          const leaveDays = Number(after.days ?? otherUpdates.days ?? before.days ?? 0);
          const leaveType = after.leaveType ?? otherUpdates.leaveType ?? before.leaveType ?? "annual";
          const policyId = after.appliesPolicyId ?? otherUpdates.appliesPolicyId ?? before.appliesPolicyId ?? null;
          const leaveYear = (parseDateParam(after.startDate ?? before.startDate) ?? new Date()).getUTCFullYear();

          if (leaveDays > 0) {
            try {
              await storage.applyLeaveUsage({
                employeeId: before.employeeId,
                leaveType,
                year: leaveYear,
                days: leaveDays,
                policyId: policyId ?? undefined,
                allowNegativeBalance: after.autoPauseAllowances ?? before.autoPauseAllowances ?? false,
              });
            } catch (error) {
              console.warn('Failed to apply leave usage:', error);
            }
          }

          try {
            await storage.updateEmployee(before.employeeId, { status: "on_leave" });
          } catch (error) {
            console.warn('Failed to update employee status for vacation approval:', error);
          }

          appendAuditLog("updated", requestActorId, approvalNote ?? null, { status: newStatus });

          try {
            const title = `Vacation approved (${after.startDate} -> ${after.endDate})`;
            await storage.createEmployeeEvent({
              employeeId: before.employeeId,
              eventType: 'vacation',
              title,
              description: approvalNote ?? title,
              amount: '0',
              eventDate: new Date().toISOString().split('T')[0],
              affectsPayroll: true,
              recurrenceType: 'none',
            });
          } catch (error) {
            console.warn('Failed to log vacation approval event:', error);
          }

          if (after.autoPauseAllowances ?? before.autoPauseAllowances) {
            try {
              const title = `Allowance paused for vacation (${after.startDate} -> ${after.endDate})`;
              await storage.createEmployeeEvent({
                employeeId: before.employeeId,
                eventType: 'allowance',
                title,
                description: approvalNote ?? title,
                amount: '0',
                eventDate: new Date().toISOString().split('T')[0],
                affectsPayroll: false,
                recurrenceType: 'none',
              });
            } catch (error) {
              console.warn('Failed to log allowance pause event:', error);
            }
          }
        } else if (newStatus === "completed") {
          try {
            await storage.updateEmployee(before.employeeId, { status: "active" });
          } catch (error) {
            console.warn('Failed to update employee status for vacation completion:', error);
          }
          appendAuditLog("updated", requestActorId, approvalNote ?? null, { status: newStatus });
          try {
            const title = `Vacation completed (${after.startDate} -> ${after.endDate})`;
            await storage.createEmployeeEvent({
              employeeId: before.employeeId,
              eventType: 'vacation',
              title,
              description: approvalNote ?? title,
              amount: '0',
              eventDate: new Date().toISOString().split('T')[0],
              affectsPayroll: true,
              recurrenceType: 'none',
            });
          } catch (error) {
            console.warn('Failed to log vacation completion event:', error);
          }

          if (after.autoPauseAllowances ?? before.autoPauseAllowances) {
            try {
              const title = `Allowance resumed after vacation (${after.startDate} -> ${after.endDate})`;
              await storage.createEmployeeEvent({
                employeeId: before.employeeId,
                eventType: 'allowance',
                title,
                description: approvalNote ?? title,
                amount: '0',
                eventDate: new Date().toISOString().split('T')[0],
                affectsPayroll: false,
                recurrenceType: 'none',
              });
            } catch (error) {
              console.warn('Failed to log allowance resume event:', error);
            }
          }
        }
      }

      res.json(after);
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

  const normalizeStatus = (value: string) => value.trim().toLowerCase();

  const mapAssignmentStatusToResourceStatus = (status?: string | null) => {
    if (!status) return undefined;
    const normalized = normalizeStatus(status);
    if (!normalized) return undefined;
    if (normalized === "completed") return "available";
    if (normalized === "active") return "assigned";
    return normalized;
  };

  const statusUpdateSchema = z.object({
    status: z
      .string({ required_error: "Status is required" })
      .transform(normalizeStatus)
      .refine(val => val.length > 0, { message: "Status is required" }),
  });

  // Asset routes
  employeesRouter.get("/api/assets", requirePermission("assets:view"), async (req, res, next) => {
    try {
      const assets = await assetService.getAssets();
      res.json(assets);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch assets"));
    }
  });

  // Asset documents
  employeesRouter.get(
    "/api/assets/:id/documents",
    requirePermission("assets:view"),
    async (req, res, next) => {
    try {
      const docs = await storage.getAssetDocuments(req.params.id);
      res.json(docs);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch asset documents"));
    }
  });
  employeesRouter.post(
    "/api/assets/:id/documents",
    requirePermission("assets:manage"),
    async (req, res, next) => {
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
  employeesRouter.get(
    "/api/assets/:id/repairs",
    requirePermission("assets:view"),
    async (req, res, next) => {
    try {
      const rows = await storage.getAssetRepairs(req.params.id);
      res.json(rows);
    } catch (error) { next(new HttpError(500, 'Failed to fetch asset repairs')); }
  });
  employeesRouter.post(
    "/api/assets/:id/repairs",
    requirePermission("assets:manage"),
    async (req, res, next) => {
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

  employeesRouter.get(
    "/api/assets/:id",
    requirePermission("assets:view"),
    async (req, res, next) => {
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

  employeesRouter.post(
    "/api/assets",
    requirePermission("assets:manage"),
    async (req, res, next) => {
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

  employeesRouter.put(
    "/api/assets/:id",
    requirePermission("assets:manage"),
    async (req, res, next) => {
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
    requirePermission("assets:manage"),
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
  employeesRouter.get(
    "/api/asset-assignments",
    requirePermission("assets:view"),
    async (req, res, next) => {
    try {
      const assignments = await assetService.getAssignments();
      res.json(assignments);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch asset assignments"));
    }
  });

  employeesRouter.get(
    "/api/asset-assignments/:id",
    requirePermission("assets:view"),
    async (req, res, next) => {
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

  employeesRouter.post(
    "/api/asset-assignments",
    requirePermission("assets:manage"),
    async (req, res, next) => {
    try {
      const assignment = insertAssetAssignmentSchema.parse(req.body);
      if (assignment.assignedDate) {
        const date = new Date(assignment.assignedDate);
        const vacations = await storage.getVacationRequests(date, date);
        const conflict = vacations.find(
          (vacation) =>
            vacation.employeeId === assignment.employeeId &&
            (vacation.status === "approved" || vacation.status === "pending"),
        );
        if (conflict) {
          return next(
            new HttpError(
              409,
              `Employee has ${conflict.status} vacation overlapping ${assignment.assignedDate}`,
            ),
          );
        }
      }
      const newAssignment = await assetService.createAssignment(assignment);
      // ensure the asset reflects its new assignment
      if (newAssignment?.assetId) {
        const desiredStatus =
          mapAssignmentStatusToResourceStatus(newAssignment.status ?? assignment.status) ?? "assigned";
        await storage.updateAsset(newAssignment.assetId, {
          status: desiredStatus,
        });
      }
      const detailed = await storage.getAssetAssignment(newAssignment.id);
      if (detailed?.employeeId) {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "asset_assignment",
          title: `Assigned ${detailed.asset?.name ?? ""}`.trim(),
          description: `Assigned ${detailed.asset?.name ?? ""} to ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          recurrenceType: "none",
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

  employeesRouter.put(
    "/api/asset-assignments/:id",
    requirePermission("assets:manage"),
    async (req, res, next) => {
    try {
      const updates = updateAssetAssignmentSchema.parse(req.body);
      const updated = await assetService.updateAssignment(req.params.id, updates);
      if (!updated) {
        return next(new HttpError(404, "Asset assignment not found"));
      }
      if (updates.status) {
        const desiredStatus = mapAssignmentStatusToResourceStatus(updates.status);
        if (desiredStatus) {
          await storage.updateAsset(updated.assetId, {
            status: desiredStatus,
          });
        }
      }
      const detailed = await storage.getAssetAssignment(req.params.id);
      if (detailed?.employeeId) {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: detailed.employeeId,
          eventType: "asset_update",
          title: `Updated assignment for ${detailed.asset?.name ?? ""}`.trim(),
          description: `Updated ${detailed.asset?.name ?? ""} assignment for ${detailed.employee?.firstName ?? ""} ${detailed.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          recurrenceType: "none",
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

  employeesRouter.delete(
    "/api/asset-assignments/:id",
    requirePermission("assets:manage"),
    async (req, res, next) => {
    try {
      const existing = await storage.getAssetAssignment(req.params.id);
      const deleted = await assetService.deleteAssignment(req.params.id);
      if (!deleted) {
        return next(new HttpError(404, "Asset assignment not found"));
      }
      if (existing?.assetId) {
        await storage.updateAsset(existing.assetId, { status: "available" });
      }
      if (existing?.employeeId) {
        const addedBy = await getAddedBy(req);
        const event: InsertEmployeeEvent = {
          employeeId: existing.employeeId,
          eventType: "asset_removal",
          title: `Removed ${existing.asset?.name ?? ""} assignment`.trim(),
          description: `Removed ${existing.asset?.name ?? ""} from ${existing.employee?.firstName ?? ""} ${existing.employee?.lastName ?? ""}`.trim(),
          amount: "0",
          eventDate: new Date().toISOString().split("T")[0],
          affectsPayroll: false,
          recurrenceType: "none",
          ...(addedBy ? { addedBy } : {}),
        };
        await storage.createEmployeeEvent(event);
      }
      res.status(204).send();
    } catch (error) {
      next(new HttpError(500, "Failed to delete asset assignment"));
    }
  });

  employeesRouter.post(
    "/api/assets/:id/status",
    requirePermission("assets:manage"),
    async (req, res, next) => {
    try {
      const { status } = statusUpdateSchema.parse(req.body);
      const existing = await assetService.getAsset(req.params.id);
      const updated = await assetService.updateAsset(req.params.id, { status });
      if (!updated) {
        return next(new HttpError(404, "Asset not found"));
      }
      const previousStatus = existing?.status
        ? normalizeStatus(existing.status)
        : undefined;
      const activeAssignment = existing?.currentAssignment;
      if (activeAssignment?.id) {
        const assignmentUpdates: Partial<InsertAssetAssignment> = {};
        if (status === "maintenance") {
          assignmentUpdates.status = "maintenance";
          if (!activeAssignment.returnDate) {
            assignmentUpdates.returnDate = new Date().toISOString().split("T")[0];
          }
        } else if (previousStatus === "maintenance") {
          if (status === "available") {
            assignmentUpdates.status = "completed";
            if (!activeAssignment.returnDate) {
              assignmentUpdates.returnDate = new Date().toISOString().split("T")[0];
            }
          } else {
            assignmentUpdates.status = "active";
          }
        }
        if (assignmentUpdates.status) {
          await storage.updateAssetAssignment(activeAssignment.id, assignmentUpdates);
          assetService.invalidateAssignmentCache();
        }
      } else if (status === "maintenance" && previousStatus !== "maintenance") {
        const today = new Date().toISOString().split("T")[0];
        await assetService.createAssignment({
          assetId: req.params.id,
          assignedDate: today,
          status: "maintenance",
        });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "Invalid asset status", error.errors));
      }
      next(new HttpError(500, "Failed to update asset status"));
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
      const { plateNumber, vin, serial } = req.query as Record<string, string | undefined>;
      const assignments = await storage.getCarAssignments({ plateNumber, vin, serial });
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
        const desiredStatus =
          mapAssignmentStatusToResourceStatus(newAssignment.status ?? assignment.status) ?? "assigned";
        await storage.updateCar(newAssignment.carId, {
          status: desiredStatus,
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
          recurrenceType: "none",
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
        const desiredStatus = mapAssignmentStatusToResourceStatus(updates.status);
        if (desiredStatus) {
          await storage.updateCar(updated.carId, {
            status: desiredStatus,
          });
        }
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
          recurrenceType: "none",
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
          recurrenceType: "none",
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
  employeesRouter.get("/api/notifications/rules", async (_req, res, next) => {
    try {
      const rules = await storage.getNotificationRoutingRules();
      res.json(rules);
    } catch (error) {
      next(new HttpError(500, "Failed to fetch notification rules"));
    }
  });

  employeesRouter.post("/api/notifications/rules", async (req, res, next) => {
    try {
      const payload = upsertNotificationRoutingRuleSchema.parse(req.body);
      const { steps = [], id, ...rule } = payload;
      const sanitizedSteps = steps.map(step => {
        const parsed = notificationEscalationStepInputSchema.parse(step);
        const { id: _stepId, ruleId: _ruleId, ...rest } = parsed;
        return rest;
      });
      const saved = await storage.upsertNotificationRoutingRule({
        ...rule,
        id,
        steps: sanitizedSteps,
      });
      res.status(201).json(saved);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(
          new HttpError(400, "Invalid routing rule payload", error.errors),
        );
      }
      next(new HttpError(500, "Failed to save notification rule"));
    }
  });

  employeesRouter.put("/api/notifications/rules/:id", async (req, res, next) => {
    try {
      const payload = upsertNotificationRoutingRuleSchema.parse({
        ...req.body,
        id: req.params.id,
      });
      const { steps = [], id, ...rule } = payload;
      const sanitizedSteps = steps.map(step => {
        const parsed = notificationEscalationStepInputSchema.parse(step);
        const { id: _stepId, ruleId: _ruleId, ...rest } = parsed;
        return rest;
      });
      const saved = await storage.upsertNotificationRoutingRule({
        ...rule,
        id,
        steps: sanitizedSteps,
      });
      res.json(saved);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(
          new HttpError(400, "Invalid routing rule payload", error.errors),
        );
      }
      next(new HttpError(500, "Failed to update notification rule"));
    }
  });

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
      const body = req.body ?? {};
      const durationMinutes = body.durationMinutes
        ? Number(body.durationMinutes)
        : undefined;
      const candidate = body.snoozedUntil ? new Date(body.snoozedUntil) : undefined;
      const untilDate =
        candidate && !Number.isNaN(candidate.getTime())
          ? candidate
          : durationMinutes && !Number.isNaN(durationMinutes)
          ? new Date(Date.now() + durationMinutes * 60_000)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const iso = untilDate.toISOString();
      const updated = await storage.updateNotification(req.params.id, {
        snoozedUntil: untilDate,
        status: 'unread',
        escalationStatus: 'pending',
        slaDueAt: untilDate,
      });
      if (!updated)
        return next(new HttpError(404, "Notification not found"));
      res.json({ message: "Notification snoozed", snoozedUntil: iso });
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

  employeesRouter.post(
    "/api/notifications/:id/escalate",
    async (req, res, next) => {
      try {
        const notifications = await storage.getNotifications();
        const notification = notifications.find(n => n.id === req.params.id);
        if (!notification) {
          return next(new HttpError(404, "Notification not found"));
        }

        const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
        const result = await escalateNotificationService({
          storage,
          notification,
          reason,
        });

        if (!result.step) {
          return res.json({ message: "No further escalation required" });
        }

        try {
          await storage.createEmployeeEvent({
            employeeId: notification.employeeId,
            eventType: 'workflow',
            title: `Escalation level ${result.step.level}: ${notification.title}`,
            description:
              reason ||
              result.step.messageTemplate ||
              `Escalated via ${result.step.channel}`,
            amount: '0',
            eventDate: new Date().toISOString().split('T')[0],
            affectsPayroll: false,
            recurrenceType: 'none',
            status: 'active',
          });
        } catch (eventError) {
          console.warn('Failed to create escalation follow-up event', eventError);
        }

        res.json({
          message: 'Escalation triggered',
          step: result.step,
          historyEntry: result.historyEntry,
        });
      } catch (error) {
        next(new HttpError(500, 'Failed to escalate notification'));
      }
    },
  );

  employeesRouter.post(
    "/api/notifications/digest",
    async (req, res, next) => {
      try {
        const email = req.body?.recipientEmail as string | undefined;
        if (!email) {
          return next(new HttpError(400, "Recipient email is required"));
        }
        const unread = await storage.getUnreadNotifications();
        const delivered = await sendNotificationDigest({
          notifications: unread,
          recipientEmail: email,
        });
        res.json({ delivered, count: unread.length });
      } catch (error) {
        next(new HttpError(500, "Failed to send notification digest"));
      }
    },
  );

  employeesRouter.post(
    "/api/notifications/run-escalations",
    async (_req, res, next) => {
      try {
        const escalated = await escalateOverdueNotifications(storage);
        res.json({ escalated });
      } catch (error) {
        next(new HttpError(500, "Failed to process escalations"));
      }
    },
  );

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
          recurrenceType: 'none',
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
          recurrenceType: 'none',
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
        recurrenceType: 'none',
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
          deliveryChannels: ['email'],
          escalationHistory: [],
          documentEventId: newEvent.id as any,
          documentUrl: pdfDataUrl,
        });
      }
      res.status(201).json(newEvent);
    } catch (error) {
      next(new HttpError(500, "Failed to save employee document"));
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

  employeesRouter.get("/api/fleet/expiry-check", async (_req, res, next) => {
    try {
      const fleetChecks = await storage.checkFleetExpiries();
      res.json(fleetChecks);
    } catch (error) {
      next(new HttpError(500, "Failed to check fleet expiries"));
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
        if (!check.employeeId) {
          continue;
        }
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
            emailSent: false,
            deliveryChannels: ['email'],
            escalationHistory: [],
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
            emailSent: false,
            deliveryChannels: ['email'],
            escalationHistory: [],
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
            emailSent: false,
            deliveryChannels: ['email'],
            escalationHistory: [],
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

        // Check driving license expiry (optional property populated by storage)
        if (check.drivingLicense && shouldSendAlert(check.drivingLicense.expiryDate, check.drivingLicense.alertDays)) {
          const emailContent = generateExpiryWarningEmail(
            employee,
            'driving_license',
            check.drivingLicense.expiryDate,
            check.drivingLicense.daysUntilExpiry,
            check.drivingLicense.number
          );

          await storage.createNotification({
            employeeId: check.employeeId,
            type: 'driving_license_expiry',
            title: emailContent.subject,
            message: `Driving License expires in ${check.drivingLicense.daysUntilExpiry} days`,
            priority:
              check.drivingLicense.daysUntilExpiry <= 7
                ? 'critical'
                : check.drivingLicense.daysUntilExpiry <= 30
                ? 'high'
                : 'medium',
            expiryDate: check.drivingLicense.expiryDate,
            daysUntilExpiry: check.drivingLicense.daysUntilExpiry,
            emailSent: false,
            deliveryChannels: ['email'],
            escalationHistory: [],
          });

          const emailSent = await sendEmail({
            to: employee.email || '',
            from: process.env.FROM_EMAIL || 'hr@company.com',
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
          });

          if (emailSent) emailsSent++;
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
      const { employeeId: employeeIdParam } = req.query;
      const startDateParam = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
      const endDateParam = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
      const eventTypeParam = typeof req.query.eventType === "string" ? req.query.eventType : undefined;

      const parseDate = (value?: string) => {
        if (!value) return undefined;
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          return undefined;
        }
        return parsed;
      };

      const startDate = parseDate(startDateParam);
      if (startDateParam && !startDate) {
        return next(new HttpError(400, "Invalid startDate"));
      }

      const endDate = parseDate(endDateParam);
      if (endDateParam && !endDate) {
        return next(new HttpError(400, "Invalid endDate"));
      }

      const trimmedEmployeeId =
        typeof employeeIdParam === "string" && employeeIdParam.trim() !== ""
          ? employeeIdParam.trim()
          : undefined;

      let eventType: InsertEmployeeEvent["eventType"] | undefined;
      if (eventTypeParam) {
        const parsedType = insertEmployeeEventSchema.shape.eventType.safeParse(eventTypeParam);
        if (!parsedType.success) {
          return next(new HttpError(400, "Invalid eventType"));
        }
        eventType = parsedType.data;
      }

      const events = await storage.getEmployeeEvents(startDate, endDate, {
        employeeId: trimmedEmployeeId,
        eventType,
      });

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
          recurrenceType: 'none',
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
            recurrenceType: 'none',
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
