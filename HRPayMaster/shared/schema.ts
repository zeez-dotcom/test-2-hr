import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, numeric, date, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import {
  parseNumber,
  parseBoolean,
  parseDateToISO,
  emptyToUndef,
  normalizeBigId,
} from "../server/utils/normalize";

const parseDate = (v: unknown) => parseDateToISO(v).value;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("viewer"),
});

export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
});

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
});

export const employees = pgTable("employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeCode: varchar("employee_code").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  arabicName: text("arabic_name"),
  nickname: text("nickname"),
  email: text("email"),
  phone: text("phone"),
  position: text("position").notNull(),
  role: text("role").notNull().default("employee"),
  departmentId: varchar("department_id").references(() => departments.id),
  companyId: varchar("company_id").references(() => companies.id),
  salary: numeric("salary", { precision: 10, scale: 2 }).notNull(),
  additions: numeric("additions", { precision: 10, scale: 2 }),
  workLocation: varchar("work_location", { length: 100 }).default("Office").notNull(),
  startDate: date("start_date").notNull(),
  status: text("status").notNull().default("active"), // active, inactive, on_leave, vacation
  bankIban: text("bank_iban"),
  bankName: text("bank_name"),
  iban: text("iban"),
  swiftCode: text("swift_code"),
  emergencyContact: text("emergency_contact"),
  emergencyPhone: text("emergency_phone"),
  nationalId: text("national_id"),
  address: text("address"),
  dateOfBirth: date("date_of_birth"),
  nationality: text("nationality"),
  professionCode: text("profession_code"),
  profession: text("profession"),
  paymentMethod: text("payment_method"),
  transferable: boolean("transferable"),
  drivingLicenseNumber: text("driving_license_number"),
  drivingLicenseIssueDate: date("driving_license_issue_date"),
  drivingLicenseExpiryDate: date("driving_license_expiry_date"),
  drivingLicenseImage: text("driving_license_image"),
  otherDocs: text("other_docs"),
  additionalDocs: text("additional_docs"),
  residencyName: text("residency_name"),
  residencyOnCompany: boolean("residency_on_company"),
  professionCategory: text("profession_category"),
  
  // Visa Information
  visaNumber: text("visa_number"),
  visaType: text("visa_type"),
  visaIssueDate: date("visa_issue_date"),
  visaExpiryDate: date("visa_expiry_date"),
  visaAlertDays: integer("visa_alert_days").default(30), // Days before expiry to alert
  
  // Civil ID Information
  civilId: text("civil_id"),
  civilIdIssueDate: date("civil_id_issue_date"),
  civilIdExpiryDate: date("civil_id_expiry_date"),
  civilIdAlertDays: integer("civil_id_alert_days").default(60), // Days before expiry to alert
  
  // Passport Information
  passportNumber: text("passport_number"),
  passportIssueDate: date("passport_issue_date"),
  passportExpiryDate: date("passport_expiry_date"),
  passportAlertDays: integer("passport_alert_days").default(90), // Days before expiry to alert
  // Image uploads
  profileImage: text("profile_image"), // Base64 or file path for profile picture
  visaImage: text("visa_image"), // Base64 or file path for visa document
  civilIdImage: text("civil_id_image"), // Base64 or file path for civil ID document
  passportImage: text("passport_image"), // Base64 or file path for passport document
  
  // Working days configuration
  standardWorkingDays: integer("standard_working_days").notNull().default(26), // Standard working days per month for this employee
});

export const employeeCustomFields = pgTable("employee_custom_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
});

export const employeeCustomValues = pgTable("employee_custom_values", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  fieldId: varchar("field_id").references(() => employeeCustomFields.id).notNull(),
  value: text("value"),
});

