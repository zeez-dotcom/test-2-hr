/** @vitest-environment node */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerRoutes } from "../routes";
import { errorHandler } from "../errorHandler";

const {
  getEmployeeCustomFieldsMock,
  createEmployeeCustomFieldMock,
  updateEmployeeCustomFieldMock,
  deleteEmployeeCustomFieldMock,
  getEmployeeMock,
  getEmployeeCustomValuesMock,
  createEmployeeMock,
  updateEmployeeMock,
  createEmployeeCustomValueMock,
  updateEmployeeCustomValueMock,
  deleteEmployeeCustomValueMock,
  createEmployeeEventMock,
} = vi.hoisted(() => ({
  getEmployeeCustomFieldsMock: vi.fn(),
  createEmployeeCustomFieldMock: vi.fn(),
  updateEmployeeCustomFieldMock: vi.fn(),
  deleteEmployeeCustomFieldMock: vi.fn(),
  getEmployeeMock: vi.fn(),
  getEmployeeCustomValuesMock: vi.fn(),
  createEmployeeMock: vi.fn(),
  updateEmployeeMock: vi.fn(),
  createEmployeeCustomValueMock: vi.fn(),
  updateEmployeeCustomValueMock: vi.fn(),
  deleteEmployeeCustomValueMock: vi.fn(),
  createEmployeeEventMock: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    query: {
      employees: { findFirst: vi.fn() },
      payrollRuns: { findFirst: vi.fn() },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
    transaction: vi.fn(async (cb: any) => cb({})),
  },
}));

vi.mock("../storage", () => ({
  storage: {
    getEmployeeCustomFields: getEmployeeCustomFieldsMock,
    createEmployeeCustomField: createEmployeeCustomFieldMock,
    updateEmployeeCustomField: updateEmployeeCustomFieldMock,
    deleteEmployeeCustomField: deleteEmployeeCustomFieldMock,
    getEmployee: getEmployeeMock,
    getEmployeeCustomValues: getEmployeeCustomValuesMock,
    createEmployee: createEmployeeMock,
    updateEmployee: updateEmployeeMock,
    createEmployeeCustomValue: createEmployeeCustomValueMock,
    updateEmployeeCustomValue: updateEmployeeCustomValueMock,
    deleteEmployeeCustomValue: deleteEmployeeCustomValueMock,
    createEmployeeEvent: createEmployeeEventMock,
  },
  DuplicateEmployeeCodeError: class DuplicateEmployeeCodeError extends Error {},
}));

