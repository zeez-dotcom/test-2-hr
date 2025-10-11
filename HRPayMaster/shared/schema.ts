import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  numeric,
  date,
  timestamp,
  boolean,
  integer,
  index,
  jsonb,
  time,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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

export type VacationApprovalStep = {
  approverId: string;
  status: "pending" | "approved" | "rejected" | "delegated";
  actedAt?: string | null;
  notes?: string | null;
  delegatedToId?: string | null;
};

export type VacationAuditLogEntry = {
  id: string;
  actorId: string;
  action: "created" | "updated" | "approved" | "rejected" | "delegated" | "comment";
  actionAt: string;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("viewer"),
  active: boolean("active").notNull().default(true),
});

export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
});

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  logo: text("logo"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  useAttendanceForDeductions: boolean("use_attendance_for_deductions").notNull().default(false),
  payrollSettings: text("payroll_settings"),
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

export const allowanceTypes = pgTable("allowance_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const employeeCustomValues = pgTable("employee_custom_values", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  fieldId: varchar("field_id").references(() => employeeCustomFields.id).notNull(),
  value: text("value"),
});

export const employeeWorkflows = pgTable(
  "employee_workflows",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id").references(() => employees.id).notNull(),
    workflowType: text("workflow_type").notNull(),
    status: text("status").notNull().default("pending"),
    startedAt: timestamp("started_at").defaultNow(),
    completedAt: timestamp("completed_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    employeeIdx: index("employee_workflows_employee_id_idx").on(t.employeeId),
    typeIdx: index("employee_workflows_type_idx").on(t.workflowType),
  }),
);

export const employeeWorkflowSteps = pgTable(
  "employee_workflow_steps",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: varchar("workflow_id").references(() => employeeWorkflows.id).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    stepType: text("step_type").notNull(),
    status: text("status").notNull().default("pending"),
    orderIndex: integer("order_index").notNull().default(0),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    workflowIdx: index("employee_workflow_steps_workflow_id_idx").on(t.workflowId),
  }),
);

