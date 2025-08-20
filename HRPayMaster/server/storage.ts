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
  type Asset,
  type InsertAsset,
  type AssetWithAssignment,
  type AssetAssignment,
  type InsertAssetAssignment,
  type AssetAssignmentWithDetails,
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
  type EmployeeCustomField,
  type InsertEmployeeCustomField,
  type EmployeeCustomValue,
  type InsertEmployeeCustomValue,
  type Company,
  type InsertCompany,
  departments,
  companies,
  employees,
  employeeCustomFields,
  employeeCustomValues,
  payrollRuns,
  payrollEntries,
  vacationRequests,
  loans,
  assets,
  assetAssignments,
  cars,
  carAssignments,
  notifications,
  emailAlerts,
  employeeEvents
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

export class DuplicateEmployeeCodeError extends Error {
  constructor(code: string) {
    super(`Employee code ${code} already exists`);
    this.name = "DuplicateEmployeeCodeError";
  }
}

export interface EmployeeReportPeriod {
  period: string;
  payrollEntries: PayrollEntry[];
  employeeEvents: EmployeeEvent[];
  loans: Loan[];
  vacationRequests: VacationRequest[];
}

export interface IStorage {
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

  // Employee methods
  getEmployees(): Promise<EmployeeWithDepartment[]>;
  getEmployee(id: string): Promise<EmployeeWithDepartment | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  createEmployeesBulk(
    employees: InsertEmployee[]
  ): Promise<{ success: number; failed: number; employees?: Employee[] }>;
  updateEmployee(
    id: string,
    employee: Partial<Omit<InsertEmployee, "employeeCode">>
  ): Promise<Employee | undefined>;
  deleteEmployee(id: string): Promise<boolean>;

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

  // Vacation request methods
  getVacationRequests(): Promise<VacationRequestWithEmployee[]>;
  getVacationRequest(id: string): Promise<VacationRequestWithEmployee | undefined>;
  createVacationRequest(vacationRequest: InsertVacationRequest): Promise<VacationRequest>;
  updateVacationRequest(id: string, vacationRequest: Partial<InsertVacationRequest>): Promise<VacationRequest | undefined>;
  deleteVacationRequest(id: string): Promise<boolean>;

  // Loan methods
  getLoans(): Promise<LoanWithEmployee[]>;
  getLoan(id: string): Promise<LoanWithEmployee | undefined>;
  createLoan(loan: InsertLoan): Promise<Loan>;
  updateLoan(id: string, loan: Partial<InsertLoan>): Promise<Loan | undefined>;
  deleteLoan(id: string): Promise<boolean>;

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

  // Car assignment methods
  getCarAssignments(): Promise<CarAssignmentWithDetails[]>;
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
  getEmployeeEvents(): Promise<(EmployeeEvent & { employee: Employee })[]>;
  getEmployeeEvent(id: string): Promise<EmployeeEvent | undefined>;
  createEmployeeEvent(event: InsertEmployeeEvent): Promise<EmployeeEvent>;
  updateEmployeeEvent(id: string, event: Partial<InsertEmployeeEvent>): Promise<EmployeeEvent | undefined>;
  deleteEmployeeEvent(id: string): Promise<boolean>;

  // Reports
  getEmployeeReport(
    employeeId: string,
    range: { startDate: string; endDate: string; groupBy: "month" | "year" }
  ): Promise<EmployeeReportPeriod[]>;

  // Document expiry check methods
  checkDocumentExpiries(): Promise<DocumentExpiryCheck[]>;
}

export class DatabaseStorage implements IStorage {
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

  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company || undefined;
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

  // Employee methods
  async getEmployees(): Promise<EmployeeWithDepartment[]> {
    const employees = await db.query.employees.findMany({
      with: {
        department: true,
      },
    });
    return employees.map(emp => ({
      ...emp,
      department: emp.department || undefined,
    }));
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
      const [newEmployee] = await db
        .insert(employees)
        .values({
          ...employee,
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

          const [created] = await tx
            .insert(employees)
            .values({
              ...emp,
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
    const [updated] = await db
      .update(employees)
      .set(employee)
      .where(eq(employees.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteEmployee(id: string): Promise<boolean> {
    const result = await db.delete(employees).where(eq(employees.id, id));
    return (result.rowCount ?? 0) > 0;
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
      }
    })
    .from(payrollEntries)
    .leftJoin(employees, eq(payrollEntries.employeeId, employees.id))
    .where(eq(payrollEntries.payrollRunId, id));
    
    return {
      ...payrollRun,
      entries
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
  async getVacationRequests(): Promise<VacationRequestWithEmployee[]> {
    const requests = await db.query.vacationRequests.findMany({
      with: {
        employee: true,
        approver: true,
      },
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
  async getLoans(): Promise<LoanWithEmployee[]> {
    const loanList = await db.query.loans.findMany({
      with: {
        employee: true,
        approver: true,
      },
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
        status: loan.status || "active",
        interestRate: loan.interestRate || "0",
      })
      .returning();
    return newLoan;
  }

  async updateLoan(id: string, loan: Partial<InsertLoan>): Promise<Loan | undefined> {
    const [updated] = await db
      .update(loans)
      .set(loan)
      .where(eq(loans.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteLoan(id: string): Promise<boolean> {
    const result = await db.delete(loans).where(eq(loans.id, id));
    return (result.rowCount ?? 0) > 0;
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
    const [newAssignment] = await db
      .insert(assetAssignments)
      .values({
        ...assignment,
        status: assignment.status || "active",
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
        serial: car.serial,
        company: car.company,
        registrationBookName: car.registrationBookName,
        notes: car.notes,
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
        serial: car.serial,
        company: car.company,
        registrationBookName: car.registrationBookName,
        notes: car.notes,
      })
      .where(eq(cars.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteCar(id: string): Promise<boolean> {
    const result = await db.delete(cars).where(eq(cars.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Car assignment methods
  async getCarAssignments(): Promise<CarAssignmentWithDetails[]> {
    const assignments = await db.query.carAssignments.findMany({
      with: {
        car: true,
        employee: true,
        assigner: true,
      },
      orderBy: desc(carAssignments.createdAt),
    });
    return assignments.map(assignment => ({
      ...assignment,
      car: assignment.car || undefined,
      employee: assignment.employee || undefined,
      assigner: assignment.assigner || undefined,
    }));
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
  async getEmployeeEvents(): Promise<(EmployeeEvent & { employee: Employee })[]> {
    const events = await db.query.employeeEvents.findMany({
      with: {
        employee: true,
      },
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

  async getEmployeeReport(
    employeeId: string,
    range: { startDate: string; endDate: string; groupBy: "month" | "year" }
  ): Promise<EmployeeReportPeriod[]> {
    const { startDate, endDate, groupBy } = range;
    const format = groupBy === "year" ? "YYYY" : "YYYY-MM";

    const payrollRows = await db
      .select({
        period: sql<string>`to_char(${payrollRuns.startDate}, '${format}')`,
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
        period: sql<string>`to_char(${employeeEvents.eventDate}, '${format}')`,
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
        period: sql<string>`to_char(${loans.startDate}, '${format}')`,
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
        period: sql<string>`to_char(${vacationRequests.startDate}, '${format}')`,
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

    return Object.values(grouped);
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
      if (check.visa || check.civilId || check.passport) {
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