export const vacationRequests = pgTable("vacation_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  days: integer("days").notNull(),
  reason: text("reason"),
  leaveType: text("leave_type").notNull().default("annual"), // annual, sick, emergency, unpaid
  deductFromSalary: boolean("deduct_from_salary").notNull().default(false),
  documentUrl: text("document_url"), // For medical certificates, emergency docs, etc.
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  approvedBy: varchar("approved_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Sick leave tracking table
export const sickLeaveTracking = pgTable("sick_leave_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  year: integer("year").notNull(),
  totalSickDaysUsed: integer("total_sick_days_used").notNull().default(0),
  remainingSickDays: integer("remaining_sick_days").notNull().default(14), // 14 days max per year
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const loans = pgTable("loans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  remainingAmount: numeric("remaining_amount", { precision: 12, scale: 2 }).notNull(),
  monthlyDeduction: numeric("monthly_deduction", { precision: 10, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 5, scale: 2 }).default("0"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  status: text("status").notNull().default("pending"), // pending, active, completed, cancelled
  reason: text("reason"),
  approvedBy: varchar("approved_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cars = pgTable("cars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  plateNumber: text("plate_number").notNull().unique(),
  vin: text("vin"),
  color: text("color"),
  fuelType: text("fuel_type"), // gasoline, diesel, hybrid, electric
  mileage: integer("mileage").default(0),
  status: text("status").notNull().default("available"), // available, assigned, maintenance, out_of_service
  purchaseDate: date("purchase_date"),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
  insuranceExpiry: date("insurance_expiry"),
  registrationExpiry: date("registration_expiry"),
  registrationOwner: text("registration_owner"), // Owner name as listed on the registration document
  registrationDocumentImage: text("registration_document_image"), // Image or scan of the registration document
  serial: text("serial"),
  company: text("company"),
  registrationBookName: text("registration_book_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const carAssignments = pgTable("car_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  carId: varchar("car_id").references(() => cars.id).notNull(),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  assignedDate: date("assigned_date").notNull(),
  returnDate: date("return_date"),
  status: text("status").notNull().default("active"), // active, completed
  assignedBy: varchar("assigned_by").references(() => employees.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const assets = pgTable("assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("available"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const assetAssignments = pgTable("asset_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").references(() => assets.id).notNull(),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  assignedDate: date("assigned_date").notNull(),
  returnDate: date("return_date"),
  status: text("status").notNull().default("active"),
  assignedBy: varchar("assigned_by").references(() => employees.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const payrollRuns = pgTable("payroll_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  period: text("period").notNull(), // e.g., "Jan 2024"
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  grossAmount: numeric("gross_amount", { precision: 12, scale: 2 }).notNull(),
  totalDeductions: numeric("total_deductions", { precision: 12, scale: 2 }).notNull(),
  netAmount: numeric("net_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, completed, cancelled
  createdAt: timestamp("created_at").defaultNow(),
});

export const payrollEntries = pgTable("payroll_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payrollRunId: varchar("payroll_run_id").references(() => payrollRuns.id).notNull(),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  grossPay: numeric("gross_pay", { precision: 10, scale: 2 }).notNull(),
  baseSalary: numeric("base_salary", { precision: 10, scale: 2 }).notNull().default("0"),
  bonusAmount: numeric("bonus_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  workingDays: integer("working_days").notNull().default(30),
  actualWorkingDays: integer("actual_working_days").notNull().default(30),
  vacationDays: integer("vacation_days").notNull().default(0),
  taxDeduction: numeric("tax_deduction", { precision: 10, scale: 2 }).notNull().default("0"),
  socialSecurityDeduction: numeric("social_security_deduction", { precision: 10, scale: 2 }).notNull().default("0"),
  healthInsuranceDeduction: numeric("health_insurance_deduction", { precision: 10, scale: 2 }).notNull().default("0"),
  loanDeduction: numeric("loan_deduction", { precision: 10, scale: 2 }).notNull().default("0"),
  otherDeductions: numeric("other_deductions", { precision: 10, scale: 2 }).notNull().default("0"),
  netPay: numeric("net_pay", { precision: 10, scale: 2 }).notNull(),
  adjustmentReason: text("adjustment_reason"), // Explanation for any adjustments
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications table for document expiry alerts
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  type: text("type").notNull(), // visa_expiry, civil_id_expiry, passport_expiry, loan_deduction, vacation_approved, status_change, salary_adjustment
  title: text("title").notNull(),
  message: text("message").notNull(),
  priority: text("priority").notNull().default("medium"), // low, medium, high, critical
  status: text("status").notNull().default("unread"), // unread, read, dismissed
  expiryDate: date("expiry_date").notNull(),
  daysUntilExpiry: integer("days_until_expiry").notNull(),
  emailSent: boolean("email_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Email alerts log
export const emailAlerts = pgTable("email_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  notificationId: varchar("notification_id").references(() => notifications.id),
  emailType: text("email_type").notNull(), // expiry_warning, critical_alert
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  recipient: text("recipient").notNull(),
  status: text("status").notNull().default("pending"), // pending, sent, failed
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Employee events for payroll adjustments
export const employeeEvents = pgTable("employee_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  eventType: text("event_type").notNull(), // bonus, deduction, allowance, overtime, penalty, vacation, employee_update, document_update, fleet_assignment, fleet_update, fleet_removal
  title: text("title").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  eventDate: date("event_date").notNull(),
  affectsPayroll: boolean("affects_payroll").default(true),
  documentUrl: text("document_url"), // For uploaded supporting documents
  status: text("status").notNull().default("active"), // active, cancelled, processed
  addedBy: varchar("added_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
});

export const insertEmployeeSchema = createInsertSchema(employees)
  .omit({ id: true })
  .partial({
    arabicName: true,
    nickname: true,
    lastName: true,
    email: true,
    phone: true,
    role: true,
    departmentId: true,
    companyId: true,
    workLocation: true,
    status: true,
    bankIban: true,
    bankName: true,
    iban: true,
    swiftCode: true,
    emergencyContact: true,
    emergencyPhone: true,
    nationalId: true,
    address: true,
    dateOfBirth: true,
    nationality: true,
    professionCode: true,
    profession: true,
    paymentMethod: true,
    transferable: true,
    drivingLicenseNumber: true,
    drivingLicenseIssueDate: true,
    drivingLicenseExpiryDate: true,
    drivingLicenseImage: true,
    otherDocs: true,
    additionalDocs: true,
    residencyName: true,
    residencyOnCompany: true,
    professionCategory: true,
    visaNumber: true,
    visaType: true,
    visaIssueDate: true,
    visaExpiryDate: true,
    visaAlertDays: true,
    civilId: true,
    civilIdIssueDate: true,
    civilIdExpiryDate: true,
    civilIdAlertDays: true,
    passportNumber: true,
    passportIssueDate: true,
    passportExpiryDate: true,
    passportAlertDays: true,
    profileImage: true,
    visaImage: true,
    civilIdImage: true,
    passportImage: true,
    additions: true,
    standardWorkingDays: true,
  })
  .extend({
    employeeCode: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : String(val);
    }, z.string().optional()),
    salary: z.preprocess(parseNumber, z.number()),
    additions: z.preprocess(parseNumber, z.number().optional()),
    visaAlertDays: z.preprocess(parseNumber, z.number().optional()),
    civilIdAlertDays: z.preprocess(parseNumber, z.number().optional()),
    passportAlertDays: z.preprocess(parseNumber, z.number().optional()),
    standardWorkingDays: z.preprocess(parseNumber, z.number().optional()),
    transferable: z.preprocess(parseBoolean, z.boolean().optional()),
    residencyOnCompany: z.preprocess(parseBoolean, z.boolean().optional()),
    startDate: z.preprocess(parseDate, z.string()),
    drivingLicenseIssueDate: z.preprocess(parseDate, z.string().nullable().optional()),
    drivingLicenseExpiryDate: z.preprocess(parseDate, z.string().nullable().optional()),
    visaIssueDate: z.preprocess(parseDate, z.string().nullable().optional()),
    visaExpiryDate: z.preprocess(parseDate, z.string().nullable().optional()),
    civilIdIssueDate: z.preprocess(parseDate, z.string().nullable().optional()),
    civilIdExpiryDate: z.preprocess(parseDate, z.string().nullable().optional()),
    passportIssueDate: z.preprocess(parseDate, z.string().nullable().optional()),
    passportExpiryDate: z.preprocess(parseDate, z.string().nullable().optional()),
    dateOfBirth: z.preprocess(parseDate, z.string().nullable().optional()),
    civilId: z.preprocess(normalizeBigId, z.string().optional()),
    passportNumber: z.preprocess(normalizeBigId, z.string().optional()),
    phone: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : String(val);
    }, z.string().optional()),
    emergencyPhone: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : String(val);
    }, z.string().optional()),
    nationalId: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : String(val);
    }, z.string().optional()),
    iban: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : String(val).replace(/\s+/g, '').toUpperCase();
    }, z.string().optional()),
    swiftCode: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : String(val);
    }, z.string().optional()),
  });

export const insertEmployeeCustomFieldSchema = createInsertSchema(employeeCustomFields).omit({
  id: true,
});

export const insertEmployeeCustomValueSchema = createInsertSchema(employeeCustomValues).omit({
  id: true,
});

export const insertPayrollRunSchema = createInsertSchema(payrollRuns).omit({
  id: true,
  createdAt: true,
});

export const insertPayrollEntrySchema = createInsertSchema(payrollEntries).omit({
  id: true,
});

export const insertVacationRequestSchema = createInsertSchema(vacationRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLoanSchema = createInsertSchema(loans)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    employeeId: z.preprocess(normalizeBigId, z.string()),
    amount: z.preprocess(parseNumber, z.number()),
    remainingAmount: z.preprocess(parseNumber, z.number().optional()),
    monthlyDeduction: z.preprocess(parseNumber, z.number()),
    interestRate: z.preprocess(parseNumber, z.number().optional()),
    startDate: z.preprocess(parseDate, z.string()),
    endDate: z.preprocess(v => {
      const val = parseDate(v);
      return val === null ? undefined : val;
    }, z.string().optional()),
    status: z.preprocess(v => emptyToUndef(v), z.string().optional()),
    reason: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : String(val);
    }, z.string().optional()),
    approvedBy: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : normalizeBigId(val);
    }, z.string().optional()),
  });