export const leaveAccrualPolicies = pgTable(
  "leave_accrual_policies",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    leaveType: text("leave_type").notNull(),
    accrualRatePerMonth: numeric("accrual_rate_per_month", { precision: 6, scale: 2 }).notNull(),
    maxBalanceDays: numeric("max_balance_days", { precision: 6, scale: 2 }),
    carryoverLimitDays: numeric("carryover_limit_days", { precision: 6, scale: 2 }),
    allowNegativeBalance: boolean("allow_negative_balance").notNull().default(false),
    effectiveFrom: date("effective_from").notNull(),
    expiresOn: date("expires_on"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  t => ({
    leaveTypeIdx: index("leave_accrual_policies_leave_type_idx").on(t.leaveType),
    nameIdx: uniqueIndex("leave_accrual_policies_name_idx").on(t.name),
  }),
);

export const employeeLeavePolicies = pgTable(
  "employee_leave_policies",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id").references(() => employees.id).notNull(),
    policyId: varchar("policy_id").references(() => leaveAccrualPolicies.id).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    customAccrualRatePerMonth: numeric("custom_accrual_rate_per_month", { precision: 6, scale: 2 }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  t => ({
    employeePolicyIdx: uniqueIndex("employee_leave_policy_unique")
      .on(t.employeeId, t.policyId, t.effectiveFrom),
  }),
);

export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id").references(() => employees.id).notNull(),
    leaveType: text("leave_type").notNull(),
    year: integer("year").notNull(),
    balanceDays: numeric("balance_days", { precision: 8, scale: 2 }).notNull().default("0"),
    carryoverDays: numeric("carryover_days", { precision: 8, scale: 2 }).notNull().default("0"),
    lastAccruedAt: timestamp("last_accrued_at"),
    policyId: varchar("policy_id").references(() => leaveAccrualPolicies.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  t => ({
    employeeLeaveIdx: uniqueIndex("leave_balances_employee_type_year_idx")
      .on(t.employeeId, t.leaveType, t.year),
  }),
);

export const leaveAccrualLedger = pgTable(
  "leave_accrual_ledger",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id").references(() => employees.id).notNull(),
    policyId: varchar("policy_id").references(() => leaveAccrualPolicies.id).notNull(),
    leaveType: text("leave_type").notNull(),
    accrualDate: date("accrual_date").notNull(),
    amount: numeric("amount", { precision: 6, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 8, scale: 2 }),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  t => ({
    employeePolicyDateIdx: uniqueIndex("leave_accrual_employee_policy_month_idx")
      .on(t.employeeId, t.policyId, t.accrualDate),
  }),
);

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
  currentApprovalStep: integer("current_approval_step").notNull().default(0),
  approvalChain: jsonb("approval_chain")
    .$type<VacationApprovalStep[]>()
    .default(sql`'[]'::jsonb`),
  auditLog: jsonb("audit_log")
    .$type<VacationAuditLogEntry[]>()
    .default(sql`'[]'::jsonb`),
  delegateApproverId: varchar("delegate_approver_id").references(() => employees.id),
  appliesPolicyId: varchar("applies_policy_id").references(() => leaveAccrualPolicies.id),
  autoPauseAllowances: boolean("auto_pause_allowances").notNull().default(false),
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
  carImage: text("car_image"), // Main car image
  registrationVideo: text("registration_video"), // Optional video demonstrating registration/inspection
  spareTireCount: integer("spare_tire_count").default(0),
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
  employeeId: varchar("employee_id").references(() => employees.id),
  assignedDate: date("assigned_date").notNull(),
  returnDate: date("return_date"),
  status: text("status").notNull().default("active"),
  assignedBy: varchar("assigned_by").references(() => employees.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Asset repair logs (parallel to car repairs)
export const assetRepairs = pgTable("asset_repairs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").references(() => assets.id).notNull(),
  repairDate: date("repair_date").notNull(),
  description: text("description").notNull(),
  cost: numeric("cost", { precision: 12, scale: 2 }),
  vendor: text("vendor"),
  documentUrl: text("document_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Asset documents (files stored as data URLs or links)
export const assetDocuments = pgTable("asset_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").references(() => assets.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  documentUrl: text("document_url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Generic generated documents (optionally linked to employee)
export const genericDocuments = pgTable("generic_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id),
  title: text("title").notNull(),
  description: text("description"),
  documentUrl: text("document_url").notNull(),
  category: text("category"),
  tags: text("tags"),
  referenceNumber: text("reference_number"),
  controllerNumber: text("controller_number"),
  expiryDate: date("expiry_date"),
  alertDays: integer("alert_days"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Document templates (NOC/Offer/Warning/Experience) editable in Settings
export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // key identifies the template: noc, offer, warning, experience
  key: text("key").notNull().unique(),
  en: text("en").notNull(),
  ar: text("ar").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Car repair logs
export const carRepairs = pgTable("car_repairs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  carId: varchar("car_id").references(() => cars.id).notNull(),
  repairDate: date("repair_date").notNull(),
  description: text("description").notNull(),
  cost: numeric("cost", { precision: 12, scale: 2 }),
  vendor: text("vendor"),
  documentUrl: text("document_url"),
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

export const payrollEntries = pgTable(
  "payroll_entries",
  {
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
  },
  (t) => ({
    payrollEntriesEmployeeIdx: index("payroll_entries_employee_id_idx").on(t.employeeId),
    payrollEntriesDateIdx: index("payroll_entries_date_idx").on(t.createdAt),
  })
);

export const loanPayments = pgTable("loan_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: varchar("loan_id").references(() => loans.id).notNull(),
  payrollRunId: varchar("payroll_run_id").references(() => payrollRuns.id).notNull(),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  appliedDate: date("applied_date").default(sql`CURRENT_DATE`).notNull(),
  source: text("source").notNull().default("payroll"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications table for document expiry alerts
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  type: text("type").notNull(), // visa_expiry, civil_id_expiry, passport_expiry, driving_license_expiry, vacation_return_due, loan_deduction, vacation_approved, status_change, salary_adjustment
  title: text("title").notNull(),
  message: text("message").notNull(),
  priority: text("priority").notNull().default("medium"), // low, medium, high, critical
  status: text("status").notNull().default("unread"), // unread, read, dismissed
  expiryDate: date("expiry_date").notNull(),
  daysUntilExpiry: integer("days_until_expiry").notNull(),
  emailSent: boolean("email_sent").default(false),
  snoozedUntil: timestamp("snoozed_until"),
  documentEventId: varchar("document_event_id"),
  documentUrl: text("document_url"),
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
export const employeeEvents = pgTable(
  "employee_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id").references(() => employees.id).notNull(),
    eventType: text("event_type").notNull(), // bonus, deduction, allowance, overtime, penalty, vacation, employee_update, document_update, asset_assignment, asset_update, asset_removal
    title: text("title").notNull(),
    description: text("description").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
    eventDate: date("event_date").notNull(),
    affectsPayroll: boolean("affects_payroll").default(true),
    documentUrl: text("document_url"), // For uploaded supporting documents
    status: text("status").notNull().default("active"), // active, cancelled, processed
    addedBy: varchar("added_by").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow(),
    recurrenceType: text("recurrence_type").notNull().default("none"),
    recurrenceEndDate: date("recurrence_end_date"),
  },
  (t) => ({
    employeeEventsEmployeeIdx: index("employee_events_employee_id_idx").on(t.employeeId),
    employeeEventsDateIdx: index("employee_events_event_date_idx").on(t.eventDate),
  })
);

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

const customFieldValueInput = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const employeeCustomValuePayloadSchema = z.record(
  z.string(),
  customFieldValueInput,
);

export const insertAllowanceTypeSchema = createInsertSchema(allowanceTypes)
  .omit({
    id: true,
    normalizedName: true,
    createdAt: true,
  })
  .extend({
    name: z
      .string()
      .trim()
      .min(1, "Name is required"),
  });

export const insertEmployeeCustomValueSchema = createInsertSchema(employeeCustomValues).omit({
  id: true,
});

export type EmployeeCustomValuePayload = z.infer<
  typeof employeeCustomValuePayloadSchema
>;

export const insertPayrollRunSchema = createInsertSchema(payrollRuns).omit({
  id: true,
  createdAt: true,
});

export const insertPayrollEntrySchema = createInsertSchema(payrollEntries)
  .omit({
    id: true,
  })
  .extend({
    payrollRunId: z.preprocess(normalizeBigId, z.string()),
    employeeId: z.preprocess(normalizeBigId, z.string()),
    grossPay: z.preprocess(v => {
      const n = parseNumber(v);
      return n === undefined ? undefined : n.toString();
    }, z.string()),
    baseSalary: z.preprocess(v => {
      const n = parseNumber(v);
      return n === undefined ? undefined : n.toString();
    }, z.string()),
    bonusAmount: z.preprocess(v => {
      const n = parseNumber(v);
      return n === undefined ? undefined : n.toString();
    }, z.string()),
    workingDays: z.preprocess(parseNumber, z.number()),
    actualWorkingDays: z.preprocess(parseNumber, z.number()),
    vacationDays: z.preprocess(parseNumber, z.number()),
    taxDeduction: z.preprocess(v => {
      const n = parseNumber(v);
      return n === undefined ? undefined : n.toString();
    }, z.string()),
    socialSecurityDeduction: z.preprocess(v => {
      const n = parseNumber(v);
      return n === undefined ? undefined : n.toString();
    }, z.string()),
    healthInsuranceDeduction: z.preprocess(v => {
      const n = parseNumber(v);
      return n === undefined ? undefined : n.toString();
    }, z.string()),
    loanDeduction: z.preprocess(v => {
      const n = parseNumber(v);
      return n === undefined ? undefined : n.toString();
    }, z.string()),
    otherDeductions: z.preprocess(v => {
      const n = parseNumber(v);
      return n === undefined ? undefined : n.toString();
    }, z.string()),
    netPay: z.preprocess(v => {
      const n = parseNumber(v);
      return n === undefined ? undefined : n.toString();
    }, z.string()),
  });

export const insertVacationRequestSchema = createInsertSchema(vacationRequests)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    delegateApproverId: z.preprocess(v => {
      if (v === null) return null;
      const normalized = emptyToUndef(v);
      return normalized === undefined ? undefined : normalizeBigId(normalized);
    }, z.union([z.string(), z.null()]).optional()),
    appliesPolicyId: z.preprocess(v => {
      const normalized = emptyToUndef(v);
      return normalized === undefined ? undefined : normalizeBigId(normalized);
    }, z.string().optional()),
    autoPauseAllowances: z.preprocess(parseBoolean, z.boolean().optional()),
    approvalChain: z
      .array(
        z.object({
          approverId: z.string().min(1),
          status: z
            .enum(["pending", "approved", "rejected", "delegated"])
            .optional()
            .default("pending"),
          actedAt: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          delegatedToId: z.string().nullable().optional(),
        }),
      )
      .optional(),
    auditLog: z
      .array(
        z.object({
          id: z.string(),
          actorId: z.string(),
          action: z.enum(["created", "updated", "approved", "rejected", "delegated", "comment"]),
          actionAt: z.string(),
          notes: z.string().nullable().optional(),
          metadata: z.record(z.any()).nullable().optional(),
        }),
      )
      .optional(),
  });

export const insertLeaveAccrualPolicySchema = createInsertSchema(leaveAccrualPolicies)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    leaveType: z.string().min(1),
    accrualRatePerMonth: z.preprocess(parseNumber, z.number()),
    maxBalanceDays: z.preprocess(parseNumber, z.number().optional()),
    carryoverLimitDays: z.preprocess(parseNumber, z.number().optional()),
    effectiveFrom: z.preprocess(parseDate, z.string()),
    expiresOn: z.preprocess(v => {
      const parsed = parseDate(v);
      return parsed === null ? undefined : parsed;
    }, z.string().optional()),
  });

export const insertEmployeeLeavePolicySchema = createInsertSchema(employeeLeavePolicies)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    employeeId: z.preprocess(normalizeBigId, z.string()),
    policyId: z.preprocess(normalizeBigId, z.string()),
    effectiveFrom: z.preprocess(parseDate, z.string()),
    effectiveTo: z.preprocess(v => {
      const parsed = parseDate(v);
      return parsed === null ? undefined : parsed;
    }, z.string().optional()),
    customAccrualRatePerMonth: z.preprocess(parseNumber, z.number().optional()),
  });

export const insertLeaveBalanceSchema = createInsertSchema(leaveBalances)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    employeeId: z.preprocess(normalizeBigId, z.string()),
    leaveType: z.string().min(1),
    year: z.preprocess(parseNumber, z.number().int()),
    balanceDays: z.preprocess(parseNumber, z.number().optional()),
    carryoverDays: z.preprocess(parseNumber, z.number().optional()),
    policyId: z.preprocess(v => {
      const normalized = emptyToUndef(v);
      return normalized === undefined ? undefined : normalizeBigId(normalized);
    }, z.string().optional()),
  });

export const insertLeaveAccrualLedgerSchema = createInsertSchema(leaveAccrualLedger)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    employeeId: z.preprocess(normalizeBigId, z.string()),
    policyId: z.preprocess(normalizeBigId, z.string()),
    leaveType: z.string().min(1),
    accrualDate: z.preprocess(parseDate, z.string()),
    amount: z.preprocess(parseNumber, z.number()),
    balanceAfter: z.preprocess(parseNumber, z.number().optional()),
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

export const insertLoanPaymentSchema = createInsertSchema(loanPayments)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    loanId: z.preprocess(normalizeBigId, z.string()),
    payrollRunId: z.preprocess(normalizeBigId, z.string()),
    employeeId: z.preprocess(normalizeBigId, z.string()),
    amount: z.preprocess(parseNumber, z.number()),
    appliedDate: z.preprocess(v => {
      const val = parseDate(v);
      return val === null ? undefined : val;
    }, z.string().optional()),
    source: z.preprocess(v => emptyToUndef(v), z.string().optional()),
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
    spareTireCount: z.preprocess(parseNumber, z.number().optional()).optional(),
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
    carImage: z
      .preprocess(v => {
        const val = emptyToUndef(v);
        return val === undefined ? undefined : String(val);
      }, z.string().optional()),
    registrationVideo: z
      .preprocess(v => {
        const val = emptyToUndef(v);
        return val === undefined ? undefined : String(val);
      }, z.string().optional()),
  });

