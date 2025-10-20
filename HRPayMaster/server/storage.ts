import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "./db";
import { normalizeAllowanceTitle } from "./utils/payroll";
import { CHATBOT_EVENT_TYPES, emitChatbotNotification } from "./chatbotEvents";
import { generateNumericOtp, verifyTotpCode } from "./utils/mfa";

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type BasicUserInfo = Pick<User, "id" | "username" | "email" | "role">;

export type AccessRequestDetail = AccessRequest & {
  permissionSet?: PermissionSet | null;
  requester?: BasicUserInfo | null;
  reviewer?: BasicUserInfo | null;
};

export type SecurityAuditEventDetail = SecurityAuditEvent & {
  actor?: BasicUserInfo | null;
};

type MfaChallengeRecord = {
  id: string;
  userId: string;
  method: MfaMethod;
  code?: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
};

const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface MfaChallengeInfo {
  id: string;
  method: MfaMethod;
  expiresAt: Date;
  deliveryHint?: string | null;
}

export interface MfaVerificationResult {
  success: boolean;
  user?: SessionUser;
  reason?: "expired" | "invalid" | "not_found" | "user_inactive";
}

export interface PasswordResetResult {
  success: boolean;
  reason?: "invalid" | "expired" | "used";
}
import {
  type Department,
  type InsertDepartment,
  type Employee,
  type InsertEmployee,
  type EmployeeWithDepartment,
  type PayrollRun,
  type InsertPayrollRun,
  type PayrollEntry,
  type InsertPayrollEntry,
  type PayrollRunWithEntries,
  type AllowanceBreakdown,
  type VacationRequest,
  type InsertVacationRequest,
  type VacationRequestWithEmployee,
  type VacationApprovalStep,
  type VacationAuditLogEntry,
  type Loan,
  type InsertLoan,
  type LoanWithEmployee,
  type LoanPayment,
  type InsertLoanPayment,
  type LoanApprovalStage,
  type InsertLoanApprovalStage,
  type LoanDocument,
  type InsertLoanDocument,
  type LoanAmortizationScheduleEntry,
  type InsertLoanAmortizationScheduleEntry,
  type LoanScheduleStatus,
  type LoanStatement,
  type Asset,
  type InsertAsset,
  type AssetWithAssignment,
  type AssetAssignment,
  type InsertAssetAssignment,
  type AssetAssignmentWithDetails,
  type AssetDocument,
  type InsertAssetDocument,
  type AssetRepair,
  type InsertAssetRepair,
  type Car,
  type InsertCar,
  type CarWithAssignment,
  type CarAssignment,
  type InsertCarAssignment,
  type CarAssignmentWithDetails,
  type Notification,
  type InsertNotification,
  type NotificationWithEmployee,
  type NotificationRoutingRule,
  type InsertNotificationRoutingRule,
  type NotificationRoutingRuleWithSteps,
  type NotificationEscalationStep,
  type UpsertNotificationRoutingRule,
  type NotificationEscalationHistoryEntry,
  type NotificationChannel,
  type NotificationEscalationStatus,
  type EmailAlert,
  type InsertEmailAlert,
  type EmployeeEvent,
  type InsertEmployeeEvent,
  type ReportSchedule,
  type InsertReportSchedule,
  type DocumentExpiryCheck,
  type FleetExpiryCheck,
  type CarRepair,
  type InsertCarRepair,
  type AllowanceType,
  type InsertAllowanceType,
  type EmployeeCustomField,
  type InsertEmployeeCustomField,
  type EmployeeCustomValue,
  type InsertEmployeeCustomValue,
  type Company,
  type InsertCompany,
  type Attendance,
  type InsertAttendance,
  type ShiftTemplate,
  type InsertShiftTemplate,
  type EmployeeSchedule,
  type InsertEmployeeSchedule,
  type User,
  type UserWithPermissions,
  type PermissionSet,
  type PermissionKey,
  type UserPermissionGrant,
  type InsertUserPermissionGrant,
  type AccessRequest,
  type InsertAccessRequest,
  type SecurityAuditEvent,
  type InsertSecurityAuditEvent,
  type SessionUser,
  type UserPermissionGrantWithSet,
  defaultRolePermissions,
  type SickLeaveTracking,
  type InsertSickLeaveTracking,
  type EmployeeWorkflow,
  type InsertEmployeeWorkflow,
  type EmployeeWorkflowStep,
  type InsertEmployeeWorkflowStep,
  type EmployeeWorkflowWithSteps,
  type LeaveAccrualPolicy,
  type InsertLeaveAccrualPolicy,
  type EmployeeLeavePolicy,
  type InsertEmployeeLeavePolicy,
  type LeaveBalance,
  type InsertLeaveBalance,
  type LeaveAccrualLedgerEntry,
  type InsertLeaveAccrualLedgerEntry,
  type PasswordResetToken,
  departments,
  companies,
  employees,
  employeeCustomFields,
  employeeCustomValues,
  employeeWorkflows,
  employeeWorkflowSteps,
  leaveAccrualPolicies,
  employeeLeavePolicies,
  leaveBalances,
  leaveAccrualLedger,
  payrollRuns,
  payrollEntries,
  vacationRequests,
  loans,
  loanPayments,
  loanApprovalStages,
  loanDocuments,
  loanAmortizationSchedules,
  assets,
  assetAssignments,
  assetDocuments,
  assetRepairs,
  cars,
  carAssignments,
  notifications,
  reportSchedules,
  notificationRoutingRules,
  notificationEscalationSteps,
  emailAlerts,
  employeeEvents,
  carRepairs,
  attendance,
  shiftTemplates,
  employeeSchedules,
  users,
  passwordResetTokens,
  permissionSets,
  userPermissionGrants,
  accessRequests,
  securityAuditEvents,
  allowanceTypes,
  sickLeaveTracking,
  type MfaMethod,
} from "@shared/schema";

const normalizeDateInput = (value: unknown): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
};

const normalizeDeliveryChannels = (
  channels: unknown,
  defaultEmpty = false,
): NotificationChannel[] | undefined => {
  if (channels === undefined) {
    return defaultEmpty ? ([] as NotificationChannel[]) : undefined;
  }
  if (channels === null) {
    return [] as NotificationChannel[];
  }
  if (Array.isArray(channels)) {
    return channels as NotificationChannel[];
  }
  return defaultEmpty ? ([] as NotificationChannel[]) : undefined;
};

type PersistedNotificationEscalationHistoryEntry = Omit<
  NotificationEscalationHistoryEntry,
  'status'
> & {
  status: NotificationEscalationStatus;
};

const normalizeEscalationHistoryEntries = (
  entries: unknown,
  defaultEmpty = false,
): PersistedNotificationEscalationHistoryEntry[] | undefined => {
  if (entries === undefined) {
    return defaultEmpty ? ([] as PersistedNotificationEscalationHistoryEntry[]) : undefined;
  }
  if (!Array.isArray(entries)) {
    return defaultEmpty ? ([] as PersistedNotificationEscalationHistoryEntry[]) : undefined;
  }
  if (entries.length === 0) {
    return [] as PersistedNotificationEscalationHistoryEntry[];
  }
  return entries
    .map(entry => {
      const base = entry as NotificationEscalationHistoryEntry;
      const status = (base.status ?? "escalated") as NotificationEscalationStatus;
      const sanitized: PersistedNotificationEscalationHistoryEntry = {
        ...base,
        status,
      };
      return sanitized;
    })
    .filter(Boolean) as PersistedNotificationEscalationHistoryEntry[];
};

const hasOwn = (obj: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

export const DEFAULT_OVERTIME_LIMIT_MINUTES = 120;

const MINUTES_PER_DAY = 24 * 60;

const DEFAULT_REPORT_RUN_TIME = { hours: 9, minutes: 0 } as const;

const parseRunTime = (value?: string | null): { hours: number; minutes: number } | undefined => {
  if (!value) return undefined;
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value);
  if (!match) return undefined;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined;
  return { hours, minutes };
};

const addCadence = (date: Date, cadence: string) => {
  const normalized = cadence?.toLowerCase();
  if (normalized === "daily") {
    date.setDate(date.getDate() + 1);
    return;
  }
  if (normalized === "weekly") {
    date.setDate(date.getDate() + 7);
    return;
  }
  if (normalized === "quarterly") {
    date.setMonth(date.getMonth() + 3);
    return;
  }
  date.setMonth(date.getMonth() + 1);
};

export const computeNextReportRun = (
  cadence: string,
  runTime?: string | null,
  reference: Date = new Date(),
): Date => {
  const next = new Date(reference.getTime());
  const time = parseRunTime(runTime) ?? DEFAULT_REPORT_RUN_TIME;
  next.setSeconds(0, 0);
  next.setHours(time.hours, time.minutes, 0, 0);
  if (next <= reference) {
    addCadence(next, cadence);
  }
  return next;
};

const toMinutesFromTimeValue = (value?: string | null): number | undefined => {
  if (!value) return undefined;
  const parts = String(value).split(":");
  if (parts.length < 2) return undefined;
  const [hoursPart, minutesPart, secondsPart] = parts;
  const hours = Number.parseInt(hoursPart, 10);
  const minutes = Number.parseInt(minutesPart ?? "0", 10);
  const seconds = secondsPart ? Number.parseFloat(secondsPart) : 0;
  if (![hours, minutes, seconds].every(part => Number.isFinite(part))) {
    return undefined;
  }
  const totalMinutes = hours * 60 + minutes + seconds / 60;
  return Math.round(totalMinutes);
};

const resolveBreakMinutes = (value?: number | null) => {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const computeExpectedMinutes = ({
  startTime,
  endTime,
  breakMinutes,
  fallback,
}: {
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number | null;
  fallback?: number;
}): number => {
  const startMinutes = toMinutesFromTimeValue(startTime);
  const endMinutes = toMinutesFromTimeValue(endTime);
  if (startMinutes === undefined || endMinutes === undefined) {
    return fallback ?? 0;
  }
  let duration = endMinutes - startMinutes;
  if (!Number.isFinite(duration)) {
    return fallback ?? 0;
  }
  if (duration < 0) {
    duration += MINUTES_PER_DAY;
  }
  const breakValue = resolveBreakMinutes(breakMinutes);
  return Math.max(0, Math.round(duration - breakValue));
};

const removeUndefined = <T extends Record<string, unknown>>(input: T): T =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;

const parseMoney = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateAttendanceMinutes = (record: Attendance): number => {
  const rawHours = (record as any)?.hours;
  if (rawHours !== undefined && rawHours !== null) {
    const parsed = Number.parseFloat(String(rawHours));
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed * 60));
    }
  }
  if (record.checkIn && record.checkOut) {
    const start = new Date(record.checkIn as any);
    const end = new Date(record.checkOut as any);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const diffMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
      if (Number.isFinite(diffMinutes)) {
        return Math.max(0, Math.round(diffMinutes));
      }
    }
  }
  return 0;
};

const toDateKey = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString().split("T")[0];
};

export interface ScheduleAlert {
  scheduleId: string;
  date: string;
  varianceMinutes: number;
  limitMinutes?: number;
}

export interface EmployeeScheduleSummary {
  expectedMinutes: number;
  actualMinutes: number;
  missingPunches: number;
  pendingLate: ScheduleAlert[];
  pendingAbsence: ScheduleAlert[];
  pendingOvertime: ScheduleAlert[];
  overtimeLimitBreaches: ScheduleAlert[];
}

export interface EmployeeScheduleDetail extends EmployeeSchedule {
  shiftTemplate?: ShiftTemplate | null;
  employee?: Employee | null;
  actualMinutes: number;
  varianceMinutes: number;
  attendanceRecords: Attendance[];
}

export interface DepartmentCostPeriod {
  period: string;
  departmentId: string | null;
  departmentName: string;
  totals: {
    grossPay: number;
    netPay: number;
    baseSalary: number;
    bonuses: number;
    overtimeEstimate: number;
    deductions: {
      tax: number;
      socialSecurity: number;
      healthInsurance: number;
      loan: number;
      other: number;
    };
  };
}

export interface DepartmentOvertimeMetric {
  departmentId: string | null;
  departmentName: string;
  totalOvertimeHours: number;
  averageOvertimeHours: number;
  overtimeCostEstimate: number;
  coverageRatio: number;
  scheduleCount: number;
}

export interface DepartmentLoanExposureMetric {
  departmentId: string | null;
  departmentName: string;
  activeLoans: number;
  totalOriginalAmount: number;
  totalOutstandingAmount: number;
  overdueInstallments: number;
  overdueBalance: number;
}

export interface AttendanceForecastMetric {
  departmentId: string | null;
  departmentName: string;
  forecastPeriodStart: string;
  forecastPeriodEnd: string;
  projectedAbsenceHours: number;
  projectedOvertimeHours: number;
  confidence: number;
  trailingAbsenceRate: number;
  trailingOvertimeRate: number;
}


export class DuplicateEmployeeCodeError extends Error {
  constructor(code: string) {
    super(`Employee code ${code} already exists`);
    this.name = "DuplicateEmployeeCodeError";
  }
}

export class LoanPaymentUndoError extends Error {
  constructor(
    message: string,
    public readonly loanId?: string,
  ) {
    super(message);
    this.name = "LoanPaymentUndoError";
  }
}

export interface LoanReportDetail {
  loanId: string;
  employeeId: string;
  employee?: Employee;
  originalAmount: number;
  remainingAmount: number;
  status: Loan["status"];
  totalRepaid: number;
  deductionInRange: number;
  pausedByVacation: boolean;
  pauseNote: string | null;
  startDate: string;
  endDate: string | null;
}

export interface LoanBalance {
  employeeId: string;
  balance: number;
}

export interface UndoPayrollLoanResult {
  payrollRun: PayrollRun;
  loans: Loan[];
  loanPayments: LoanPayment[];
}

export interface UndoPayrollLoanOptions {
  tx?: TransactionClient;
  removeLoanPayments?: boolean;
}

export interface EmployeeReportPeriod {
  period: string;
  payrollEntries: PayrollEntry[];
  employeeEvents: EmployeeEvent[];
  loans: Loan[];
  vacationRequests: VacationRequest[];
}

export interface PayrollSummaryPeriod {
  period: string;
  payrollEntries: PayrollEntry[];
}

export interface PayrollDepartmentSummaryRow {
  period: string;
  departmentId: string | null;
  departmentName: string | null;
  grossPay: number;
  netPay: number;
}

export interface AssetUsage {
  assignmentId: string;
  assetId: string;
  assetName: string;
  assetType: string;
  assetStatus: string;
  assetDetails: string | null;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  assignedDate: string;
  returnDate: string | null;
  status: AssetAssignment["status"];
  notes: string | null;
}

export interface FleetUsage {
  assignmentId: string;
  carId: string;
  vehicle: string;
  plateNumber: string;
  vin: string | null;
  serial: string | null;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  assignedDate: string;
  returnDate: string | null;
  status: CarAssignment["status"];
  notes: string | null;
}

export interface EmployeeFilters {
  limit?: number;
  offset?: number;
  includeTerminated?: boolean;
  status?: string[];
  departmentId?: string;
  companyId?: string;
  search?: string;
  sort?:
    | "name"
    | "position"
    | "department"
    | "salary"
    | "status"
    | "startDate";
  order?: "asc" | "desc";
}

export interface CarAssignmentFilters {
  plateNumber?: string;
  vin?: string;
  serial?: string;
}

export interface GenericDocumentFilters {
  search?: string;
  category?: string;
  tags?: string[];
  employeeId?: string;
  signatureStatus?: import("@shared/schema").DocumentSignatureStatus | "all";
  versionGroupId?: string;
  latestOnly?: boolean;
}

export interface IStorage {
  // User methods
  getUserById(id: string): Promise<UserWithPermissions | undefined>;
  getUserByUsername(username: string): Promise<UserWithPermissions | undefined>;
  getUserByEmail(email: string): Promise<UserWithPermissions | undefined>;
  getUsers(): Promise<UserWithPermissions[]>;
  createUser(user: typeof users.$inferInsert): Promise<UserWithPermissions>;
  updateUser(
    id: string,
    user: Partial<typeof users.$inferInsert>,
  ): Promise<UserWithPermissions | undefined>;
  getSessionUser(id: string): Promise<SessionUser | undefined>;
  createPasswordResetToken(
    userId: string,
    options?: { expiresInMs?: number },
  ): Promise<{ token: string; expiresAt: Date }>;
  resetPasswordWithToken(
    token: string,
    passwordHash: string,
  ): Promise<PasswordResetResult>;
  getPermissionSets(): Promise<PermissionSet[]>;
  getPermissionSetByKey(key: string): Promise<PermissionSet | undefined>;
  getActivePermissionGrants(
    userId: string,
    options?: { includeExpired?: boolean },
  ): Promise<UserPermissionGrantWithSet[]>;
  grantPermissionSet(
    grant: InsertUserPermissionGrant,
  ): Promise<UserPermissionGrantWithSet>;
  revokePermissionGrant(id: string, revokedAt?: Date): Promise<boolean>;
  createAccessRequest(request: InsertAccessRequest): Promise<AccessRequest>;
  updateAccessRequest(
    id: string,
    updates: Partial<InsertAccessRequest> & {
      status?: AccessRequest["status"];
      reviewerId?: string | null;
      reviewedAt?: Date | null;
    },
  ): Promise<AccessRequest | undefined>;
  getAccessRequests(options?: {
    id?: string;
    status?: AccessRequest["status"] | "all";
    requesterId?: string;
    reviewerId?: string;
    includeResolved?: boolean;
  }): Promise<AccessRequestDetail[]>;
  logSecurityEvent(event: InsertSecurityAuditEvent): Promise<SecurityAuditEvent>;
  getSecurityAuditEvents(
    options?: { limit?: number },
  ): Promise<SecurityAuditEventDetail[]>;
  countActiveAdmins(excludeId?: string): Promise<number>;
  getFirstActiveAdmin(): Promise<UserWithPermissions | undefined>;
  createMfaChallenge(userId: string): Promise<MfaChallengeInfo | undefined>;
  verifyMfaChallenge(
    challengeId: string,
    token: string,
  ): Promise<MfaVerificationResult>;

  // Department methods
  getDepartments(): Promise<Department[]>;
  getDepartment(id: string): Promise<Department | undefined>;
  createDepartment(department: InsertDepartment): Promise<Department>;
  updateDepartment(id: string, department: Partial<InsertDepartment>): Promise<Department | undefined>;
  deleteDepartment(id: string): Promise<boolean>;

