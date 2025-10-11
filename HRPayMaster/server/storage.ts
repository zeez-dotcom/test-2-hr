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
import { db } from "./db";
import { normalizeAllowanceTitle } from "./utils/payroll";

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
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
  type Loan,
  type InsertLoan,
  type LoanWithEmployee,
  type LoanPayment,
  type InsertLoanPayment,
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
  type EmailAlert,
  type InsertEmailAlert,
  type EmployeeEvent,
  type InsertEmployeeEvent,
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
  type SickLeaveTracking,
  type InsertSickLeaveTracking,
  type EmployeeWorkflow,
  type InsertEmployeeWorkflow,
  type EmployeeWorkflowStep,
  type InsertEmployeeWorkflowStep,
  type EmployeeWorkflowWithSteps,
  departments,
  companies,
  employees,
  employeeCustomFields,
  employeeCustomValues,
  employeeWorkflows,
  employeeWorkflowSteps,
  payrollRuns,
  payrollEntries,
  vacationRequests,
  loans,
  loanPayments,
  assets,
  assetAssignments,
  assetDocuments,
  assetRepairs,
  cars,
  carAssignments,
  notifications,
  emailAlerts,
  employeeEvents,
  carRepairs,
  attendance,
  shiftTemplates,
  employeeSchedules,
  users,
  allowanceTypes,
  sickLeaveTracking,
} from "@shared/schema";

export const DEFAULT_OVERTIME_LIMIT_MINUTES = 120;

const MINUTES_PER_DAY = 24 * 60;

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

export interface IStorage {
  // User methods
  getUserById(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: typeof users.$inferInsert): Promise<User>;
  updateUser(id: string, user: Partial<typeof users.$inferInsert>): Promise<User | undefined>;
  countActiveAdmins(excludeId?: string): Promise<number>;
  getFirstActiveAdmin(): Promise<User | undefined>;

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
  getGenericDocuments(): Promise<import("@shared/schema").GenericDocument[]>;
  createGenericDocument(doc: import("@shared/schema").InsertGenericDocument): Promise<import("@shared/schema").GenericDocument>;
  updateGenericDocument(id: string, doc: Partial<import("@shared/schema").InsertGenericDocument>): Promise<import("@shared/schema").GenericDocument | undefined>;
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
}

export class DatabaseStorage implements IStorage {

  private hasRecurringEmployeeEventsColumns: boolean | undefined;

  private loggedMissingRecurringEventColumns = false;

  async getUserById(id: string): Promise<User | undefined> {

    const [row] = await db.select().from(users).where(eq(users.id, id));

    return row || undefined;

  }



  async getUsers(): Promise<User[]> {

    const rows = await db.select().from(users).orderBy(asc(users.username));

    return rows;

  }



  async getUserByUsername(username: string): Promise<User | undefined> {

    const [row] = await db.select().from(users).where(eq(users.username, username));

    return row || undefined;

  }



  async createUser(user: typeof users.$inferInsert): Promise<User> {

    const [created] = await db.insert(users).values(user).returning();

    return created;



  }