export const insertCarAssignmentSchema = createInsertSchema(carAssignments).omit({
  id: true,
  createdAt: true,
});

export const insertAssetSchema = createInsertSchema(assets).omit({
  id: true,
  createdAt: true,
});

const assetAssignmentBaseSchema = createInsertSchema(assetAssignments)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    employeeId: z.preprocess(
      value => {
        const normalized = emptyToUndef(value);
        return normalized === undefined ? undefined : normalizeBigId(normalized);
      },
      z.string().min(1, "Employee is required").optional(),
    ),
  });

export const insertAssetAssignmentSchema = assetAssignmentBaseSchema.refine(
  data => {
    if (!data.status || data.status === "maintenance") return true;
    return !!data.employeeId;
  },
  {
    path: ["employeeId"],
    message: "Employee is required unless the asset is in maintenance",
  },
);

export const updateAssetAssignmentSchema = assetAssignmentBaseSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.status && data.status !== "maintenance" && !data.employeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Employee is required unless the asset is in maintenance",
        path: ["employeeId"],
      });
    }
  });

export const insertAssetDocumentSchema = createInsertSchema(assetDocuments).omit({
  id: true,
  createdAt: true,
});

export const insertGenericDocumentSchema = createInsertSchema(genericDocuments).omit({
  id: true,
  createdAt: true,
});

