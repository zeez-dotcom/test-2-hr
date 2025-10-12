/** @vitest-environment node */
import express from "express";
import request from "supertest";
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const {
  runStore,
  entryStore,
  vacationStore,
  findEntryMock,
  findRunMock,
  findVacationManyMock,
  transactionMock,
  selectMock,
  updateMock,
  deleteMock,
} = vi.hoisted(() => {
  return {
    runStore: [] as any[],
    entryStore: [] as any[],
    vacationStore: [] as any[],
    findEntryMock: vi.fn(),
    findRunMock: vi.fn(),
    findVacationManyMock: vi.fn(),
    transactionMock: vi.fn(),
    selectMock: vi.fn(),
    updateMock: vi.fn(),
    deleteMock: vi.fn(),
  };
});

vi.mock("../db", () => ({
  db: {
    query: {
      payrollEntries: {
        findFirst: findEntryMock,
      },
      payrollRuns: {
        findFirst: findRunMock,
      },
      vacationRequests: {
        findMany: findVacationManyMock,
      },
    },
    transaction: transactionMock,
    select: selectMock,
    update: updateMock,
    delete: deleteMock,
  },
}));

import { registerRoutes } from "../routes";
import { errorHandler } from "../errorHandler";
import { storage } from "../storage";
import {
  payrollEntries as payrollEntriesTable,
  payrollRuns as payrollRunsTable,
} from "@shared/schema";

const storageSpies = {
  createVacationRequest: vi.spyOn(storage, "createVacationRequest"),
  updateVacationRequest: vi.spyOn(storage, "updateVacationRequest"),
  updatePayrollEntry: vi.spyOn(storage, "updatePayrollEntry"),
  getVacationRequests: vi.spyOn(storage, "getVacationRequests"),
  getEmployees: vi.spyOn(storage, "getEmployees"),
  getLoans: vi.spyOn(storage, "getLoans"),
  getEmployeeEvents: vi.spyOn(storage, "getEmployeeEvents"),
  getCompanies: vi.spyOn(storage, "getCompanies"),
  getAttendanceSummary: vi.spyOn(storage, "getAttendanceSummary"),
  getScheduleSummary: vi.spyOn(storage, "getScheduleSummary"),
  getPayrollRun: vi.spyOn(storage, "getPayrollRun"),
};