export const insertCarSchema = createInsertSchema(cars)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    year: z.preprocess(parseNumber, z.number()),
    mileage: z.preprocess(parseNumber, z.number()).optional(),
    purchasePrice: z.preprocess(parseNumber, z.number()).optional(),
    registrationOwner: z
      .preprocess(v => {
        const val = emptyToUndef(v);
        return val === undefined ? undefined : String(val);
      }, z.string().optional()), // Owner name as on the registration document
    registrationDocumentImage: z
      .preprocess(v => {
        const val = emptyToUndef(v);
        return val === undefined ? undefined : String(val);
      }, z.string().optional()), // Image or scan of the registration document
  });

export const insertCarAssignmentSchema = createInsertSchema(carAssignments).omit({
  id: true,
  createdAt: true,
});

export const insertAssetSchema = createInsertSchema(assets).omit({
  id: true,
  createdAt: true,
});

export const insertAssetAssignmentSchema = createInsertSchema(assetAssignments).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertEmailAlertSchema = createInsertSchema(emailAlerts).omit({
  id: true,
  createdAt: true,
});

const baseInsertEmployeeEventSchema = createInsertSchema(employeeEvents).omit({
  id: true,
  createdAt: true,
});

export const insertEmployeeEventSchema = baseInsertEmployeeEventSchema.extend({
  eventType: z.enum([
    "bonus",
    "deduction",
    "allowance",
    "overtime",
    "penalty",
    "vacation",
    "employee_update",
    "document_update",
    "fleet_assignment",
    "fleet_update",
    "fleet_removal",
  ]),
  amount: baseInsertEmployeeEventSchema.shape.amount.optional().default("0"),
});