export const insertAssetRepairSchema = createInsertSchema(assetRepairs).omit({
  id: true,
  createdAt: true,
});

export const insertCarRepairSchema = createInsertSchema(carRepairs).omit({
  id: true,
  createdAt: true,
});

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
    "commission",
    "deduction",
    "allowance",
    "overtime",
    "penalty",
    "vacation",
    "employee_added",
    "employee_update",
    "document_update",
    "asset_assignment",
    "asset_update",
    "asset_removal",
    "workflow",
  ]),
  amount: baseInsertEmployeeEventSchema.shape.amount.optional().default("0"),
  recurrenceType: z.enum(["none", "monthly"]).optional().default("none"),
  recurrenceEndDate: baseInsertEmployeeEventSchema.shape.recurrenceEndDate
    .nullable()
    .optional(),
});

export const insertSickLeaveTrackingSchema = createInsertSchema(sickLeaveTracking).omit({
  id: true,
  lastUpdated: true,
});

const baseInsertEmployeeWorkflowSchema = createInsertSchema(employeeWorkflows).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export const insertEmployeeWorkflowSchema = baseInsertEmployeeWorkflowSchema.extend({
  workflowType: z.enum(["onboarding", "offboarding"]),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional().default("pending"),
  metadata: z.record(z.any()).optional().default({}),
});

