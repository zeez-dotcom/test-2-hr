import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  ne,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { db } from "./db";
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
  type VacationRequest,
  type InsertVacationRequest,
  type VacationRequestWithEmployee,
  type Loan,
  type InsertLoan,
  type LoanWithEmployee,
  loanPayments,
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
  type CarRepair,
  type InsertCarRepair,
  type EmployeeCustomField,
  type InsertEmployeeCustomField,
  type EmployeeCustomValue,
  type InsertEmployeeCustomValue,
  type Company,
  type InsertCompany,
  type Attendance,
  type InsertAttendance,
  type User,
  departments,
  companies,
  employees,
  employeeCustomFields,
  employeeCustomValues,
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
  users,
} from "@shared/schema";


export class DuplicateEmployeeCodeError extends Error {
  constructor(code: string) {
    super(`Employee code ${code} already exists`);
    this.name = "DuplicateEmployeeCodeError";
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
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
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
  createUser(user: typeof users.$inferInsert): Promise<User>;
  updateUser(id: string, user: Partial<typeof users.$inferInsert>): Promise<User | undefined>;

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

  // Payroll methods
  getPayrollRuns(): Promise<PayrollRun[]>;
  getPayrollRun(id: string): Promise<PayrollRunWithEntries | undefined>;
  createPayrollRun(payrollRun: InsertPayrollRun): Promise<PayrollRun>;
  updatePayrollRun(id: string, payrollRun: Partial<InsertPayrollRun>): Promise<PayrollRun | undefined>;
  deletePayrollRun(id: string): Promise<boolean>;

  // Payroll entry methods
  getPayrollEntries(payrollRunId: string): Promise<PayrollEntry[]>;
  createPayrollEntry(payrollEntry: InsertPayrollEntry): Promise<PayrollEntry>;
  updatePayrollEntry(id: string, payrollEntry: Partial<InsertPayrollEntry>): Promise<PayrollEntry | undefined>;
  getSickLeaveBalance(employeeId: string, year: number): Promise<any>;
  createSickLeaveBalance(data: any): Promise<any>;
  updateSickLeaveBalance(id: string, data: any): Promise<any>;

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

  // Attendance methods
  getAttendance(start?: Date, end?: Date): Promise<Attendance[]>;
  getAttendanceForEmployee(employeeId: string, start?: Date, end?: Date): Promise<Attendance[]>;
  createAttendance(record: InsertAttendance): Promise<Attendance>;
  updateAttendance(id: string, record: Partial<InsertAttendance>): Promise<Attendance | undefined>;
  deleteAttendance(id: string): Promise<boolean>;
  getAttendanceSummary(start: Date, end: Date): Promise<Record<string, number>>; // employeeId -> present days
}

export class DatabaseStorage implements IStorage {

  async getUserById(id: string): Promise<User | undefined> {

    const [row] = await db.select().from(users).where(eq(users.id, id));

    return row || undefined;

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




  private buildEmployeeOrder(
    sort?: EmployeeFilters["sort"],
    order: EmployeeFilters["order"] = "asc",
  ): (AnyColumn | SQL)[] {
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
      conditions.push(
        or(
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
        ),
      );
    }

    return conditions;
  }