export const insertSickLeaveTrackingSchema = createInsertSchema(sickLeaveTracking).omit({
  id: true,
  lastUpdated: true,
});

// Types
export type User = typeof users.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;

export type EmployeeCustomField = typeof employeeCustomFields.$inferSelect;
export type InsertEmployeeCustomField = z.infer<typeof insertEmployeeCustomFieldSchema>;

export type EmployeeCustomValue = typeof employeeCustomValues.$inferSelect;
export type InsertEmployeeCustomValue = z.infer<typeof insertEmployeeCustomValueSchema>;

export type PayrollRun = typeof payrollRuns.$inferSelect;
export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;

export type PayrollEntry = typeof payrollEntries.$inferSelect;
export type InsertPayrollEntry = z.infer<typeof insertPayrollEntrySchema>;

export type VacationRequest = typeof vacationRequests.$inferSelect;
export type InsertVacationRequest = z.infer<typeof insertVacationRequestSchema>;

export type Loan = typeof loans.$inferSelect;
export type InsertLoan = z.infer<typeof insertLoanSchema>;

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;

export type AssetAssignment = typeof assetAssignments.$inferSelect;
export type InsertAssetAssignment = z.infer<typeof insertAssetAssignmentSchema>;

export type Car = typeof cars.$inferSelect;
export type InsertCar = z.infer<typeof insertCarSchema>;

