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
  foreignKey,
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

export const permissionKeys = [
  "payroll:view",
  "payroll:manage",
  "payroll:approve",
  "loans:view",
  "loans:manage",
  "loans:approve",
  "assets:view",
  "assets:manage",
  "reports:view",
  "reports:finance",
  "employees:custom-field",
  "security:audit:view",
  "security:access:request",
  "security:access:review",
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export const defaultRolePermissions: Record<string, PermissionKey[]> = {
  admin: [...permissionKeys],
  hr: [
    "payroll:view",
    "payroll:manage",
    "payroll:approve",
    "loans:view",
    "loans:manage",
    "loans:approve",
    "assets:view",
    "assets:manage",
    "reports:view",
    "reports:finance",
    "employees:custom-field",
    "security:audit:view",
    "security:access:request",
  ],
  manager: [
    "payroll:view",
    "loans:view",
    "assets:view",
    "reports:view",
    "security:access:request",
  ],
  viewer: ["reports:view"],
  employee: ["security:access:request"],
};

export const mfaMethods = ["totp", "email_otp"] as const;

export type MfaMethod = (typeof mfaMethods)[number];

const parseDate = (v: unknown) => parseDateToISO(v).value;

const parseJsonInput = <T>(schema: z.ZodType<T>) =>
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
  }, schema);

export const payrollScenarioToggleSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean().default(true),
  description: z.string().optional().nullable(),
});

export type PayrollScenarioToggle = z.infer<typeof payrollScenarioToggleSchema>;

const payrollScenarioToggleArraySchema = z.array(payrollScenarioToggleSchema);

export const payrollFrequencyConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cadence: z.enum([
    "weekly",
    "biweekly",
    "semiMonthly",
    "monthly",
    "quarterly",
    "annual",
    "custom",
  ]),
  periodDays: z.number().int().positive().optional(),
  description: z.string().optional().nullable(),
  defaultScenarios: payrollScenarioToggleArraySchema.optional(),
});

export type PayrollFrequencyConfig = z.infer<typeof payrollFrequencyConfigSchema>;

export const payrollCalendarConfigSchema = z.object({
  id: z.string().min(1),
  frequencyId: z.string().min(1),
  name: z.string().min(1),
  anchorDate: z.string().optional().nullable(),
  cutoffDay: z.number().int().min(1).max(31).optional(),
  payDateOffsetDays: z.number().int().optional(),
  scenarioOverrides: payrollScenarioToggleArraySchema.optional(),
});

export type PayrollCalendarConfig = z.infer<typeof payrollCalendarConfigSchema>;

export const payrollExportFormatConfigSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["bank", "gl", "statutory"]),
  format: z.enum(["pdf", "csv", "xlsx"]),
  name: z.string().min(1),
  templateId: z.string().optional().nullable(),
  enabled: z.boolean().optional().default(true),
  description: z.string().optional().nullable(),
  options: z.record(z.unknown()).optional(),
});

export type PayrollExportFormatConfig = z.infer<typeof payrollExportFormatConfigSchema>;

export const payrollExportArtifactSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["bank", "gl", "statutory"]),
  format: z.enum(["pdf", "csv", "xlsx"]),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  data: z.string().min(1),
  createdAt: z.string().min(1),
  scenarioKey: z.string().optional(),
  description: z.string().optional().nullable(),
});

export type PayrollExportArtifact = z.infer<typeof payrollExportArtifactSchema>;

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
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaMethod: text("mfa_method"),
  mfaTotpSecret: text("mfa_totp_secret"),
  mfaBackupCodes: jsonb("mfa_backup_codes")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
});