  async getEmployees(filters: EmployeeFilters = {}): Promise<EmployeeWithDepartment[]> {
    const conditions = this.buildEmployeeConditions(filters);
    const whereCondition =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    let query = db
      .select({
        employee: employees,
        department: departments,
        company: companies,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(companies, eq(employees.companyId, companies.id));

    if (whereCondition) {
      query = query.where(whereCondition);
    }

    const orderByExpressions = this.buildEmployeeOrder(filters.sort, filters.order);
    if (orderByExpressions.length > 0) {
      query = query.orderBy(...orderByExpressions);
    }

    if (typeof filters.limit === "number") {
      query = query.limit(filters.limit);
    }

    if (typeof filters.offset === "number") {
      query = query.offset(filters.offset);
    }

    const rows = await query;

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

    let query = db
      .select({ count: sql<number>`count(*)` })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(companies, eq(employees.companyId, companies.id));

    if (whereCondition) {
      query = query.where(whereCondition);
    }

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

    const result = await db

      .delete(employeeCustomFields)

      .where(eq(employeeCustomFields.id, id));

    return (result.rowCount ?? 0) > 0;

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



  // Payroll methods

  async getPayrollRuns(): Promise<PayrollRun[]> {

    return await db.select().from(payrollRuns).orderBy(desc(payrollRuns.createdAt));

  }



  async getPayrollRun(id: string): Promise<PayrollRunWithEntries | undefined> {

    const [payrollRun] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id));

    

    if (!payrollRun) return undefined;



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

        firstName: employees.firstName,

        lastName: employees.lastName,

        salary: employees.salary,

      }

    })

    .from(payrollEntries)

    .leftJoin(employees, eq(payrollEntries.employeeId, employees.id))

    .where(eq(payrollEntries.payrollRunId, id));



    const normalizedEntries = entries.map((entry) => ({

      ...entry,

      employee: entry.employee ?? undefined,

    }));



    return {

      ...payrollRun,

      entries: normalizedEntries

    };

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



  async deletePayrollRun(id: string): Promise<boolean> {

    // Delete associated payroll entries first

    await db.delete(payrollEntries).where(eq(payrollEntries.payrollRunId, id));

    

    const result = await db.delete(payrollRuns).where(eq(payrollRuns.id, id));

    return (result.rowCount ?? 0) > 0;

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

  async getSickLeaveBalance(employeeId: string, year: number): Promise<any> {

    // This would need a sick leave balance table - for now return mock data

    return {

      employeeId,

      year,

      totalSickDaysUsed: 0,

      remainingSickDays: 14,

    };

  }



  async createSickLeaveBalance(data: any): Promise<any> {

    return data;

  }



  async updateSickLeaveBalance(id: string, data: any): Promise<any> {

    return data;

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

  ): Promise<(EmployeeEvent & { employee: Employee })[]> {

    const where =

      start && end

        ? and(

            gte(employeeEvents.eventDate, start.toISOString().split("T")[0]),

            lte(employeeEvents.eventDate, end.toISOString().split("T")[0]),

          )

        : undefined;



    const events = await db.query.employeeEvents.findMany({

      with: {

        employee: true,

      },

      where,

      orderBy: desc(employeeEvents.createdAt),

    });

    return events;

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

              gte(employeeEvents.eventDate, startDate),

              lte(employeeEvents.eventDate, endDate),

              eq(employeeEvents.affectsPayroll, true)

            )

          ),

      ]);



      return {

        payroll: payrollRows.map((r) => r.entry),

        loans: loansRows,

        events: eventRows,

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



    const eventRows = await db

      .select({

        period: periodExpr(employeeEvents.eventDate),

        event: employeeEvents,

      })

      .from(employeeEvents)

      .where(

        and(

          eq(employeeEvents.employeeId, employeeId),

          gte(employeeEvents.eventDate, startDate),

          lte(employeeEvents.eventDate, endDate),

          eq(employeeEvents.affectsPayroll, true)

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



    payrollRows.forEach(({ period, entry }) => {

      ensure(period).payrollEntries.push(entry);

    });

    eventRows.forEach(({ period, event }) => {

      ensure(period).employeeEvents.push(event);

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



  private calculateDaysUntilExpiry(expiryDate: string): number {

    const today = new Date();

    const expiry = new Date(expiryDate);

    const diffTime = expiry.getTime() - today.getTime();

    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;

  }

}



export const storage = new DatabaseStorage();

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

  private calculateDaysUntilExpiry(expiryDate: string): number {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
}

export const storage = new DatabaseStorage();