  async updateUser(id: string, user: Partial<typeof users.$inferInsert>): Promise<User | undefined> {

    const [updated] = await db.update(users).set(user).where(eq(users.id, id)).returning();

    return updated || undefined;

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



  async getFirstActiveAdmin(): Promise<User | undefined> {

    const [row] = await db

      .select()

      .from(users)

      .where(and(eq(users.role, "admin"), eq(users.active, true)))

      .limit(1);

    return row || undefined;

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

  async getGenericDocuments(): Promise<import("@shared/schema").GenericDocument[]> {

    return await db.select().from((await import("@shared/schema")).genericDocuments);

  }

  async createGenericDocument(doc: import("@shared/schema").InsertGenericDocument): Promise<import("@shared/schema").GenericDocument> {

    const { genericDocuments } = await import("@shared/schema");

    const [row] = await db.insert(genericDocuments).values(doc).returning();

    return row;

  }

  async updateGenericDocument(id: string, doc: Partial<import("@shared/schema").InsertGenericDocument>): Promise<import("@shared/schema").GenericDocument | undefined> {

    const { genericDocuments } = await import("@shared/schema");

    const [row] = await db.update(genericDocuments).set(doc).where(eq(genericDocuments.id, id)).returning();

    return row || undefined;

  }

  async deleteGenericDocument(id: string): Promise<boolean> {

    const { genericDocuments } = await import("@shared/schema");

    const result = await db.delete(genericDocuments).where(eq(genericDocuments.id, id));

    return (result.rowCount ?? 0) > 0;

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

    const [newCompany] = await db.insert(companies).values(company).returning();

    return newCompany;

  }



  async updateCompany(id: string, company: Partial<InsertCompany>): Promise<Company | undefined> {

    const [updated] = await db

      .update(companies)

      .set(company)

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



    const normalizedEntries = entries.map((entry) => ({

      ...entry,

      employee: entry.employee ?? undefined,

    }));



    let allowanceMetadata: {
      breakdownByEmployee: Map<string, AllowanceBreakdown>;
      allowanceKeys: string[];
    };

    try {

      allowanceMetadata = await this.buildAllowanceBreakdownForRun(

        normalizedEntries,

        run.startDate,

        run.endDate,

      );

    } catch (error) {

      if (this.isDataSourceUnavailableError(error)) {

        console.warn(

          "Failed to load allowance metadata due to missing data source:",

          error,

        );

        allowanceMetadata = { allowanceKeys: [], breakdownByEmployee: new Map() };

      } else {

        throw error;

      }

    }



    const { breakdownByEmployee, allowanceKeys } = allowanceMetadata;



    const entriesWithAllowances = normalizedEntries.map((entry) => {

      const allowances = breakdownByEmployee.get(entry.employeeId);

      if (!allowances || Object.keys(allowances).length === 0) {

        return { ...entry, allowances: undefined };

      }

      return { ...entry, allowances: { ...allowances } };

    });



    return {

      ...run,

      entries: entriesWithAllowances,

      allowanceKeys,

    };

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

      },

      where,

      orderBy: desc(vacationRequests.createdAt),

    });