export const permissionSets = pgTable("permission_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions")
    .$type<PermissionKey[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userPermissionGrants = pgTable(
  "user_permission_grants",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionSetId: varchar("permission_set_id")
      .notNull()
      .references(() => permissionSets.id, { onDelete: "cascade" }),
    grantedById: varchar("granted_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    startsAt: timestamp("starts_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => ({
    userIdx: index("user_permission_grants_user_idx").on(table.userId),
    activeIdx: index("user_permission_grants_active_idx").on(
      table.userId,
      table.startsAt,
      table.expiresAt,
    ),
  }),
);

export const accessRequests = pgTable(
  "access_requests",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    requesterId: varchar("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionSetId: varchar("permission_set_id")
      .notNull()
      .references(() => permissionSets.id, { onDelete: "cascade" }),
    reason: text("reason"),
    status: text("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
    reviewerId: varchar("reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startAt: timestamp("start_at"),
    expiresAt: timestamp("expires_at"),
    decisionNotes: text("decision_notes"),
  },
  (table) => ({
    requesterIdx: index("access_requests_requester_idx").on(table.requesterId),
    statusIdx: index("access_requests_status_idx").on(table.status),
  }),
);

export const securityAuditEvents = pgTable(
  "security_audit_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    actorId: varchar("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    summary: text("summary"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    eventTypeIdx: index("security_audit_events_type_idx").on(table.eventType),
    actorIdx: index("security_audit_events_actor_idx").on(table.actorId),
    createdIdx: index("security_audit_events_created_idx").on(table.createdAt),
  }),
);

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
  currencyCode: text("currency_code").notNull().default("KWD"),
  locale: text("locale").notNull().default("en-KW"),
  useAttendanceForDeductions: boolean("use_attendance_for_deductions").notNull().default(false),
  payrollFrequencies: jsonb("payroll_frequencies")
    .$type<PayrollFrequencyConfig[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  payrollCalendars: jsonb("payroll_calendars")
    .$type<PayrollCalendarConfig[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  payrollExportFormats: jsonb("payroll_export_formats")
    .$type<PayrollExportFormatConfig[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
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
  approvalState: text("approval_state").notNull().default("draft"),
  reason: text("reason"),
  approvedBy: varchar("approved_by").references(() => employees.id),
  policyMetadata: jsonb("policy_metadata")
    .$type<
      | {
          lastCheckedAt?: string;
          violations?: string[];
          warnings?: string[];
          approverNotes?: string[];
        }
      | null
    >()
    .default(sql`'{}'::jsonb`),
  documentsMetadata: jsonb("documents_metadata")
    .$type<
      | {
          required?: string[];
          optional?: string[];
        }
      | null
    >()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
});

export const loanApprovalStages = pgTable(
  "loan_approval_stages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    loanId: varchar("loan_id").references(() => loans.id).notNull(),
    stageName: text("stage_name").notNull(),
    stageOrder: integer("stage_order").notNull().default(0),
    approverId: varchar("approver_id").references(() => employees.id),
    status: text("status").notNull().default("pending"),
    actedAt: timestamp("acted_at"),
    notes: text("notes"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown> | null>()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  t => ({
    loanIdx: index("loan_approval_stages_loan_idx").on(t.loanId),
    stageOrderIdx: index("loan_approval_stages_order_idx").on(t.loanId, t.stageOrder),
  }),
);

export const loanDocuments = pgTable(
  "loan_documents",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    loanId: varchar("loan_id").references(() => loans.id).notNull(),
    title: text("title").notNull(),
    documentType: text("document_type"),
    fileUrl: text("file_url").notNull(),
    storageKey: text("storage_key"),
    uploadedBy: varchar("uploaded_by").references(() => employees.id),
    uploadedAt: timestamp("uploaded_at").defaultNow(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown> | null>()
      .default(sql`'{}'::jsonb`),
  },
  t => ({
    loanDocLoanIdx: index("loan_documents_loan_idx").on(t.loanId),
    docTypeIdx: index("loan_documents_type_idx").on(t.documentType),
  }),
);

export const loanAmortizationSchedules = pgTable(
  "loan_amortization_schedules",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    loanId: varchar("loan_id").references(() => loans.id).notNull(),
    installmentNumber: integer("installment_number").notNull(),
    dueDate: date("due_date").notNull(),
    principalAmount: numeric("principal_amount", { precision: 12, scale: 2 }).notNull(),
    interestAmount: numeric("interest_amount", { precision: 12, scale: 2 }).notNull(),
    paymentAmount: numeric("payment_amount", { precision: 12, scale: 2 }).notNull(),
    remainingBalance: numeric("remaining_balance", { precision: 12, scale: 2 }).notNull(),
    status: text("status").notNull().default("pending"),
    payrollRunId: varchar("payroll_run_id").references(() => payrollRuns.id),
    paidAt: date("paid_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  t => ({
    loanScheduleLoanIdx: index("loan_amortization_schedules_loan_idx").on(t.loanId),
    loanScheduleDueIdx: index("loan_amortization_schedules_due_idx").on(t.loanId, t.dueDate),
  }),
);

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
export const genericDocuments = pgTable(
  "generic_documents",
  {
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
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`),
    versionGroupId: varchar("version_group_id")
      .notNull()
      .default(sql`gen_random_uuid()`),
    version: integer("version").notNull().default(1),
    previousVersionId: varchar("previous_version_id"),
    isLatest: boolean("is_latest").notNull().default(true),
    generatedFromTemplateKey: text("generated_from_template_key"),
    generatedByUserId: varchar("generated_by_user_id").references(() => users.id),
    signatureStatus: text("signature_status").default("not_requested"),
    signatureProvider: text("signature_provider"),
    signatureEnvelopeId: text("signature_envelope_id"),
    signatureRecipientEmail: text("signature_recipient_email"),
    signatureRequestedAt: timestamp("signature_requested_at"),
    signatureCompletedAt: timestamp("signature_completed_at"),
    signatureDeclinedAt: timestamp("signature_declined_at"),
    signatureCancelledAt: timestamp("signature_cancelled_at"),
    signatureMetadata: jsonb("signature_metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    versionGroupIdx: index("generic_documents_version_group_idx").on(table.versionGroupId),
    signatureStatusIdx: index("generic_documents_signature_status_idx").on(table.signatureStatus),
    employeeIdx: index("generic_documents_employee_idx").on(table.employeeId),
    previousVersionFk: foreignKey({
      columns: [table.previousVersionId],
      foreignColumns: [table.id],
      name: "generic_documents_previous_version_id_fk",
    }).onDelete("set null"),
  }),
);

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
  calendarId: text("calendar_id"),
  cycleLabel: text("cycle_label"),
  scenarioKey: text("scenario_key"),
  scenarioToggles: jsonb("scenario_toggles")
    .$type<Record<string, boolean>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  exportArtifacts: jsonb("export_artifacts")
    .$type<PayrollExportArtifact[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
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
const notificationChannelSchema = z.enum(["email", "sms", "chat", "push"]);

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationRoutingRules = pgTable("notification_routing_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull(),
  description: text("description"),
  slaMinutes: integer("sla_minutes").notNull().default(60),
  deliveryChannels: jsonb("delivery_channels")
    .$type<NotificationChannel[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  escalationStrategy: text("escalation_strategy").notNull().default("sequential"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notificationEscalationSteps = pgTable("notification_escalation_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleId: varchar("rule_id")
    .references(() => notificationRoutingRules.id)
    .notNull(),
  level: integer("level").notNull().default(1),
  escalateAfterMinutes: integer("escalate_after_minutes").notNull().default(0),
  targetRole: text("target_role").notNull(),
  channel: text("channel").notNull(),
  messageTemplate: text("message_template"),
  createdAt: timestamp("created_at").defaultNow(),
});

const notificationEscalationStatusSchema = z.enum([
  "pending",
  "acknowledged",
  "escalated",
  "resolved",
  "closed",
]);

export type NotificationEscalationStatus = z.infer<
  typeof notificationEscalationStatusSchema
>;

const notificationEscalationHistoryEntrySchema = z.object({
  level: z.number().int().nonnegative(),
  channel: notificationChannelSchema,
  recipient: z.string(),
  escalatedAt: z.string(),
  status: notificationEscalationStatusSchema.default("escalated"),
  notes: z.string().optional().nullable(),
});

export type NotificationEscalationHistoryEntry = z.infer<
  typeof notificationEscalationHistoryEntrySchema
>;

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
  routingRuleId: varchar("routing_rule_id").references(
    () => notificationRoutingRules.id,
  ),
  deliveryChannels: jsonb("delivery_channels")
    .$type<NotificationChannel[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  slaDueAt: timestamp("sla_due_at"),
  escalationLevel: integer("escalation_level").notNull().default(0),
  escalationStatus: text("escalation_status")
    .notNull()
    .default("pending"),
  lastEscalatedAt: timestamp("last_escalated_at"),
  escalationHistory: jsonb("escalation_history")
    .$type<NotificationEscalationHistoryEntry[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reportSchedules = pgTable("report_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  reportType: text("report_type").notNull(),
  filters: jsonb("filters")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  groupings: jsonb("groupings")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  exportFormat: text("export_format").notNull().default("json"),
  cadence: text("cadence").notNull().default("monthly"),
  runTime: time("run_time"),
  timezone: text("timezone").notNull().default("UTC"),
  deliveryChannels: jsonb("delivery_channels")
    .$type<NotificationChannel[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  recipients: jsonb("recipients")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  notifyEmployeeIds: jsonb("notify_employee_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdBy: varchar("created_by").references(() => users.id),
  status: text("status").notNull().default("active"),
  lastRunStatus: text("last_run_status"),
  lastRunSummary: text("last_run_summary"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const insertCompanySchema = createInsertSchema(companies)
  .omit({
    id: true,
  })
  .extend({
    currencyCode: z.string().min(1).default("KWD"),
    locale: z.string().min(1).default("en-KW"),
    payrollFrequencies: parseJsonInput(
      z.array(payrollFrequencyConfigSchema),
    ).default([]),
    payrollCalendars: parseJsonInput(
      z.array(payrollCalendarConfigSchema),
    ).default([]),
    payrollExportFormats: parseJsonInput(
      z.array(payrollExportFormatConfigSchema),
    ).default([]),
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

export const insertPayrollRunSchema = createInsertSchema(payrollRuns)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    scenarioToggles: parseJsonInput(z.record(z.boolean())).default({}),
    exportArtifacts: parseJsonInput(
      z.array(payrollExportArtifactSchema),
    ).default([]),
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
    approvalState: z.preprocess(v => emptyToUndef(v), z.string().optional()),
    reason: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : String(val);
    }, z.string().optional()),
    approvedBy: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : normalizeBigId(val);
    }, z.string().optional()),
    policyMetadata: z
      .preprocess(v => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        if (typeof v === "string") {
          try {
            return JSON.parse(v);
          } catch {
            return undefined;
          }
        }
        return v as Record<string, unknown>;
      }, z.record(z.any()).nullable().optional()),
    documentsMetadata: z
      .preprocess(v => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        if (typeof v === "string") {
          try {
            return JSON.parse(v);
          } catch {
            return undefined;
          }
        }
        return v as Record<string, unknown>;
      }, z.record(z.any()).nullable().optional()),
  });

export const loanApprovalStageInputSchema = z.object({
  stageName: z.string().min(1),
  stageOrder: z.number().int().nonnegative().optional(),
  approverId: z.string().optional(),
  status: z
    .enum(["pending", "approved", "rejected", "delegated", "skipped"])
    .optional(),
  actedAt: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const insertLoanApprovalStageSchema = createInsertSchema(loanApprovalStages)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    loanId: z.preprocess(normalizeBigId, z.string()),
    stageName: z.string().min(1),
    stageOrder: z.preprocess(parseNumber, z.number().int().nonnegative().optional()),
    approverId: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : normalizeBigId(val);
    }, z.string().optional()),
    status: z
      .enum(["pending", "approved", "rejected", "delegated", "skipped"])
      .optional(),
    actedAt: z.preprocess(v => {
      const parsed = parseDate(v);
      return parsed === null ? undefined : parsed;
    }, z.string().optional()),
    metadata: z
      .preprocess(v => {
        if (v === undefined) return undefined;
        if (typeof v === "string") {
          try {
            return JSON.parse(v);
          } catch {
            return undefined;
          }
        }
        return v as Record<string, unknown>;
      }, z.record(z.any()).optional()),
  });

export const loanDocumentInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  documentType: z.string().optional(),
  fileUrl: z.string().min(1),
  storageKey: z.string().optional(),
  uploadedBy: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  remove: z.boolean().optional(),
});

export const insertLoanDocumentSchema = createInsertSchema(loanDocuments)
  .omit({
    id: true,
    uploadedAt: true,
  })
  .extend({
    loanId: z.preprocess(normalizeBigId, z.string()),
    title: z.string().min(1),
    documentType: z.preprocess(v => emptyToUndef(v), z.string().optional()),
    fileUrl: z.string().min(1),
    storageKey: z.preprocess(v => emptyToUndef(v), z.string().optional()),
    uploadedBy: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : normalizeBigId(val);
    }, z.string().optional()),
    metadata: z
      .preprocess(v => {
        if (v === undefined) return undefined;
        if (typeof v === "string") {
          try {
            return JSON.parse(v);
          } catch {
            return undefined;
          }
        }
        return v as Record<string, unknown>;
      }, z.record(z.any()).optional()),
  });

export const insertLoanAmortizationScheduleSchema = createInsertSchema(
  loanAmortizationSchedules,
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    loanId: z.preprocess(normalizeBigId, z.string()),
    installmentNumber: z.preprocess(parseNumber, z.number().int().positive()),
    dueDate: z.preprocess(parseDate, z.string()),
    principalAmount: z.preprocess(parseNumber, z.number()),
    interestAmount: z.preprocess(parseNumber, z.number()),
    paymentAmount: z.preprocess(parseNumber, z.number()),
    remainingBalance: z.preprocess(parseNumber, z.number()),
    status: z
      .enum(["pending", "paid", "paused", "skipped"])
      .optional(),
    payrollRunId: z.preprocess(v => {
      const val = emptyToUndef(v);
      return val === undefined ? undefined : normalizeBigId(val);
    }, z.string().optional()),
    paidAt: z.preprocess(v => {
      const parsed = parseDate(v);
      return parsed === null ? undefined : parsed;
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

export const documentSignatureStatusSchema = z.enum([
  "not_requested",
  "draft",
  "sent",
  "viewed",
  "completed",
  "declined",
  "voided",
  "error",
]);

const baseInsertGenericDocumentSchema = createInsertSchema(genericDocuments).omit({
  id: true,
  createdAt: true,
  version: true,
  versionGroupId: true,
  previousVersionId: true,
  isLatest: true,
});

export const insertGenericDocumentSchema = baseInsertGenericDocumentSchema.extend({
  metadata: parseJsonInput(z.record(z.unknown()).optional()),
  signatureMetadata: parseJsonInput(z.record(z.unknown()).optional()),
  signatureStatus: documentSignatureStatusSchema.optional(),
});

export type DocumentSignatureStatus = z.infer<typeof documentSignatureStatusSchema>;

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

const baseInsertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = baseInsertNotificationSchema.extend({
  deliveryChannels: parseJsonInput(z.array(notificationChannelSchema)).default([]),
  escalationHistory: parseJsonInput(
    z.array(notificationEscalationHistoryEntrySchema),
  ).default([]),
  escalationStatus: notificationEscalationStatusSchema.optional(),
});

export const insertReportScheduleSchema = createInsertSchema(reportSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastRunAt: true,
  nextRunAt: true,
  lastRunStatus: true,
  lastRunSummary: true,
});

export const insertNotificationRoutingRuleSchema = createInsertSchema(
  notificationRoutingRules,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationEscalationStepSchema = createInsertSchema(
  notificationEscalationSteps,
).omit({
  id: true,
  createdAt: true,
});

export const notificationEscalationStepInputSchema =
  insertNotificationEscalationStepSchema
    .omit({
      ruleId: true,
    })
    .extend({
      id: z.string().optional(),
      ruleId: z.string().optional(),
      level: z.number().int().min(1).optional(),
    });

export const upsertNotificationRoutingRuleSchema =
  insertNotificationRoutingRuleSchema
    .extend({
      id: z.string().optional(),
      deliveryChannels: parseJsonInput(
        z.array(notificationChannelSchema),
      ).default([]),
    })
    .extend({
      steps: z.array(notificationEscalationStepInputSchema).optional().default([]),
    });

export const insertPermissionSetSchema = createInsertSchema(permissionSets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserPermissionGrantSchema = createInsertSchema(
  userPermissionGrants,
).omit({
  id: true,
  createdAt: true,
});

export const insertAccessRequestSchema = createInsertSchema(accessRequests).omit({
  id: true,
  requestedAt: true,
  reviewedAt: true,
});

export const insertSecurityAuditEventSchema = createInsertSchema(
  securityAuditEvents,
).omit({
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
export type PermissionSet = typeof permissionSets.$inferSelect;
export type InsertPermissionSet = z.infer<typeof insertPermissionSetSchema>;
export type UserPermissionGrant = typeof userPermissionGrants.$inferSelect;
export type InsertUserPermissionGrant = z.infer<
  typeof insertUserPermissionGrantSchema
>;
export type AccessRequest = typeof accessRequests.$inferSelect;
export type InsertAccessRequest = z.infer<typeof insertAccessRequestSchema>;
export type SecurityAuditEvent = typeof securityAuditEvents.$inferSelect;
export type InsertSecurityAuditEvent = z.infer<
  typeof insertSecurityAuditEventSchema
>;

export type UserPermissionGrantWithSet = UserPermissionGrant & {
  permissionSet?: PermissionSet | null;
};

export type UserMfaState = {
  enabled: boolean;
  method: MfaMethod | null;
  backupCodesRemaining: number;
};

export type SessionUser = Omit<User, "passwordHash" | "mfaTotpSecret" | "mfaBackupCodes"> & {
  permissions: PermissionKey[];
  activeGrants: UserPermissionGrantWithSet[];
  mfa: UserMfaState;
};

export type UserWithPermissions = User & {
  permissions: PermissionKey[];
  activeGrants: UserPermissionGrantWithSet[];
};

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

export type LoanAmortizationScheduleEntry =
  typeof loanAmortizationSchedules.$inferSelect;
export type InsertLoanAmortizationScheduleEntry = z.infer<
  typeof insertLoanAmortizationScheduleSchema
>;
export type LoanScheduleStatus = LoanAmortizationScheduleEntry["status"];
export type Loan = typeof loans.$inferSelect & {
  dueAmountForPeriod?: number;
  scheduleDueThisPeriod?: LoanAmortizationScheduleEntry[];
};
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type LoanApprovalStage = typeof loanApprovalStages.$inferSelect;
export type InsertLoanApprovalStage = z.infer<typeof insertLoanApprovalStageSchema>;
export type LoanDocument = typeof loanDocuments.$inferSelect;
export type InsertLoanDocument = z.infer<typeof insertLoanDocumentSchema>;
export type LoanPayment = typeof loanPayments.$inferSelect;
export type InsertLoanPayment = z.infer<typeof insertLoanPaymentSchema>;
export type LoanStatement = {
  loan: LoanWithEmployee;
  schedule: LoanAmortizationScheduleEntry[];
  payments: LoanPayment[];
  documents: LoanDocument[];
  totals: {
    scheduledPrincipal: number;
    scheduledInterest: number;
    totalPaid: number;
    outstandingBalance: number;
  };
  nextDue?: LoanAmortizationScheduleEntry | undefined;
};

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

export type ReportSchedule = typeof reportSchedules.$inferSelect;
export type InsertReportSchedule = typeof reportSchedules.$inferInsert;

export type NotificationRoutingRule = typeof notificationRoutingRules.$inferSelect;
export type InsertNotificationRoutingRule = z.infer<
  typeof insertNotificationRoutingRuleSchema
>;

export type NotificationEscalationStep = typeof notificationEscalationSteps.$inferSelect;
export type InsertNotificationEscalationStep = z.infer<
  typeof insertNotificationEscalationStepSchema
>;

export type NotificationEscalationStepInput = z.infer<
  typeof notificationEscalationStepInputSchema
>;

export type UpsertNotificationRoutingRule = z.infer<
  typeof upsertNotificationRoutingRuleSchema
>;

export type NotificationRoutingRuleWithSteps = NotificationRoutingRule & {
  steps: NotificationEscalationStep[];
};

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
  routingRule?: NotificationRoutingRuleWithSteps | null;
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
  approvalStages?: Array<LoanApprovalStage & { approver?: Employee | null }>;
  documents?: Array<LoanDocument & { uploader?: Employee | null }>;
  amortizationSchedule?: LoanAmortizationScheduleEntry[];
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

export const notificationRoutingRulesRelations = relations(
  notificationRoutingRules,
  ({ many }) => ({
    notifications: many(notifications),
    steps: many(notificationEscalationSteps),
  }),
);

export const notificationEscalationStepsRelations = relations(
  notificationEscalationSteps,
  ({ one }) => ({
    rule: one(notificationRoutingRules, {
      fields: [notificationEscalationSteps.ruleId],
      references: [notificationRoutingRules.id],
    }),
  }),
);

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
  approvalStages: many(loanApprovalStages),
  documents: many(loanDocuments),
  amortizationSchedule: many(loanAmortizationSchedules),
  payments: many(loanPayments),
}));

export const loanApprovalStagesRelations = relations(loanApprovalStages, ({ one }) => ({
  loan: one(loans, {
    fields: [loanApprovalStages.loanId],
    references: [loans.id],
  }),
  approver: one(employees, {
    fields: [loanApprovalStages.approverId],
    references: [employees.id],
  }),
}));

export const loanDocumentsRelations = relations(loanDocuments, ({ one }) => ({
  loan: one(loans, {
    fields: [loanDocuments.loanId],
    references: [loans.id],
  }),
  uploader: one(employees, {
    fields: [loanDocuments.uploadedBy],
    references: [employees.id],
  }),
}));

export const loanAmortizationSchedulesRelations = relations(
  loanAmortizationSchedules,
  ({ one }) => ({
    loan: one(loans, {
      fields: [loanAmortizationSchedules.loanId],
      references: [loans.id],
    }),
    payrollRun: one(payrollRuns, {
      fields: [loanAmortizationSchedules.payrollRunId],
      references: [payrollRuns.id],
    }),
  }),
);

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
  routingRule: one(notificationRoutingRules, {
    fields: [notifications.routingRuleId],
    references: [notificationRoutingRules.id],
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