const baseInsertEmployeeWorkflowStepSchema = createInsertSchema(employeeWorkflowSteps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export const insertEmployeeWorkflowStepSchema = baseInsertEmployeeWorkflowStepSchema.extend({
  stepType: z.enum(["document", "asset", "task", "loan", "vacation"]),
  status: z.enum(["pending", "in_progress", "completed", "skipped"]).optional().default("pending"),
  metadata: z.record(z.any()).optional().default({}),
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

export type AllowanceType = typeof allowanceTypes.$inferSelect;
export type InsertAllowanceType = z.infer<typeof insertAllowanceTypeSchema>;

export type EmployeeCustomValue = typeof employeeCustomValues.$inferSelect;
export type InsertEmployeeCustomValue = z.infer<typeof insertEmployeeCustomValueSchema>;
export type EmployeeCustomValueMap = Record<string, string | null>;

export type EmployeeWorkflow = typeof employeeWorkflows.$inferSelect;
export type InsertEmployeeWorkflow = z.infer<typeof insertEmployeeWorkflowSchema>;
export type EmployeeWorkflowStep = typeof employeeWorkflowSteps.$inferSelect;
export type InsertEmployeeWorkflowStep = z.infer<typeof insertEmployeeWorkflowStepSchema>;
export type EmployeeWorkflowWithSteps = EmployeeWorkflow & {
  steps: EmployeeWorkflowStep[];
};

export type PayrollRun = typeof payrollRuns.$inferSelect;
export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;

type BasePayrollEntry = typeof payrollEntries.$inferSelect;
export type AllowanceBreakdown = Record<string, number>;
export type PayrollEntryEmployee = Partial<Employee> & {
  id: Employee["id"];
  firstName: Employee["firstName"];
  lastName?: Employee["lastName"];
  salary?: Employee["salary"];
};
export type PayrollEntry = BasePayrollEntry & {
  employee?: PayrollEntryEmployee;
  allowances?: AllowanceBreakdown;
};
export type InsertPayrollEntry = z.infer<typeof insertPayrollEntrySchema>;

export type VacationRequest = typeof vacationRequests.$inferSelect;
export type InsertVacationRequest = z.infer<typeof insertVacationRequestSchema>;

export type LeaveAccrualPolicy = typeof leaveAccrualPolicies.$inferSelect;
export type InsertLeaveAccrualPolicy = z.infer<typeof insertLeaveAccrualPolicySchema>;

export type EmployeeLeavePolicy = typeof employeeLeavePolicies.$inferSelect;
export type InsertEmployeeLeavePolicy = z.infer<typeof insertEmployeeLeavePolicySchema>;

export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type InsertLeaveBalance = z.infer<typeof insertLeaveBalanceSchema>;

export type LeaveAccrualLedgerEntry = typeof leaveAccrualLedger.$inferSelect;
export type InsertLeaveAccrualLedgerEntry = z.infer<typeof insertLeaveAccrualLedgerSchema>;

export type Loan = typeof loans.$inferSelect;
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type LoanPayment = typeof loanPayments.$inferSelect;
export type InsertLoanPayment = z.infer<typeof insertLoanPaymentSchema>;

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;

export type AssetAssignment = typeof assetAssignments.$inferSelect;
export type InsertAssetAssignment = z.infer<typeof insertAssetAssignmentSchema>;

export type AssetDocument = typeof assetDocuments.$inferSelect;
export type InsertAssetDocument = z.infer<typeof insertAssetDocumentSchema>;
export type GenericDocument = typeof genericDocuments.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type InsertGenericDocument = z.infer<typeof insertGenericDocumentSchema>;
export type AssetRepair = typeof assetRepairs.$inferSelect;
export type InsertAssetRepair = z.infer<typeof insertAssetRepairSchema>;

export type CarRepair = typeof carRepairs.$inferSelect;
export type InsertCarRepair = z.infer<typeof insertCarRepairSchema>;

export type Car = typeof cars.$inferSelect;
export type InsertCar = z.infer<typeof insertCarSchema>;

export type CarAssignment = typeof carAssignments.$inferSelect;
export type InsertCarAssignment = z.infer<typeof insertCarAssignmentSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type EmailAlert = typeof emailAlerts.$inferSelect;
export type InsertEmailAlert = z.infer<typeof insertEmailAlertSchema>;

// Attendance tracking
export const attendance = pgTable("attendance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").references(() => employees.id).notNull(),
  date: date("date").notNull(),
  checkIn: timestamp("check_in"),
  checkOut: timestamp("check_out"),
  hours: numeric("hours", { precision: 6, scale: 2 }),
  source: text("source").default("manual"), // manual, import, device
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shiftTemplates = pgTable("shift_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  breakMinutes: integer("break_minutes").notNull().default(60),
  expectedMinutes: integer("expected_minutes").notNull().default(480),
  overtimeLimitMinutes: integer("overtime_limit_minutes").notNull().default(120),
  color: text("color"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const employeeSchedules = pgTable(
  "employee_schedules",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    employeeId: varchar("employee_id").references(() => employees.id).notNull(),
    scheduleDate: date("schedule_date").notNull(),
    shiftTemplateId: varchar("shift_template_id").references(() => shiftTemplates.id),
    customStartTime: time("custom_start_time"),
    customEndTime: time("custom_end_time"),
    customBreakMinutes: integer("custom_break_minutes"),
    expectedMinutes: integer("expected_minutes").notNull().default(480),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    lateApprovalStatus: text("late_approval_status").notNull().default("pending"),
    absenceApprovalStatus: text("absence_approval_status").notNull().default("pending"),
    overtimeApprovalStatus: text("overtime_approval_status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    employeeDateIdx: uniqueIndex("employee_schedules_employee_date_idx").on(
      table.employeeId,
      table.scheduleDate,
    ),
    scheduleDateIdx: index("employee_schedules_date_idx").on(table.scheduleDate),
    employeeIdx: index("employee_schedules_employee_idx").on(table.employeeId),
  }),
);

export const insertAttendanceSchema = createInsertSchema(attendance).omit({
  id: true,
  createdAt: true,
});

export const insertShiftTemplateSchema = createInsertSchema(shiftTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmployeeScheduleSchema = createInsertSchema(employeeSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type InsertShiftTemplate = z.infer<typeof insertShiftTemplateSchema>;
export type EmployeeSchedule = typeof employeeSchedules.$inferSelect;
export type InsertEmployeeSchedule = z.infer<typeof insertEmployeeScheduleSchema>;

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
  drivingLicense?: {
    number: string;
    expiryDate: string;
    alertDays: number;
    daysUntilExpiry: number;
  };
};

export type FleetExpiryCheck = {
  carId: string;
  make: string;
  model: string;
  year: number | null;
  plateNumber: string;
  registrationExpiry: string | null;
  daysUntilRegistrationExpiry: number | null;
  status: string;
  assignedEmployeeName?: string | null;
  registrationOwner?: string | null;
};

// Extended types for API responses
export type EmployeeWithDepartment = Employee & {
  department?: Department;
  company?: Company;
};

export type EmployeeWithDepartmentAndCustomValues = EmployeeWithDepartment & {
  customFieldValues?: EmployeeCustomValueMap;
};

export type PayrollRunWithEntries = PayrollRun & {
  entries?: PayrollEntry[];
  allowanceKeys?: string[];
};

export type VacationRequestWithEmployee = VacationRequest & {
  employee?: Employee;
  approver?: Employee;
  delegateApprover?: Employee;
  policy?: LeaveAccrualPolicy;
};

export type LoanWithEmployee = Loan & {
  employee?: Employee;
  approver?: Employee;
};

export type CarWithAssignment = Car & {
  currentAssignment?: (CarAssignment & {
    employee?: Employee | null;
  }) | null;
};

export type CarAssignmentWithDetails = CarAssignment & {
  car?: Car | null;
  employee?: Employee | null;
  assigner?: Employee | null;
};

export type AssetWithAssignment = Asset & {
  currentAssignment?: (AssetAssignment & {
    employee?: Employee | null;
  }) | null;
};

export type AssetAssignmentWithDetails = AssetAssignment & {
  asset?: Asset | null;
  employee?: Employee | null;
  assigner?: Employee | null;
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
  delegateApprover: one(employees, {
    fields: [vacationRequests.delegateApproverId],
    references: [employees.id],
  }),
  policy: one(leaveAccrualPolicies, {
    fields: [vacationRequests.appliesPolicyId],
    references: [leaveAccrualPolicies.id],
  }),
}));

export const leaveAccrualPoliciesRelations = relations(leaveAccrualPolicies, ({ many }) => ({
  assignments: many(employeeLeavePolicies),
  balances: many(leaveBalances),
  ledger: many(leaveAccrualLedger),
}));

export const employeeLeavePoliciesRelations = relations(employeeLeavePolicies, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeLeavePolicies.employeeId],
    references: [employees.id],
  }),
  policy: one(leaveAccrualPolicies, {
    fields: [employeeLeavePolicies.policyId],
    references: [leaveAccrualPolicies.id],
  }),
}));

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveBalances.employeeId],
    references: [employees.id],
  }),
  policy: one(leaveAccrualPolicies, {
    fields: [leaveBalances.policyId],
    references: [leaveAccrualPolicies.id],
  }),
}));