describe("employee custom fields routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use((req, _res, next) => {
      (req as any).isAuthenticated = () => true;
      (req as any).user = { role: "admin" };
      next();
    });
    await registerRoutes(app);
    app.use(errorHandler);

    getEmployeeCustomFieldsMock.mockReset();
    createEmployeeCustomFieldMock.mockReset();
    updateEmployeeCustomFieldMock.mockReset();
    deleteEmployeeCustomFieldMock.mockReset();
    getEmployeeMock.mockReset();
    getEmployeeCustomValuesMock.mockReset();
    createEmployeeMock.mockReset();
    updateEmployeeMock.mockReset();
    createEmployeeCustomValueMock.mockReset();
    updateEmployeeCustomValueMock.mockReset();
    deleteEmployeeCustomValueMock.mockReset();
    createEmployeeEventMock.mockReset();
  });

  it("lists configured custom fields", async () => {
    getEmployeeCustomFieldsMock.mockResolvedValue([
      { id: "field-1", name: "Favorite color" },
    ] as any);

    const res = await request(app).get("/api/employees/custom-fields");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "field-1", name: "Favorite color" }]);
    expect(getEmployeeCustomFieldsMock).toHaveBeenCalledTimes(1);
  });

  it("creates a new custom field", async () => {
    createEmployeeCustomFieldMock.mockResolvedValue({ id: "field-2", name: "Hobby" } as any);

    const res = await request(app)
      .post("/api/employees/custom-fields")
      .send({ name: "Hobby" });

    expect(res.status).toBe(201);
    expect(createEmployeeCustomFieldMock).toHaveBeenCalledWith({ name: "Hobby" });
    expect(res.body).toEqual({ id: "field-2", name: "Hobby" });
  });

  it("rejects custom field creation with empty name", async () => {
    const res = await request(app)
      .post("/api/employees/custom-fields")
      .send({ name: "   " });

    expect(res.status).toBe(400);
    expect(createEmployeeCustomFieldMock).not.toHaveBeenCalled();
  });

  it("updates an existing custom field", async () => {
    updateEmployeeCustomFieldMock.mockResolvedValue({ id: "field-3", name: "Nickname" } as any);

    const res = await request(app)
      .put("/api/employees/custom-fields/field-3")
      .send({ name: "Nickname" });

    expect(res.status).toBe(200);
    expect(updateEmployeeCustomFieldMock).toHaveBeenCalledWith("field-3", { name: "Nickname" });
    expect(res.body).toEqual({ id: "field-3", name: "Nickname" });
  });

  it("returns 404 when updating a non-existent custom field", async () => {
    updateEmployeeCustomFieldMock.mockResolvedValue(undefined);

    const res = await request(app)
      .put("/api/employees/custom-fields/missing")
      .send({ name: "Nickname" });

    expect(res.status).toBe(404);
    expect(updateEmployeeCustomFieldMock).toHaveBeenCalledWith("missing", { name: "Nickname" });
  });

  it("returns 204 when deleting a custom field", async () => {
    deleteEmployeeCustomFieldMock.mockResolvedValue(true);

    const res = await request(app)
      .delete("/api/employees/custom-fields/field-4");

    expect(res.status).toBe(204);
    expect(deleteEmployeeCustomFieldMock).toHaveBeenCalledWith("field-4");
  });

  it("returns 404 when deleting a missing custom field", async () => {
    deleteEmployeeCustomFieldMock.mockResolvedValue(false);

    const res = await request(app)
      .delete("/api/employees/custom-fields/field-404");

    expect(res.status).toBe(404);
    expect(deleteEmployeeCustomFieldMock).toHaveBeenCalledWith("field-404");
  });

  it("returns custom field values for an employee", async () => {
    getEmployeeMock.mockResolvedValue({ id: "emp-1" } as any);
    getEmployeeCustomFieldsMock.mockResolvedValue([
      { id: "field-1", name: "Favorite color" },
    ] as any);
    getEmployeeCustomValuesMock.mockResolvedValueOnce([
      { id: "val-1", fieldId: "field-1", value: "Blue" },
    ] as any);

    const res = await request(app).get("/api/employees/emp-1/custom-fields");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      fields: [{ id: "field-1", name: "Favorite color" }],
      values: { "field-1": "Blue" },
    });
    expect(getEmployeeMock).toHaveBeenCalledWith("emp-1");
  });

  it("persists custom field values when creating an employee", async () => {
    createEmployeeMock.mockResolvedValue({ id: "emp-99", employeeCode: "E-99" } as any);
    createEmployeeEventMock.mockResolvedValue(undefined);
    getEmployeeCustomFieldsMock.mockResolvedValue([
      { id: "field-1", name: "Favorite color" },
    ] as any);
    getEmployeeCustomValuesMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "val-new", fieldId: "field-1", value: "Blue" },
    ] as any);
    createEmployeeCustomValueMock.mockResolvedValue({
      id: "val-new",
      fieldId: "field-1",
      employeeId: "emp-99",
      value: "Blue",
    } as any);

    const res = await request(app)
      .post("/api/employees")
      .send({
        employeeCode: "E-99",
        firstName: "Ada",
        lastName: "Lovelace",
        position: "Engineer",
        salary: 1000,
        startDate: "2024-01-01",
        customFieldValues: {
          "field-1": "Blue",
        },
      });

    expect(res.status).toBe(201);
    expect(createEmployeeCustomValueMock).toHaveBeenCalledWith({
      employeeId: "emp-99",
      fieldId: "field-1",
      value: "Blue",
    });
    expect(res.body).toMatchObject({
      id: "emp-99",
      customFieldValues: { "field-1": "Blue" },
    });
  });

  it("updates and removes employee custom field values", async () => {
    updateEmployeeMock.mockResolvedValue({ id: "emp-1", employeeCode: "E-1" } as any);
    getEmployeeCustomFieldsMock.mockResolvedValue([
      { id: "field-1", name: "Favorite color" },
      { id: "field-2", name: "Shirt size" },
    ] as any);
    getEmployeeCustomValuesMock
      .mockResolvedValueOnce([
        { id: "val-1", fieldId: "field-1", value: "Green" },
        { id: "val-2", fieldId: "field-2", value: "Medium" },
      ] as any)
      .mockResolvedValueOnce([
        { id: "val-1", fieldId: "field-1", value: "Blue" },
      ] as any);
    updateEmployeeCustomValueMock.mockResolvedValue({
      id: "val-1",
      fieldId: "field-1",
      value: "Blue",
    } as any);
    deleteEmployeeCustomValueMock.mockResolvedValue(true);

    const res = await request(app)
      .put("/api/employees/emp-1")
      .send({
        firstName: "Ada",
        customFieldValues: {
          "field-1": "Blue",
          "field-2": "",
        },
      });

    expect(res.status).toBe(200);
    expect(updateEmployeeCustomValueMock).toHaveBeenCalledWith("val-1", { value: "Blue" });
    expect(deleteEmployeeCustomValueMock).toHaveBeenCalledWith("val-2");
    expect(res.body).toMatchObject({
      id: "emp-1",
      customFieldValues: { "field-1": "Blue" },
    });
  });
});