    return requests.map(req => ({

      ...req,

      employee: req.employee || undefined,

      approver: req.approver || undefined,

    }));

  }



  async getVacationRequest(id: string): Promise<VacationRequestWithEmployee | undefined> {

    const vacationRequest = await db.query.vacationRequests.findFirst({

      where: eq(vacationRequests.id, id),

      with: {

        employee: true,

        approver: true,

      },

    });

    if (!vacationRequest) return undefined;

    return {

      ...vacationRequest,

      employee: vacationRequest.employee || undefined,

      approver: vacationRequest.approver || undefined,

    };

  }



  async createVacationRequest(vacationRequest: InsertVacationRequest): Promise<VacationRequest> {

    const [newVacationRequest] = await db

      .insert(vacationRequests)

      .values({

        ...vacationRequest,

        status: vacationRequest.status || "pending",

      })

      .returning();

    return newVacationRequest;

  }



  async updateVacationRequest(id: string, vacationRequest: Partial<InsertVacationRequest>): Promise<VacationRequest | undefined> {

    const [updated] = await db

      .update(vacationRequests)

      .set({

        ...vacationRequest,

        updatedAt: new Date(),

      })

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



    const loanList = await db.query.loans.findMany({

      with: {

        employee: true,

        approver: true,

      },

      where,

      orderBy: desc(loans.createdAt),

    });

    return loanList.map(loan => ({

      ...loan,

      employee: loan.employee || undefined,

      approver: loan.approver || undefined,

    }));

  }



  async getLoan(id: string): Promise<LoanWithEmployee | undefined> {

    const loan = await db.query.loans.findFirst({

      where: eq(loans.id, id),

      with: {

        employee: true,

        approver: true,

      },

    });

    if (!loan) return undefined;

    return {

      ...loan,

      employee: loan.employee || undefined,

      approver: loan.approver || undefined,

    };

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

    const [updated] = await db

      .update(cars)

      .set({

        ...car,

        purchasePrice: car.purchasePrice?.toString(),

      })

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

      },

      orderBy: desc(notifications.createdAt),

    });

  }



  async getUnreadNotifications(): Promise<NotificationWithEmployee[]> {

    return await db.query.notifications.findMany({

      where: eq(notifications.status, 'unread'),

      with: {

        employee: true,

      },

      orderBy: desc(notifications.createdAt),

    });

  }



  async createNotification(notification: InsertNotification): Promise<Notification> {

    // Deduplicate by employeeId+type+title+expiryDate

    const existing = await db.query.notifications.findFirst({

      where: (n, { and, eq }) => and(

        eq(n.employeeId, notification.employeeId),

        eq(n.type, notification.type),

        eq(n.title, notification.title),

        eq(n.expiryDate, notification.expiryDate as any)

      ),

    });

    if (existing) return existing;

    const [newNotification] = await db

      .insert(notifications)

      .values({

        ...notification,

        status: notification.status || "unread",

        priority: notification.priority || "medium",

        emailSent: notification.emailSent || false,

      })

      .returning();

    return newNotification;

  }



  async updateNotification(id: string, notification: Partial<InsertNotification>): Promise<Notification | undefined> {

    const [updated] = await db

      .update(notifications)

      .set(notification)

      .where(eq(notifications.id, id))

      .returning();

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

    const allowanceBreakdownByRun = new Map<string, Map<string, AllowanceBreakdown>>();

    for (const [runId, { start, end, entries }] of entriesByRun.entries()) {
      const employeeIds = Array.from(
        new Set(
          entries
            .map((entry) => entry.employeeId)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      if (!start || employeeIds.length === 0) {
        allowanceBreakdownByRun.set(runId, new Map());
        continue;
      }

      const allowanceEnd = end ?? start;

      try {
        const { breakdownByEmployee } = await this.buildAllowanceBreakdownForRun(
          employeeIds.map((id) => ({ employeeId: id })),
          start,
          allowanceEnd,
        );
        allowanceBreakdownByRun.set(runId, breakdownByEmployee);
      } catch (error) {
        if (this.isDataSourceUnavailableError(error)) {
          console.warn(
            "Failed to load allowance metadata due to missing data source:",
            error,
          );
          allowanceBreakdownByRun.set(runId, new Map());
        } else {
          throw error;
        }
      }
    }

    payrollRows.forEach(({ period, entry, runId }) => {
      const employeeEntryId = entry.employeeId;
      const breakdownForRun = runId ? allowanceBreakdownByRun.get(runId) : undefined;
      const allowances =
        employeeEntryId && breakdownForRun
          ? breakdownForRun.get(employeeEntryId)
          : undefined;

      const normalizedEntry: PayrollEntry =
        allowances && Object.keys(allowances).length > 0
          ? { ...entry, allowances: { ...allowances } }
          : { ...entry, allowances: undefined };

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

      })

      .from(payrollEntries)

      .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))

      .where(and(gte(payrollRuns.startDate, startDate), lte(payrollRuns.startDate, endDate)));



    const grouped: Record<string, PayrollSummaryPeriod> = {};

    rows.forEach(({ period, entry }) => {

      if (!grouped[period]) {

        grouped[period] = { period, payrollEntries: [] };

      }

      grouped[period].payrollEntries.push(entry);

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

    const allEmployees = await db.select().from(employees);

    const checks: DocumentExpiryCheck[] = [];



    allEmployees.forEach(employee => {

      const check: DocumentExpiryCheck = {

        employeeId: employee.id,

        employeeName: `${employee.firstName} ${employee.lastName}`,

        email: employee.email,

      };



      // Check visa expiry

      if (employee.visaExpiryDate && employee.visaNumber) {

        const daysUntilExpiry = this.calculateDaysUntilExpiry(employee.visaExpiryDate);

        check.visa = {

          number: employee.visaNumber,

          expiryDate: employee.visaExpiryDate,

          alertDays: employee.visaAlertDays || 30,

          daysUntilExpiry,

        };

      }



      // Check civil ID expiry

      if (employee.civilIdExpiryDate && employee.civilId) {

        const daysUntilExpiry = this.calculateDaysUntilExpiry(employee.civilIdExpiryDate);

        check.civilId = {

          number: employee.civilId,

          expiryDate: employee.civilIdExpiryDate,

          alertDays: employee.civilIdAlertDays || 60,

          daysUntilExpiry,

        };

      }



      // Check passport expiry

      if (employee.passportExpiryDate && employee.passportNumber) {

        const daysUntilExpiry = this.calculateDaysUntilExpiry(employee.passportExpiryDate);

        check.passport = {

          number: employee.passportNumber,

          expiryDate: employee.passportExpiryDate,

          alertDays: employee.passportAlertDays || 90,

          daysUntilExpiry,

        };

      }



      // Only add if employee has at least one document to track

      if (check.visa || check.civilId || check.passport || (check as any).drivingLicense) {

        checks.push(check);

      }

    });



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