export type CarAssignment = typeof carAssignments.$inferSelect;
export type InsertCarAssignment = z.infer<typeof insertCarAssignmentSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type EmailAlert = typeof emailAlerts.$inferSelect;
export type InsertEmailAlert = z.infer<typeof insertEmailAlertSchema>;

export type EmployeeEvent = typeof employeeEvents.$inferSelect;
export type InsertEmployeeEvent = z.infer<typeof insertEmployeeEventSchema>;

export type SickLeaveTracking = typeof sickLeaveTracking.$inferSelect;
export type InsertSickLeaveTracking = z.infer<typeof insertSickLeaveTrackingSchema>;

// Extended types with relations
export type NotificationWithEmployee = Notification & {
  employee: Employee;
};

export type DocumentExpiryCheck = {
  employeeId: string;
  employeeName: string;
  email: string | null;
  visa?: {
    number: string;
    expiryDate: string;
    alertDays: number;
    daysUntilExpiry: number;
  };
  civilId?: {
    number: string;
    expiryDate: string;
    alertDays: number;
    daysUntilExpiry: number;
  };
  passport?: {
    number: string;
    expiryDate: string;
    alertDays: number;
    daysUntilExpiry: number;
  };
};

// Extended types for API responses
export type EmployeeWithDepartment = Employee & {
  department?: Department;
  company?: Company;
};

export type PayrollRunWithEntries = PayrollRun & {
  entries?: PayrollEntry[];
};

export type VacationRequestWithEmployee = VacationRequest & {
  employee?: Employee;
  approver?: Employee;
};

export type LoanWithEmployee = Loan & {
  employee?: Employee;
  approver?: Employee;
};

export type CarWithAssignment = Car & {
  currentAssignment?: CarAssignment & {
    employee?: Employee;
  };
};

export type CarAssignmentWithDetails = CarAssignment & {
  car?: Car;
  employee?: Employee;
  assigner?: Employee;
};

export type AssetWithAssignment = Asset & {
  currentAssignment?: AssetAssignment & {
    employee?: Employee;
  };
};