  // Company methods
  getCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: string): Promise<boolean>;

  // Allowance type methods
  getAllowanceTypes(): Promise<AllowanceType[]>;
  createAllowanceType(type: InsertAllowanceType): Promise<AllowanceType>;

  // Generic documents
  getGenericDocuments(
    filters?: GenericDocumentFilters,
  ): Promise<import("@shared/schema").GenericDocument[]>;
  getGenericDocument(
    id: string,
  ): Promise<import("@shared/schema").GenericDocument | undefined>;
  createGenericDocument(
    doc: import("@shared/schema").InsertGenericDocument,
    options?: { baseDocumentId?: string | null },
  ): Promise<import("@shared/schema").GenericDocument>;
  updateGenericDocument(
    id: string,
    doc: Partial<import("@shared/schema").InsertGenericDocument>,
  ): Promise<import("@shared/schema").GenericDocument | undefined>;
  updateGenericDocumentByEnvelope(
    envelopeId: string,
    updates: Partial<import("@shared/schema").InsertGenericDocument>,
  ): Promise<import("@shared/schema").GenericDocument | undefined>;
  deleteGenericDocument(id: string): Promise<boolean>;

  // Templates
  getTemplates(): Promise<import("@shared/schema").Template[]>;
  getTemplateByKey(key: string): Promise<import("@shared/schema").Template | undefined>;
  upsertTemplate(key: string, data: { en: string; ar: string }): Promise<import("@shared/schema").Template>;

  // Employee methods
  getEmployees(filters?: EmployeeFilters): Promise<EmployeeWithDepartment[]>;
  countEmployees(filters?: EmployeeFilters): Promise<number>;
  getEmployee(id: string): Promise<EmployeeWithDepartment | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  createEmployeesBulk(
    employees: InsertEmployee[]
  ): Promise<{ success: number; failed: number; employees?: Employee[] }>;
  updateEmployee(
    id: string,
    employee: Partial<Omit<InsertEmployee, "employeeCode">>
  ): Promise<Employee | undefined>;
  terminateEmployee(id: string): Promise<Employee | undefined>;
  deleteEmployee(id: string): Promise<Employee | undefined>;

  // Employee custom field methods
  getEmployeeCustomFields(): Promise<EmployeeCustomField[]>;
  createEmployeeCustomField(field: InsertEmployeeCustomField): Promise<EmployeeCustomField>;
  updateEmployeeCustomField(
    id: string,
    field: Partial<InsertEmployeeCustomField>
  ): Promise<EmployeeCustomField | undefined>;
  deleteEmployeeCustomField(id: string): Promise<boolean>;

  // Employee custom value methods
  getEmployeeCustomValues(employeeId: string): Promise<EmployeeCustomValue[]>;
  createEmployeeCustomValue(value: InsertEmployeeCustomValue): Promise<EmployeeCustomValue>;
  updateEmployeeCustomValue(
    id: string,
    value: Partial<InsertEmployeeCustomValue>
  ): Promise<EmployeeCustomValue | undefined>;
  deleteEmployeeCustomValue(id: string): Promise<boolean>;

  // Employee workflow methods
  getEmployeeWorkflows(
    employeeId: string,
    workflowType?: EmployeeWorkflow["workflowType"],
  ): Promise<EmployeeWorkflowWithSteps[]>;
  getEmployeeWorkflowById(id: string): Promise<EmployeeWorkflowWithSteps | undefined>;
  getActiveEmployeeWorkflow(
    employeeId: string,
    workflowType: EmployeeWorkflow["workflowType"],
  ): Promise<EmployeeWorkflowWithSteps | undefined>;
  createEmployeeWorkflow(
    workflow: InsertEmployeeWorkflow,
    steps: Omit<InsertEmployeeWorkflowStep, "workflowId" | "id" | "createdAt" | "updatedAt" | "completedAt">[],
  ): Promise<EmployeeWorkflowWithSteps>;
  updateEmployeeWorkflow(
    id: string,
    workflow: Partial<InsertEmployeeWorkflow> & { completedAt?: Date | null },
  ): Promise<EmployeeWorkflow | undefined>;
  updateEmployeeWorkflowStep(
    id: string,
    step: Partial<InsertEmployeeWorkflowStep> & { completedAt?: Date | null },
  ): Promise<EmployeeWorkflowStep | undefined>;

  // Payroll methods
  getPayrollRuns(): Promise<PayrollRunWithEntries[]>;
  getPayrollRun(id: string): Promise<PayrollRunWithEntries | undefined>;
  createPayrollRun(payrollRun: InsertPayrollRun): Promise<PayrollRun>;
  updatePayrollRun(id: string, payrollRun: Partial<InsertPayrollRun>): Promise<PayrollRun | undefined>;
  undoPayrollRunLoanDeductions(
    payrollRunId: string,
    options?: UndoPayrollLoanOptions,
  ): Promise<UndoPayrollLoanResult | undefined>;
  deletePayrollRun(id: string): Promise<boolean>;

  // Payroll entry methods
  getPayrollEntries(payrollRunId: string): Promise<PayrollEntry[]>;
  createPayrollEntry(payrollEntry: InsertPayrollEntry): Promise<PayrollEntry>;
  updatePayrollEntry(id: string, payrollEntry: Partial<InsertPayrollEntry>): Promise<PayrollEntry | undefined>;
  getLeaveAccrualPolicies(): Promise<LeaveAccrualPolicy[]>;
  getLeaveAccrualPolicy(id: string): Promise<LeaveAccrualPolicy | undefined>;
  createLeaveAccrualPolicy(policy: InsertLeaveAccrualPolicy): Promise<LeaveAccrualPolicy>;
  updateLeaveAccrualPolicy(
    id: string,
    policy: Partial<InsertLeaveAccrualPolicy>,
  ): Promise<LeaveAccrualPolicy | undefined>;
  assignEmployeeLeavePolicy(assignment: InsertEmployeeLeavePolicy): Promise<EmployeeLeavePolicy>;
  getEmployeeLeavePolicies(filters?: {
    employeeId?: string;
    activeOn?: Date;
  }): Promise<(EmployeeLeavePolicy & { policy?: LeaveAccrualPolicy; employee?: Employee })[]>;
  getLeaveBalances(filters?: {
    employeeId?: string;
    year?: number;
  }): Promise<(LeaveBalance & { employee?: Employee; policy?: LeaveAccrualPolicy })[]>;
  getLeaveBalance(
    employeeId: string,
    leaveType: string,
    year: number,
  ): Promise<LeaveBalance | undefined>;
  incrementLeaveBalance(args: {
    employeeId: string;
    leaveType: string;
    year: number;
    delta: number;
    policyId?: string | null;
    maxBalanceDays?: number | null;
    allowNegativeBalance?: boolean;
  }): Promise<LeaveBalance>;
  recordLeaveAccrual(
    entry: InsertLeaveAccrualLedgerEntry & { note?: string },
  ): Promise<LeaveAccrualLedgerEntry>;
  getLeaveAccrualLedger(filters?: {
    employeeId?: string;
    policyId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<LeaveAccrualLedgerEntry[]>;
  applyLeaveUsage(args: {
    employeeId: string;
    leaveType: string;
    year: number;
    days: number;
    policyId?: string | null;
    note?: string;
    allowNegativeBalance?: boolean;
  }): Promise<{ balance: LeaveBalance; sick?: SickLeaveTracking | undefined }>;
  getSickLeaveBalance(
    employeeId: string,
    year: number,
  ): Promise<SickLeaveTracking | undefined>;
  createSickLeaveBalance(data: InsertSickLeaveTracking): Promise<SickLeaveTracking>;
  updateSickLeaveBalance(
    id: string,
    data: Partial<InsertSickLeaveTracking>,
  ): Promise<SickLeaveTracking | undefined>;

  // Vacation request methods
  getVacationRequests(
    start?: Date,
    end?: Date,
  ): Promise<VacationRequestWithEmployee[]>;
  getVacationRequest(id: string): Promise<VacationRequestWithEmployee | undefined>;
  createVacationRequest(vacationRequest: InsertVacationRequest): Promise<VacationRequest>;
  updateVacationRequest(id: string, vacationRequest: Partial<InsertVacationRequest>): Promise<VacationRequest | undefined>;
  deleteVacationRequest(id: string): Promise<boolean>;

  // Loan methods
  getLoans(start?: Date, end?: Date): Promise<LoanWithEmployee[]>;
  getLoan(id: string): Promise<LoanWithEmployee | undefined>;
  createLoan(loan: InsertLoan): Promise<Loan>;
  updateLoan(id: string, loan: Partial<InsertLoan>): Promise<Loan | undefined>;
  deleteLoan(id: string): Promise<boolean>;
  createLoanPayment(payment: InsertLoanPayment): Promise<LoanPayment>;
  createLoanPayments(payments: InsertLoanPayment[]): Promise<LoanPayment[]>;
  getLoanPaymentsByLoan(loanId: string): Promise<LoanPayment[]>;
  getLoanPaymentsForPayroll(payrollRunId: string): Promise<LoanPayment[]>;
  getLoanApprovalStages(
    loanId: string,
  ): Promise<Array<LoanApprovalStage & { approver?: Employee | null }>>;
  setLoanApprovalStages(
    loanId: string,
    stages: InsertLoanApprovalStage[],
  ): Promise<Array<LoanApprovalStage & { approver?: Employee | null }>>;
  updateLoanApprovalStage(
    stageId: string,
    updates: Partial<InsertLoanApprovalStage>,
  ): Promise<LoanApprovalStage | undefined>;
  getLoanDocuments(
    loanId: string,
  ): Promise<Array<LoanDocument & { uploader?: Employee | null }>>;
  createLoanDocument(document: InsertLoanDocument): Promise<LoanDocument>;
  replaceLoanDocuments(loanId: string, documents: InsertLoanDocument[]): Promise<LoanDocument[]>;
  deleteLoanDocument(id: string): Promise<boolean>;
  getLoanAmortizationSchedule(loanId: string): Promise<LoanAmortizationScheduleEntry[]>;
  replaceLoanAmortizationSchedule(
    loanId: string,
    schedule: InsertLoanAmortizationScheduleEntry[],
    options?: { preservePaid?: boolean },
  ): Promise<LoanAmortizationScheduleEntry[]>;
  updateLoanScheduleStatuses(
    loanId: string,
    installmentNumbers: number[],
    status: LoanScheduleStatus,
    options?: { payrollRunId?: string; paidAt?: string; notes?: string; tx?: TransactionClient },
  ): Promise<void>;
  getLoanStatement(loanId: string): Promise<LoanStatement | undefined>;
  getLoanReportDetails(range: { startDate: string; endDate: string }): Promise<LoanReportDetail[]>;

  // Asset methods
  getAssets(): Promise<AssetWithAssignment[]>;
  getAsset(id: string): Promise<AssetWithAssignment | undefined>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  updateAsset(id: string, asset: Partial<InsertAsset>): Promise<Asset | undefined>;
  deleteAsset(id: string): Promise<boolean>;

  // Asset assignment methods
  getAssetAssignments(): Promise<AssetAssignmentWithDetails[]>;
  getAssetAssignment(id: string): Promise<AssetAssignmentWithDetails | undefined>;
  createAssetAssignment(assignment: InsertAssetAssignment): Promise<AssetAssignment>;
  updateAssetAssignment(id: string, assignment: Partial<InsertAssetAssignment>): Promise<AssetAssignment | undefined>;
  deleteAssetAssignment(id: string): Promise<boolean>;

  // Car methods
  getCars(): Promise<CarWithAssignment[]>;
  getCar(id: string): Promise<CarWithAssignment | undefined>;
  createCar(car: InsertCar): Promise<Car>;
  updateCar(id: string, car: Partial<InsertCar>): Promise<Car | undefined>;
  deleteCar(id: string): Promise<boolean>;
  // Car repair methods
  getCarRepairs(carId: string): Promise<CarRepair[]>;
  createCarRepair(repair: InsertCarRepair): Promise<CarRepair>;

  // Car assignment methods
  getCarAssignments(filters?: CarAssignmentFilters): Promise<CarAssignmentWithDetails[]>;
  getCarAssignment(id: string): Promise<CarAssignmentWithDetails | undefined>;
  createCarAssignment(carAssignment: InsertCarAssignment): Promise<CarAssignment>;
  updateCarAssignment(id: string, carAssignment: Partial<InsertCarAssignment>): Promise<CarAssignment | undefined>;
  deleteCarAssignment(id: string): Promise<boolean>;

  // Notification methods
  getNotifications(): Promise<NotificationWithEmployee[]>;
  getUnreadNotifications(): Promise<NotificationWithEmployee[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  updateNotification(id: string, notification: Partial<InsertNotification>): Promise<Notification | undefined>;
  markNotificationAsRead(id: string): Promise<boolean>;
  deleteNotification(id: string): Promise<boolean>;
  getNotificationRoutingRules(): Promise<NotificationRoutingRuleWithSteps[]>;
  upsertNotificationRoutingRule(
    rule: UpsertNotificationRoutingRule,
  ): Promise<NotificationRoutingRuleWithSteps>;
  appendNotificationEscalationHistory(
    id: string,
    entry: NotificationEscalationHistoryEntry,
    status?: NotificationEscalationStatus,
  ): Promise<Notification | undefined>;

  // Email alert methods
  getEmailAlerts(): Promise<EmailAlert[]>;
  createEmailAlert(alert: InsertEmailAlert): Promise<EmailAlert>;
  updateEmailAlert(id: string, alert: Partial<InsertEmailAlert>): Promise<EmailAlert | undefined>;

  // Employee event methods
  getEmployeeEvents(
    start?: Date,
    end?: Date,
  ): Promise<(EmployeeEvent & { employee: Employee })[]>;
  getEmployeeEvent(id: string): Promise<EmployeeEvent | undefined>;
  createEmployeeEvent(event: InsertEmployeeEvent): Promise<EmployeeEvent>;
  updateEmployeeEvent(id: string, event: Partial<InsertEmployeeEvent>): Promise<EmployeeEvent | undefined>;
  deleteEmployeeEvent(id: string): Promise<boolean>;

  // Reports
  getMonthlyEmployeeSummary(
    employeeId: string,
    month: Date
  ): Promise<{ payroll: PayrollEntry[]; loans: Loan[]; events: EmployeeEvent[] }>;
  getEmployeeReport(
    employeeId: string,
    range: { startDate: string; endDate: string; groupBy: "month" | "year" }
  ): Promise<EmployeeReportPeriod[]>;
  getCompanyPayrollSummary(
    range: { startDate: string; endDate: string; groupBy: "month" | "year" }
  ): Promise<PayrollSummaryPeriod[]>;
  getCompanyPayrollByDepartment(
    range: { startDate: string; endDate: string; groupBy: "month" | "year" }
  ): Promise<PayrollDepartmentSummaryRow[]>;
  getDepartmentCostAnalytics(
    range: {
      startDate: string;
      endDate: string;
      groupBy: "month" | "year";
      departmentIds?: string[];
    }
  ): Promise<DepartmentCostPeriod[]>;
  getDepartmentOvertimeMetrics(
    range: { startDate: string; endDate: string; departmentIds?: string[] }
  ): Promise<DepartmentOvertimeMetric[]>;
  getDepartmentLoanExposure(
    range: { startDate: string; endDate: string; departmentIds?: string[] }
  ): Promise<DepartmentLoanExposureMetric[]>;
  getAttendanceForecast(
    range: { startDate: string; endDate: string; departmentIds?: string[] }
  ): Promise<AttendanceForecastMetric[]>;
  getLoanBalances(): Promise<LoanBalance[]>;
  getAssetUsageDetails(params: { startDate?: string; endDate?: string }): Promise<AssetUsage[]>;
  getFleetUsage(params: { startDate?: string; endDate?: string }): Promise<FleetUsage[]>;
  getAssetDocuments(assetId: string): Promise<AssetDocument[]>;
  createAssetDocument(doc: InsertAssetDocument): Promise<AssetDocument>;
  getAssetRepairs(assetId: string): Promise<AssetRepair[]>;
  createAssetRepair(repair: InsertAssetRepair): Promise<AssetRepair>;

  // Document expiry check methods
  checkDocumentExpiries(): Promise<DocumentExpiryCheck[]>;
  checkFleetExpiries(): Promise<FleetExpiryCheck[]>;

  // Attendance methods
  getAttendance(start?: Date, end?: Date): Promise<Attendance[]>;
  getAttendanceForEmployee(employeeId: string, start?: Date, end?: Date): Promise<Attendance[]>;
  createAttendance(record: InsertAttendance): Promise<Attendance>;
  updateAttendance(id: string, record: Partial<InsertAttendance>): Promise<Attendance | undefined>;
  deleteAttendance(id: string): Promise<boolean>;
  getAttendanceSummary(start: Date, end: Date): Promise<Record<string, number>>; // employeeId -> present days
  getShiftTemplates(): Promise<ShiftTemplate[]>;
  createShiftTemplate(template: InsertShiftTemplate): Promise<ShiftTemplate>;
  updateShiftTemplate(id: string, template: Partial<InsertShiftTemplate>): Promise<ShiftTemplate | undefined>;
  deleteShiftTemplate(id: string): Promise<boolean>;
  getEmployeeSchedules(filters?: {
    start?: Date;
    end?: Date;
    employeeId?: string;
  }): Promise<EmployeeScheduleDetail[]>;
  getEmployeeSchedule(id: string): Promise<EmployeeScheduleDetail | undefined>;
  createEmployeeSchedules(assignments: InsertEmployeeSchedule[]): Promise<EmployeeScheduleDetail[]>;
  updateEmployeeSchedule(
    id: string,
    schedule: Partial<InsertEmployeeSchedule>,
  ): Promise<EmployeeScheduleDetail | undefined>;
  deleteEmployeeSchedule(id: string): Promise<boolean>;
  getScheduleSummary(start: Date, end: Date): Promise<Record<string, EmployeeScheduleSummary>>;
  getReportSchedules(): Promise<ReportSchedule[]>;
  getReportSchedule(id: string): Promise<ReportSchedule | undefined>;
  createReportSchedule(schedule: InsertReportSchedule): Promise<ReportSchedule>;
  updateReportSchedule(
    id: string,
    updates: Partial<InsertReportSchedule> & {
      status?: ReportSchedule["status"];
      lastRunStatus?: ReportSchedule["lastRunStatus"] | null;
      lastRunSummary?: ReportSchedule["lastRunSummary"] | null;
      lastRunAt?: Date | string | null;
      nextRunAt?: Date | string | null;
    }
  ): Promise<ReportSchedule | undefined>;
  getDueReportSchedules(reference: Date): Promise<ReportSchedule[]>;
}

export class DatabaseStorage implements IStorage {

  private mfaChallenges = new Map<string, MfaChallengeRecord>();

  private hasRecurringEmployeeEventsColumns: boolean | undefined;

  private loggedMissingRecurringEventColumns = false;

  private pruneExpiredMfaChallenges(): void {
    const now = Date.now();
    for (const [id, challenge] of this.mfaChallenges) {
      if (challenge.expiresAt.getTime() <= now) {
        this.mfaChallenges.delete(id);
      }
    }
  }

  private clearMfaChallengesForUser(userId: string): void {
    for (const [id, challenge] of this.mfaChallenges) {
      if (challenge.userId === userId) {
        this.mfaChallenges.delete(id);
      }
    }
  }

  private parseMfaMethod(method: string | null | undefined): MfaMethod | null {
    if (!method) return null;
    if (method === "totp" || method === "email_otp") {
      return method;
    }
    return null;
  }

  private maskEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const [local, domain] = email.split("@");
    if (!domain) return null;
    const visible = local.slice(0, 1) || "*";
    const maskedLocal = visible + "*".repeat(Math.max(local.length - 1, 1));
    return `${maskedLocal}@${domain}`;
  }

  private async consumeBackupCode(
    user: UserWithPermissions,
    code: string,
  ): Promise<boolean> {
    const codes = user.mfaBackupCodes ?? [];
    if (!codes.includes(code)) {
      return false;
    }
    const updatedCodes = codes.filter(entry => entry !== code);
    await db
      .update(users)
      .set({ mfaBackupCodes: updatedCodes })
      .where(eq(users.id, user.id));
    user.mfaBackupCodes = updatedCodes;
    return true;
  }

  private async fetchPermissionGrants(
    userId: string,
    { includeExpired = false }: { includeExpired?: boolean } = {},
  ): Promise<UserPermissionGrantWithSet[]> {
    const conditions: SQL<unknown>[] = [eq(userPermissionGrants.userId, userId)];
    const now = new Date();
    if (!includeExpired) {
      conditions.push(lte(userPermissionGrants.startsAt, now));
      const expirationCondition = or(
        isNull(userPermissionGrants.expiresAt),
        gte(userPermissionGrants.expiresAt, now),
      );
      if (expirationCondition) {
        conditions.push(expirationCondition);
      }
      conditions.push(isNull(userPermissionGrants.revokedAt));
    }

    const rows = await db
      .select({
        grant: userPermissionGrants,
        permissionSet: permissionSets,
      })
      .from(userPermissionGrants)
      .leftJoin(permissionSets, eq(userPermissionGrants.permissionSetId, permissionSets.id))
      .where(and(...conditions))
      .orderBy(desc(userPermissionGrants.createdAt));

    return rows.map(row => ({
      ...row.grant,
      permissionSet: row.permissionSet ?? null,
    }));
  }

  private async hydrateUser(
    user: User | undefined,
  ): Promise<UserWithPermissions | undefined> {
    if (!user) return undefined;
    const activeGrants = await this.fetchPermissionGrants(user.id);
    const base = defaultRolePermissions[user.role] ?? [];
    const permissionsSet = new Set<PermissionKey>(base);
    for (const grant of activeGrants) {
      const perms = grant.permissionSet?.permissions ?? [];
      for (const perm of perms) {
        permissionsSet.add(perm);
      }
    }
    return {
      ...user,
      permissions: Array.from(permissionsSet) as PermissionKey[],
      activeGrants,
    };
  }

  private toBasicUserInfo(user: User | undefined): BasicUserInfo | null {
    if (!user) return null;
    const { id, username, email, role } = user;
    return { id, username, email, role };
  }

  private toSessionUser(user: UserWithPermissions): SessionUser {
    const { passwordHash, mfaTotpSecret, mfaBackupCodes, ...rest } = user;
    const codes = Array.isArray(mfaBackupCodes) ? mfaBackupCodes : [];
    return {
      ...rest,
      mfa: {
        enabled: rest.mfaEnabled ?? false,
        method: this.parseMfaMethod(rest.mfaMethod) ?? null,
        backupCodesRemaining: codes.length,
      },
    };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async getUserById(id: string): Promise<UserWithPermissions | undefined> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return this.hydrateUser(row);
  }

  async getUsers(): Promise<UserWithPermissions[]> {
    const rows = await db.select().from(users).orderBy(asc(users.username));
    const hydrated = await Promise.all(rows.map(row => this.hydrateUser(row)));
    return hydrated.filter((user): user is UserWithPermissions => Boolean(user));
  }

  async getUserByUsername(username: string): Promise<UserWithPermissions | undefined> {
    const [row] = await db.select().from(users).where(eq(users.username, username));
    return this.hydrateUser(row);
  }

  async getUserByEmail(email: string): Promise<UserWithPermissions | undefined> {
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : email;
    const target = typeof normalized === "string" && normalized.length > 0 ? normalized : email;
    const [row] = await db.select().from(users).where(eq(users.email, target));
    return this.hydrateUser(row);
  }

  async createUser(user: typeof users.$inferInsert): Promise<UserWithPermissions> {
    const [created] = await db.insert(users).values(user).returning();
    const hydrated = await this.hydrateUser(created);
    if (!hydrated) {
      throw new Error("Failed to hydrate created user");
    }
    return hydrated;
  }

  async updateUser(
    id: string,
    user: Partial<typeof users.$inferInsert>,
  ): Promise<UserWithPermissions | undefined> {
    const [updated] = await db.update(users).set(user).where(eq(users.id, id)).returning();
    return this.hydrateUser(updated);
  }

  async getSessionUser(id: string): Promise<SessionUser | undefined> {
    const user = await this.getUserById(id);
    return user ? this.toSessionUser(user) : undefined;
  }

  async createPasswordResetToken(
    userId: string,
    options: { expiresInMs?: number } = {},
  ): Promise<{ token: string; expiresAt: Date }> {
    const ttl = options.expiresInMs && options.expiresInMs > 0 ? options.expiresInMs : PASSWORD_RESET_TOKEN_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl);
    const token = randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(token);
    const now = new Date();

    await db.transaction(async tx => {
      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(passwordResetTokens.userId, userId),
            isNull(passwordResetTokens.consumedAt),
          ),
        );

      await tx.insert(passwordResetTokens).values({
        userId,
        tokenHash,
        expiresAt,
        createdAt: now,
      });
    });

    return { token, expiresAt };
  }

  async resetPasswordWithToken(token: string, passwordHash: string): Promise<PasswordResetResult> {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    return db.transaction(async tx => {
      const [record] = await tx
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash));

      if (!record) {
        return { success: false, reason: "invalid" };
      }

      if (record.consumedAt) {
        return { success: false, reason: "used" };
      }

      if (record.expiresAt.getTime() <= now.getTime()) {
        await tx
          .update(passwordResetTokens)
          .set({ consumedAt: now })
          .where(eq(passwordResetTokens.id, record.id));
        return { success: false, reason: "expired" };
      }

      await tx
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, record.userId));

      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: now })
        .where(eq(passwordResetTokens.id, record.id));

      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(passwordResetTokens.userId, record.userId),
            isNull(passwordResetTokens.consumedAt),
          ),
        );

      return { success: true };
    });
  }

  async getPermissionSets(): Promise<PermissionSet[]> {
    return db.select().from(permissionSets).orderBy(asc(permissionSets.name));
  }

  async getPermissionSetByKey(key: string): Promise<PermissionSet | undefined> {
    const [row] = await db.select().from(permissionSets).where(eq(permissionSets.key, key));
    return row ?? undefined;
  }

  async getActivePermissionGrants(
    userId: string,
    options: { includeExpired?: boolean } = {},
  ): Promise<UserPermissionGrantWithSet[]> {
    return this.fetchPermissionGrants(userId, options);
  }

  async grantPermissionSet(
    grant: InsertUserPermissionGrant,
  ): Promise<UserPermissionGrantWithSet> {
    const [created] = await db.insert(userPermissionGrants).values(grant).returning();
    const [row] = await db
      .select({
        grant: userPermissionGrants,
        permissionSet: permissionSets,
      })
      .from(userPermissionGrants)
      .leftJoin(permissionSets, eq(userPermissionGrants.permissionSetId, permissionSets.id))
      .where(eq(userPermissionGrants.id, created.id));
    if (!row) {
      throw new Error("Failed to load permission grant");
    }
    return {
      ...row.grant,
      permissionSet: row.permissionSet ?? null,
    };
  }

  async revokePermissionGrant(id: string, revokedAt: Date = new Date()): Promise<boolean> {
    const [updated] = await db
      .update(userPermissionGrants)
      .set({ revokedAt })
      .where(eq(userPermissionGrants.id, id))
      .returning({ id: userPermissionGrants.id });
    return Boolean(updated);
  }

  async createAccessRequest(request: InsertAccessRequest): Promise<AccessRequest> {
    const [created] = await db.insert(accessRequests).values(request).returning();
    return created;
  }

  async updateAccessRequest(
    id: string,
    updates: Partial<InsertAccessRequest> & {
      status?: AccessRequest["status"];
      reviewerId?: string | null;
      reviewedAt?: Date | null;
    },
  ): Promise<AccessRequest | undefined> {
    const [updated] = await db
      .update(accessRequests)
      .set(updates)
      .where(eq(accessRequests.id, id))
      .returning();
    return updated ?? undefined;
  }

  async getAccessRequests(options: {
    id?: string;
    status?: AccessRequest["status"] | "all";
    requesterId?: string;
    reviewerId?: string;
    includeResolved?: boolean;
  } = {}): Promise<AccessRequestDetail[]> {
    const requesterAlias = alias(users, "requester");
    const reviewerAlias = alias(users, "reviewer");
    const conditions: SQL<unknown>[] = [];

    if (options.id) {
      conditions.push(eq(accessRequests.id, options.id));
    }
    if (options.requesterId) {
      conditions.push(eq(accessRequests.requesterId, options.requesterId));
    }
    if (options.reviewerId) {
      conditions.push(eq(accessRequests.reviewerId, options.reviewerId));
    }
    if (options.status && options.status !== "all") {
      conditions.push(eq(accessRequests.status, options.status));
    } else if (!options.includeResolved) {
      conditions.push(eq(accessRequests.status, "pending"));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        request: accessRequests,
        permissionSet: permissionSets,
        requester: requesterAlias,
        reviewer: reviewerAlias,
      })
      .from(accessRequests)
      .leftJoin(permissionSets, eq(accessRequests.permissionSetId, permissionSets.id))
      .leftJoin(requesterAlias, eq(accessRequests.requesterId, requesterAlias.id))
      .leftJoin(reviewerAlias, eq(accessRequests.reviewerId, reviewerAlias.id))
      .where(whereClause)
      .orderBy(desc(accessRequests.requestedAt));

    return rows.map(row => ({
      ...row.request,
      permissionSet: row.permissionSet ?? null,
      requester: row.requester ? this.toBasicUserInfo(row.requester) : null,
      reviewer: row.reviewer ? this.toBasicUserInfo(row.reviewer) : null,
    }));
  }

  async logSecurityEvent(event: InsertSecurityAuditEvent): Promise<SecurityAuditEvent> {
    const payload: typeof securityAuditEvents.$inferInsert = {
      actorId: event.actorId ?? null,
      eventType: event.eventType,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      summary: event.summary ?? null,
      metadata: (event.metadata ?? null) as Record<string, unknown> | null,
    };
    const [created] = await db.insert(securityAuditEvents).values(payload).returning();
    return created;
  }

  async getSecurityAuditEvents(
    options: { limit?: number } = {},
  ): Promise<SecurityAuditEventDetail[]> {
    const actorAlias = alias(users, "actor");
    const limit = options.limit ?? 100;
    const rows = await db
      .select({
        event: securityAuditEvents,
        actor: actorAlias,
      })
      .from(securityAuditEvents)
      .leftJoin(actorAlias, eq(securityAuditEvents.actorId, actorAlias.id))
      .orderBy(desc(securityAuditEvents.createdAt))
      .limit(limit);

    return rows.map(row => ({
      ...row.event,
      actor: row.actor ? this.toBasicUserInfo(row.actor) : null,
    }));
  }



  async countActiveAdmins(excludeId?: string): Promise<number> {

    const conditions: SQL<unknown>[] = [eq(users.role, "admin"), eq(users.active, true)];

    if (excludeId) {

      conditions.push(ne(users.id, excludeId));

    }

    const [row] = await db

      .select({ value: sql<number>`count(*)::int` })

      .from(users)

      .where(and(...conditions));

    return Number(row?.value ?? 0);

  }



  async getFirstActiveAdmin(): Promise<UserWithPermissions | undefined> {
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.active, true)))
      .limit(1);
    return this.hydrateUser(row);
  }

  async createMfaChallenge(userId: string): Promise<MfaChallengeInfo | undefined> {
    this.pruneExpiredMfaChallenges();
    const user = await this.getUserById(userId);
    if (!user || user.active === false) {
      return undefined;
    }
    if (!user.mfaEnabled) {
      return undefined;
    }
    const method = this.parseMfaMethod(user.mfaMethod);
    if (!method) {
      return undefined;
    }

    this.clearMfaChallengesForUser(user.id);

    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MFA_CHALLENGE_TTL_MS);
    const record: MfaChallengeRecord = {
      id,
      userId: user.id,
      method,
      createdAt: now,
      expiresAt,
      attempts: 0,
    };

    if (method === "email_otp") {
      record.code = generateNumericOtp();
    }

    this.mfaChallenges.set(id, record);

    return {
      id,
      method,
      expiresAt,
      deliveryHint: method === "email_otp" ? this.maskEmail(user.email) : null,
    };
  }

  async verifyMfaChallenge(
    challengeId: string,
    token: string,
  ): Promise<MfaVerificationResult> {
    this.pruneExpiredMfaChallenges();
    const record = this.mfaChallenges.get(challengeId);
    if (!record) {
      return { success: false, reason: "not_found" };
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      this.mfaChallenges.delete(challengeId);
      return { success: false, reason: "expired" };
    }

    const user = await this.getUserById(record.userId);
    if (!user || user.active === false) {
      this.mfaChallenges.delete(challengeId);
      return { success: false, reason: "user_inactive" };
    }

    record.attempts += 1;
    const normalizedToken = typeof token === "string" ? token.trim() : "";
    let verified = false;

    if (normalizedToken) {
      const backupUsed = await this.consumeBackupCode(user, normalizedToken);
      if (backupUsed) {
        verified = true;
      } else if (record.method === "email_otp") {
        verified = normalizedToken === record.code;
      } else if (record.method === "totp") {
        verified = verifyTotpCode(user.mfaTotpSecret, normalizedToken);
      }
    }

    if (verified) {
      this.mfaChallenges.delete(challengeId);
      return { success: true, user: this.toSessionUser(user) };
    }

    if (record.attempts >= MFA_MAX_ATTEMPTS) {
      this.mfaChallenges.delete(challengeId);
    }

    return { success: false, reason: "invalid" };
  }



  
  private buildEmployeeOrder(
    sort?: EmployeeFilters["sort"],
    order: EmployeeFilters["order"] = "asc",
  ): SQL<unknown>[] {
    const direction = order === "desc" ? desc : asc;

    const buildNameOrder = () => [
      direction(employees.firstName),
      direction(employees.lastName),
      direction(employees.employeeCode),
    ];

    switch (sort) {
      case "name":
        return buildNameOrder();
      case "position":
        return [direction(employees.position), ...buildNameOrder()];
      case "department":
        return [direction(departments.name), ...buildNameOrder()];
      case "salary":
        return [direction(employees.salary), ...buildNameOrder()];
      case "status":
        return [direction(employees.status), ...buildNameOrder()];
      case "startDate":
        return [direction(employees.startDate), ...buildNameOrder()];
      default:
        return buildNameOrder();
    }
  }

  private buildEmployeeConditions(filters: EmployeeFilters = {}): SQL<unknown>[] {
    const conditions: SQL<unknown>[] = [];

    const statuses = filters.status?.map(status => status.trim()).filter(Boolean);
    if (statuses && statuses.length > 0) {
      conditions.push(inArray(employees.status, statuses));
    } else if (!filters.includeTerminated) {
      conditions.push(ne(employees.status, "terminated"));
    }

    if (filters.departmentId) {
      conditions.push(eq(employees.departmentId, filters.departmentId));
    }

    if (filters.companyId) {
      conditions.push(eq(employees.companyId, filters.companyId));
    }

    const searchTerm = filters.search?.trim();
    if (searchTerm) {
      const sanitized = searchTerm.replace(/[%_]/g, "\\$&");
      const likeTerm = `%${sanitized}%`;
      const searchConditions: SQL<unknown>[] = [
        ilike(employees.firstName, likeTerm),
        ilike(employees.lastName, likeTerm),
        ilike(employees.arabicName, likeTerm),
        ilike(employees.nickname, likeTerm),
        ilike(employees.email, likeTerm),
        ilike(employees.phone, likeTerm),
        ilike(employees.employeeCode, likeTerm),
        ilike(employees.position, likeTerm),
        ilike(departments.name, likeTerm),
        ilike(companies.name, likeTerm),
      ];
      if (searchConditions.length > 0) {
        const [firstCondition, ...rest] = searchConditions;
        const combined: SQL<unknown> =
          rest.length > 0 ? or(firstCondition, ...rest) ?? firstCondition : firstCondition;
        conditions.push(combined);
      }
    }

    return conditions;
  }

  private isDataSourceUnavailableError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const seen = new Set<unknown>();
    const queue: unknown[] = [error];

    const matchesCode = (code: unknown) =>
      typeof code === "string" && (code === "42P01" || code === "42703");

    const matchesMessage = (message: unknown) => {
      if (typeof message !== "string") {
        return false;
      }
      const normalized = message.toLowerCase();
      if (normalized.includes("does not exist") && normalized.includes("employee")) {
        return true;
      }
      if (normalized.includes("column") && normalized.includes("recurrence")) {
        return true;
      }
      return false;
    };

    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || seen.has(current)) {
        continue;
      }
      seen.add(current);
      const candidate: any = current;
      if (matchesCode(candidate.code) || matchesMessage(candidate.message)) {
        return true;
      }
      if (candidate.cause) {
        queue.push(candidate.cause);
      }
      if (candidate.originalError) {
        queue.push(candidate.originalError);
      }
      if (Array.isArray(candidate.errors)) {
        queue.push(...candidate.errors);
      }
    }

    return false;
  }



  private normalizeDateInput(value: string | Date | null | undefined): string | undefined {
    if (!value) return undefined;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
      }
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) return undefined;
      return parsed.toISOString().split("T")[0];
    }
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return undefined;
      return value.toISOString().split("T")[0];
    }
    return undefined;
  }

  private addMonths(dateString: string, monthsToAdd: number, referenceDay?: number): string {
    const [yearStr, monthStr, dayStr] = dateString.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = referenceDay ?? Number(dayStr);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return dateString;
    }
    const base = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
    const daysInMonth = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const finalDay = Math.min(Math.max(day || 1, 1), daysInMonth);
    const next = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), finalDay),
    );
    return next.toISOString().split("T")[0];
  }

  private expandRecurringEmployeeEvents<
    T extends {
      id: string;
      eventDate: string;
      eventType: string;
      recurrenceType?: string | null;
      recurrenceEndDate?: string | null;
    },
  >(events: T[], rangeStart?: string, rangeEnd?: string): T[] {
    if (!rangeStart || !rangeEnd) {
      return events.slice();
    }

    const normalizedStart = rangeStart;
    const normalizedEnd = rangeEnd;
    const results: T[] = [];
    const seen = new Set<string>();

    const addOccurrence = (event: T, occurrenceDate: string) => {
      if (occurrenceDate < normalizedStart || occurrenceDate > normalizedEnd) {
        return;
      }
      const key = `${event.id}|${occurrenceDate}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      if (event.eventDate === occurrenceDate) {
        results.push(event);
      } else {
        results.push({ ...event, eventDate: occurrenceDate });
      }
    };

    for (const event of events) {
      const normalizedEventDate = this.normalizeDateInput(event.eventDate) ?? event.eventDate;
      const baseEvent =
        normalizedEventDate === event.eventDate
          ? event
          : ({ ...event, eventDate: normalizedEventDate } as T);

      if (
        normalizedEventDate >= normalizedStart &&
        normalizedEventDate <= normalizedEnd
      ) {
        addOccurrence(baseEvent, normalizedEventDate);
      }

      if (baseEvent.eventType !== "allowance" || baseEvent.recurrenceType !== "monthly") {
        continue;
      }

      const recurrenceStart = this.normalizeDateInput(baseEvent.eventDate);
      if (!recurrenceStart || recurrenceStart > normalizedEnd) {
        continue;
      }

      const recurrenceEnd = this.normalizeDateInput(
        baseEvent.recurrenceEndDate ?? undefined,
      );
      if (recurrenceEnd && recurrenceEnd < normalizedStart) {
        continue;
      }

      const targetEnd =
        recurrenceEnd && recurrenceEnd < normalizedEnd ? recurrenceEnd : normalizedEnd;
      const originalDay = parseInt(recurrenceStart.split("-")[2] ?? "1", 10) || 1;

      let occurrence = recurrenceStart;
      while (occurrence < normalizedStart) {
        occurrence = this.addMonths(occurrence, 1, originalDay);
      }

      while (occurrence <= targetEnd) {
        addOccurrence(baseEvent, occurrence);
        occurrence = this.addMonths(occurrence, 1, originalDay);
      }
    }

    return results.sort((a, b) => {
      if (a.eventDate === b.eventDate) {
        return 0;
      }
      return a.eventDate > b.eventDate ? -1 : 1;
    });
  }

  async getEmployees(filters: EmployeeFilters = {}): Promise<EmployeeWithDepartment[]> {
    const conditions = this.buildEmployeeConditions(filters);
    const whereCondition =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    const baseQuery = db
      .select({
        employee: employees,
        department: departments,
        company: companies,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(companies, eq(employees.companyId, companies.id));

    const filteredQuery = whereCondition ? baseQuery.where(whereCondition) : baseQuery;

    const orderByExpressions = this.buildEmployeeOrder(filters.sort, filters.order);
    const orderedQuery =
      orderByExpressions.length > 0
        ? filteredQuery.orderBy(...orderByExpressions)
        : filteredQuery;

    const limitedQuery =
      typeof filters.limit === "number"
        ? orderedQuery.limit(filters.limit)
        : orderedQuery;

    const finalQuery =
      typeof filters.offset === "number"
        ? limitedQuery.offset(filters.offset)
        : limitedQuery;

    const rows = await finalQuery;

    return rows.map(row => ({
      ...row.employee,
      department: row.department ?? undefined,
      company: row.company ?? undefined,
    }));
  }

  async countEmployees(filters: EmployeeFilters = {}): Promise<number> {
    const conditions = this.buildEmployeeConditions(filters);
    const whereCondition =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    const baseQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(companies, eq(employees.companyId, companies.id));

    const query = whereCondition ? baseQuery.where(whereCondition) : baseQuery;

    const [result] = await query;
    return result ? Number(result.count) : 0;
  }

  private formatLoanPaymentForInsert(payment: InsertLoanPayment): typeof loanPayments.$inferInsert {

    return {

      loanId: payment.loanId,

      payrollRunId: payment.payrollRunId,

      employeeId: payment.employeeId,

      amount: payment.amount.toString(),

      appliedDate: payment.appliedDate ?? undefined,

      source: payment.source ?? "payroll",

    };

  }

  private formatLoanScheduleEntryForInsert(
    entry: InsertLoanAmortizationScheduleEntry,
  ): typeof loanAmortizationSchedules.$inferInsert {

    return {

      loanId: entry.loanId,

      installmentNumber: entry.installmentNumber,

      dueDate: entry.dueDate,

      principalAmount: entry.principalAmount.toString(),

      interestAmount: entry.interestAmount.toString(),

      paymentAmount: entry.paymentAmount.toString(),

      remainingBalance: entry.remainingBalance.toString(),

      status: entry.status ?? "pending",

      payrollRunId: entry.payrollRunId ?? undefined,

      paidAt: entry.paidAt ?? undefined,

      notes: (entry as any).notes ?? undefined,

    };

  }



  // Department methods

  async getDepartments(): Promise<Department[]> {

    return await db.select().from(departments);

  }



  async getDepartment(id: string): Promise<Department | undefined> {

    const [department] = await db.select().from(departments).where(eq(departments.id, id));

    return department || undefined;

  }



  async createDepartment(department: InsertDepartment): Promise<Department> {

    const [newDepartment] = await db

      .insert(departments)

      .values(department)

      .returning();

    return newDepartment;

  }



  async updateDepartment(id: string, department: Partial<InsertDepartment>): Promise<Department | undefined> {

    const [updated] = await db

      .update(departments)

      .set(department)

      .where(eq(departments.id, id))

      .returning();

    return updated || undefined;

  }



  async deleteDepartment(id: string): Promise<boolean> {

    const result = await db.delete(departments).where(eq(departments.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  // Company methods

  async getCompanies(): Promise<Company[]> {

    return await db.select().from(companies);

  }

  async getGenericDocuments(
    filters: GenericDocumentFilters = {},
  ): Promise<import("@shared/schema").GenericDocument[]> {
    const { genericDocuments } = await import("@shared/schema");
    const {
      search,
      category,
      tags,
      employeeId,
      signatureStatus,
      versionGroupId,
      latestOnly = true,
    } = filters;

    const conditions: SQL[] = [];

    if (latestOnly) {

      conditions.push(eq(genericDocuments.isLatest, true));

    }

    if (employeeId) {

      conditions.push(eq(genericDocuments.employeeId, employeeId));

    }

    if (category) {

      conditions.push(ilike(genericDocuments.category, `%${category}%`));

    }

    if (versionGroupId) {

      conditions.push(eq(genericDocuments.versionGroupId, versionGroupId));

    }

    if (signatureStatus && signatureStatus !== "all") {

      conditions.push(eq(genericDocuments.signatureStatus, signatureStatus));

    }

    if (tags && tags.length) {

      const tagConditions = tags

        .map(tag => tag.trim())

        .filter((tag): tag is string => Boolean(tag.length))

        .map(tag => ilike(genericDocuments.tags, `%${tag}%`));

      if (tagConditions.length) {

        const combinedTags = and(...tagConditions);

        if (combinedTags) {

          conditions.push(combinedTags);

        }

      }

    }

    if (search) {

      const likeValue = `%${search}%`;

      const searchCondition = or(

        ilike(genericDocuments.title, likeValue),

        ilike(genericDocuments.description, likeValue),

        ilike(genericDocuments.referenceNumber, likeValue),

        ilike(genericDocuments.controllerNumber, likeValue),

      );

      if (searchCondition) {

        conditions.push(searchCondition);

      }

    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const baseQuery = db.select().from(genericDocuments);

    const filteredQuery = whereClause ? baseQuery.where(whereClause) : baseQuery;

    return await filteredQuery.orderBy(

      desc(genericDocuments.createdAt),

      desc(genericDocuments.version),

    );

  }

  async getGenericDocument(
    id: string,
  ): Promise<import("@shared/schema").GenericDocument | undefined> {
    const { genericDocuments } = await import("@shared/schema");
    const [row] = await db

      .select()

      .from(genericDocuments)

      .where(eq(genericDocuments.id, id))

      .limit(1);

    return row || undefined;

  }

  async createGenericDocument(

    doc: import("@shared/schema").InsertGenericDocument,

    options: { baseDocumentId?: string | null } = {},

  ): Promise<import("@shared/schema").GenericDocument> {
    const { genericDocuments } = await import("@shared/schema");
    const payload = removeUndefined({ ...doc }) as typeof genericDocuments.$inferInsert;

    const baseDocumentId = options.baseDocumentId;

    return await db.transaction(async (tx) => {

      if (baseDocumentId) {

        const baseDocument = await tx

          .select()

          .from(genericDocuments)

          .where(eq(genericDocuments.id, baseDocumentId))

          .limit(1);

        const current = baseDocument[0];

        if (!current) {

          throw new Error(`Base document ${baseDocumentId} not found`);

        }

        const groupId = current.versionGroupId ?? current.id;

        const [{ maxVersion }] = await tx

          .select({ maxVersion: sql<number>`COALESCE(max(${genericDocuments.version}), 0)` })

          .from(genericDocuments)

          .where(eq(genericDocuments.versionGroupId, groupId));

        await tx

          .update(genericDocuments)

          .set({ isLatest: false })

          .where(eq(genericDocuments.versionGroupId, groupId));

        const [row] = await tx

          .insert(genericDocuments)

          .values({

            ...payload,

            versionGroupId: groupId,

            version: (maxVersion ?? 0) + 1,

            previousVersionId: current.id,

            isLatest: true,

          })

          .returning();

        if (!row) {

          throw new Error("Failed to create document version");

        }

        return row;

      }

      const [row] = await tx.insert(genericDocuments).values(payload).returning();

      if (!row) {

        throw new Error("Failed to create document");

      }

      return row;

    });

  }

  async updateGenericDocument(

    id: string,

    doc: Partial<import("@shared/schema").InsertGenericDocument>,

  ): Promise<import("@shared/schema").GenericDocument | undefined> {

    const { genericDocuments } = await import("@shared/schema");

    const updates = removeUndefined({ ...doc }) as Partial<typeof genericDocuments.$inferInsert>;

    delete (updates as any).id;

    delete (updates as any).version;

    delete (updates as any).versionGroupId;

    delete (updates as any).previousVersionId;

    delete (updates as any).createdAt;

    delete (updates as any).isLatest;

    if (Object.keys(updates).length === 0) {

      const current = await this.getGenericDocument(id);

      return current;

    }

    const [row] = await db

      .update(genericDocuments)

      .set(updates)

      .where(eq(genericDocuments.id, id))

      .returning();

    return row || undefined;

  }

  async updateGenericDocumentByEnvelope(

    envelopeId: string,

    updates: Partial<import("@shared/schema").InsertGenericDocument>,

  ): Promise<import("@shared/schema").GenericDocument | undefined> {

    const { genericDocuments } = await import("@shared/schema");

    if (!envelopeId) return undefined;

    const payload = removeUndefined({ ...updates }) as Partial<typeof genericDocuments.$inferInsert>;

    delete (payload as any).id;

    delete (payload as any).version;

    delete (payload as any).versionGroupId;

    delete (payload as any).previousVersionId;

    delete (payload as any).createdAt;

    delete (payload as any).isLatest;

    if (Object.keys(payload).length === 0) {

      const [current] = await db

        .select()

        .from(genericDocuments)

        .where(eq(genericDocuments.signatureEnvelopeId, envelopeId))

        .limit(1);

      return current || undefined;

    }

    const [row] = await db

      .update(genericDocuments)

      .set(payload)

      .where(eq(genericDocuments.signatureEnvelopeId, envelopeId))

      .returning();

    return row || undefined;

  }

  async deleteGenericDocument(id: string): Promise<boolean> {

    const existing = await this.getGenericDocument(id);

    if (!existing) return false;

    const { genericDocuments } = await import("@shared/schema");
    const result = await db.delete(genericDocuments).where(eq(genericDocuments.id, id));

    const deleted = (result.rowCount ?? 0) > 0;

    if (!deleted) return false;

    if (existing.isLatest) {

      const [latest] = await db

        .select()

        .from(genericDocuments)

        .where(eq(genericDocuments.versionGroupId, existing.versionGroupId))

        .orderBy(desc(genericDocuments.version))

        .limit(1);

      if (latest) {

        await db

          .update(genericDocuments)

          .set({ isLatest: true })

          .where(eq(genericDocuments.id, latest.id));

      }

    }

    return true;

  }



  async getCompany(id: string): Promise<Company | undefined> {

    const [company] = await db.select().from(companies).where(eq(companies.id, id));

    return company || undefined;

  }



  async getTemplates(): Promise<import("@shared/schema").Template[]> {

    const { templates } = await import("@shared/schema");

    return await db.select().from(templates);

  }



  async getTemplateByKey(key: string): Promise<import("@shared/schema").Template | undefined> {

    const { templates } = await import("@shared/schema");

    const [row] = await db.select().from(templates).where(eq(templates.key, key));

    return row || undefined;

  }



  async upsertTemplate(key: string, data: { en: string; ar: string }): Promise<import("@shared/schema").Template> {

    const { templates } = await import("@shared/schema");

    const existing = await this.getTemplateByKey(key);

    if (existing) {

      const [row] = await db.update(templates).set({ en: data.en, ar: data.ar, updatedAt: sql`now()` }).where(eq(templates.key, key)).returning();

      return row!;

    }

    const [row] = await db.insert(templates).values({ key, en: data.en, ar: data.ar }).returning();

    return row!;

  }



  async createCompany(company: InsertCompany): Promise<Company> {

    const [newCompany] = await db
      .insert(companies)
      .values(company as typeof companies.$inferInsert)
      .returning();

    return newCompany;

  }



  async updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined> {

    const [updated] = await db

      .update(companies)

      .set(company as Partial<typeof companies.$inferInsert>)

      .where(eq(companies.id, id))

      .returning();

    return updated || undefined;

  }



  async deleteCompany(id: string): Promise<boolean> {

    const result = await db.delete(companies).where(eq(companies.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  async getAllowanceTypes(): Promise<AllowanceType[]> {

    return await db.select().from(allowanceTypes).orderBy(asc(allowanceTypes.name));

  }



  async createAllowanceType(type: InsertAllowanceType): Promise<AllowanceType> {

    const name = type.name.trim();

    if (!name) {

      throw new Error("Allowance type name is required");

    }

    const normalizedName = normalizeAllowanceTitle(name);

    const [record] = await db

      .insert(allowanceTypes)

      .values({ name, normalizedName })

      .onConflictDoUpdate({

        target: allowanceTypes.normalizedName,

        set: { name },

      })

      .returning();

    if (record) {

      return record;

    }

    const [existing] = await db

      .select()

      .from(allowanceTypes)

      .where(eq(allowanceTypes.normalizedName, normalizedName))

      .limit(1);

    if (existing) {

      return existing;

    }

    throw new Error("Failed to create allowance type");

  }




  async getEmployee(id: string): Promise<EmployeeWithDepartment | undefined> {

    const employee = await db.query.employees.findFirst({

      where: eq(employees.id, id),

      with: {

        department: true,

      },

    });

    if (!employee) return undefined;

    return {

      ...employee,

      department: employee.department || undefined,

    };

  }



  async createEmployee(employee: InsertEmployee): Promise<Employee> {

    let code = employee.employeeCode?.trim();

    if (!code) {

      code = await this.generateEmployeeCode();

    } else {

      const existing = await db

        .select()

        .from(employees)

        .where(eq(employees.employeeCode, code))

        .limit(1);

      if (existing.length > 0) {

        throw new DuplicateEmployeeCodeError(code);

      }

    }



    try {

      const { salary, additions, ...rest } = employee;

      const [newEmployee] = await db

        .insert(employees)

        .values({

          ...rest,

          salary: salary.toString(),

          ...(additions !== undefined ? { additions: additions.toString() } : {}),

          employeeCode: code,

          role: employee.role || "employee",

          status: employee.status || "active",

          visaAlertDays: employee.visaAlertDays || 30,

          civilIdAlertDays: employee.civilIdAlertDays || 60,

          passportAlertDays: employee.passportAlertDays || 90,

        })

        .returning();

      return newEmployee;

    } catch (error: any) {

      // Handle potential race condition where the employee code becomes duplicate

      if (error?.code === "23505") {

        throw new DuplicateEmployeeCodeError(code);

      }

      throw error;

    }

  }



  private async generateEmployeeCode(): Promise<string> {

    let code = "";

    while (true) {

      const random = Math.floor(1000 + Math.random() * 9000);

      code = `EMP${random}`;

      const existing = await db

        .select()

        .from(employees)

        .where(eq(employees.employeeCode, code))

        .limit(1);

      if (existing.length === 0) {

        return code;

      }

    }

  }



  async createEmployeesBulk(

    employeeList: InsertEmployee[]

  ): Promise<{ success: number; failed: number; employees?: Employee[] }> {

    let success = 0;

    let failed = 0;

    const inserted: Employee[] = [];

    await db.transaction(async tx => {

      const usedCodes = new Set<string>();

      for (const emp of employeeList) {

        try {

          let code = emp.employeeCode?.trim();

          if (!code) {

            do {

              code = await this.generateEmployeeCode();

            } while (usedCodes.has(code));

          } else {

            if (usedCodes.has(code)) throw new DuplicateEmployeeCodeError(code);

            const existing = await tx

              .select()

              .from(employees)

              .where(eq(employees.employeeCode, code))

              .limit(1);

            if (existing.length > 0) throw new DuplicateEmployeeCodeError(code);

          }



          const { salary, additions, ...restEmp } = emp;

          const [created] = await tx

            .insert(employees)

            .values({

              ...restEmp,

              salary: salary.toString(),

              ...(additions !== undefined ? { additions: additions.toString() } : {}),

              employeeCode: code,

              role: emp.role || "employee",

              status: emp.status || "active",

              visaAlertDays: emp.visaAlertDays || 30,

              civilIdAlertDays: emp.civilIdAlertDays || 60,

              passportAlertDays: emp.passportAlertDays || 90,

            })

            .returning();

          inserted.push(created);

          usedCodes.add(code);

          success++;

        } catch {

          failed++;

        }

      }

    });

    return { success, failed, employees: inserted };

  }



  async updateEmployee(

    id: string,

    employee: Partial<Omit<InsertEmployee, "employeeCode">>

  ): Promise<Employee | undefined> {

    if ("employeeCode" in (employee as any)) {

      delete (employee as any).employeeCode;

    }

    const { salary, additions, ...rest } = employee;

    const updateData = {

      ...rest,

      ...(salary !== undefined ? { salary: salary.toString() } : {}),

      ...(additions !== undefined ? { additions: additions.toString() } : {}),

    } as Partial<Omit<InsertEmployee, "employeeCode">> & {

      salary?: string;

      additions?: string;

    };



    const [updated] = await db

      .update(employees)

      .set(updateData)

      .where(eq(employees.id, id))

      .returning();

    return updated || undefined;

  }

  async terminateEmployee(id: string): Promise<Employee | undefined> {
    const [updated] = await db
      .update(employees)
      .set({ status: "terminated" })
      .where(eq(employees.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteEmployee(id: string): Promise<Employee | undefined> {
    return await this.terminateEmployee(id);
  }



  // Employee custom field methods

  async getEmployeeCustomFields(): Promise<EmployeeCustomField[]> {

    return await db.select().from(employeeCustomFields);

  }



  async createEmployeeCustomField(

    field: InsertEmployeeCustomField

  ): Promise<EmployeeCustomField> {

    const [created] = await db

      .insert(employeeCustomFields)

      .values(field)

      .returning();

    return created;

  }



  async updateEmployeeCustomField(

    id: string,

    field: Partial<InsertEmployeeCustomField>

  ): Promise<EmployeeCustomField | undefined> {

    const [updated] = await db

      .update(employeeCustomFields)

      .set(field)

      .where(eq(employeeCustomFields.id, id))

      .returning();

    return updated || undefined;

  }



  async deleteEmployeeCustomField(id: string): Promise<boolean> {
    return await db.transaction(async tx => {
      await tx
        .delete(employeeCustomValues)
        .where(eq(employeeCustomValues.fieldId, id));

      const result = await tx
        .delete(employeeCustomFields)
        .where(eq(employeeCustomFields.id, id));

      return (result.rowCount ?? 0) > 0;
    });
  }



  // Employee custom value methods

  async getEmployeeCustomValues(

    employeeId: string

  ): Promise<EmployeeCustomValue[]> {

    return await db

      .select()

      .from(employeeCustomValues)

      .where(eq(employeeCustomValues.employeeId, employeeId));

  }



  async createEmployeeCustomValue(

    value: InsertEmployeeCustomValue

  ): Promise<EmployeeCustomValue> {

    const [created] = await db

      .insert(employeeCustomValues)

      .values(value)

      .returning();

    return created;

  }



  async updateEmployeeCustomValue(

    id: string,

    value: Partial<InsertEmployeeCustomValue>

  ): Promise<EmployeeCustomValue | undefined> {

    const [updated] = await db

      .update(employeeCustomValues)

      .set(value)

      .where(eq(employeeCustomValues.id, id))

      .returning();

    return updated || undefined;

  }



  async deleteEmployeeCustomValue(id: string): Promise<boolean> {

    const result = await db

      .delete(employeeCustomValues)

      .where(eq(employeeCustomValues.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  async getEmployeeWorkflows(

    employeeId: string,

    workflowType?: EmployeeWorkflow["workflowType"],

  ): Promise<EmployeeWorkflowWithSteps[]> {

    const conditions: SQL<unknown>[] = [eq(employeeWorkflows.employeeId, employeeId)];

    if (workflowType) {

      conditions.push(eq(employeeWorkflows.workflowType, workflowType));

    }

    const workflows = await db.query.employeeWorkflows.findMany({

      where: and(...conditions),

      with: {

        steps: {

          orderBy: asc(employeeWorkflowSteps.orderIndex),

        },

      },

      orderBy: desc(employeeWorkflows.startedAt),

    });

    return workflows.map(workflow => ({

      ...workflow,

      metadata: workflow.metadata ?? {},

      steps: workflow.steps.map(step => ({

        ...step,

        metadata: step.metadata ?? {},

      })),

    }));

  }



  async getEmployeeWorkflowById(id: string): Promise<EmployeeWorkflowWithSteps | undefined> {

    const workflow = await db.query.employeeWorkflows.findFirst({

      where: eq(employeeWorkflows.id, id),

      with: {

        steps: {

          orderBy: asc(employeeWorkflowSteps.orderIndex),

        },

      },

    });

    if (!workflow) return undefined;

    return {

      ...workflow,

      metadata: workflow.metadata ?? {},

      steps: workflow.steps.map(step => ({

        ...step,

        metadata: step.metadata ?? {},

      })),

    };

  }



  async getActiveEmployeeWorkflow(

    employeeId: string,

    workflowType: EmployeeWorkflow["workflowType"],

  ): Promise<EmployeeWorkflowWithSteps | undefined> {

    const workflow = await db.query.employeeWorkflows.findFirst({

      where: and(

        eq(employeeWorkflows.employeeId, employeeId),

        eq(employeeWorkflows.workflowType, workflowType),

        inArray(employeeWorkflows.status, ["pending", "in_progress"]),

      ),

      with: {

        steps: {

          orderBy: asc(employeeWorkflowSteps.orderIndex),

        },

      },

      orderBy: desc(employeeWorkflows.startedAt),

    });

    if (!workflow) return undefined;

    return {

      ...workflow,

      metadata: workflow.metadata ?? {},

      steps: workflow.steps.map(step => ({

        ...step,

        metadata: step.metadata ?? {},

      })),

    };

  }



  async createEmployeeWorkflow(

    workflow: InsertEmployeeWorkflow,

    steps: Omit<InsertEmployeeWorkflowStep, "workflowId" | "id" | "createdAt" | "updatedAt" | "completedAt">[],

  ): Promise<EmployeeWorkflowWithSteps> {

    return await db.transaction(async tx => {

      const [createdWorkflow] = await tx

        .insert(employeeWorkflows)

        .values({

          ...workflow,

          metadata: workflow.metadata ?? {},

        })

        .returning();

      if (!createdWorkflow) {

        throw new Error("Failed to create workflow");

      }

      if (steps.length > 0) {

        await tx.insert(employeeWorkflowSteps).values(

          steps.map((step, index) => ({

            ...step,

            workflowId: createdWorkflow.id,

            orderIndex: step.orderIndex ?? index,

            metadata: step.metadata ?? {},

          })),

        );

      }

      const created = await tx.query.employeeWorkflows.findFirst({

        where: eq(employeeWorkflows.id, createdWorkflow.id),

        with: {

          steps: {

            orderBy: asc(employeeWorkflowSteps.orderIndex),

          },

        },

      });

      if (!created) {

        throw new Error("Failed to load workflow after creation");

      }

      return {

        ...created,

        metadata: created.metadata ?? {},

        steps: created.steps.map(step => ({

          ...step,

          metadata: step.metadata ?? {},

        })),

      };

    });

  }



  async updateEmployeeWorkflow(

    id: string,

    workflow: Partial<InsertEmployeeWorkflow> & { completedAt?: Date | null },

  ): Promise<EmployeeWorkflow | undefined> {

    const updates: Partial<InsertEmployeeWorkflow> & {
      metadata?: Record<string, unknown> | null;
      completedAt?: Date | null;
    } = {

      ...workflow,

    };

    if (workflow.metadata === undefined) {

      delete updates.metadata;

    } else {

      updates.metadata = workflow.metadata ?? {};

    }

    const [updated] = await db

      .update(employeeWorkflows)

      .set(updates)

      .where(eq(employeeWorkflows.id, id))

      .returning();

    if (!updated) return undefined;

    return {

      ...updated,

      metadata: updated.metadata ?? {},

    };

  }



  async updateEmployeeWorkflowStep(

    id: string,

    step: Partial<InsertEmployeeWorkflowStep> & { completedAt?: Date | null },

  ): Promise<EmployeeWorkflowStep | undefined> {

    const updates: Partial<InsertEmployeeWorkflowStep> & {
      metadata?: Record<string, unknown> | null;
      updatedAt?: Date;
      completedAt?: Date | null;
    } = {

      ...step,

      updatedAt: new Date(),

    };

    if (step.metadata === undefined) {

      delete updates.metadata;

    } else {

      updates.metadata = step.metadata ?? {};

    }

    const [updated] = await db

      .update(employeeWorkflowSteps)

      .set(updates)

      .where(eq(employeeWorkflowSteps.id, id))

      .returning();

    if (!updated) return undefined;

    return {

      ...updated,

      metadata: updated.metadata ?? {},

    };

  }



  // Payroll methods

  async getPayrollRuns(): Promise<PayrollRunWithEntries[]> {
    const runs = await db.select().from(payrollRuns).orderBy(desc(payrollRuns.createdAt));
    const enriched = await Promise.all(runs.map(run => this.hydratePayrollRunWithEntries(run)));
    return enriched;
  }



  async getPayrollRun(id: string): Promise<PayrollRunWithEntries | undefined> {
    const [payrollRun] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id));



    if (!payrollRun) return undefined;



    return this.hydratePayrollRunWithEntries(payrollRun);
  }



  private async hydratePayrollRunWithEntries(run: PayrollRun): Promise<PayrollRunWithEntries> {

    const entries = await db.select({

      id: payrollEntries.id,

      createdAt: payrollEntries.createdAt,

      payrollRunId: payrollEntries.payrollRunId,

      employeeId: payrollEntries.employeeId,

      grossPay: payrollEntries.grossPay,

      baseSalary: payrollEntries.baseSalary,

      bonusAmount: payrollEntries.bonusAmount,

      workingDays: payrollEntries.workingDays,

      actualWorkingDays: payrollEntries.actualWorkingDays,

      vacationDays: payrollEntries.vacationDays,

      taxDeduction: payrollEntries.taxDeduction,

      socialSecurityDeduction: payrollEntries.socialSecurityDeduction,

      healthInsuranceDeduction: payrollEntries.healthInsuranceDeduction,

      loanDeduction: payrollEntries.loanDeduction,

      otherDeductions: payrollEntries.otherDeductions,

      netPay: payrollEntries.netPay,

      adjustmentReason: payrollEntries.adjustmentReason,

      allowances: payrollEntries.allowances,

      employee: {

        id: employees.id,

        employeeCode: employees.employeeCode,

        firstName: employees.firstName,

        lastName: employees.lastName,

        arabicName: employees.arabicName,

        nickname: employees.nickname,

        salary: employees.salary,

      }

    })

    .from(payrollEntries)

    .leftJoin(employees, eq(payrollEntries.employeeId, employees.id))

    .where(eq(payrollEntries.payrollRunId, run.id));



    const normalizedEntries = entries.map(entry => ({
      ...entry,
      employee: entry.employee ?? undefined,
    }));

    const scenarioToggles =
      run.scenarioToggles && typeof run.scenarioToggles === "object"
        ? (run.scenarioToggles as Record<string, boolean>)
        : {};
    const allowancesEnabled = scenarioToggles.allowances !== false;

    const fallbackCandidates = allowancesEnabled
      ? normalizedEntries.filter(entry => entry.allowances === null)
      : [];

    let fallbackBreakdown = new Map<string, AllowanceBreakdown>();
    let fallbackAllowanceKeys: string[] = [];

    if (fallbackCandidates.length > 0) {
      try {
        const metadata = await this.buildAllowanceBreakdownForRun(
          fallbackCandidates.map(entry => ({ employeeId: entry.employeeId })),
          run.startDate,
          run.endDate,
        );
        fallbackBreakdown = metadata.breakdownByEmployee;
        fallbackAllowanceKeys = metadata.allowanceKeys;
      } catch (error) {
        if (this.isDataSourceUnavailableError(error)) {
          console.warn(
            "Failed to load allowance metadata due to missing data source:",
            error,
          );
          fallbackBreakdown = new Map();
          fallbackAllowanceKeys = [];
        } else {
          throw error;
        }
      }
    }

    const allowanceKeySet = new Set<string>(fallbackAllowanceKeys);

    const entriesWithAllowances = normalizedEntries.map(entry => {
      const { allowances: rawAllowances, ...rest } = entry;
      let normalizedAllowances: AllowanceBreakdown | undefined;

      if (rawAllowances === null) {
        if (allowancesEnabled) {
          const fallback = fallbackBreakdown.get(entry.employeeId);
          if (fallback && Object.keys(fallback).length > 0) {
            normalizedAllowances = { ...fallback };
            Object.keys(normalizedAllowances).forEach(key => allowanceKeySet.add(key));
          }
        }
      } else if (rawAllowances) {
        const sanitized = this.sanitizeAllowanceBreakdown(rawAllowances);
        if (sanitized) {
          normalizedAllowances = sanitized;
          Object.keys(sanitized).forEach(key => allowanceKeySet.add(key));
        }
      }

      const normalizedEntry = { ...rest } as PayrollEntry;
      if (normalizedAllowances !== undefined) {
        normalizedEntry.allowances = normalizedAllowances;
      }
      return normalizedEntry;
    });



    return {

      ...run,

      entries: entriesWithAllowances,

      allowanceKeys: Array.from(allowanceKeySet).sort(),

    };

  }



  private sanitizeAllowanceBreakdown(raw: unknown): AllowanceBreakdown | undefined {
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const sanitized = Object.entries(raw as Record<string, unknown>).reduce<AllowanceBreakdown>(
      (acc, [key, value]) => {
        if (typeof value === "number") {
          if (Number.isFinite(value)) {
            acc[key] = value;
          }
          return acc;
        }

        if (typeof value === "string") {
          const trimmed = value.trim();
          if (!trimmed) {
            return acc;
          }

          const numeric = Number(trimmed);
          if (Number.isFinite(numeric)) {
            acc[key] = numeric;
          }
        }

        return acc;
      },
      {},
    );

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  private async buildAllowanceBreakdownForRun(

    entries: Array<{ employeeId: string }>,

    startDate: string | Date,

    endDate: string | Date,

  ): Promise<{ breakdownByEmployee: Map<string, AllowanceBreakdown>; allowanceKeys: string[] }> {

    const employeeIds = Array.from(new Set(entries.map((entry) => entry.employeeId))).filter(Boolean);

    if (employeeIds.length === 0) {

      return { breakdownByEmployee: new Map(), allowanceKeys: [] };

    }



    const start = new Date(startDate);

    const end = new Date(endDate);



    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {

      return { breakdownByEmployee: new Map(), allowanceKeys: [] };

    }



    const allowanceEvents = await this.getEmployeeEvents(start, end, { eventType: "allowance" });



    const breakdownByEmployee = new Map<string, AllowanceBreakdown>();

    const allowanceKeySet = new Set<string>();

    const employeeSet = new Set(employeeIds);



    for (const event of allowanceEvents) {

      if (!employeeSet.has(event.employeeId)) continue;

      if ((event as any).status && (event as any).status !== "active") continue;

      if ((event as any).affectsPayroll === false) continue;



      const amount = Number.parseFloat(String((event as any).amount ?? 0));

      if (!Number.isFinite(amount)) continue;



      const normalizedKey = normalizeAllowanceTitle((event as any).title as string | undefined);

      allowanceKeySet.add(normalizedKey);



      const existing = breakdownByEmployee.get(event.employeeId) ?? {};

      const current = existing[normalizedKey] ?? 0;

      existing[normalizedKey] = Number((current + amount).toFixed(3));

      breakdownByEmployee.set(event.employeeId, existing);

    }



    const allowanceKeys = Array.from(allowanceKeySet).sort();



    return { breakdownByEmployee, allowanceKeys };

  }



  async createPayrollRun(payrollRun: InsertPayrollRun): Promise<PayrollRun> {

    const [newPayrollRun] = await db

      .insert(payrollRuns)

      .values({

        ...payrollRun,

        status: payrollRun.status || "pending",

      })

      .returning();

    return newPayrollRun;

  }



  async updatePayrollRun(id: string, payrollRun: Partial<InsertPayrollRun>): Promise<PayrollRun | undefined> {

    const [updated] = await db

      .update(payrollRuns)

      .set(payrollRun)

      .where(eq(payrollRuns.id, id))

      .returning();

    return updated || undefined;

  }

  async undoPayrollRunLoanDeductions(
    payrollRunId: string,
    options: UndoPayrollLoanOptions = {},
  ): Promise<UndoPayrollLoanResult | undefined> {

    const removeLoanPayments = options.removeLoanPayments ?? true;

    const payrollRunNotFound = Symbol("PAYROLL_RUN_NOT_FOUND");

    const runUndo = async (client: TransactionClient): Promise<UndoPayrollLoanResult> => {

      const runs = await client

        .select()

        .from(payrollRuns)

        .where(eq(payrollRuns.id, payrollRunId));

      const existingRun = runs[0];

      if (!existingRun) {

        throw payrollRunNotFound;

      }

      const paymentsForRun = await client

        .select()

        .from(loanPayments)

        .where(eq(loanPayments.payrollRunId, payrollRunId));

      await this.undoPayrollLoanDeductions(client, payrollRunId);

      if (removeLoanPayments && paymentsForRun.length > 0) {

        await client

          .delete(loanPayments)

          .where(eq(loanPayments.payrollRunId, payrollRunId));

      }

      const loanIds = Array.from(

        new Set(

          paymentsForRun

            .map(payment => payment.loanId)

            .filter((loanId): loanId is string => Boolean(loanId)),

        ),

      );

      const loanRows = await Promise.all(

        loanIds.map(async loanId => {

          const result = await client

            .select()

            .from(loans)

            .where(eq(loans.id, loanId));

          return result[0];

        }),

      );

      const loansAfterUndo = loanRows.filter((loan): loan is Loan => Boolean(loan));

      return {

        payrollRun: existingRun,

        loanPayments: paymentsForRun,

        loans: loansAfterUndo,

      };

    };

    if (options.tx) {

      try {

        return await runUndo(options.tx);

      } catch (error) {

        if (error === payrollRunNotFound) {

          return undefined;

        }

        throw error;

      }

    }

    try {

      return await db.transaction(runUndo);

    } catch (error) {

      if (error === payrollRunNotFound) {

        return undefined;

      }

      throw error;

    }

  }

  private async undoPayrollLoanDeductions(
    tx: TransactionClient,
    payrollRunId: string,
  ): Promise<void> {

    const payments = await tx

      .select({ loanId: loanPayments.loanId, amount: loanPayments.amount })

      .from(loanPayments)

      .where(eq(loanPayments.payrollRunId, payrollRunId));



    if (payments.length === 0) {

      return;

    }



    const totalsByLoan = new Map<string, number>();



    for (const payment of payments) {

      const loanId = payment.loanId;

      if (!loanId) continue;

      const amount = Number.parseFloat(String(payment.amount ?? 0));

      if (!Number.isFinite(amount)) {

        throw new LoanPaymentUndoError(

          `Unable to undo payroll deductions; invalid payment amount for loan ${loanId}.`,

          loanId,

        );

      }

      totalsByLoan.set(loanId, (totalsByLoan.get(loanId) ?? 0) + amount);

    }



    if (totalsByLoan.size === 0) {

      return;

    }



    const loanIds = Array.from(totalsByLoan.keys());



    const loansToRestore = await tx

      .select({

        id: loans.id,

        amount: loans.amount,

        remainingAmount: loans.remainingAmount,

        status: loans.status,

      })

      .from(loans)

      .where(inArray(loans.id, loanIds));



    const loanLookup = new Map(loansToRestore.map(loan => [loan.id, loan] as const));

    const EPSILON = 0.01;



    for (const [loanId, amountToRestore] of totalsByLoan.entries()) {

      if (!(amountToRestore > 0)) {

        continue;

      }



      const loan = loanLookup.get(loanId);

      if (!loan) {

        throw new LoanPaymentUndoError(

          `Loan ${loanId} referenced by payroll run is missing and cannot be restored.`,

          loanId,

        );

      }



      const remainingAmount = Number.parseFloat(String(loan.remainingAmount ?? 0));

      if (!Number.isFinite(remainingAmount)) {

        throw new LoanPaymentUndoError(

          `Loan ${loanId} has an invalid remaining balance and cannot be restored.`,

          loanId,

        );

      }



      const originalAmountRaw =

        loan.amount == null ? undefined : Number.parseFloat(String(loan.amount));

      const hasOriginalAmount =

        originalAmountRaw !== undefined && Number.isFinite(originalAmountRaw);



      const updatedRemaining = remainingAmount + amountToRestore;



      if (

        hasOriginalAmount &&

        (originalAmountRaw as number) > 0 &&

        updatedRemaining - (originalAmountRaw as number) > EPSILON

      ) {

        throw new LoanPaymentUndoError(

          `Reverting payroll deductions would exceed the original amount for loan ${loanId}.`,

          loanId,

        );

      }



      const clampedRemaining = hasOriginalAmount

        ? Math.min(originalAmountRaw as number, updatedRemaining)

        : updatedRemaining;



      const nextStatus = clampedRemaining <= EPSILON ? "completed" : "active";



      await tx

        .update(loans)

        .set({

          remainingAmount: clampedRemaining.toFixed(2),

          status: nextStatus,

        })

        .where(eq(loans.id, loanId));

    }

  }



  async deletePayrollRun(id: string): Promise<boolean> {
    const payrollRunNotFound = Symbol("PAYROLL_RUN_NOT_FOUND");

    try {
      return await db.transaction(async tx => {
        const undoResult = await this.undoPayrollRunLoanDeductions(id, {
          tx,
          removeLoanPayments: true,
        });

        if (!undoResult) {
          throw payrollRunNotFound;
        }

        await tx
          .delete(payrollEntries)
          .where(eq(payrollEntries.payrollRunId, id));

        const result = await tx.delete(payrollRuns).where(eq(payrollRuns.id, id));

        if ((result.rowCount ?? 0) === 0) {
          throw payrollRunNotFound;
        }

        return true;
      });
    } catch (error) {
      if (error === payrollRunNotFound) {
        return false;
      }

      throw error;
    }
  }



  // Payroll entry methods

  async getPayrollEntries(payrollRunId: string): Promise<PayrollEntry[]> {

    return await db.select().from(payrollEntries).where(eq(payrollEntries.payrollRunId, payrollRunId));

  }



  async createPayrollEntry(payrollEntry: InsertPayrollEntry): Promise<PayrollEntry> {

    const [newPayrollEntry] = await db

      .insert(payrollEntries)

      .values({

        ...payrollEntry,

        taxDeduction: payrollEntry.taxDeduction || "0",

        socialSecurityDeduction: payrollEntry.socialSecurityDeduction || "0",

        healthInsuranceDeduction: payrollEntry.healthInsuranceDeduction || "0",

        otherDeductions: payrollEntry.otherDeductions || "0",

      })

      .returning();

    return newPayrollEntry;

  }



  async updatePayrollEntry(id: string, payrollEntry: Partial<InsertPayrollEntry>): Promise<PayrollEntry | undefined> {

    const [updated] = await db

      .update(payrollEntries)

      .set(payrollEntry)

      .where(eq(payrollEntries.id, id))

      .returning();

    return updated || undefined;

  }



  private normalizeApprovalChain(approvalChain?: VacationApprovalStep[]): VacationApprovalStep[] {
    if (!approvalChain || !Array.isArray(approvalChain)) {
      return [];
    }

    return approvalChain.map((step, index) => ({
      approverId: step.approverId,
      status: step.status ?? (index === 0 ? "pending" : "pending"),
      actedAt: step.actedAt ?? null,
      notes: step.notes ?? null,
      delegatedToId: step.delegatedToId ?? null,
    }));
  }

  private computeApprovalIndex(approvalChain: VacationApprovalStep[]): number {
    const pendingIndex = approvalChain.findIndex(step => step.status === "pending" || step.status === "delegated");
    if (pendingIndex >= 0) {
      return pendingIndex;
    }
    return approvalChain.length > 0 ? approvalChain.length - 1 : 0;
  }

  // Leave accrual policy methods

  private formatLeaveAccrualPolicyForDb(policy: Partial<InsertLeaveAccrualPolicy>) {
    const { metadata, ...rest } = policy;
    const normalizedMetadata =
      metadata === undefined
        ? undefined
        : metadata === null
          ? null
          : (metadata as Record<string, unknown>);

    return removeUndefined({
      ...rest,
      metadata: normalizedMetadata,
      accrualRatePerMonth:
        policy.accrualRatePerMonth !== undefined ? policy.accrualRatePerMonth.toString() : undefined,
      maxBalanceDays:
        policy.maxBalanceDays !== undefined && policy.maxBalanceDays !== null
          ? policy.maxBalanceDays.toString()
          : undefined,
      carryoverLimitDays:
        policy.carryoverLimitDays !== undefined && policy.carryoverLimitDays !== null
          ? policy.carryoverLimitDays.toString()
          : undefined,
    });
  }

  private formatEmployeeLeavePolicyForDb(
    assignment: InsertEmployeeLeavePolicy | Partial<InsertEmployeeLeavePolicy>,
  ) {
    const { metadata, ...rest } = assignment;
    const normalizedMetadata =
      metadata === undefined
        ? undefined
        : metadata === null
          ? null
          : (metadata as Record<string, unknown>);

    return removeUndefined({
      ...rest,
      metadata: normalizedMetadata,
      customAccrualRatePerMonth:
        assignment.customAccrualRatePerMonth !== undefined && assignment.customAccrualRatePerMonth !== null
          ? assignment.customAccrualRatePerMonth.toString()
          : undefined,
    });
  }

  async getLeaveAccrualPolicies(): Promise<LeaveAccrualPolicy[]> {
    return await db.select().from(leaveAccrualPolicies).orderBy(asc(leaveAccrualPolicies.name));
  }

  async getLeaveAccrualPolicy(id: string): Promise<LeaveAccrualPolicy | undefined> {
    return await db.query.leaveAccrualPolicies.findFirst({
      where: eq(leaveAccrualPolicies.id, id),
    });
  }

  async createLeaveAccrualPolicy(policy: InsertLeaveAccrualPolicy): Promise<LeaveAccrualPolicy> {
    const payload = this.formatLeaveAccrualPolicyForDb(policy) as unknown as InsertLeaveAccrualPolicy;

    const [created] = await db.insert(leaveAccrualPolicies).values(payload as any).returning();

    return created;
  }

  async updateLeaveAccrualPolicy(
    id: string,
    policy: Partial<InsertLeaveAccrualPolicy>,
  ): Promise<LeaveAccrualPolicy | undefined> {
    const updatePayload = this.formatLeaveAccrualPolicyForDb(policy) as Partial<InsertLeaveAccrualPolicy>;

    if (Object.keys(updatePayload).length === 0) {
      return await this.getLeaveAccrualPolicy(id);
    }

    const [updated] = await db
      .update(leaveAccrualPolicies)
      .set({ ...(updatePayload as any), updatedAt: new Date() })
      .where(eq(leaveAccrualPolicies.id, id))
      .returning();

    return updated ?? undefined;
  }

  async assignEmployeeLeavePolicy(assignment: InsertEmployeeLeavePolicy): Promise<EmployeeLeavePolicy> {
    const payload = this.formatEmployeeLeavePolicyForDb(assignment) as unknown as InsertEmployeeLeavePolicy;
    const updateSet = removeUndefined({
      ...payload,
      employeeId: undefined,
      policyId: undefined,
      effectiveFrom: undefined,
      updatedAt: new Date(),
    });

    const [record] = await db
      .insert(employeeLeavePolicies)
      .values(payload as any)
      .onConflictDoUpdate({
        target: [
          employeeLeavePolicies.employeeId,
          employeeLeavePolicies.policyId,
          employeeLeavePolicies.effectiveFrom,
        ],
        set: updateSet as any,
      })
      .returning();

    return record;
  }

  async getEmployeeLeavePolicies(filters?: {
    employeeId?: string;
    activeOn?: Date;
  }): Promise<(EmployeeLeavePolicy & { policy?: LeaveAccrualPolicy; employee?: Employee })[]> {
    const activeOn = filters?.activeOn ? toDateKey(filters.activeOn) : undefined;

    const results = await db.query.employeeLeavePolicies.findMany({
      where: filters
        ? (record, helpers) => {
            const conditions: SQL[] = [];
            if (filters.employeeId) {
              conditions.push(helpers.eq(record.employeeId, filters.employeeId));
            }
            if (activeOn !== undefined) {
              const activeDate = activeOn;
              conditions.push(helpers.lte(record.effectiveFrom, activeDate as any));
              const effectiveToCondition = helpers.or(
                helpers.isNull(record.effectiveTo),
                helpers.gte(record.effectiveTo, activeDate as any),
              ) as SQL<unknown>;
              conditions.push(effectiveToCondition);
            }
            if (conditions.length === 0) {
              return undefined;
            }
            return helpers.and(...conditions);
          }
        : undefined,
      with: {
        policy: true,
        employee: true,
      },
      orderBy: [asc(employeeLeavePolicies.employeeId), asc(employeeLeavePolicies.effectiveFrom)],
    });

    return results.map(record => ({
      ...record,
      policy: record.policy ?? undefined,
      employee: record.employee ?? undefined,
    }));
  }

  async getLeaveBalances(filters?: {
    employeeId?: string;
    year?: number;
  }): Promise<(LeaveBalance & { employee?: Employee; policy?: LeaveAccrualPolicy })[]> {
    const results = await db.query.leaveBalances.findMany({
      where: filters
        ? (record, helpers) => {
            const conditions: SQL[] = [];
            if (filters.employeeId) {
              conditions.push(helpers.eq(record.employeeId, filters.employeeId));
            }
            if (filters.year !== undefined) {
              conditions.push(helpers.eq(record.year, filters.year));
            }
            if (conditions.length === 0) {
              return undefined;
            }
            return helpers.and(...conditions);
          }
        : undefined,
      with: {
        employee: true,
        policy: true,
      },
      orderBy: [asc(leaveBalances.leaveType), asc(leaveBalances.employeeId)],
    });

    return results.map(record => ({
      ...record,
      employee: record.employee ?? undefined,
      policy: record.policy ?? undefined,
    }));
  }

  async getLeaveBalance(
    employeeId: string,
    leaveType: string,
    year: number,
  ): Promise<LeaveBalance | undefined> {
    return await db.query.leaveBalances.findFirst({
      where: (record, helpers) =>
        helpers.and(
          helpers.eq(record.employeeId, employeeId),
          helpers.eq(record.leaveType, leaveType),
          helpers.eq(record.year, year),
        ),
    });
  }

  async incrementLeaveBalance({
    employeeId,
    leaveType,
    year,
    delta,
    policyId,
    maxBalanceDays,
    allowNegativeBalance,
  }: {
    employeeId: string;
    leaveType: string;
    year: number;
    delta: number;
    policyId?: string | null;
    maxBalanceDays?: number | null;
    allowNegativeBalance?: boolean;
  }): Promise<LeaveBalance> {
    const existing = await this.getLeaveBalance(employeeId, leaveType, year);
    const previous = existing ? Number(existing.balanceDays) : 0;

    let nextBalance = previous + delta;
    const allowNegative = allowNegativeBalance ?? false;
    if (!allowNegative) {
      nextBalance = Math.max(0, nextBalance);
    }
    if (maxBalanceDays !== undefined && maxBalanceDays !== null) {
      nextBalance = Math.min(maxBalanceDays, nextBalance);
    }

    const resolvedPolicyId = policyId ?? (existing?.policyId ?? undefined);

    const payload = removeUndefined({
      employeeId,
      leaveType,
      year,
      balanceDays: nextBalance.toFixed(2),
      policyId: resolvedPolicyId ?? null,
      lastAccruedAt: new Date(),
    });

    const updateSet = removeUndefined({
      balanceDays: payload.balanceDays,
      policyId: payload.policyId,
      lastAccruedAt: payload.lastAccruedAt,
      updatedAt: new Date(),
    });

    const [record] = await db
      .insert(leaveBalances)
      .values(payload)
      .onConflictDoUpdate({
        target: [leaveBalances.employeeId, leaveBalances.leaveType, leaveBalances.year],
        set: updateSet,
      })
      .returning();

    return record;
  }

  async recordLeaveAccrual(
    entry: InsertLeaveAccrualLedgerEntry & { note?: string },
  ): Promise<LeaveAccrualLedgerEntry> {
    const accrualDate = toDateKey(entry.accrualDate);
    const year = Number.parseInt(accrualDate.slice(0, 4), 10);
    const policy = await this.getLeaveAccrualPolicy(entry.policyId);

    const maxBalance = policy?.maxBalanceDays !== undefined && policy?.maxBalanceDays !== null
      ? Number(policy.maxBalanceDays)
      : undefined;

    const balance = await this.incrementLeaveBalance({
      employeeId: entry.employeeId,
      leaveType: entry.leaveType,
      year: Number.isFinite(year) ? year : new Date().getUTCFullYear(),
      delta: entry.amount,
      policyId: entry.policyId,
      maxBalanceDays: maxBalance,
      allowNegativeBalance: policy?.allowNegativeBalance ?? false,
    });

    if (entry.leaveType.toLowerCase() === "sick") {
      const sickYear = Number.isFinite(year) ? year : new Date().getUTCFullYear();
      const accrualDays = Math.round(entry.amount);
      if (accrualDays !== 0) {
        const sickRecord = await this.getSickLeaveBalance(entry.employeeId, sickYear);
        if (sickRecord) {
          await this.updateSickLeaveBalance(sickRecord.id, {
            remainingSickDays: Math.max(0, (sickRecord.remainingSickDays ?? 0) + accrualDays),
          });
        } else {
          await this.createSickLeaveBalance({
            employeeId: entry.employeeId,
            year: sickYear,
            totalSickDaysUsed: 0,
            remainingSickDays: Math.max(0, accrualDays),
          });
        }
      }
    }

    const payload = removeUndefined({
      ...entry,
      accrualDate,
      amount: entry.amount.toString(),
      balanceAfter: balance.balanceDays,
      note: entry.note,
    });

    const updateSet = removeUndefined({
      amount: payload.amount,
      balanceAfter: payload.balanceAfter,
      note: payload.note,
    });

    const [record] = await db
      .insert(leaveAccrualLedger)
      .values(payload)
      .onConflictDoUpdate({
        target: [leaveAccrualLedger.employeeId, leaveAccrualLedger.policyId, leaveAccrualLedger.accrualDate],
        set: updateSet,
      })
      .returning();

    return record;
  }

  async getLeaveAccrualLedger(filters?: {
    employeeId?: string;
    policyId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<LeaveAccrualLedgerEntry[]> {
    const conditions: SQL[] = [];
    if (filters?.employeeId) {
      conditions.push(eq(leaveAccrualLedger.employeeId, filters.employeeId));
    }
    if (filters?.policyId) {
      conditions.push(eq(leaveAccrualLedger.policyId, filters.policyId));
    }
    if (filters?.startDate) {
      conditions.push(gte(leaveAccrualLedger.accrualDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(leaveAccrualLedger.accrualDate, filters.endDate));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db.select().from(leaveAccrualLedger);
    const conditioned = where ? baseQuery.where(where) : baseQuery;

    return await conditioned.orderBy(asc(leaveAccrualLedger.accrualDate));
  }

  async applyLeaveUsage(args: {
    employeeId: string;
    leaveType: string;
    year: number;
    days: number;
    policyId?: string | null;
    note?: string;
    allowNegativeBalance?: boolean;
  }): Promise<{ balance: LeaveBalance; sick?: SickLeaveTracking | undefined }> {
    const { employeeId, leaveType, year, days, policyId, allowNegativeBalance } = args;
    const negativeDelta = -Math.abs(days);
    const resolvedPolicyId = policyId ?? undefined;

    const policy = resolvedPolicyId ? await this.getLeaveAccrualPolicy(resolvedPolicyId) : undefined;

    const balance = await this.incrementLeaveBalance({
      employeeId,
      leaveType,
      year,
      delta: negativeDelta,
      policyId: resolvedPolicyId,
      maxBalanceDays:
        policy?.maxBalanceDays !== undefined && policy?.maxBalanceDays !== null
          ? Number(policy.maxBalanceDays)
          : undefined,
      allowNegativeBalance: allowNegativeBalance ?? policy?.allowNegativeBalance ?? false,
    });

    let sickRecord: SickLeaveTracking | undefined;
    if (leaveType.toLowerCase() === "sick") {
      sickRecord = await this.getSickLeaveBalance(employeeId, year);
      const daysUsed = Math.abs(Math.round(days));
      if (!sickRecord) {
        sickRecord = await this.createSickLeaveBalance({
          employeeId,
          year,
          totalSickDaysUsed: daysUsed,
          remainingSickDays: Math.max(0, 14 - daysUsed),
        });
      } else {
        const updated = removeUndefined({
          totalSickDaysUsed: (sickRecord.totalSickDaysUsed ?? 0) + daysUsed,
          remainingSickDays: Math.max(0, (sickRecord.remainingSickDays ?? 0) + negativeDelta),
        });
        sickRecord = (await this.updateSickLeaveBalance(sickRecord.id, updated)) ?? sickRecord;
      }
    }

    return { balance, sick: sickRecord };
  }



  // Sick leave balance methods

  async getSickLeaveBalance(
    employeeId: string,
    year: number,
  ): Promise<SickLeaveTracking | undefined> {
    return await db.query.sickLeaveTracking.findFirst({
      where: (record, { and, eq }) =>
        and(eq(record.employeeId, employeeId), eq(record.year, year)),
    });
  }

  async createSickLeaveBalance(
    data: InsertSickLeaveTracking,
  ): Promise<SickLeaveTracking> {
    const [created] = await db.insert(sickLeaveTracking).values(data).returning();
    return created;
  }

  async updateSickLeaveBalance(
    id: string,
    data: Partial<InsertSickLeaveTracking>,
  ): Promise<SickLeaveTracking | undefined> {
    if (Object.keys(data).length === 0) {
      return await db.query.sickLeaveTracking.findFirst({
        where: (record, { eq }) => eq(record.id, id),
      });
    }

    const updateData: Partial<InsertSickLeaveTracking> & { lastUpdated?: Date } = {
      ...data,
      lastUpdated: new Date(),
    };

    const [updated] = await db
      .update(sickLeaveTracking)
      .set(updateData)
      .where(eq(sickLeaveTracking.id, id))
      .returning();

    return updated ?? undefined;
  }



  // Vacation request methods

  async getVacationRequests(

    start?: Date,

    end?: Date,

  ): Promise<VacationRequestWithEmployee[]> {

    const where =

      start && end

        ? and(

            lte(vacationRequests.startDate, end.toISOString().split("T")[0]),

            gte(vacationRequests.endDate, start.toISOString().split("T")[0]),

          )

        : undefined;



    const requests = await db.query.vacationRequests.findMany({

      with: {

        employee: true,

        approver: true,

        delegateApprover: true,

        policy: true,

      },

      where,

      orderBy: desc(vacationRequests.createdAt),

    });

    return requests.map(req => ({

      ...req,

      employee: req.employee || undefined,

      approver: req.approver || undefined,

      delegateApprover: req.delegateApprover || undefined,

      policy: req.policy || undefined,

      approvalChain: Array.isArray(req.approvalChain)

        ? (req.approvalChain as VacationApprovalStep[])

        : [],

      auditLog: Array.isArray(req.auditLog)

        ? (req.auditLog as VacationAuditLogEntry[])

        : [],

    }));

  }



  async getVacationRequest(id: string): Promise<VacationRequestWithEmployee | undefined> {
    const vacationRequest = await db.query.vacationRequests.findFirst({
      where: eq(vacationRequests.id, id),
      with: {
        employee: true,
        approver: true,
        delegateApprover: true,
        policy: true,
      },
    });

    if (!vacationRequest) return undefined;

    return {
      ...vacationRequest,
      employee: vacationRequest.employee || undefined,
      approver: vacationRequest.approver || undefined,
      delegateApprover: vacationRequest.delegateApprover || undefined,
      policy: vacationRequest.policy || undefined,
    };
  }



  async createVacationRequest(vacationRequest: InsertVacationRequest): Promise<VacationRequest> {
    const approvalChain = this.normalizeApprovalChain(vacationRequest.approvalChain);
    const currentApprovalStep = this.computeApprovalIndex(approvalChain);
    const auditLog: VacationAuditLogEntry[] = Array.isArray(vacationRequest.auditLog)
      ? [...vacationRequest.auditLog]
      : [];
    auditLog.push({
      id: randomUUID(),
      actorId: vacationRequest.employeeId,
      action: "created",
      actionAt: new Date().toISOString(),
      notes: vacationRequest.reason ?? null,
      metadata: null,
    });

    const [newVacationRequest] = await db
      .insert(vacationRequests)
      .values({
        ...vacationRequest,
        status: vacationRequest.status || "pending",
        approvalChain,
        currentApprovalStep,
        auditLog,
      })
      .returning();

    return newVacationRequest;
  }



  async updateVacationRequest(id: string, vacationRequest: Partial<InsertVacationRequest>): Promise<VacationRequest | undefined> {
    const updateData: Partial<InsertVacationRequest> & { updatedAt: Date } = {
      ...vacationRequest,
      updatedAt: new Date(),
    };

    if (vacationRequest.approvalChain !== undefined) {
      const normalized = this.normalizeApprovalChain(vacationRequest.approvalChain as VacationApprovalStep[]);
      (updateData as any).approvalChain = normalized;
      (updateData as any).currentApprovalStep = this.computeApprovalIndex(normalized);
    }

    if (vacationRequest.auditLog !== undefined) {
      (updateData as any).auditLog = vacationRequest.auditLog;
    }

    const sanitized = removeUndefined(updateData as Record<string, unknown>);

    const [updated] = await db
      .update(vacationRequests)
      .set(sanitized as any)
      .where(eq(vacationRequests.id, id))
      .returning();

    return updated || undefined;
  }



  async deleteVacationRequest(id: string): Promise<boolean> {

    const result = await db.delete(vacationRequests).where(eq(vacationRequests.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  // Loan methods

  async getLoans(start?: Date, end?: Date): Promise<LoanWithEmployee[]> {

    const where =

      start && end

        ? and(

            lte(loans.startDate, end.toISOString().split("T")[0]),

            sql`(${loans.endDate} IS NULL OR ${loans.endDate} >= ${start.toISOString().split("T")[0]})`,

          )

        : undefined;



    const startIso = start ? start.toISOString().split("T")[0] : undefined;
    const endIso = end ? end.toISOString().split("T")[0] : undefined;

    const loanList = await db.query.loans.findMany({

      with: {

        employee: true,

        approver: true,

        approvalStages: {

          with: { approver: true },

          orderBy: asc(loanApprovalStages.stageOrder),

        },

        documents: {

          with: { uploader: true },

          orderBy: desc(loanDocuments.uploadedAt),

        },

        amortizationSchedule: {

          orderBy: asc(loanAmortizationSchedules.installmentNumber),

        },

      },

      where,

      orderBy: desc(loans.createdAt),

    });

    return loanList.map(loan => {

      const schedule = (loan as any).amortizationSchedule as LoanAmortizationScheduleEntry[] | undefined;

      const allEntries = schedule ?? [];

      const dueEntries = startIso && endIso

        ? allEntries.filter(entry => entry.dueDate >= startIso && entry.dueDate <= endIso)

        : allEntries.filter(entry => entry.status === "pending" || entry.status === "paused");

      const pendingEntries = dueEntries.filter(entry => entry.status === "pending");

      const dueAmount = pendingEntries.reduce((sum, entry) => sum + parseMoney(entry.paymentAmount), 0);

      return {

        ...loan,

        employee: loan.employee || undefined,

        approver: loan.approver || undefined,

        approvalStages: (loan.approvalStages ?? []).map(stage => ({

          ...stage,

          approver: stage.approver || undefined,

        })),

        documents: (loan.documents ?? []).map(doc => ({

          ...doc,

          uploader: doc.uploader || undefined,

        })),

        amortizationSchedule: allEntries,

        dueAmountForPeriod: Number(dueAmount.toFixed(2)),

        scheduleDueThisPeriod: dueEntries,

      } satisfies LoanWithEmployee;

    });

  }



  async getLoan(id: string): Promise<LoanWithEmployee | undefined> {

    const loan = await db.query.loans.findFirst({

      where: eq(loans.id, id),

      with: {

        employee: true,

        approver: true,

        approvalStages: {

          with: { approver: true },

          orderBy: asc(loanApprovalStages.stageOrder),

        },

        documents: {

          with: { uploader: true },

          orderBy: desc(loanDocuments.uploadedAt),

        },

        amortizationSchedule: {

          orderBy: asc(loanAmortizationSchedules.installmentNumber),

        },

      },

    });

    if (!loan) return undefined;

    const schedule = (loan as any).amortizationSchedule as LoanAmortizationScheduleEntry[] | undefined;

    const pendingEntries = (schedule ?? []).filter(entry => entry.status === "pending");

    const dueAmount = pendingEntries.reduce((sum, entry) => sum + parseMoney(entry.paymentAmount), 0);

    return {

      ...loan,

      employee: loan.employee || undefined,

      approver: loan.approver || undefined,

      approvalStages: (loan.approvalStages ?? []).map(stage => ({

        ...stage,

        approver: stage.approver || undefined,

      })),

      documents: (loan.documents ?? []).map(doc => ({

        ...doc,

        uploader: doc.uploader || undefined,

      })),

      amortizationSchedule: schedule ?? [],

      dueAmountForPeriod: Number(dueAmount.toFixed(2)),

      scheduleDueThisPeriod: pendingEntries,

    } satisfies LoanWithEmployee;

  }



  async createLoan(loan: InsertLoan): Promise<Loan> {

    const [newLoan] = await db

      .insert(loans)

      .values({

        ...loan,

        amount: loan.amount.toString(),

        monthlyDeduction: loan.monthlyDeduction.toString(),

        remainingAmount: (loan as any).remainingAmount !== undefined ? (loan as any).remainingAmount!.toString() : undefined,

        interestRate: (loan as any).interestRate !== undefined ? (loan as any).interestRate!.toString() : "0",

        status: loan.status || "pending",

      })

      .returning();

    return newLoan;

  }



  async updateLoan(id: string, loan: Partial<InsertLoan>): Promise<Loan | undefined> {

    const [updated] = await db

      .update(loans)

      .set({

        ...loan,

        amount: loan.amount !== undefined ? loan.amount.toString() : undefined as any,

        monthlyDeduction: loan.monthlyDeduction !== undefined ? loan.monthlyDeduction.toString() : undefined as any,

        remainingAmount: (loan as any).remainingAmount !== undefined ? (loan as any).remainingAmount!.toString() : undefined as any,

        interestRate: (loan as any).interestRate !== undefined ? (loan as any).interestRate!.toString() : undefined as any,

      })

      .where(eq(loans.id, id))

      .returning();

    return updated || undefined;

  }



  async deleteLoan(id: string): Promise<boolean> {

    const result = await db.delete(loans).where(eq(loans.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  async createLoanPayment(payment: InsertLoanPayment): Promise<LoanPayment> {

    const [created] = await db

      .insert(loanPayments)

      .values(this.formatLoanPaymentForInsert(payment))

      .returning();

    return created;

  }



  async createLoanPayments(payments: InsertLoanPayment[]): Promise<LoanPayment[]> {

    if (payments.length === 0) {

      return [];

    }

    return await db

      .insert(loanPayments)

      .values(payments.map(payment => this.formatLoanPaymentForInsert(payment)))

      .returning();

  }



  async getLoanPaymentsByLoan(loanId: string): Promise<LoanPayment[]> {

    return await db.query.loanPayments.findMany({

      where: eq(loanPayments.loanId, loanId),

      orderBy: asc(loanPayments.appliedDate),

    });

  }



  async getLoanPaymentsForPayroll(payrollRunId: string): Promise<LoanPayment[]> {

    return await db.query.loanPayments.findMany({

      where: eq(loanPayments.payrollRunId, payrollRunId),

      orderBy: asc(loanPayments.appliedDate),

    });

  }



  async getLoanApprovalStages(

    loanId: string,

  ): Promise<Array<LoanApprovalStage & { approver?: Employee | null }>> {

    const stages = await db.query.loanApprovalStages.findMany({

      where: eq(loanApprovalStages.loanId, loanId),

      with: { approver: true },

      orderBy: asc(loanApprovalStages.stageOrder),

    });

    return stages.map(stage => ({

      ...stage,

      approver: stage.approver || undefined,

    }));

  }



  async setLoanApprovalStages(

    loanId: string,

    stages: InsertLoanApprovalStage[],

  ): Promise<Array<LoanApprovalStage & { approver?: Employee | null }>> {

    const normalized = stages.map((stage, index) => ({

      ...stage,

      loanId,

      stageOrder: stage.stageOrder ?? index,

    }));

    await db.transaction(async tx => {

      await tx.delete(loanApprovalStages).where(eq(loanApprovalStages.loanId, loanId));

      if (normalized.length > 0) {

        await tx.insert(loanApprovalStages).values(

          normalized.map(stage => {

            const actedAtValue = stage.actedAt;

            const actedAt = actedAtValue

              ? typeof actedAtValue === "string"

                ? new Date(actedAtValue)

                : actedAtValue

              : undefined;

            return {

              loanId,

              stageName: stage.stageName,

              stageOrder: stage.stageOrder ?? 0,

              approverId: stage.approverId ?? undefined,

              status: stage.status ?? "pending",

              actedAt,

              notes: (stage as any).notes ?? undefined,

              metadata: (stage as any).metadata ?? undefined,

            };

          }),

        );

      }

    });

    return await this.getLoanApprovalStages(loanId);

  }



  async updateLoanApprovalStage(

    stageId: string,

    updates: Partial<InsertLoanApprovalStage>,

  ): Promise<LoanApprovalStage | undefined> {

    const payload = removeUndefined({

      ...updates,

      stageOrder:

        updates.stageOrder === undefined ? undefined : Number(updates.stageOrder),

      actedAt: updates.actedAt ?? undefined,

    });

    const [updated] = await db

      .update(loanApprovalStages)

      .set(payload as any)

      .where(eq(loanApprovalStages.id, stageId))

      .returning();

    return updated || undefined;

  }



  async getLoanDocuments(

    loanId: string,

  ): Promise<Array<LoanDocument & { uploader?: Employee | null }>> {

    const docs = await db.query.loanDocuments.findMany({

      where: eq(loanDocuments.loanId, loanId),

      with: { uploader: true },

      orderBy: desc(loanDocuments.uploadedAt),

    });

    return docs.map(doc => ({

      ...doc,

      uploader: doc.uploader || undefined,

    }));

  }



  async createLoanDocument(document: InsertLoanDocument): Promise<LoanDocument> {

    const [created] = await db

      .insert(loanDocuments)

      .values({

        loanId: document.loanId,

        title: document.title,

        documentType: document.documentType ?? undefined,

        fileUrl: document.fileUrl,

        storageKey: document.storageKey ?? undefined,

        uploadedBy: document.uploadedBy ?? undefined,

        metadata: (document as any).metadata ?? undefined,

      })

      .returning();

    return created;

  }



  async replaceLoanDocuments(

    loanId: string,

    documents: InsertLoanDocument[],

  ): Promise<LoanDocument[]> {

    await db.transaction(async tx => {

      await tx.delete(loanDocuments).where(eq(loanDocuments.loanId, loanId));

      if (documents.length > 0) {

        await tx.insert(loanDocuments).values(

          documents.map(doc => ({

            loanId,

            title: doc.title,

            documentType: doc.documentType ?? undefined,

            fileUrl: doc.fileUrl,

            storageKey: doc.storageKey ?? undefined,

            uploadedBy: doc.uploadedBy ?? undefined,

            metadata: (doc as any).metadata ?? undefined,

          })),

        );

      }

    });

    return await this.getLoanDocuments(loanId);

  }



  async deleteLoanDocument(id: string): Promise<boolean> {

    const result = await db.delete(loanDocuments).where(eq(loanDocuments.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  async getLoanAmortizationSchedule(

    loanId: string,

  ): Promise<LoanAmortizationScheduleEntry[]> {

    return await db.query.loanAmortizationSchedules.findMany({

      where: eq(loanAmortizationSchedules.loanId, loanId),

      orderBy: asc(loanAmortizationSchedules.installmentNumber),

    });

  }



  async replaceLoanAmortizationSchedule(

    loanId: string,

    schedule: InsertLoanAmortizationScheduleEntry[],

    options: { preservePaid?: boolean } = {},

  ): Promise<LoanAmortizationScheduleEntry[]> {

    const preservePaid = options.preservePaid ?? true;

    await db.transaction(async tx => {

      let preserved: LoanAmortizationScheduleEntry[] = [];

      if (preservePaid) {

        preserved = await tx.query.loanAmortizationSchedules.findMany({

          where: eq(loanAmortizationSchedules.loanId, loanId),

        });

        preserved = preserved.filter(entry => entry.status === "paid");

      }

      await tx.delete(loanAmortizationSchedules).where(eq(loanAmortizationSchedules.loanId, loanId));

      const preservedInstallments = new Set(

        preserved.map(entry => entry.installmentNumber),

      );

      const sanitizedSchedule = schedule.filter(

        entry => !preservedInstallments.has(entry.installmentNumber),

      );

      const values = [

        ...preserved.map(entry =>

          this.formatLoanScheduleEntryForInsert({

            loanId,

            installmentNumber: entry.installmentNumber,

            dueDate: entry.dueDate,

            principalAmount: parseMoney(entry.principalAmount),

            interestAmount: parseMoney(entry.interestAmount),

            paymentAmount: parseMoney(entry.paymentAmount),

            remainingBalance: parseMoney(entry.remainingBalance),

            status: entry.status as LoanScheduleStatus,

            payrollRunId: entry.payrollRunId ?? undefined,

            paidAt: entry.paidAt ?? undefined,

            notes: (entry as any).notes ?? undefined,

          } as InsertLoanAmortizationScheduleEntry),

        ),

        ...sanitizedSchedule.map(entry =>

          this.formatLoanScheduleEntryForInsert({

            ...entry,

            loanId,

          }),

        ),

      ];

      if (values.length > 0) {

        await tx.insert(loanAmortizationSchedules).values(values);

      }

    });

    return await this.getLoanAmortizationSchedule(loanId);

  }



  async updateLoanScheduleStatuses(

    loanId: string,

    installmentNumbers: number[],

    status: LoanScheduleStatus,

    options: { payrollRunId?: string; paidAt?: string; notes?: string; tx?: TransactionClient } = {},

  ): Promise<void> {

    if (installmentNumbers.length === 0) {

      return;

    }

    const executor = options.tx ?? db;

    const payload: Record<string, unknown> = {

      status,

      updatedAt: new Date(),

    };

    if (status === "paid") {

      payload.payrollRunId = options.payrollRunId ?? null;

      payload.paidAt = options.paidAt ?? new Date().toISOString().split("T")[0];

    } else {

      payload.payrollRunId = null;

      payload.paidAt = null;

    }

    if (options.notes !== undefined) {

      payload.notes = options.notes;

    }

    await executor

      .update(loanAmortizationSchedules)

      .set(payload)

      .where(

        and(

          eq(loanAmortizationSchedules.loanId, loanId),

          inArray(loanAmortizationSchedules.installmentNumber, installmentNumbers),

        ),

      );

  }



  async getLoanStatement(loanId: string): Promise<LoanStatement | undefined> {

    const loan = await this.getLoan(loanId);

    if (!loan) {

      return undefined;

    }

    const [schedule, payments, documents] = await Promise.all([

      this.getLoanAmortizationSchedule(loanId),

      this.getLoanPaymentsByLoan(loanId),

      this.getLoanDocuments(loanId),

    ]);

    let scheduledPrincipal = 0;

    let scheduledInterest = 0;

    let totalPaid = 0;

    for (const entry of schedule) {

      scheduledPrincipal += parseMoney(entry.principalAmount);

      scheduledInterest += parseMoney(entry.interestAmount);

      if (entry.status === "paid") {

        totalPaid += parseMoney(entry.paymentAmount);

      }

    }

    const outstandingBalance = schedule.length > 0

      ? parseMoney(schedule[schedule.length - 1].remainingBalance)

      : parseMoney((loan as any).remainingAmount ?? loan.amount);

    const nextDue = schedule.find(entry => entry.status === "pending" || entry.status === "paused");

    return {

      loan,

      schedule,

      payments,

      documents,

      totals: {

        scheduledPrincipal: Number(scheduledPrincipal.toFixed(2)),

        scheduledInterest: Number(scheduledInterest.toFixed(2)),

        totalPaid: Number(totalPaid.toFixed(2)),

        outstandingBalance: Number(outstandingBalance.toFixed(2)),

      },

      nextDue,

    };

  }



  // Asset methods

  async getAssets(): Promise<AssetWithAssignment[]> {

    const allAssets = await db.select().from(assets);

    const result: AssetWithAssignment[] = [];



    for (const asset of allAssets) {

      const [currentAssignment] = await db.query.assetAssignments.findMany({

        where: and(eq(assetAssignments.assetId, asset.id), eq(assetAssignments.status, 'active')),

        with: {

          employee: true,

        },

      });



      result.push({

        ...asset,

        currentAssignment: currentAssignment || undefined,

      });

    }



    return result.sort((a, b) => a.name.localeCompare(b.name));

  }



  async getAsset(id: string): Promise<AssetWithAssignment | undefined> {

    const [asset] = await db.select().from(assets).where(eq(assets.id, id));

    if (!asset) return undefined;



    const [currentAssignment] = await db.query.assetAssignments.findMany({

      where: and(eq(assetAssignments.assetId, id), eq(assetAssignments.status, 'active')),

      with: {

        employee: true,

      },

    });



    return {

      ...asset,

      currentAssignment: currentAssignment || undefined,

    };

  }



  async createAsset(asset: InsertAsset): Promise<Asset> {

    const [newAsset] = await db

      .insert(assets)

      .values({

        ...asset,

        status: asset.status || "available",

      })

      .returning();

    return newAsset;

  }



  async updateAsset(id: string, asset: Partial<InsertAsset>): Promise<Asset | undefined> {

    const [updated] = await db

      .update(assets)

      .set(asset)

      .where(eq(assets.id, id))

      .returning();

    return updated || undefined;

  }



  async deleteAsset(id: string): Promise<boolean> {

    const result = await db.delete(assets).where(eq(assets.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  // Asset assignment methods

  async getAssetAssignments(): Promise<AssetAssignmentWithDetails[]> {

    const assignments = await db.query.assetAssignments.findMany({

      with: {

        asset: true,

        employee: true,

        assigner: true,

      },

      orderBy: desc(assetAssignments.createdAt),

    });

    return assignments.map(assignment => ({

      ...assignment,

      asset: assignment.asset || undefined,

      employee: assignment.employee || undefined,

      assigner: assignment.assigner || undefined,

    }));

  }



  async getAssetAssignment(id: string): Promise<AssetAssignmentWithDetails | undefined> {

    const assignment = await db.query.assetAssignments.findFirst({

      where: eq(assetAssignments.id, id),

      with: {

        asset: true,

        employee: true,

        assigner: true,

      },

    });

    if (!assignment) return undefined;

    return {

      ...assignment,

      asset: assignment.asset || undefined,

      employee: assignment.employee || undefined,

      assigner: assignment.assigner || undefined,

    };

  }



  async createAssetAssignment(assignment: InsertAssetAssignment): Promise<AssetAssignment> {

    // Ensure only one active assignment exists per asset

    const existingActiveAssignment = await db.query.assetAssignments.findFirst({

      where: and(

        eq(assetAssignments.assetId, assignment.assetId),

        eq(assetAssignments.status, 'active'),

      ),

    });



    if (existingActiveAssignment) {

      // If the asset is already assigned to the same employee, reject

      if (existingActiveAssignment.employeeId === assignment.employeeId) {

        throw new Error('Asset already assigned to this employee');

      }



      // Otherwise auto-complete the existing assignment

      await db

        .update(assetAssignments)

        .set({

          status: 'completed',

          returnDate: assignment.assignedDate,

        })

        .where(eq(assetAssignments.id, existingActiveAssignment.id));

    }



    const [newAssignment] = await db

      .insert(assetAssignments)

      .values({

        ...assignment,

        status: assignment.status ?? 'active',

      })

      .returning();



    return newAssignment;

  }



  async updateAssetAssignment(id: string, assignment: Partial<InsertAssetAssignment>): Promise<AssetAssignment | undefined> {

    const [updated] = await db

      .update(assetAssignments)

      .set(assignment)

      .where(eq(assetAssignments.id, id))

      .returning();

    return updated || undefined;

  }



  async deleteAssetAssignment(id: string): Promise<boolean> {

    const result = await db.delete(assetAssignments).where(eq(assetAssignments.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  // Car methods

  async getCars(): Promise<CarWithAssignment[]> {

    const allCars = await db.select().from(cars);

    const result: CarWithAssignment[] = [];



    for (const car of allCars) {

      const [currentAssignment] = await db.query.carAssignments.findMany({

        where: and(eq(carAssignments.carId, car.id), eq(carAssignments.status, 'active')),

        with: {

          employee: true,

        },

      });



      result.push({

        ...car,

        currentAssignment: currentAssignment || undefined,

      });

    }



    return result.sort((a, b) => a.make.localeCompare(b.make));

  }



  async getCar(id: string): Promise<CarWithAssignment | undefined> {

    const [car] = await db.select().from(cars).where(eq(cars.id, id));

    if (!car) return undefined;



    const [currentAssignment] = await db.query.carAssignments.findMany({

      where: and(eq(carAssignments.carId, id), eq(carAssignments.status, 'active')),

      with: {

        employee: true,

      },

    });



    return {

      ...car,

      currentAssignment: currentAssignment || undefined,

    };

  }



  async createCar(car: InsertCar): Promise<Car> {

    const [newCar] = await db

      .insert(cars)

      .values({

        ...car,

        purchasePrice: car.purchasePrice?.toString(),

        status: car.status || "available",

        mileage: car.mileage || 0,

      })

      .returning();

    return newCar;

  }



  async updateCar(id: string, car: Partial<InsertCar>): Promise<Car | undefined> {

    const filteredEntries = Object.entries(car).filter(([, value]) => value !== undefined);

    const sanitized = Object.fromEntries(filteredEntries) as Partial<InsertCar>;

    const updatePayload: Record<string, any> = { ...sanitized };

    if (sanitized.purchasePrice !== undefined) {

      updatePayload.purchasePrice = sanitized.purchasePrice?.toString();

    }

    const [updated] = await db

      .update(cars)

      .set(updatePayload)

      .where(eq(cars.id, id))

      .returning();

    return updated || undefined;

  }



  async deleteCar(id: string): Promise<boolean> {

    const result = await db.delete(cars).where(eq(cars.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  // Car repair methods

  async getCarRepairs(carId: string): Promise<CarRepair[]> {

    return await db.query.carRepairs.findMany({

      where: eq(carRepairs.carId, carId),

      orderBy: desc(carRepairs.repairDate),

    });

  }



  async createCarRepair(repair: InsertCarRepair): Promise<CarRepair> {

    const [newRepair] = await db

      .insert(carRepairs)

      .values({

        ...repair,

        cost: repair.cost ? repair.cost.toString() : undefined,

      })

      .returning();

    return newRepair;

  }



  // Attendance methods

  async getAttendance(start?: Date, end?: Date): Promise<Attendance[]> {

    if (!start || !end) return await db.select().from(attendance);

    const s = start.toISOString().split('T')[0];

    const e = end.toISOString().split('T')[0];

    return await db.query.attendance.findMany({

      where: (att, { gte, lte, and }) => and(gte(att.date, s), lte(att.date, e)),

    });

  }



  async getAttendanceForEmployee(employeeId: string, start?: Date, end?: Date): Promise<Attendance[]> {

    if (!start || !end) return await db.query.attendance.findMany({ where: (att, { eq }) => eq(att.employeeId, employeeId) });

    const s = start.toISOString().split('T')[0];

    const e = end.toISOString().split('T')[0];

    return await db.query.attendance.findMany({

      where: (att, { gte, lte, and, eq }) => and(eq(att.employeeId, employeeId), gte(att.date, s), lte(att.date, e)),

    });

  }



  async createAttendance(record: InsertAttendance): Promise<Attendance> {

    const [row] = await db.insert(attendance).values(record).returning();

    return row;

  }



  async updateAttendance(id: string, record: Partial<InsertAttendance>): Promise<Attendance | undefined> {

    const [row] = await db.update(attendance).set(record).where(eq(attendance.id, id)).returning();

    return row || undefined;

  }



  async deleteAttendance(id: string): Promise<boolean> {

    const result = await db.delete(attendance).where(eq(attendance.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  async getAttendanceSummary(start: Date, end: Date): Promise<Record<string, number>> {

    const rows = await this.getAttendance(start, end);

    const present: Record<string, Set<string>> = {};

    for (const r of rows) {

      if (!r.checkIn || !r.checkOut) continue;

      const d = (r.date as any as string);

      if (!present[r.employeeId]) present[r.employeeId] = new Set();

      present[r.employeeId].add(d);

    }

    const summary: Record<string, number> = {};

    for (const [emp, days] of Object.entries(present)) {

      summary[emp] = days.size;

    }

    return summary;

  }



  async getShiftTemplates(): Promise<ShiftTemplate[]> {

    return await db.query.shiftTemplates.findMany({

      orderBy: asc(shiftTemplates.name),

    });

  }



  async createShiftTemplate(template: InsertShiftTemplate): Promise<ShiftTemplate> {

    const expectedMinutes = computeExpectedMinutes({

      startTime: template.startTime as any,

      endTime: template.endTime as any,

      breakMinutes: template.breakMinutes ?? 0,

      fallback: template.expectedMinutes,

    });

    const [created] = await db

      .insert(shiftTemplates)

      .values({

        ...template,

        expectedMinutes,

        overtimeLimitMinutes:

          template.overtimeLimitMinutes ?? DEFAULT_OVERTIME_LIMIT_MINUTES,

        updatedAt: new Date(),

      })

      .returning();

    return created;

  }



  async updateShiftTemplate(

    id: string,

    template: Partial<InsertShiftTemplate>,

  ): Promise<ShiftTemplate | undefined> {

    const existing = await db.query.shiftTemplates.findFirst({

      where: eq(shiftTemplates.id, id),

    });

    if (!existing) {

      return undefined;

    }

    const startTime =

      template.startTime !== undefined

        ? (template.startTime as any)

        : existing.startTime;

    const endTime =

      template.endTime !== undefined

        ? (template.endTime as any)

        : existing.endTime;

    const breakMinutes =

      template.breakMinutes !== undefined

        ? template.breakMinutes

        : existing.breakMinutes;

    const expectedMinutes = computeExpectedMinutes({

      startTime,

      endTime,

      breakMinutes,

      fallback: template.expectedMinutes ?? existing.expectedMinutes,

    });

    const [updated] = await db

      .update(shiftTemplates)

      .set({

        ...template,

        expectedMinutes,

        overtimeLimitMinutes:

          template.overtimeLimitMinutes ?? existing.overtimeLimitMinutes ?? DEFAULT_OVERTIME_LIMIT_MINUTES,

        updatedAt: new Date(),

      })

      .where(eq(shiftTemplates.id, id))

      .returning();

    return updated || undefined;

  }



  async deleteShiftTemplate(id: string): Promise<boolean> {

    const result = await db.delete(shiftTemplates).where(eq(shiftTemplates.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  private async loadScheduleTemplateMap(

    templateIds: Set<string>,

  ): Promise<Map<string, ShiftTemplate>> {

    if (templateIds.size === 0) {

      return new Map();

    }

    const templates = await db.query.shiftTemplates.findMany({

      where: inArray(shiftTemplates.id, Array.from(templateIds)),

    });

    const map = new Map<string, ShiftTemplate>();

    templates.forEach(template => map.set(template.id, template));

    return map;

  }



  private resolveScheduleInsert(

    assignment: InsertEmployeeSchedule,

    template?: ShiftTemplate,

  ) {

    const scheduleDateKey = toDateKey(assignment.scheduleDate as any);

    const resolvedTemplateId =

      assignment.shiftTemplateId !== undefined

        ? assignment.shiftTemplateId

        : template?.id ?? null;

    const startTimeSource = assignment.customStartTime ?? template?.startTime ?? null;

    const endTimeSource = assignment.customEndTime ?? template?.endTime ?? null;

    const breakMinutesSource =

      assignment.customBreakMinutes ?? template?.breakMinutes ?? 0;

    const expectedMinutes = computeExpectedMinutes({

      startTime: startTimeSource as any,

      endTime: endTimeSource as any,

      breakMinutes: breakMinutesSource,

      fallback: assignment.expectedMinutes ?? template?.expectedMinutes,

    });

    return {

      employeeId: assignment.employeeId,

      scheduleDate: scheduleDateKey as any,

      shiftTemplateId: resolvedTemplateId,

      customStartTime: assignment.customStartTime ?? null,

      customEndTime: assignment.customEndTime ?? null,

      customBreakMinutes: assignment.customBreakMinutes ?? null,

      expectedMinutes,

      overtimeMinutes: assignment.overtimeMinutes ?? 0,

      lateApprovalStatus: assignment.lateApprovalStatus ?? "pending",

      absenceApprovalStatus: assignment.absenceApprovalStatus ?? "pending",

      overtimeApprovalStatus: assignment.overtimeApprovalStatus ?? "pending",

      notes: assignment.notes ?? null,

      updatedAt: new Date(),

    } satisfies typeof employeeSchedules.$inferInsert;

  }



  private async getSchedulesWithDetails(

    filters?: { start?: Date; end?: Date; employeeId?: string },

  ): Promise<EmployeeScheduleDetail[]> {

    const startKey = filters?.start ? toDateKey(filters.start) : undefined;

    const endKey = filters?.end ? toDateKey(filters.end) : undefined;

    const hasFilters = Boolean(filters?.employeeId || startKey || endKey);

    const schedules = await db.query.employeeSchedules.findMany({

      where: hasFilters

        ? (schedule, { and, eq, gte, lte }) => {

            const clauses: SQL[] = [];

            if (filters?.employeeId) {

              clauses.push(eq(schedule.employeeId, filters.employeeId));

            }

            if (startKey) {

              clauses.push(gte(schedule.scheduleDate, startKey));

            }

            if (endKey) {

              clauses.push(lte(schedule.scheduleDate, endKey));

            }

            if (clauses.length === 0) {

              return undefined as any;

            }

            if (clauses.length === 1) {

              return clauses[0];

            }

            return and(...clauses);

          }

        : undefined,

      with: {

        shiftTemplate: true,

        employee: true,

      },

      orderBy: asc(employeeSchedules.scheduleDate),

    });

    if (schedules.length === 0) {

      return [];

    }

    let rangeStart = filters?.start;

    let rangeEnd = filters?.end;

    if (!rangeStart) {

      const first = schedules[0].scheduleDate as any;

      const parsed = new Date(first);

      if (!Number.isNaN(parsed.getTime())) {

        rangeStart = parsed;

      }

    }

    if (!rangeEnd) {

      const last = schedules[schedules.length - 1].scheduleDate as any;

      const parsed = new Date(last);

      if (!Number.isNaN(parsed.getTime())) {

        rangeEnd = parsed;

      }

    }

    const validRangeStart = rangeStart && !Number.isNaN(rangeStart.getTime()) ? rangeStart : undefined;

    const validRangeEnd = rangeEnd && !Number.isNaN(rangeEnd.getTime()) ? rangeEnd : undefined;

    const attendanceRecords = validRangeStart && validRangeEnd

      ? await this.getAttendance(validRangeStart, validRangeEnd)

      : await this.getAttendance();

    const attendanceMap = new Map<string, Attendance[]>();

    for (const record of attendanceRecords) {

      const key = `${record.employeeId}:${toDateKey(record.date as any)}`;

      const list = attendanceMap.get(key);

      if (list) {

        list.push(record);

      } else {

        attendanceMap.set(key, [record]);

      }

    }

    return schedules.map(schedule => {

      const dateKey = toDateKey(schedule.scheduleDate as any);

      const attendanceKey = `${schedule.employeeId}:${dateKey}`;

      const records = attendanceMap.get(attendanceKey) ?? [];

      const actualMinutes = records.reduce(

        (total, record) => total + calculateAttendanceMinutes(record),

        0,

      );

      const expected = Number(schedule.expectedMinutes ?? 0);

      return {

        ...schedule,

        shiftTemplate: schedule.shiftTemplate || undefined,

        employee: schedule.employee || undefined,

        actualMinutes,

        varianceMinutes: actualMinutes - expected,

        attendanceRecords: records,

      } satisfies EmployeeScheduleDetail;

    });

  }



  async getEmployeeSchedules(

    filters?: { start?: Date; end?: Date; employeeId?: string },

  ): Promise<EmployeeScheduleDetail[]> {

    return await this.getSchedulesWithDetails(filters);

  }



  async getEmployeeSchedule(id: string): Promise<EmployeeScheduleDetail | undefined> {

    const schedule = await db.query.employeeSchedules.findFirst({

      where: eq(employeeSchedules.id, id),

      with: {

        shiftTemplate: true,

        employee: true,

      },

    });

    if (!schedule) {

      return undefined;

    }

    const dateKey = toDateKey(schedule.scheduleDate as any);

    const date = new Date(dateKey);

    const attendanceRecords = await this.getAttendanceForEmployee(

      schedule.employeeId,

      date,

      date,

    );

    const actualMinutes = attendanceRecords.reduce(

      (total, record) => total + calculateAttendanceMinutes(record),

      0,

    );

    const expected = Number(schedule.expectedMinutes ?? 0);

    return {

      ...schedule,

      shiftTemplate: schedule.shiftTemplate || undefined,

      employee: schedule.employee || undefined,

      actualMinutes,

      varianceMinutes: actualMinutes - expected,

      attendanceRecords,

    } satisfies EmployeeScheduleDetail;

  }



  async createEmployeeSchedules(

    assignments: InsertEmployeeSchedule[],

  ): Promise<EmployeeScheduleDetail[]> {

    if (assignments.length === 0) {

      return [];

    }

    const templateIds = new Set<string>();

    for (const assignment of assignments) {

      if (assignment.shiftTemplateId) {

        templateIds.add(assignment.shiftTemplateId);

      }

    }

    const templateMap = await this.loadScheduleTemplateMap(templateIds);

    const now = new Date();

    const values = assignments.map(assignment =>

      this.resolveScheduleInsert(

        assignment,

        assignment.shiftTemplateId ? templateMap.get(assignment.shiftTemplateId) : undefined,

      ),

    );

    const inserted = await db

      .insert(employeeSchedules)

      .values(values)

      .onConflictDoUpdate({

        target: [employeeSchedules.employeeId, employeeSchedules.scheduleDate],

        set: {

          shiftTemplateId: sql`excluded.shift_template_id`,

          customStartTime: sql`excluded.custom_start_time`,

          customEndTime: sql`excluded.custom_end_time`,

          customBreakMinutes: sql`excluded.custom_break_minutes`,

          expectedMinutes: sql`excluded.expected_minutes`,

          overtimeMinutes: sql`excluded.overtime_minutes`,

          lateApprovalStatus: sql`excluded.late_approval_status`,

          absenceApprovalStatus: sql`excluded.absence_approval_status`,

          overtimeApprovalStatus: sql`excluded.overtime_approval_status`,

          notes: sql`excluded.notes`,

          updatedAt: now,

        },

      })

      .returning({ id: employeeSchedules.id, scheduleDate: employeeSchedules.scheduleDate });

    if (inserted.length === 0) {

      return [];

    }

    const ids = new Set(inserted.map(record => record.id));

    const minDate = inserted.reduce<Date | undefined>((acc, record) => {

      const date = new Date(record.scheduleDate as any);

      if (Number.isNaN(date.getTime())) {

        return acc;

      }

      if (!acc || date < acc) return date;

      return acc;

    }, undefined);

    const maxDate = inserted.reduce<Date | undefined>((acc, record) => {

      const date = new Date(record.scheduleDate as any);

      if (Number.isNaN(date.getTime())) {

        return acc;

      }

      if (!acc || date > acc) return date;

      return acc;

    }, undefined);

    const employeeIds = new Set(assignments.map(assignment => assignment.employeeId));

    const filters: { start?: Date; end?: Date; employeeId?: string } = {

      start: minDate,

      end: maxDate,

    };

    if (employeeIds.size === 1) {

      filters.employeeId = assignments[0].employeeId;

    }

    const schedules = await this.getSchedulesWithDetails(filters);

    return schedules.filter(schedule => ids.has(schedule.id));

  }



  async updateEmployeeSchedule(

    id: string,

    schedule: Partial<InsertEmployeeSchedule>,

  ): Promise<EmployeeScheduleDetail | undefined> {

    const existing = await db.query.employeeSchedules.findFirst({

      where: eq(employeeSchedules.id, id),

    });

    if (!existing) {

      return undefined;

    }

    const templateId =

      schedule.shiftTemplateId !== undefined

        ? schedule.shiftTemplateId

        : existing.shiftTemplateId ?? undefined;

    const template = templateId

      ? await db.query.shiftTemplates.findFirst({

          where: eq(shiftTemplates.id, templateId),

        })

      : undefined;

    const startTime =

      schedule.customStartTime !== undefined

        ? (schedule.customStartTime as any)

        : existing.customStartTime ?? template?.startTime;

    const endTime =

      schedule.customEndTime !== undefined

        ? (schedule.customEndTime as any)

        : existing.customEndTime ?? template?.endTime;

    const breakMinutes =

      schedule.customBreakMinutes !== undefined

        ? schedule.customBreakMinutes

        : existing.customBreakMinutes ?? template?.breakMinutes ?? 0;

    const expectedMinutes = computeExpectedMinutes({

      startTime,

      endTime,

      breakMinutes,

      fallback: schedule.expectedMinutes ?? existing.expectedMinutes ?? template?.expectedMinutes,

    });

    const [updated] = await db

      .update(employeeSchedules)

      .set({

        ...schedule,

        expectedMinutes,

        updatedAt: new Date(),

      })

      .where(eq(employeeSchedules.id, id))

      .returning();

    if (!updated) {

      return undefined;

    }

    return await this.getEmployeeSchedule(updated.id);

  }



  async deleteEmployeeSchedule(id: string): Promise<boolean> {

    const result = await db.delete(employeeSchedules).where(eq(employeeSchedules.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  async getScheduleSummary(

    start: Date,

    end: Date,

  ): Promise<Record<string, EmployeeScheduleSummary>> {

    const schedules = await this.getSchedulesWithDetails({ start, end });

    const summary: Record<string, EmployeeScheduleSummary> = {};

    for (const schedule of schedules) {

      const employeeId = schedule.employeeId;

      if (!summary[employeeId]) {

        summary[employeeId] = {

          expectedMinutes: 0,

          actualMinutes: 0,

          missingPunches: 0,

          pendingLate: [],

          pendingAbsence: [],

          pendingOvertime: [],

          overtimeLimitBreaches: [],

        };

      }

      const bucket = summary[employeeId];

      const expected = Number(schedule.expectedMinutes ?? 0);

      const actual = schedule.actualMinutes ?? 0;

      bucket.expectedMinutes += expected;

      bucket.actualMinutes += actual;

      if (expected > 0 && actual === 0) {

        bucket.missingPunches += 1;

      }

      const variance = schedule.varianceMinutes ?? actual - expected;

      const dateKey = toDateKey(schedule.scheduleDate as any);

      if (variance < -30 && (schedule.lateApprovalStatus ?? "pending") === "pending") {

        bucket.pendingLate.push({

          scheduleId: schedule.id,

          date: dateKey,

          varianceMinutes: variance,

        });

      }

      if (actual === 0 && (schedule.absenceApprovalStatus ?? "pending") === "pending") {

        bucket.pendingAbsence.push({

          scheduleId: schedule.id,

          date: dateKey,

          varianceMinutes: variance,

        });

      }

      if (variance > 0 && (schedule.overtimeApprovalStatus ?? "pending") === "pending") {

        bucket.pendingOvertime.push({

          scheduleId: schedule.id,

          date: dateKey,

          varianceMinutes: variance,

        });

      }

      const limit = schedule.shiftTemplate?.overtimeLimitMinutes ?? DEFAULT_OVERTIME_LIMIT_MINUTES;

      if (variance > limit && (schedule.overtimeApprovalStatus ?? "pending") !== "approved") {

        bucket.overtimeLimitBreaches.push({

          scheduleId: schedule.id,

          date: dateKey,

          varianceMinutes: variance,

          limitMinutes: limit,

        });

      }

    }

    return summary;

  }


  async getReportSchedules(): Promise<ReportSchedule[]> {

    return await db

      .select()

      .from(reportSchedules)

      .orderBy(asc(reportSchedules.name));

  }


  async getReportSchedule(id: string): Promise<ReportSchedule | undefined> {

    const [schedule] = await db

      .select()

      .from(reportSchedules)

      .where(eq(reportSchedules.id, id));

    return schedule || undefined;

  }


  async createReportSchedule(schedule: InsertReportSchedule): Promise<ReportSchedule> {

    const now = new Date();

    const cadence = schedule.cadence ?? "monthly";

    const runTime = schedule.runTime;

    const filters = schedule.filters ?? {};

    const groupings = schedule.groupings ?? [];

    const recipients = schedule.recipients ?? [];

    const notifyEmployeeIds = schedule.notifyEmployeeIds ?? [];

    const deliveryChannels = schedule.deliveryChannels ?? [];

    const timezone = schedule.timezone ?? "UTC";

    const nextRun = computeNextReportRun(cadence, runTime, now);

    const [created] = await db

      .insert(reportSchedules)

      .values({

        ...schedule,

        cadence,

        runTime,

        filters,

        groupings,

        recipients,

        notifyEmployeeIds,

        deliveryChannels,

        timezone,

        nextRunAt: nextRun,

        createdAt: now,

        updatedAt: now,

      })

      .returning();

    return created;

  }


  async updateReportSchedule(

    id: string,

    updates: Partial<InsertReportSchedule> & {

      status?: ReportSchedule["status"];

      lastRunStatus?: ReportSchedule["lastRunStatus"] | null;

      lastRunSummary?: ReportSchedule["lastRunSummary"] | null;

      lastRunAt?: Date | string | null;

      nextRunAt?: Date | string | null;

    },

  ): Promise<ReportSchedule | undefined> {

    const existing = await this.getReportSchedule(id);

    if (!existing) {

      return undefined;

    }

    const payload: Record<string, unknown> = {

      ...updates,

      updatedAt: new Date(),

    };

    if (updates.filters !== undefined) {

      payload.filters = updates.filters ?? {};

    }

    if (updates.groupings !== undefined) {

      payload.groupings = updates.groupings ?? [];

    }

    if (updates.recipients !== undefined) {

      payload.recipients = updates.recipients ?? [];

    }

    if (updates.notifyEmployeeIds !== undefined) {

      payload.notifyEmployeeIds = updates.notifyEmployeeIds ?? [];

    }

    if (updates.deliveryChannels !== undefined) {

      payload.deliveryChannels = updates.deliveryChannels ?? [];

    }

    if (updates.lastRunAt !== undefined) {

      payload.lastRunAt = updates.lastRunAt === null ? null : new Date(updates.lastRunAt);

    }

    if (updates.nextRunAt !== undefined) {

      payload.nextRunAt = updates.nextRunAt === null ? null : new Date(updates.nextRunAt);

    }

    if ((updates.cadence !== undefined || updates.runTime !== undefined) && updates.nextRunAt === undefined) {

      const cadence = updates.cadence ?? existing.cadence;

      const runTime = updates.runTime ?? existing.runTime;

      payload.nextRunAt = computeNextReportRun(cadence, runTime, new Date());

    }

    const sanitized = removeUndefined(payload);

    const [updated] = await db

      .update(reportSchedules)

      .set(sanitized)

      .where(eq(reportSchedules.id, id))

      .returning();

    return updated || undefined;

  }


  async getDueReportSchedules(reference: Date): Promise<ReportSchedule[]> {

    const whereClause = and(

      eq(reportSchedules.status, "active"),

      or(isNull(reportSchedules.nextRunAt), lte(reportSchedules.nextRunAt, reference)),

    );

    return await db

      .select()

      .from(reportSchedules)

      .where(whereClause)

      .orderBy(asc(reportSchedules.nextRunAt));

  }



  // Car assignment methods

  async getCarAssignments(filters?: CarAssignmentFilters): Promise<CarAssignmentWithDetails[]> {

    const assignments = await db.query.carAssignments.findMany({

      with: {

        car: true,

        employee: true,

        assigner: true,

      },

      orderBy: desc(carAssignments.createdAt),

    });

    const normalizedAssignments = assignments.map(assignment => ({

      ...assignment,

      car: assignment.car || undefined,

      employee: assignment.employee || undefined,

      assigner: assignment.assigner || undefined,

    }));

    if (!filters) return normalizedAssignments;



    const normalizedFilters = {

      plateNumber: filters.plateNumber?.trim().toLowerCase() || "",

      vin: filters.vin?.trim().toLowerCase() || "",

      serial: filters.serial?.trim().toLowerCase() || "",

    };



    const hasFilter = Object.values(normalizedFilters).some(value => value.length > 0);

    if (!hasFilter) return normalizedAssignments;



    return normalizedAssignments.filter(assignment => {

      const car = assignment.car;

      if (!car) return false;



      const plateMatches = normalizedFilters.plateNumber

        ? car.plateNumber?.toLowerCase().includes(normalizedFilters.plateNumber) ?? false

        : true;

      const vinMatches = normalizedFilters.vin

        ? car.vin?.toLowerCase().includes(normalizedFilters.vin) ?? false

        : true;

      const serialMatches = normalizedFilters.serial

        ? car.serial?.toLowerCase().includes(normalizedFilters.serial) ?? false

        : true;



      return plateMatches && vinMatches && serialMatches;

    });

  }



  async getCarAssignment(id: string): Promise<CarAssignmentWithDetails | undefined> {

    const assignment = await db.query.carAssignments.findFirst({

      where: eq(carAssignments.id, id),

      with: {

        car: true,

        employee: true,

        assigner: true,

      },

    });

    if (!assignment) return undefined;

    return {

      ...assignment,

      car: assignment.car || undefined,

      employee: assignment.employee || undefined,

      assigner: assignment.assigner || undefined,

    };

  }



  async createCarAssignment(carAssignment: InsertCarAssignment): Promise<CarAssignment> {

    const [newCarAssignment] = await db

      .insert(carAssignments)

      .values({

        ...carAssignment,

        status: carAssignment.status || "active",

      })

      .returning();

    return newCarAssignment;

  }



  async updateCarAssignment(id: string, carAssignment: Partial<InsertCarAssignment>): Promise<CarAssignment | undefined> {

    const [updated] = await db

      .update(carAssignments)

      .set(carAssignment)

      .where(eq(carAssignments.id, id))

      .returning();

    return updated || undefined;

  }



  async deleteCarAssignment(id: string): Promise<boolean> {

    const result = await db.delete(carAssignments).where(eq(carAssignments.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  // Notification methods

  async getNotifications(): Promise<NotificationWithEmployee[]> {
    return await db.query.notifications.findMany({
      with: {
        employee: true,
        routingRule: {
          with: {
            steps: {
              orderBy: asc(notificationEscalationSteps.level),
            },
          },
        },
      },
      orderBy: desc(notifications.createdAt),
    });
  }

  async getUnreadNotifications(): Promise<NotificationWithEmployee[]> {
    return await db.query.notifications.findMany({
      where: eq(notifications.status, 'unread'),
      with: {
        employee: true,
        routingRule: {
          with: {
            steps: {
              orderBy: asc(notificationEscalationSteps.level),
            },
          },
        },
      },
      orderBy: desc(notifications.createdAt),
    });
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const normalized = { ...notification } as InsertNotification;
    const normalizedChannels =
      normalizeDeliveryChannels(notification.deliveryChannels, true) ?? [];
    normalized.deliveryChannels = [...normalizedChannels] as any;
    const normalizedHistory =
      normalizeEscalationHistoryEntries(notification.escalationHistory, true) ?? [];
    normalized.escalationHistory = [...normalizedHistory] as any;
    normalized.escalationStatus = notification.escalationStatus ?? 'pending';
    normalized.escalationLevel = notification.escalationLevel ?? 0;

    for (const field of ['snoozedUntil', 'slaDueAt', 'lastEscalatedAt'] as const) {
      const value = normalizeDateInput(
        (notification as Partial<InsertNotification>)[field],
      );
      if (value === undefined) {
        delete (normalized as Partial<InsertNotification>)[field];
      } else {
        normalized[field] = value as any;
      }
    }

    if (normalized.routingRuleId) {
      const rule = await db.query.notificationRoutingRules.findFirst({
        where: eq(notificationRoutingRules.id, normalized.routingRuleId),
      });
      if (rule) {
        if (!normalized.deliveryChannels?.length && rule.deliveryChannels?.length) {
          normalized.deliveryChannels = rule.deliveryChannels;
        }
        if (!normalized.slaDueAt && rule.slaMinutes) {
          const due = new Date(Date.now() + rule.slaMinutes * 60_000);
          normalized.slaDueAt = due;
        }
      }
    }

    // Deduplicate by employeeId+type+title+expiryDate
    const existing = await db.query.notifications.findFirst({
      where: (n, { and, eq }) =>
        and(
          eq(n.employeeId, normalized.employeeId),
          eq(n.type, normalized.type),
          eq(n.title, normalized.title),
          eq(n.expiryDate, normalized.expiryDate as any),
        ),
    });

    if (existing) return existing;

    const insertPayload = {
      ...normalized,
      status: normalized.status || 'unread',
      priority: normalized.priority || 'medium',
      emailSent: normalized.emailSent || false,
    } as typeof notifications.$inferInsert;

    const [newNotification] = await db
      .insert(notifications)
      .values(insertPayload)
      .returning();

    if (newNotification) {
      emitChatbotNotification({
        type: CHATBOT_EVENT_TYPES.notificationCreated,
        payload: {
          id: newNotification.id,
          employeeId: newNotification.employeeId,
          title: newNotification.title,
          message: newNotification.message,
          priority: newNotification.priority,
          documentUrl: newNotification.documentUrl,
        },
      });
    }

    return newNotification;
  }



  async updateNotification(
    id: string,
    notification: Partial<InsertNotification>,
  ): Promise<Notification | undefined> {
    const normalized: Partial<InsertNotification> = { ...notification };

    if (hasOwn(notification, 'deliveryChannels')) {
      if (notification.deliveryChannels === undefined) {
        delete normalized.deliveryChannels;
      } else {
        const channels =
          normalizeDeliveryChannels(notification.deliveryChannels, true) ?? [];
        normalized.deliveryChannels = [...channels] as any;
      }
    }

    if (hasOwn(notification, 'escalationHistory')) {
      if (notification.escalationHistory === undefined) {
        delete normalized.escalationHistory;
      } else {
        const history =
          normalizeEscalationHistoryEntries(notification.escalationHistory, true) ?? [];
        normalized.escalationHistory = [...history] as any;
      }
    }

    for (const field of ['snoozedUntil', 'slaDueAt', 'lastEscalatedAt'] as const) {
      if (!hasOwn(notification, field)) continue;
      const value = normalizeDateInput(notification[field]);
      if (value === undefined) {
        delete normalized[field];
      } else {
        normalized[field] = value as any;
      }
    }

    const updatePayload =
      normalized as Partial<typeof notifications.$inferInsert>;

    const [updated] = await db
      .update(notifications)
      .set(updatePayload)
      .where(eq(notifications.id, id))
      .returning();

    if (updated) {
      emitChatbotNotification({
        type: CHATBOT_EVENT_TYPES.notificationUpdated,
        payload: {
          id: updated.id,
          employeeId: updated.employeeId,
          title: updated.title,
          message: updated.message,
          priority: updated.priority,
          documentUrl: updated.documentUrl,
        },
      });
    }

    return updated || undefined;
  }



  async markNotificationAsRead(id: string): Promise<boolean> {

    const result = await db

      .update(notifications)

      .set({ status: 'read' })

      .where(eq(notifications.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  async deleteNotification(id: string): Promise<boolean> {
    const result = await db.delete(notifications).where(eq(notifications.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getNotificationRoutingRules(): Promise<NotificationRoutingRuleWithSteps[]> {
    return await db.query.notificationRoutingRules.findMany({
      with: {
        steps: {
          orderBy: asc(notificationEscalationSteps.level),
        },
      },
      orderBy: asc(notificationRoutingRules.name),
    });
  }

  async upsertNotificationRoutingRule(
    rule: UpsertNotificationRoutingRule,
  ): Promise<NotificationRoutingRuleWithSteps> {
    return await db.transaction(async tx => {
      const { steps = [], id, ...rawRule } = rule;
      const normalizedChannels =
        normalizeDeliveryChannels(rawRule.deliveryChannels, true) ?? [];
      const normalizedRule: InsertNotificationRoutingRule = {
        ...rawRule,
        deliveryChannels: [...normalizedChannels] as any,
        metadata: rawRule.metadata ?? {},
      };
      const formattedSteps = steps.map((step, index) => ({
        level: step.level ?? index + 1,
        escalateAfterMinutes: step.escalateAfterMinutes ?? 0,
        targetRole: step.targetRole,
        channel: step.channel,
        messageTemplate: step.messageTemplate ?? null,
      }));
      let savedRule: NotificationRoutingRule | undefined;

      if (id) {
        const updatePayload = {
          ...normalizedRule,
          updatedAt: new Date(),
        } as Partial<typeof notificationRoutingRules.$inferInsert>;
        const [updated] = await tx
          .update(notificationRoutingRules)
          .set(updatePayload)
          .where(eq(notificationRoutingRules.id, id))
          .returning();
        savedRule = updated;
      } else {
        const insertPayload =
          normalizedRule as typeof notificationRoutingRules.$inferInsert;
        const [created] = await tx
          .insert(notificationRoutingRules)
          .values(insertPayload)
          .returning();
        savedRule = created;
      }

      if (!savedRule) {
        throw new Error('Failed to persist notification routing rule');
      }

      await tx
        .delete(notificationEscalationSteps)
        .where(eq(notificationEscalationSteps.ruleId, savedRule.id));

      if (formattedSteps.length > 0) {
        await tx.insert(notificationEscalationSteps).values(
          formattedSteps.map((step, index) => ({
            ...step,
            ruleId: savedRule!.id,
            level: step.level ?? index + 1,
          })),
        );
      }

      const reloaded = await tx.query.notificationRoutingRules.findFirst({
        where: eq(notificationRoutingRules.id, savedRule.id),
        with: {
          steps: {
            orderBy: asc(notificationEscalationSteps.level),
          },
        },
      });

      if (!reloaded) {
        throw new Error('Failed to load notification routing rule');
      }

      return reloaded;
    });
  }

  async appendNotificationEscalationHistory(
    id: string,
    entry: NotificationEscalationHistoryEntry,
    status?: NotificationEscalationStatus,
  ): Promise<Notification | undefined> {
    const existing = await db.query.notifications.findFirst({
      where: eq(notifications.id, id),
    });

    if (!existing) return undefined;

    const history = [...(existing.escalationHistory ?? []), entry];

    const [updated] = await db
      .update(notifications)
      .set({
        escalationHistory: history,
        escalationLevel: entry.level,
        lastEscalatedAt: new Date(entry.escalatedAt),
        escalationStatus: status ?? entry.status ?? existing.escalationStatus,
      })
      .where(eq(notifications.id, id))
      .returning();

    return updated || undefined;
  }



  async getAssetDocuments(assetId: string): Promise<AssetDocument[]> {

    return await db.query.assetDocuments.findMany({ where: (t, { eq }) => eq(t.assetId, assetId), orderBy: desc(assetDocuments.createdAt) });

  }

  async createAssetDocument(doc: InsertAssetDocument): Promise<AssetDocument> {

    const [row] = await db.insert(assetDocuments).values(doc).returning();

    return row;

  }

  async getAssetRepairs(assetId: string): Promise<AssetRepair[]> {

    return await db.query.assetRepairs.findMany({ where: (t,{eq}) => eq(t.assetId, assetId), orderBy: desc(assetRepairs.repairDate) });

  }

  async createAssetRepair(repair: InsertAssetRepair): Promise<AssetRepair> {

    const [row] = await db.insert(assetRepairs).values(repair).returning();

    return row;

  }



  // Email alert methods

  async getEmailAlerts(): Promise<EmailAlert[]> {

    return await db.select().from(emailAlerts).orderBy(desc(emailAlerts.createdAt));

  }



  async createEmailAlert(alert: InsertEmailAlert): Promise<EmailAlert> {

    const [newEmailAlert] = await db

      .insert(emailAlerts)

      .values({

        ...alert,

        status: alert.status || "pending",

      })

      .returning();

    return newEmailAlert;

  }



  async updateEmailAlert(id: string, alert: Partial<InsertEmailAlert>): Promise<EmailAlert | undefined> {

    const [updated] = await db

      .update(emailAlerts)

      .set(alert)

      .where(eq(emailAlerts.id, id))

      .returning();

    return updated || undefined;

  }



  // Employee event methods

  async getEmployeeEvents(
    start?: Date,
    end?: Date,
    filters?: {
      employeeId?: string;
      eventType?: InsertEmployeeEvent["eventType"];
    },
  ): Promise<(EmployeeEvent & { employee: Employee })[]> {
    const rangeStart = this.normalizeDateInput(start);
    const rangeEnd = this.normalizeDateInput(end);

    if (this.hasRecurringEmployeeEventsColumns === false) {
      return this.getEmployeeEventsLegacy(rangeStart, rangeEnd, filters);
    }

    try {
      const conditions: (SQL | undefined)[] = [];

      if (filters?.employeeId) {
        conditions.push(eq(employeeEvents.employeeId, filters.employeeId));
      }

      if (filters?.eventType) {
        conditions.push(eq(employeeEvents.eventType, filters.eventType));
      }

      if (rangeStart && rangeEnd) {
        conditions.push(
          or(
            and(
              gte(employeeEvents.eventDate, rangeStart),
              lte(employeeEvents.eventDate, rangeEnd),
            ),
            and(
              eq(employeeEvents.eventType, "allowance"),
              eq(employeeEvents.recurrenceType, "monthly"),
              lte(employeeEvents.eventDate, rangeEnd),
              or(
                isNull(employeeEvents.recurrenceEndDate),
                gte(employeeEvents.recurrenceEndDate, rangeStart),
              ),
            ),
          ),
        );
      }

      const activeConditions = conditions.filter(Boolean) as SQL[];
      const where = activeConditions.length
        ? activeConditions.length === 1
          ? activeConditions[0]
          : and(...activeConditions)
        : undefined;

      const events = await db.query.employeeEvents.findMany({
        with: {
          employee: true,
        },
        where,
        orderBy: desc(employeeEvents.createdAt),
      });

      this.hasRecurringEmployeeEventsColumns = true;

      if (!rangeStart || !rangeEnd) {
        return events;
      }

      return this.expandRecurringEmployeeEvents(events, rangeStart, rangeEnd);
    } catch (error) {
      if (this.isDataSourceUnavailableError(error)) {
        if (!this.loggedMissingRecurringEventColumns) {
          console.warn(
            "Recurring employee event columns unavailable; falling back without recurrence support.",
            error,
          );
          this.loggedMissingRecurringEventColumns = true;
        }
        this.hasRecurringEmployeeEventsColumns = false;
        return this.getEmployeeEventsLegacy(rangeStart, rangeEnd, filters);
      }
      throw error;
    }
  }

  private async getEmployeeEventsLegacy(
    rangeStart?: string,
    rangeEnd?: string,
    filters?: {
      employeeId?: string;
      eventType?: InsertEmployeeEvent["eventType"];
    },
  ): Promise<(EmployeeEvent & { employee: Employee })[]> {
    const conditions: SQL[] = [];

    if (filters?.employeeId) {
      conditions.push(eq(employeeEvents.employeeId, filters.employeeId));
    }

    if (filters?.eventType) {
      conditions.push(eq(employeeEvents.eventType, filters.eventType));
    }

    if (rangeStart && rangeEnd) {
      const start = rangeStart;
      const end = rangeEnd;
      const startCondition = gte(employeeEvents.eventDate, start);
      const endCondition = lte(employeeEvents.eventDate, end);
      const combined: SQL<unknown> = and(startCondition, endCondition) ?? startCondition;
      conditions.push(combined);
    }

    const where = conditions.length
      ? conditions.length === 1
        ? conditions[0]
        : and(...conditions)
      : undefined;

    const baseQuery = db
      .select({
        event: {
          id: employeeEvents.id,
          employeeId: employeeEvents.employeeId,
          eventType: employeeEvents.eventType,
          title: employeeEvents.title,
          description: employeeEvents.description,
          amount: employeeEvents.amount,
          eventDate: employeeEvents.eventDate,
          affectsPayroll: employeeEvents.affectsPayroll,
          documentUrl: employeeEvents.documentUrl,
          status: employeeEvents.status,
          addedBy: employeeEvents.addedBy,
          createdAt: employeeEvents.createdAt,
        },
        employee: employees,
      })
      .from(employeeEvents)
      .leftJoin(employees, eq(employeeEvents.employeeId, employees.id));

    const query = where ? baseQuery.where(where) : baseQuery;

    const rows = await query.orderBy(desc(employeeEvents.createdAt));

    return rows.map(({ event, employee }) => ({
      ...event,
      recurrenceType: "none",
      recurrenceEndDate: null,
      employee: employee ?? undefined,
    })) as (EmployeeEvent & { employee: Employee })[];
  }


  async getEmployeeEvent(id: string): Promise<EmployeeEvent | undefined> {

    const [event] = await db.select().from(employeeEvents).where(eq(employeeEvents.id, id));

    return event || undefined;

  }



  async createEmployeeEvent(event: InsertEmployeeEvent): Promise<EmployeeEvent> {

    const [newEvent] = await db

      .insert(employeeEvents)

      .values({

        ...event,

        status: event.status || "active",

        affectsPayroll: event.affectsPayroll ?? true,

        recurrenceType: event.recurrenceType ?? "none",

      })

      .returning();

    return newEvent;

  }



  async updateEmployeeEvent(id: string, event: Partial<InsertEmployeeEvent>): Promise<EmployeeEvent | undefined> {

    const [updated] = await db

      .update(employeeEvents)

      .set(event)

      .where(eq(employeeEvents.id, id))

      .returning();

    return updated || undefined;

  }



  async deleteEmployeeEvent(id: string): Promise<boolean> {

    const result = await db.delete(employeeEvents).where(eq(employeeEvents.id, id));

    return (result.rowCount ?? 0) > 0;

  }



  async getMonthlyEmployeeSummary(

    employeeId: string,

    month: Date

  ): Promise<{ payroll: PayrollEntry[]; loans: Loan[]; events: EmployeeEvent[] }> {

    const startDate = new Date(

      month.getFullYear(),

      month.getMonth(),

      1

    )

      .toISOString()

      .split("T")[0];

    const endDate = new Date(

      month.getFullYear(),

      month.getMonth() + 1,

      0

    )

      .toISOString()

      .split("T")[0];



    return await db.transaction(async (tx) => {

      const [payrollRows, loansRows, eventRows] = await Promise.all([

        tx

          .select({ entry: payrollEntries })

          .from(payrollEntries)

          .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))

          .where(

            and(

              eq(payrollEntries.employeeId, employeeId),

              gte(payrollRuns.startDate, startDate),

              lte(payrollRuns.startDate, endDate)

            )

          ),

        tx

          .select()

          .from(loans)

          .where(

            and(

              eq(loans.employeeId, employeeId),

              eq(loans.status, "active"),

              lte(loans.startDate, endDate)

            )

          ),

        tx

          .select()

          .from(employeeEvents)

          .where(

            and(

              eq(employeeEvents.employeeId, employeeId),

              eq(employeeEvents.affectsPayroll, true),

              or(

                and(

                  gte(employeeEvents.eventDate, startDate),

                  lte(employeeEvents.eventDate, endDate),

                ),

                and(

                  eq(employeeEvents.eventType, "allowance"),

                  eq(employeeEvents.recurrenceType, "monthly"),

                  lte(employeeEvents.eventDate, endDate),

                  or(

                    isNull(employeeEvents.recurrenceEndDate),

                    gte(employeeEvents.recurrenceEndDate, startDate),

                  ),

                ),

              ),

            )

          ),

      ]);



      const expandedEvents = this.expandRecurringEmployeeEvents(

        eventRows,

        startDate,

        endDate,

      );

      return {

        payroll: payrollRows.map((r) => r.entry),

        loans: loansRows,

        events: expandedEvents,

      };

    });

  }



  async getEmployeeReport(

    employeeId: string,

    range: { startDate: string; endDate: string; groupBy: "month" | "year" }

  ): Promise<EmployeeReportPeriod[]> {

    const { startDate, endDate, groupBy } = range;

    const periodExpr = (column: AnyColumn) =>

      groupBy === "year"

        ? sql<string>`to_char(${column}, 'YYYY')`

        : sql<string>`to_char(${column}, 'YYYY-MM')`;



    const payrollRows = await db

      .select({

        period: periodExpr(payrollRuns.startDate),

        entry: payrollEntries,

        runId: payrollRuns.id,

        runStart: payrollRuns.startDate,

        runEnd: payrollRuns.endDate,

      })

      .from(payrollEntries)

      .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))

      .where(

        and(

          eq(payrollEntries.employeeId, employeeId),

          gte(payrollRuns.startDate, startDate),

          lte(payrollRuns.startDate, endDate)

        )

      );



    const rawEventRows = await db

      .select()

      .from(employeeEvents)

      .where(

        and(

          eq(employeeEvents.employeeId, employeeId),

          eq(employeeEvents.affectsPayroll, true),

          or(

            and(

              gte(employeeEvents.eventDate, startDate),

              lte(employeeEvents.eventDate, endDate),

            ),

            and(

              eq(employeeEvents.eventType, "allowance"),

              eq(employeeEvents.recurrenceType, "monthly"),

              lte(employeeEvents.eventDate, endDate),

              or(

                isNull(employeeEvents.recurrenceEndDate),

                gte(employeeEvents.recurrenceEndDate, startDate),

              ),

            ),

          ),

        )

      );



    const loanRows = await db

      .select({

        period: periodExpr(loans.startDate),

        loan: loans,

      })

      .from(loans)

      .where(

        and(

          eq(loans.employeeId, employeeId),

          gte(loans.startDate, startDate),

          lte(loans.startDate, endDate)

        )

      );



    const vacationRows = await db

      .select({

        period: periodExpr(vacationRequests.startDate),

        vacation: vacationRequests,

      })

      .from(vacationRequests)

      .where(

        and(

          eq(vacationRequests.employeeId, employeeId),

          gte(vacationRequests.startDate, startDate),

          lte(vacationRequests.startDate, endDate)

        )

      );



    const grouped: Record<string, EmployeeReportPeriod> = {};

    const ensure = (period: string) => {

      if (!grouped[period]) {

        grouped[period] = {

          period,

          payrollEntries: [],

          employeeEvents: [],

          loans: [],

          vacationRequests: [],

        };

      }

      return grouped[period];

    };



    const entriesByRun = new Map<
      string,
      {
        start: string | Date | null | undefined;
        end: string | Date | null | undefined;
        entries: PayrollEntry[];
      }
    >();

    payrollRows.forEach(({ runId, runStart, runEnd, entry }) => {
      if (!runId) {
        return;
      }
      const existing = entriesByRun.get(runId);
      if (existing) {
        existing.entries.push(entry);
      } else {
        entriesByRun.set(runId, {
          start: runStart,
          end: runEnd,
          entries: [entry],
        });
      }
    });

    const fallbackBreakdownByRun = new Map<string, Map<string, AllowanceBreakdown>>();
    const allowanceKeySetsByRun = new Map<string, Set<string>>();

    for (const [runId, { start, end, entries }] of entriesByRun.entries()) {
      const keySet = new Set<string>();
      allowanceKeySetsByRun.set(runId, keySet);

      const entriesNeedingFallback = entries.filter(entry => entry.allowances == null);

      if (!start || entriesNeedingFallback.length === 0) {
        fallbackBreakdownByRun.set(runId, new Map());
        continue;
      }

      const allowanceEnd = end ?? start;

      try {
        const metadata = await this.buildAllowanceBreakdownForRun(
          entriesNeedingFallback.map(entry => ({ employeeId: entry.employeeId })),
          start,
          allowanceEnd,
        );
        fallbackBreakdownByRun.set(runId, metadata.breakdownByEmployee);
        metadata.allowanceKeys.forEach(key => keySet.add(key));
      } catch (error) {
        if (this.isDataSourceUnavailableError(error)) {
          console.warn(
            "Failed to load allowance metadata due to missing data source:",
            error,
          );
          fallbackBreakdownByRun.set(runId, new Map());
        } else {
          throw error;
        }
      }
    }

    payrollRows.forEach(({ period, entry, runId }) => {
      const employeeEntryId = entry.employeeId;
      const breakdownForRun = runId ? fallbackBreakdownByRun.get(runId) : undefined;
      const keySet = runId ? allowanceKeySetsByRun.get(runId) : undefined;
      const { allowances: rawAllowances, ...entryWithoutAllowances } = entry as any;

      let normalizedAllowances: AllowanceBreakdown | undefined;

      if (rawAllowances != null) {
        const sanitized = this.sanitizeAllowanceBreakdown(rawAllowances);
        if (sanitized) {
          normalizedAllowances = sanitized;
          Object.keys(sanitized).forEach(key => keySet?.add(key));
        }
      } else if (employeeEntryId && breakdownForRun) {
        const fallback = breakdownForRun.get(employeeEntryId);
        if (fallback && Object.keys(fallback).length > 0) {
          normalizedAllowances = { ...fallback };
          Object.keys(normalizedAllowances).forEach(key => keySet?.add(key));
        }
      }

      const normalizedEntry = { ...entryWithoutAllowances } as PayrollEntry;
      if (normalizedAllowances !== undefined) {
        normalizedEntry.allowances = normalizedAllowances;
      }

      ensure(period).payrollEntries.push(normalizedEntry);
    });

    const expandedEventRows = this.expandRecurringEmployeeEvents(

      rawEventRows,

      startDate,

      endDate,

    );

    const resolvePeriod = (date?: string | null) => {

      const normalized = this.normalizeDateInput(date);

      if (!normalized) {

        return undefined;

      }

      return groupBy === "year" ? normalized.slice(0, 4) : normalized.slice(0, 7);

    };

    expandedEventRows.forEach(event => {

      const periodKey = resolvePeriod(event.eventDate);

      if (!periodKey) return;

      ensure(periodKey).employeeEvents.push(event);

    });

    loanRows.forEach(({ period, loan }) => {

      ensure(period).loans.push(loan);

    });

    vacationRows.forEach(({ period, vacation }) => {

      ensure(period).vacationRequests.push(vacation);

    });



    return Object.values(grouped).sort((a, b) =>

      a.period.localeCompare(b.period)

    );

  }



  // Company-level report queries mirroring the employee report logic

  async getCompanyPayrollSummary(

    range: { startDate: string; endDate: string; groupBy: "month" | "year" }

  ): Promise<PayrollSummaryPeriod[]> {

    const { startDate, endDate, groupBy } = range;

    const periodExpr = (column: AnyColumn) =>

      groupBy === "year"

        ? sql<string>`to_char(${column}, 'YYYY')`

        : sql<string>`to_char(${column}, 'YYYY-MM')`;



    const rows = await db

      .select({

        period: periodExpr(payrollRuns.startDate),

        entry: payrollEntries,

        runId: payrollRuns.id,

        runStart: payrollRuns.startDate,

        runEnd: payrollRuns.endDate,

        scenarioToggles: payrollRuns.scenarioToggles,

      })

      .from(payrollEntries)

      .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))

      .where(and(gte(payrollRuns.startDate, startDate), lte(payrollRuns.startDate, endDate)));



    const entriesByRun = new Map<

      string,

      {

        start: string | Date | null | undefined;

        end: string | Date | null | undefined;

        scenarioToggles: unknown;

        entries: PayrollEntry[];

      }

    >();



    rows.forEach(({ runId, runStart, runEnd, scenarioToggles, entry }) => {

      if (!runId) {

        return;

      }

      const existing = entriesByRun.get(runId);

      if (existing) {

        existing.entries.push(entry);

      } else {

        entriesByRun.set(runId, {

          start: runStart,

          end: runEnd,

          scenarioToggles,

          entries: [entry],

        });

      }

    });



    const fallbackBreakdownByRun = new Map<string, Map<string, AllowanceBreakdown>>();

    const allowancesEnabledByRun = new Map<string, boolean>();



    for (const [runId, { start, end, scenarioToggles, entries }] of entriesByRun.entries()) {

      const toggles =

        scenarioToggles && typeof scenarioToggles === "object"

          ? (scenarioToggles as Record<string, boolean>)

          : {};

      const allowancesEnabled = toggles.allowances !== false;

      allowancesEnabledByRun.set(runId, allowancesEnabled);



      if (!allowancesEnabled) {

        fallbackBreakdownByRun.set(runId, new Map());

        continue;

      }



      const entriesNeedingFallback = entries.filter(entry => entry.allowances == null);

      if (!start || entriesNeedingFallback.length === 0) {

        fallbackBreakdownByRun.set(runId, new Map());

        continue;

      }



      const allowanceEnd = end ?? start;



      try {

        const metadata = await this.buildAllowanceBreakdownForRun(

          entriesNeedingFallback.map(entry => ({ employeeId: entry.employeeId })),

          start,

          allowanceEnd,

        );

        fallbackBreakdownByRun.set(runId, metadata.breakdownByEmployee);

      } catch (error) {

        if (this.isDataSourceUnavailableError(error)) {

          console.warn(

            "Failed to load allowance metadata due to missing data source:",

            error,

          );

          fallbackBreakdownByRun.set(runId, new Map());

        } else {

          throw error;

        }

      }

    }



    const grouped: Record<string, PayrollSummaryPeriod> = {};



    rows.forEach(({ period, entry, runId }) => {

      if (!grouped[period]) {

        grouped[period] = { period, payrollEntries: [] };

      }



      const { allowances: rawAllowances, ...entryWithoutAllowances } = entry as any;

      let normalizedAllowances = this.sanitizeAllowanceBreakdown(rawAllowances);



      if (!normalizedAllowances && runId) {

        const allowancesEnabled = allowancesEnabledByRun.get(runId) ?? false;

        if (allowancesEnabled) {

          const fallback = fallbackBreakdownByRun.get(runId)?.get(entry.employeeId);

          if (fallback && Object.keys(fallback).length > 0) {

            normalizedAllowances = { ...fallback };

          }

        }

      }



      const normalizedEntry = { ...entryWithoutAllowances } as PayrollEntry;
      if (normalizedAllowances !== undefined) {
        normalizedEntry.allowances = normalizedAllowances;
      }

      grouped[period].payrollEntries.push(normalizedEntry);

    });



    return Object.values(grouped).sort((a, b) => a.period.localeCompare(b.period));

  }



  async getCompanyPayrollByDepartment(

    range: { startDate: string; endDate: string; groupBy: "month" | "year" }

  ): Promise<PayrollDepartmentSummaryRow[]> {

    const { startDate, endDate, groupBy } = range;

    const periodExpr = (column: AnyColumn) =>

      groupBy === "year"

        ? sql<string>`to_char(${column}, 'YYYY')`

        : sql<string>`to_char(${column}, 'YYYY-MM')`;



    const grossSum = sql<string>`sum(${payrollEntries.grossPay})`;

    const netSum = sql<string>`sum(${payrollEntries.netPay})`;



    const rows = await db

      .select({

        period: periodExpr(payrollRuns.startDate),

        departmentId: employees.departmentId,

        departmentName: departments.name,

        gross: grossSum,

        net: netSum,

      })

      .from(payrollEntries)

      .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))

      .innerJoin(employees, eq(payrollEntries.employeeId, employees.id))

      .leftJoin(departments, eq(employees.departmentId, departments.id))

      .where(and(gte(payrollRuns.startDate, startDate), lte(payrollRuns.startDate, endDate)))

      .groupBy(periodExpr(payrollRuns.startDate), employees.departmentId, departments.name)

      .orderBy(periodExpr(payrollRuns.startDate));



    return rows.map(r => ({

      period: r.period,

      departmentId: r.departmentId ?? null,

      departmentName: r.departmentName ?? null,

      grossPay: Number(r.gross),

      netPay: Number(r.net),

    }));

  }



  async getDepartmentCostAnalytics(

    range: {

      startDate: string;

      endDate: string;

      groupBy: "month" | "year";

      departmentIds?: string[];

    },

  ): Promise<DepartmentCostPeriod[]> {

    const { startDate, endDate, groupBy, departmentIds } = range;

    const periodExpr = (column: AnyColumn) =>

      groupBy === "year"

        ? sql<string>`to_char(${column}, 'YYYY')`

        : sql<string>`to_char(${column}, 'YYYY-MM')`;

    const grossSum = sql<string>`coalesce(sum(${payrollEntries.grossPay}), 0)`;

    const netSum = sql<string>`coalesce(sum(${payrollEntries.netPay}), 0)`;

    const baseSum = sql<string>`coalesce(sum(${payrollEntries.baseSalary}), 0)`;

    const bonusSum = sql<string>`coalesce(sum(${payrollEntries.bonusAmount}), 0)`;

    const taxSum = sql<string>`coalesce(sum(${payrollEntries.taxDeduction}), 0)`;

    const socialSum = sql<string>`coalesce(sum(${payrollEntries.socialSecurityDeduction}), 0)`;

    const healthSum = sql<string>`coalesce(sum(${payrollEntries.healthInsuranceDeduction}), 0)`;

    const loanSum = sql<string>`coalesce(sum(${payrollEntries.loanDeduction}), 0)`;

    const otherSum = sql<string>`coalesce(sum(${payrollEntries.otherDeductions}), 0)`;

    const conditions: SQL[] = [

      gte(payrollRuns.startDate, startDate),

      lte(payrollRuns.startDate, endDate),

    ];

    if (departmentIds && departmentIds.length > 0) {

      conditions.push(inArray(employees.departmentId, departmentIds));

    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const rows = await db

      .select({

        period: periodExpr(payrollRuns.startDate),

        departmentId: employees.departmentId,

        departmentName: departments.name,

        gross: grossSum,

        net: netSum,

        base: baseSum,

        bonus: bonusSum,

        tax: taxSum,

        social: socialSum,

        health: healthSum,

        loan: loanSum,

        other: otherSum,

      })

      .from(payrollEntries)

      .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))

      .innerJoin(employees, eq(payrollEntries.employeeId, employees.id))

      .leftJoin(departments, eq(employees.departmentId, departments.id))

      .where(whereClause)

      .groupBy(

        periodExpr(payrollRuns.startDate),

        employees.departmentId,

        departments.name,

      )

      .orderBy(periodExpr(payrollRuns.startDate), asc(departments.name));

    return rows.map(row => {

      const gross = Number(row.gross ?? 0);

      const base = Number(row.base ?? 0);

      const bonuses = Number(row.bonus ?? 0);

      const overtimeEstimate = Math.max(0, gross - base - bonuses);

      return {

        period: row.period,

        departmentId: row.departmentId ?? null,

        departmentName: row.departmentName ?? "Unassigned",

        totals: {

          grossPay: gross,

          netPay: Number(row.net ?? 0),

          baseSalary: base,

          bonuses,

          overtimeEstimate,

          deductions: {

            tax: Number(row.tax ?? 0),

            socialSecurity: Number(row.social ?? 0),

            healthInsurance: Number(row.health ?? 0),

            loan: Number(row.loan ?? 0),

            other: Number(row.other ?? 0),

          },

        },

      } satisfies DepartmentCostPeriod;

    });

  }


  private async getDepartmentScheduleAggregates(

    range: { startDate: string; endDate: string; departmentIds?: string[] },

  ): Promise<

    Array<{

      departmentId: string | null;

      departmentName: string;

      expectedMinutes: number;

      overtimeMinutes: number;

      recordedMinutes: number;

      scheduleCount: number;

      employeeCount: number;

      salarySum: number;

    }>

  > {

    const { startDate, endDate, departmentIds } = range;

    const baseCondition = and(

      gte(employeeSchedules.scheduleDate, startDate),

      lte(employeeSchedules.scheduleDate, endDate),

    );

    const whereClause =

      departmentIds && departmentIds.length > 0

        ? and(baseCondition, inArray(employees.departmentId, departmentIds))

        : baseCondition;

    const expectedSum = sql<string>`coalesce(sum(${employeeSchedules.expectedMinutes}), 0)`;

    const overtimeSum = sql<string>`coalesce(sum(${employeeSchedules.overtimeMinutes}), 0)`;

    const recordedHours = sql<string>`coalesce(sum(${attendance.hours}), 0)`;

    const scheduleCount = sql<string>`count(${employeeSchedules.id})`;

    const employeeCount = sql<string>`count(distinct ${employeeSchedules.employeeId})`;

    const salarySum = sql<string>`coalesce(sum(${employees.salary}), 0)`;

    const rows = await db

      .select({

        departmentId: employees.departmentId,

        departmentName: departments.name,

        expected: expectedSum,

        overtime: overtimeSum,

        recorded: recordedHours,

        schedules: scheduleCount,

        employees: employeeCount,

        salary: salarySum,

      })

      .from(employeeSchedules)

      .innerJoin(employees, eq(employeeSchedules.employeeId, employees.id))

      .leftJoin(departments, eq(employees.departmentId, departments.id))

      .leftJoin(

        attendance,

        and(

          eq(attendance.employeeId, employeeSchedules.employeeId),

          eq(attendance.date, employeeSchedules.scheduleDate),

        ),

      )

      .where(whereClause)

      .groupBy(employees.departmentId, departments.name);

    return rows.map(row => ({

      departmentId: row.departmentId ?? null,

      departmentName: row.departmentName ?? "Unassigned",

      expectedMinutes: Number(row.expected ?? 0),

      overtimeMinutes: Math.max(0, Number(row.overtime ?? 0)),

      recordedMinutes: Math.max(0, Number(row.recorded ?? 0)) * 60,

      scheduleCount: Number(row.schedules ?? 0),

      employeeCount: Number(row.employees ?? 0),

      salarySum: Number(row.salary ?? 0),

    }));

  }


  async getDepartmentOvertimeMetrics(

    range: { startDate: string; endDate: string; departmentIds?: string[] },

  ): Promise<DepartmentOvertimeMetric[]> {

    const aggregates = await this.getDepartmentScheduleAggregates(range);

    if (aggregates.length === 0) {

      return [];

    }

    return aggregates

      .map(aggregate => {

        const expected = Math.max(0, aggregate.expectedMinutes);

        const recorded = Math.max(0, aggregate.recordedMinutes);

        const storedOvertime = Math.max(0, aggregate.overtimeMinutes);

        const computedOvertime = Math.max(0, recorded - expected);

        const overtimeMinutes = Math.max(storedOvertime, computedOvertime);

        const totalOvertimeHours = overtimeMinutes / 60;

        const denominator = aggregate.employeeCount > 0 ? aggregate.employeeCount : Math.max(1, aggregate.scheduleCount);

        const averageOvertimeHours = totalOvertimeHours / Math.max(1, denominator);

        const averageHourlyRate = aggregate.employeeCount > 0

          ? aggregate.salarySum / aggregate.employeeCount / 160

          : aggregate.salarySum / Math.max(1, aggregate.scheduleCount) / 160;

        const overtimeCostEstimate = totalOvertimeHours * Math.max(0, averageHourlyRate) * 1.5;

        const coverageRatio = expected > 0 ? Math.min(1.5, recorded / expected) : 0;

        return {

          departmentId: aggregate.departmentId,

          departmentName: aggregate.departmentName,

          totalOvertimeHours,

          averageOvertimeHours,

          overtimeCostEstimate: Number.isFinite(overtimeCostEstimate) ? Number(overtimeCostEstimate.toFixed(2)) : 0,

          coverageRatio: Number.isFinite(coverageRatio) ? Number(coverageRatio.toFixed(2)) : 0,

          scheduleCount: aggregate.scheduleCount,

        } satisfies DepartmentOvertimeMetric;

      })

      .sort((a, b) => b.totalOvertimeHours - a.totalOvertimeHours);

  }


  async getDepartmentLoanExposure(

    range: { startDate: string; endDate: string; departmentIds?: string[] },

  ): Promise<DepartmentLoanExposureMetric[]> {

    const { startDate, endDate, departmentIds } = range;

    const baseCondition = and(

      lte(loans.startDate, endDate),

      or(isNull(loans.endDate), gte(loans.endDate, startDate)),

    );

    const whereClause =

      departmentIds && departmentIds.length > 0

        ? and(baseCondition, inArray(employees.departmentId, departmentIds))

        : baseCondition;

    const activeCount = sql<string>`sum(case when ${loans.status} = 'active' then 1 else 0 end)`;

    const originalSum = sql<string>`coalesce(sum(${loans.amount}), 0)`;

    const outstandingSum = sql<string>`coalesce(sum(${loans.remainingAmount}), 0)`;

    const rows = await db

      .select({

        departmentId: employees.departmentId,

        departmentName: departments.name,

        active: activeCount,

        original: originalSum,

        outstanding: outstandingSum,

      })

      .from(loans)

      .innerJoin(employees, eq(loans.employeeId, employees.id))

      .leftJoin(departments, eq(employees.departmentId, departments.id))

      .where(whereClause)

      .groupBy(employees.departmentId, departments.name);

    if (rows.length === 0) {

      return [];

    }

    const overdueRows = await db

      .select({

        departmentId: employees.departmentId,

        overdueCount: sql<string>`sum(case when ${loanAmortizationSchedules.status} <> 'paid' and ${loanAmortizationSchedules.dueDate} <= ${endDate} and ${loanAmortizationSchedules.dueDate} >= ${startDate} then 1 else 0 end)`,

        overdueBalance: sql<string>`coalesce(sum(case when ${loanAmortizationSchedules.status} <> 'paid' and ${loanAmortizationSchedules.dueDate} <= ${endDate} and ${loanAmortizationSchedules.dueDate} >= ${startDate} then ${loanAmortizationSchedules.remainingBalance} else 0 end), 0)`,

      })

      .from(loanAmortizationSchedules)

      .innerJoin(loans, eq(loanAmortizationSchedules.loanId, loans.id))

      .innerJoin(employees, eq(loans.employeeId, employees.id))

      .leftJoin(departments, eq(employees.departmentId, departments.id))

      .where(whereClause)

      .groupBy(employees.departmentId);

    const overdueMap = new Map<string | null, { count: number; balance: number }>();

    overdueRows.forEach(row => {

      const key = row.departmentId ?? null;

      overdueMap.set(key, {

        count: Number(row.overdueCount ?? 0),

        balance: Number(row.overdueBalance ?? 0),

      });

    });

    return rows

      .map(row => {

        const key = row.departmentId ?? null;

        const overdue = overdueMap.get(key) ?? { count: 0, balance: 0 };

        return {

          departmentId: key,

          departmentName: row.departmentName ?? "Unassigned",

          activeLoans: Number(row.active ?? 0),

          totalOriginalAmount: Number(row.original ?? 0),

          totalOutstandingAmount: Number(row.outstanding ?? 0),

          overdueInstallments: overdue.count,

          overdueBalance: overdue.balance,

        } satisfies DepartmentLoanExposureMetric;

      })

      .sort((a, b) => b.totalOutstandingAmount - a.totalOutstandingAmount);

  }


  async getAttendanceForecast(

    range: { startDate: string; endDate: string; departmentIds?: string[] },

  ): Promise<AttendanceForecastMetric[]> {

    const aggregates = await this.getDepartmentScheduleAggregates(range);

    if (aggregates.length === 0) {

      return [];

    }

    const start = new Date(range.startDate);

    const end = new Date(range.endDate);

    const startMs = start.getTime();

    const endMs = end.getTime();

    const diffDays = Number.isFinite(startMs) && Number.isFinite(endMs)

      ? Math.max(1, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1)

      : 30;

    const nextStart = new Date(Number.isFinite(endMs) ? endMs + 24 * 60 * 60 * 1000 : Date.now());

    const nextEnd = new Date(nextStart.getTime() + diffDays * 24 * 60 * 60 * 1000 - 1);

    const toDateString = (date: Date) => date.toISOString().split("T")[0];

    return aggregates

      .map(aggregate => {

        const expected = Math.max(0, aggregate.expectedMinutes);

        const recorded = Math.max(0, aggregate.recordedMinutes);

        const storedOvertime = Math.max(0, aggregate.overtimeMinutes);

        const overtimeMinutes = Math.max(storedOvertime, recorded - expected);

        const absenceMinutes = Math.max(0, expected - recorded);

        const absenceRate = expected > 0 ? absenceMinutes / expected : 0;

        const overtimeRate = expected > 0 ? overtimeMinutes / expected : 0;

        const projectedAbsenceHours = (absenceRate * expected) / 60;

        const projectedOvertimeHours = (overtimeRate * expected) / 60;

        const confidenceBase = Math.max(1, aggregate.scheduleCount);

        const confidence = Math.min(1, confidenceBase / (diffDays * Math.max(1, aggregate.employeeCount)));

        return {

          departmentId: aggregate.departmentId,

          departmentName: aggregate.departmentName,

          forecastPeriodStart: toDateString(nextStart),

          forecastPeriodEnd: toDateString(nextEnd),

          projectedAbsenceHours: Number(projectedAbsenceHours.toFixed(2)),

          projectedOvertimeHours: Number(projectedOvertimeHours.toFixed(2)),

          confidence: Number(confidence.toFixed(2)),

          trailingAbsenceRate: Number(absenceRate.toFixed(3)),

          trailingOvertimeRate: Number(overtimeRate.toFixed(3)),

        } satisfies AttendanceForecastMetric;

      })

      .sort((a, b) => b.projectedAbsenceHours - a.projectedAbsenceHours);

  }



  async getLoanReportDetails({ startDate, endDate }: { startDate: string; endDate: string }): Promise<LoanReportDetail[]> {

    const loansWithEmployees = await db.query.loans.findMany({

      with: { employee: true },

      orderBy: desc(loans.createdAt),

    });



    if (loansWithEmployees.length === 0) {

      return [];

    }



    const loanIds = loansWithEmployees.map(loan => loan.id);

    const employeeIds = loansWithEmployees.map(loan => loan.employeeId);

    const start = new Date(startDate);

    const end = new Date(endDate);



    const paymentRows = loanIds.length

      ? await db

          .select({

            loanId: loanPayments.loanId,

            amount: loanPayments.amount,

            appliedDate: loanPayments.appliedDate,

            payrollDate: payrollRuns.startDate,

          })

          .from(loanPayments)

          .leftJoin(payrollRuns, eq(loanPayments.payrollRunId, payrollRuns.id))

          .where(inArray(loanPayments.loanId, loanIds))

      : [];



    const totalPaid = new Map<string, number>();

    const inRangePaid = new Map<string, number>();



    for (const row of paymentRows) {

      if (!row.loanId) continue;

      const amount = Number(row.amount ?? 0);

      if (!Number.isFinite(amount)) continue;



      totalPaid.set(row.loanId, (totalPaid.get(row.loanId) ?? 0) + amount);



      const rawDate = (row.appliedDate ?? row.payrollDate) as string | null;

      if (!rawDate) continue;



      const paymentDate = new Date(rawDate);

      if (Number.isNaN(paymentDate.getTime())) continue;



      if (paymentDate >= start && paymentDate <= end) {

        inRangePaid.set(row.loanId, (inRangePaid.get(row.loanId) ?? 0) + amount);

      }

    }



    const pauseRows = employeeIds.length

      ? await db

          .select({

            employeeId: vacationRequests.employeeId,

            start: vacationRequests.startDate,

            end: vacationRequests.endDate,

            reason: vacationRequests.reason,

          })

          .from(vacationRequests)

          .where(

            and(

              inArray(vacationRequests.employeeId, employeeIds),

              eq(vacationRequests.status, "approved"),

              lte(vacationRequests.startDate, endDate),

              gte(vacationRequests.endDate, startDate),

            ),

          )

      : [];



    const pauseLookup = new Map<string, { note: string; paused: boolean }>();

    for (const row of pauseRows) {

      if (!row.employeeId) continue;

      const reason = String(row.reason ?? "");

      const wantsPause = reason.toLowerCase().includes("[pause-loans]");

      if (!wantsPause) continue;



      const startLabel = row.start ?? undefined;

      const endLabel = row.end ?? undefined;

      const note =

        startLabel && endLabel

          ? `Paused via approved vacation (${startLabel} – ${endLabel})`

          : "Paused via approved vacation";



      pauseLookup.set(row.employeeId, { note, paused: true });

    }



    return loansWithEmployees.map(loan => {

      const originalAmount = Number(loan.amount ?? 0);

      const remainingAmount = Number(loan.remainingAmount ?? 0);

      const totalRepaid = totalPaid.has(loan.id)

        ? totalPaid.get(loan.id) ?? 0

        : Math.max(0, originalAmount - remainingAmount);



      const deductionInRange = inRangePaid.get(loan.id) ?? 0;

      const pauseInfo = pauseLookup.get(loan.employeeId);



      return {

        loanId: loan.id,

        employeeId: loan.employeeId,

        employee: loan.employee || undefined,

        originalAmount,

        remainingAmount,

        status: loan.status,

        totalRepaid,

        deductionInRange,

        pausedByVacation: Boolean(pauseInfo?.paused),

        pauseNote: pauseInfo?.note ?? null,

        startDate: loan.startDate,

        endDate: loan.endDate,

      } satisfies LoanReportDetail;

    });

  }



  async getLoanBalances(): Promise<LoanBalance[]> {

    const rows = await db

      .select({ employeeId: loans.employeeId, remaining: loans.remainingAmount })

      .from(loans)

      .where(eq(loans.status, "active"));



    const grouped: Record<string, number> = {};

    rows.forEach(({ employeeId, remaining }) => {

      grouped[employeeId] = (grouped[employeeId] || 0) + Number(remaining);

    });

    return Object.entries(grouped).map(([employeeId, balance]) => ({

      employeeId,

      balance,

    }));

  }



  async getAssetUsageDetails({

    startDate,

    endDate,

  }: {

    startDate?: string;

    endDate?: string;

  }): Promise<AssetUsage[]> {

    const filters: SQL<unknown>[] = [];



    if (endDate) {

      filters.push(lte(assetAssignments.assignedDate, endDate));

    }



    if (startDate) {

      filters.push(

        sql`(${assetAssignments.returnDate} IS NULL OR ${assetAssignments.returnDate} >= ${startDate})`,

      );

    }



    const assignments = await db.query.assetAssignments.findMany({

      where: filters.length ? and(...filters) : undefined,

      with: {

        asset: true,

        employee: true,

      },

      orderBy: [asc(assetAssignments.assetId), asc(assetAssignments.assignedDate)],

    });



    const start = startDate ? new Date(startDate) : null;

    const end = endDate ? new Date(endDate) : null;



    const normalizeDate = (value?: string | Date | null) => {

      if (!value) return null;

      if (value instanceof Date) {

        return value.toISOString().split("T")[0];

      }

      return value;

    };



    const toDate = (value: string | Date) =>

      value instanceof Date ? value : new Date(value);



    return assignments

      .filter((assignment) => {

        const assigned = toDate(assignment.assignedDate);

        const returned = assignment.returnDate

          ? toDate(assignment.returnDate)

          : null;



        const startsBeforeEnd = !end || assigned <= end;

        const endsAfterStart = !start || !returned || returned >= start;



        return startsBeforeEnd && endsAfterStart;

      })

      .map((assignment) => {

        const asset = assignment.asset;

        const employee = assignment.employee;

        const assignedDate = normalizeDate(assignment.assignedDate) ?? "";

        const returnDate = normalizeDate(assignment.returnDate);

        const employeeName = [employee?.firstName, employee?.lastName]

          .filter(Boolean)

          .join(" ")

          .trim();



        return {

          assignmentId: assignment.id,

          assetId: assignment.assetId,

          assetName: asset?.name ?? assignment.assetId,

          assetType: asset?.type ?? "",

          assetStatus: asset?.status ?? "",

          assetDetails: asset?.details ?? null,

          employeeId: assignment.employeeId,

          employeeCode: employee?.employeeCode ?? null,

          employeeName:

            employeeName ||

            employee?.firstName ||

            employee?.lastName ||

            assignment.employeeId,

          assignedDate,

          returnDate,

          status: assignment.status,

          notes: assignment.notes ?? null,

        } satisfies AssetUsage;

      })

      .sort((a, b) => {

        const nameCompare = a.assetName.localeCompare(b.assetName);

        if (nameCompare !== 0) return nameCompare;



        const dateA = new Date(a.assignedDate);

        const dateB = new Date(b.assignedDate);

        return dateA.getTime() - dateB.getTime();

      });

  }



  async getFleetUsage({

    startDate,

    endDate,

  }: {

    startDate?: string;

    endDate?: string;

  }): Promise<FleetUsage[]> {

    const sanitizedStartDate = startDate?.trim() || undefined;

    const sanitizedEndDate = endDate?.trim() || undefined;

    const filters: SQL<unknown>[] = [];



    if (sanitizedEndDate) {

      filters.push(lte(carAssignments.assignedDate, sanitizedEndDate));

    }



    if (sanitizedStartDate) {

      filters.push(

        sql`(${carAssignments.returnDate} IS NULL OR ${carAssignments.returnDate} >= ${sanitizedStartDate})`,

      );

    }



    const assignments = await db.query.carAssignments.findMany({

      where: filters.length ? and(...filters) : undefined,

      with: {

        car: true,

        employee: true,

      },

      orderBy: [asc(carAssignments.carId), asc(carAssignments.assignedDate)],

    });



    const start = sanitizedStartDate ? new Date(sanitizedStartDate) : null;

    const end = sanitizedEndDate ? new Date(sanitizedEndDate) : null;



    const normalizeDate = (value?: string | Date | null) => {

      if (!value) return null;

      if (value instanceof Date) {

        return value.toISOString().split("T")[0];

      }

      return value;

    };



    const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value));



    return assignments

      .filter((assignment) => {

        const assigned = toDate(assignment.assignedDate);

        const returned = assignment.returnDate ? toDate(assignment.returnDate) : null;



        const startsBeforeEnd = !end || assigned <= end;

        const endsAfterStart = !start || !returned || returned >= start;



        return startsBeforeEnd && endsAfterStart;

      })

      .map((assignment) => {

        const car = assignment.car;

        const employee = assignment.employee;

        const assignedDate = normalizeDate(assignment.assignedDate) ?? "";

        const returnDate = normalizeDate(assignment.returnDate);

        const vehicleParts = [car?.make, car?.model, car?.year ? String(car.year) : null].filter(Boolean);

        const vehicleName = vehicleParts.join(" ") || car?.plateNumber || assignment.carId;

        const employeeName = [employee?.firstName, employee?.lastName]

          .filter(Boolean)

          .join(" ")

          .trim();



        return {

          assignmentId: assignment.id,

          carId: assignment.carId,

          vehicle: vehicleName,

          plateNumber: car?.plateNumber ?? "",

          vin: car?.vin ?? null,

          serial: car?.serial ?? null,

          employeeId: assignment.employeeId,

          employeeCode: employee?.employeeCode ?? null,

          employeeName:

            employeeName || employee?.firstName || employee?.lastName || assignment.employeeId,

          assignedDate,

          returnDate,

          status: assignment.status,

          notes: assignment.notes ?? null,

        } satisfies FleetUsage;

      })

      .sort((a, b) => {

        const nameCompare = a.vehicle.localeCompare(b.vehicle);

        if (nameCompare !== 0) return nameCompare;



        const dateA = new Date(a.assignedDate);

        const dateB = new Date(b.assignedDate);

        return dateA.getTime() - dateB.getTime();

      });

  }



  // Document expiry check methods

  async checkDocumentExpiries(): Promise<DocumentExpiryCheck[]> {
    const employeeRows = await db
      .select({
        employee: employees,
        company: companies,
      })
      .from(employees)
      .leftJoin(companies, eq(employees.companyId, companies.id));

    const checks: DocumentExpiryCheck[] = [];
    const processedCompanyIds = new Set<string>();

    for (const row of employeeRows) {
      const employee = row.employee;
      const company = row.company ?? null;

      const fullName = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim();

      const check: DocumentExpiryCheck = {
        employeeId: employee.id,
        employeeName:
          fullName || employee.firstName || employee.lastName || employee.employeeCode || employee.id,
        email: employee.email ?? null,
        companyId: company?.id ?? null,
        companyName: company?.name ?? null,
      };

      if (employee.visaExpiryDate && employee.visaNumber) {
        const daysUntilExpiry = this.calculateDaysUntilExpiry(employee.visaExpiryDate);
        check.visa = {
          number: employee.visaNumber,
          expiryDate: employee.visaExpiryDate,
          alertDays: employee.visaAlertDays || 30,
          daysUntilExpiry,
        };
      }

      if (employee.civilIdExpiryDate && employee.civilId) {
        const daysUntilExpiry = this.calculateDaysUntilExpiry(employee.civilIdExpiryDate);
        check.civilId = {
          number: employee.civilId,
          expiryDate: employee.civilIdExpiryDate,
          alertDays: employee.civilIdAlertDays || 60,
          daysUntilExpiry,
        };
      }

      if (employee.passportExpiryDate && employee.passportNumber) {
        const daysUntilExpiry = this.calculateDaysUntilExpiry(employee.passportExpiryDate);
        check.passport = {
          number: employee.passportNumber,
          expiryDate: employee.passportExpiryDate,
          alertDays: employee.passportAlertDays || 90,
          daysUntilExpiry,
        };
      }

      if (employee.drivingLicenseExpiryDate && employee.drivingLicenseNumber) {
        const daysUntilExpiry = this.calculateDaysUntilExpiry(employee.drivingLicenseExpiryDate);
        check.drivingLicense = {
          number: employee.drivingLicenseNumber,
          expiryDate: employee.drivingLicenseExpiryDate,
          alertDays: employee.drivingLicenseAlertDays || 30,
          daysUntilExpiry,
        };
      }

      if (check.visa || check.civilId || check.passport || check.drivingLicense) {
        checks.push(check);
      }

      if (
        company &&
        company.companyLicenseExpiryDate &&
        company.companyLicenseNumber &&
        !processedCompanyIds.has(company.id)
      ) {
        const daysUntilExpiry = this.calculateDaysUntilExpiry(company.companyLicenseExpiryDate);
        checks.push({
          employeeId: null,
          employeeName: company.name,
          email: company.email ?? null,
          companyId: company.id,
          companyName: company.name,
          companyLicense: {
            number: company.companyLicenseNumber,
            expiryDate: company.companyLicenseExpiryDate,
            alertDays: company.companyLicenseAlertDays || 60,
            daysUntilExpiry,
          },
        });
        processedCompanyIds.add(company.id);
      }
    }

    return checks;
  }

  async checkFleetExpiries(): Promise<FleetExpiryCheck[]> {
    const carsWithAssignments = await this.getCars();
    const checks: FleetExpiryCheck[] = carsWithAssignments.map((car) => {
      const registrationExpiry = car.registrationExpiry ?? null;
      const daysUntilExpiry = registrationExpiry
        ? this.calculateDaysUntilExpiry(registrationExpiry)
        : null;
      const assignedEmployee = car.currentAssignment?.employee
        ? `${car.currentAssignment.employee.firstName ?? ""} ${car.currentAssignment.employee.lastName ?? ""}`.trim()
        : null;
      return {
        carId: car.id,
        make: car.make,
        model: car.model,
        year: car.year ?? null,
        plateNumber: car.plateNumber,
        registrationExpiry,
        daysUntilRegistrationExpiry: daysUntilExpiry,
        status: car.status,
        assignedEmployeeName: assignedEmployee || null,
        registrationOwner: car.registrationOwner ?? null,
      };
    });

    return checks.sort((a, b) => {
      const aDays = a.daysUntilRegistrationExpiry;
      const bDays = b.daysUntilRegistrationExpiry;
      if (aDays === null && bDays === null) {
        return a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || a.plateNumber.localeCompare(b.plateNumber);
      }
      if (aDays === null) return 1;
      if (bDays === null) return -1;
      if (aDays === bDays) {
        return a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || a.plateNumber.localeCompare(b.plateNumber);
      }
      return aDays - bDays;
    });
  }



  private calculateDaysUntilExpiry(expiryDate: string): number {

    const today = new Date();

    const expiry = new Date(expiryDate);

    const diffTime = expiry.getTime() - today.getTime();

    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;

  }

}

export const storage = new DatabaseStorage();