export const leaveAccrualLedgerRelations = relations(leaveAccrualLedger, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveAccrualLedger.employeeId],
    references: [employees.id],
  }),
  policy: one(leaveAccrualPolicies, {
    fields: [leaveAccrualLedger.policyId],
    references: [leaveAccrualPolicies.id],
  }),
}));

export const loansRelations = relations(loans, ({ one, many }) => ({
  employee: one(employees, {
    fields: [loans.employeeId],
    references: [employees.id],
  }),
  approver: one(employees, {
    fields: [loans.approvedBy],
    references: [employees.id],
  }),
  payments: many(loanPayments),
}));

export const loanPaymentsRelations = relations(loanPayments, ({ one }) => ({
  loan: one(loans, {
    fields: [loanPayments.loanId],
    references: [loans.id],
  }),
  employee: one(employees, {
    fields: [loanPayments.employeeId],
    references: [employees.id],
  }),
  payrollRun: one(payrollRuns, {
    fields: [loanPayments.payrollRunId],
    references: [payrollRuns.id],
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

export const shiftTemplatesRelations = relations(shiftTemplates, ({ many }) => ({
  schedules: many(employeeSchedules),
}));

export const employeeSchedulesRelations = relations(employeeSchedules, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeSchedules.employeeId],
    references: [employees.id],
  }),
  shiftTemplate: one(shiftTemplates, {
    fields: [employeeSchedules.shiftTemplateId],
    references: [shiftTemplates.id],
  }),
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

export const employeeWorkflowsRelations = relations(employeeWorkflows, ({ one, many }) => ({
  employee: one(employees, {
    fields: [employeeWorkflows.employeeId],
    references: [employees.id],
  }),
  steps: many(employeeWorkflowSteps),
}));

export const employeeWorkflowStepsRelations = relations(employeeWorkflowSteps, ({ one }) => ({
  workflow: one(employeeWorkflows, {
    fields: [employeeWorkflowSteps.workflowId],
    references: [employeeWorkflows.id],
  }),
}));
