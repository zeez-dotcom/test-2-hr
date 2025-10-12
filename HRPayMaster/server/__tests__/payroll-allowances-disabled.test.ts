/** @vitest-environment node */
import express from "express";
import request from "supertest";
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const {
  insertedRuns,
  insertedEntries,
  selectMock,
  transactionMock,
  updateMock,
  deleteMock,
  findFirstMock,
  employeesById,
} = vi.hoisted(() => {
  const insertedRuns: any[] = [];
  const insertedEntries: any[] = [];
  return {
    insertedRuns,
    insertedEntries,
    selectMock: vi.fn(),
    transactionMock: vi.fn(),
    updateMock: vi.fn(),
    deleteMock: vi.fn(),
    findFirstMock: vi.fn(),
    employeesById: new Map<string, any>(),
  };
});

vi.mock("../db", () => ({
  db: {
    select: selectMock,
    transaction: transactionMock,
    update: updateMock,
    delete: deleteMock,
    query: {
      payrollRuns: {
        findFirst: findFirstMock,
      },
    },
  },
}));

import { registerRoutes } from "../routes";
import { errorHandler } from "../errorHandler";
import { storage } from "../storage";
import {
  payrollRuns,
  payrollEntries as payrollEntriesTable,
} from "@shared/schema";

const storageSpies = {
  getEmployees: vi.spyOn(storage, "getEmployees"),
  getLoans: vi.spyOn(storage, "getLoans"),
  getVacationRequests: vi.spyOn(storage, "getVacationRequests"),
  getEmployeeEvents: vi.spyOn(storage, "getEmployeeEvents"),
  getCompanies: vi.spyOn(storage, "getCompanies"),
  getAttendanceSummary: vi.spyOn(storage, "getAttendanceSummary"),
  getScheduleSummary: vi.spyOn(storage, "getScheduleSummary"),
  createNotification: vi.spyOn(storage, "createNotification"),
};

describe("payroll generation with allowances disabled", () => {
  let app: express.Express;

  beforeEach(async () => {
    insertedRuns.length = 0;
    insertedEntries.length = 0;
    employeesById.clear();

    selectMock.mockReset();
    transactionMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
    findFirstMock.mockReset();

    transactionMock.mockImplementation(async (callback) => {
      const tx = {
        insert: (table: unknown) => ({
          values: (values: any) => {
            if (table === payrollRuns) {
              const records = (Array.isArray(values) ? values : [values]).map(
                (value: any, index: number) => {
                  const id = value.id ?? `run-${insertedRuns.length + index + 1}`;
                  const record = {
                    ...value,
                    id,
                    createdAt: value.createdAt ?? new Date().toISOString(),
                    updatedAt: value.updatedAt ?? new Date().toISOString(),
                  };
                  insertedRuns.push(record);
                  return record;
                },
              );
              return {
                returning: async () => records,
              };
            }

            if (table === payrollEntriesTable) {
              const records = (Array.isArray(values) ? values : [values]).map(
                (value: any, index: number) => {
                  const record = {
                    id: value.id ?? `entry-${insertedEntries.length + index + 1}`,
                    createdAt: value.createdAt ?? new Date().toISOString(),
                    ...value,
                  };
                  insertedEntries.push(record);
                  return record;
                },
              );
              return Promise.resolve(records);
            }

            return Promise.resolve([]);
          },
        }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
        delete: vi.fn().mockReturnValue({ where: vi.fn() }),
      };
      return callback(tx);
    });

    selectMock.mockImplementation(() => ({
      from: () => ({ where: async () => [] }),
    }));

    findFirstMock.mockResolvedValue(undefined);

    Object.values(storageSpies).forEach(spy => spy.mockReset());

    app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => true;
      (req as any).user = { role: "admin", permissions: ["payroll:manage"] };
      next();
    });
    await registerRoutes(app);
    app.use(errorHandler);
  });

  afterAll(() => {
    Object.values(storageSpies).forEach(spy => spy.mockRestore());
  });

  it("stores and returns empty allowance data when allowances are disabled", async () => {
    storageSpies.getEmployees.mockResolvedValue([
      {
        id: "emp-1",
        employeeCode: "E-1",
        firstName: "Ada",
        lastName: "Lovelace",
        position: "Engineer",
        salary: "3000",
        status: "active",
        standardWorkingDays: 30,
      } as any,
    ]);
    employeesById.set("emp-1", {
      id: "emp-1",
      employeeCode: "E-1",
      firstName: "Ada",
      lastName: "Lovelace",
      arabicName: null,
      nickname: null,
      salary: "3000",
    });

    storageSpies.getLoans.mockResolvedValue([] as any);
    storageSpies.getVacationRequests.mockResolvedValue([] as any);
    storageSpies.getEmployeeEvents.mockResolvedValue([
      {
        id: "evt-allowance",
        employeeId: "emp-1",
        eventType: "allowance",
        amount: "150",
        eventDate: "2024-05-05",
        status: "active",
        affectsPayroll: true,
        title: "Transport",
      } as any,
    ]);
    storageSpies.getScheduleSummary.mockResolvedValue({});
    storageSpies.getAttendanceSummary.mockResolvedValue({});
    storageSpies.getCompanies.mockResolvedValue([
      {
        id: "co-1",
        payrollExportFormats: [],
      } as any,
    ]);
    storageSpies.createNotification.mockResolvedValue(undefined as any);

    const response = await request(app)
      .post("/api/payroll/generate")
      .send({
        period: "May 2024",
        startDate: "2024-05-01",
        endDate: "2024-05-31",
        status: "draft",
        useAttendance: false,
        scenarioToggles: {
          allowances: false,
          loans: false,
          attendance: false,
        },
      });

    expect(response.status).toBe(201);
    const runId = response.body.id;
    expect(runId).toBeTruthy();

    expect(insertedEntries).toHaveLength(1);
    expect(insertedEntries[0].allowances).toEqual({});

    const runRow = insertedRuns.find(run => run.id === runId);
    const entryRows = insertedEntries
      .filter(entry => entry.payrollRunId === runId)
      .map(entry => ({
        ...entry,
        employee: employeesById.get(entry.employeeId) ?? null,
      }));

    selectMock.mockReset();
    selectMock
      .mockReturnValueOnce({
        from: () => ({ where: async () => (runRow ? [runRow] : []) }),
      })
      .mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({ where: async () => entryRows }),
        }),
      });

    const fetched = await request(app).get(`/api/payroll/${runId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(runId);
    expect(fetched.body.allowanceKeys).toEqual([]);
    expect(fetched.body.entries).toHaveLength(1);
    const entry = fetched.body.entries[0];
    expect(entry.allowances).toBeUndefined();
    expect("allowances" in entry).toBe(false);
  });
});