describe("payroll vacation override endpoint", () => {
  let app: express.Express;

  beforeEach(async () => {
    runStore.length = 0;
    entryStore.length = 0;
    vacationStore.length = 0;

    findEntryMock.mockReset();
    findRunMock.mockReset();
    findVacationManyMock.mockReset();
    transactionMock.mockReset();
    selectMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();

    Object.values(storageSpies).forEach(spy => spy.mockReset());

    const baseRun = {
      id: "run-1",
      period: "Jan 2024",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      grossAmount: "0",
      totalDeductions: "0",
      netAmount: "0",
      status: "completed",
      scenarioToggles: {},
      exportArtifacts: [],
      calendarId: null,
      cycleLabel: null,
      scenarioKey: null,
      createdAt: new Date().toISOString(),
    } as any;

    const baseEntry = {
      id: "entry-1",
      payrollRunId: "run-1",
      employeeId: "emp-1",
      grossPay: "1000",
      baseSalary: "1000",
      bonusAmount: "0",
      workingDays: 30,
      actualWorkingDays: 30,
      vacationDays: 0,
      taxDeduction: "0",
      socialSecurityDeduction: "0",
      healthInsuranceDeduction: "0",
      loanDeduction: "0",
      otherDeductions: "0",
      netPay: "1000",
      adjustmentReason: null,
      allowances: null,
      createdAt: new Date().toISOString(),
    } as any;

    runStore.push(baseRun);
    entryStore.push({ ...baseEntry });

    findEntryMock.mockImplementation(async () => ({
      ...entryStore[0],
      payrollRun: baseRun,
    }));

    findRunMock.mockImplementation(async () => baseRun);
    findVacationManyMock.mockImplementation(async () => [...vacationStore]);

    storageSpies.createVacationRequest.mockImplementation(async data => {
      const request = {
        id: `vac-${vacationStore.length + 1}`,
        status: data.status ?? "approved",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        auditLog: data.auditLog ?? [],
        approvalChain: [],
        documentUrl: null,
        reason: data.reason ?? null,
        delegateApproverId: null,
        appliesPolicyId: null,
        approvedBy: null,
        currentApprovalStep: 0,
        autoPauseAllowances: false,
        ...data,
      } as any;
      vacationStore.push(request);
      return request;
    });

    storageSpies.updateVacationRequest.mockImplementation(async (id, updates) => {
      const request = vacationStore.find(vac => vac.id === id);
      if (!request) return undefined;
      Object.assign(request, updates, { updatedAt: new Date().toISOString() });
      return request;
    });

    storageSpies.updatePayrollEntry.mockImplementation(async (id, updates) => {
      const entry = entryStore.find(item => item.id === id);
      if (!entry) return undefined;
      Object.assign(entry, updates);
      return entry;
    });

    storageSpies.getVacationRequests.mockImplementation(async () => {
      return vacationStore.map(vacation => ({
        ...vacation,
        employee: { id: "emp-1" },
        approver: undefined,
        delegateApprover: undefined,
        policy: undefined,
      }));
    });

    storageSpies.getEmployees.mockResolvedValue([
      {
        id: "emp-1",
        firstName: "Ada",
        lastName: "Lovelace",
        salary: "1000",
        status: "active",
        standardWorkingDays: 30,
      } as any,
    ]);

    storageSpies.getLoans.mockResolvedValue([]);
    storageSpies.getEmployeeEvents.mockResolvedValue([]);
    storageSpies.getCompanies.mockResolvedValue([
      {
        id: "company-1",
        currencyCode: "KWD",
        locale: "en-KW",
        useAttendanceForDeductions: false,
      } as any,
    ]);
    storageSpies.getAttendanceSummary.mockResolvedValue({});
    storageSpies.getScheduleSummary.mockResolvedValue({});

    storageSpies.getPayrollRun.mockImplementation(async (id: string) => {
      if (id !== "run-1") return undefined;
      return {
        ...runStore[0],
        entries: entryStore
          .filter(entry => entry.payrollRunId === id)
          .map(entry => ({
            ...entry,
            employee: {
              id: "emp-1",
              firstName: "Ada",
              lastName: "Lovelace",
              salary: "1000",
            },
          })),
      } as any;
    });

    transactionMock.mockImplementation(async callback => {
      const tx = {
        insert: (table: unknown) => ({
          values: (values: any) => {
            if (table === payrollEntriesTable) {
              const records = (Array.isArray(values) ? values : [values]).map((value: any, index: number) => {
                const record = {
                  id: value.id ?? `entry-${index + 1}-${Date.now()}`,
                  createdAt: new Date().toISOString(),
                  ...value,
                };
                entryStore.push(record);
                return record;
              });
              return records;
            }
            if (table === payrollRunsTable) {
              runStore.push(values);
            }
            return [];
          },
        }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
        delete: (table: unknown) => ({
          where: (_predicate: unknown) => {
            if (table === payrollEntriesTable) {
              const remaining = entryStore.filter(entry => entry.payrollRunId !== "run-1");
              entryStore.splice(0, entryStore.length, ...remaining);
            }
          },
        }),
      };
      return callback(tx);
    });

    app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => true;
      (req as any).user = { id: "manager-1", role: "admin", permissions: ["payroll:manage"] };
      next();
    });
    await registerRoutes(app);
    app.use(errorHandler);
  });

  afterAll(() => {
    Object.values(storageSpies).forEach(spy => spy.mockRestore());
  });

  it("creates a vacation override and persists it through recalculation", async () => {
    const overridePayload = {
      startDate: "2024-01-10",
      endDate: "2024-01-12",
      leaveType: "annual",
      deductFromSalary: false,
    };

    const response = await request(app)
      .post("/api/payroll/entries/entry-1/vacation")
      .send(overridePayload)
      .expect(200);

    expect(response.body.vacationRequest).toBeTruthy();
    expect(response.body.vacationRequest.days).toBe(3);
    expect(vacationStore).toHaveLength(1);
    const storedRequest = vacationStore[0];
    expect(storedRequest.status).toBe("approved");
    expect(storedRequest.startDate).toBe("2024-01-10");
    expect(entryStore[0].vacationDays).toBe(3);
    expect(entryStore[0].adjustmentReason).toContain("annual leave");

    const auditMetadata = Array.isArray(storedRequest.auditLog)
      ? (storedRequest.auditLog as any[])
      : [];
    expect(
      auditMetadata.some(entry => entry.metadata?.payrollEntryId === "entry-1"),
    ).toBe(true);

    const recalcResponse = await request(app)
      .post("/api/payroll/run-1/recalculate")
      .send({})
      .expect(200);

    expect(recalcResponse.body?.entries?.[0]?.vacationDays).toBe(3);
    expect(storageSpies.getVacationRequests).toHaveBeenCalled();
  });
});