export type AssetAssignmentWithDetails = AssetAssignment & {
  asset?: Asset;
  employee?: Employee;
  assigner?: Employee;
};

// Relations
export const companiesRelations = relations(companies, ({ many }) => ({
  employees: many(employees),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  employees: many(employees),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  company: one(companies, {
    fields: [employees.companyId],
    references: [companies.id],
  }),
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
  }),
  vacationRequests: many(vacationRequests),
  loans: many(loans),
  carAssignments: many(carAssignments),
  assetAssignments: many(assetAssignments),
  notifications: many(notifications),
  emailAlerts: many(emailAlerts),
  customValues: many(employeeCustomValues),
}));

export const employeeCustomFieldsRelations = relations(employeeCustomFields, ({ many }) => ({
  values: many(employeeCustomValues),
}));

export const employeeCustomValuesRelations = relations(employeeCustomValues, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeCustomValues.employeeId],
    references: [employees.id],
  }),
  field: one(employeeCustomFields, {
    fields: [employeeCustomValues.fieldId],
    references: [employeeCustomFields.id],
  }),
}));

export const vacationRequestsRelations = relations(vacationRequests, ({ one }) => ({
  employee: one(employees, {
    fields: [vacationRequests.employeeId],
    references: [employees.id],
  }),
  approver: one(employees, {
    fields: [vacationRequests.approvedBy],
    references: [employees.id],
  }),
}));

export const loansRelations = relations(loans, ({ one }) => ({
  employee: one(employees, {
    fields: [loans.employeeId],
    references: [employees.id],
  }),
  approver: one(employees, {
    fields: [loans.approvedBy],
    references: [employees.id],
  }),
}));

export const carsRelations = relations(cars, ({ many }) => ({
  assignments: many(carAssignments),
}));

export const carAssignmentsRelations = relations(carAssignments, ({ one }) => ({
  car: one(cars, {
    fields: [carAssignments.carId],
    references: [cars.id],
  }),
  employee: one(employees, {
    fields: [carAssignments.employeeId],
    references: [employees.id],
  }),
  assigner: one(employees, {
    fields: [carAssignments.assignedBy],
    references: [employees.id],
  }),
}));

export const assetsRelations = relations(assets, ({ many }) => ({
  assignments: many(assetAssignments),
}));

export const assetAssignmentsRelations = relations(assetAssignments, ({ one }) => ({
  asset: one(assets, {
    fields: [assetAssignments.assetId],
    references: [assets.id],
  }),
  employee: one(employees, {
    fields: [assetAssignments.employeeId],
    references: [employees.id],
  }),
  assigner: one(employees, {
    fields: [assetAssignments.assignedBy],
    references: [employees.id],
  }),
}));

export const payrollRunsRelations = relations(payrollRuns, ({ many }) => ({
  entries: many(payrollEntries),
}));

export const payrollEntriesRelations = relations(payrollEntries, ({ one }) => ({
  payrollRun: one(payrollRuns, {
    fields: [payrollEntries.payrollRunId],
    references: [payrollRuns.id],
  }),
  employee: one(employees, {
    fields: [payrollEntries.employeeId],
    references: [employees.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one, many }) => ({
  employee: one(employees, {
    fields: [notifications.employeeId],
    references: [employees.id],
  }),
  emailAlerts: many(emailAlerts),
}));

export const emailAlertsRelations = relations(emailAlerts, ({ one }) => ({
  employee: one(employees, {
    fields: [emailAlerts.employeeId],
    references: [employees.id],
  }),
  notification: one(notifications, {
    fields: [emailAlerts.notificationId],
    references: [notifications.id],
  }),
}));

export const employeeEventsRelations = relations(employeeEvents, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeEvents.employeeId],
    references: [employees.id],
  }),
  addedBy: one(employees, {
    fields: [employeeEvents.addedBy],
    references: [employees.id],
  }),
}));
