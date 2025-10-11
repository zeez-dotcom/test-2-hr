import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
import { buildPayrollExports } from "./payrollExports";
import type {
  PayrollExportRequest,
  PayrollRun,
  EmployeeWithDepartment,
} from "@shared/schema";

vi.mock("pdfmake", () => {
  class MockPdfDocument {
    private handlers: Record<string, ((chunk?: unknown) => void) | undefined> = {};

    on(event: string, handler: (chunk?: unknown) => void) {
      this.handlers[event] = handler;
      return this;
    }

    end() {
      this.handlers.data?.(Buffer.from("%PDF-1.4\n"));
      this.handlers.end?.();
    }
  }

  return {
    default: class MockPdfPrinter {
      createPdfKitDocument() {
        return new MockPdfDocument();
      }
    },
  };
});

describe("buildPayrollExports", () => {
  const run: PayrollRun = {
    id: "run-1",
    period: "Jan 2024",
    startDate: new Date("2024-01-01"),
    endDate: new Date("2024-01-31"),
    grossAmount: "5000.00",
    totalDeductions: "500.00",
    netAmount: "4500.00",
    status: "completed",
    calendarId: "monthly",
    cycleLabel: "Monthly",
    scenarioKey: "baseline",
    scenarioToggles: {},
    exportArtifacts: [],
    createdAt: new Date("2024-02-01T08:00:00Z"),
  } as PayrollRun;

  const employees: EmployeeWithDepartment[] = [
    {
      id: "emp-1",
      employeeCode: "E001",
      firstName: "John",
      lastName: "Doe",
      salary: "2500.00",
      additions: null,
      workLocation: "Office",
      startDate: new Date("2020-01-01"),
      status: "active",
      departmentId: null,
      companyId: null,
      role: "employee",
      email: null,
      phone: null,
      position: "Developer",
      arabicName: null,
      nickname: null,
      bankIban: "KW12BANK123456789",
      bankName: "Kuwait Bank",
      iban: "KW12BANK123456789",
      swiftCode: null,
      emergencyContact: null,
      emergencyPhone: null,
      nationalId: null,
      address: null,
      dateOfBirth: null,
      nationality: null,
      professionCode: null,
      profession: null,
      paymentMethod: null,
      transferable: null,
      createdAt: new Date("2020-01-01"),
      updatedAt: new Date("2020-01-01"),
      departmentName: "Engineering",
    },
  ];

  const entries = [
    {
      employeeId: "emp-1",
      grossPay: 5000,
      netPay: 4500,
      loanDeduction: 200,
      otherDeductions: 300,
      bonusAmount: 250,
      taxDeduction: 100,
      socialSecurityDeduction: 150,
      healthInsuranceDeduction: 50,
    },
  ];

  const requests: PayrollExportRequest[] = [
    { id: "bank-csv", type: "bank", format: "csv" },
    { id: "gl-xlsx", type: "gl", format: "xlsx" },
    { id: "statutory-pdf", type: "statutory", format: "pdf" },
  ];

  it("creates base64 encoded artifacts for each export request", async () => {
    const artifacts = await buildPayrollExports({
      run,
      entries,
      employees,
      scenarioKey: "baseline",
      toggles: { attendance: true },
      requests,
    });

    expect(artifacts).toHaveLength(3);

    const bankArtifact = artifacts.find(artifact => artifact.type === "bank");
    expect(bankArtifact?.mimeType).toBe("text/csv");
    expect(bankArtifact?.filename).toContain("bank-export-jan-2024-baseline.csv");
    const bankCsv = Buffer.from(bankArtifact!.data, "base64").toString("utf8");
    expect(bankCsv).toContain("Employee Code,Employee Name,Bank,IBAN,Net Pay");
    expect(bankCsv).toContain("E001");

    const glArtifact = artifacts.find(artifact => artifact.type === "gl");
    expect(glArtifact?.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const workbook = XLSX.read(Buffer.from(glArtifact!.data, "base64"), {
      type: "buffer",
    });
    expect(workbook.SheetNames).toContain("Payroll GL");
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["Payroll GL"], {
      header: 1,
    }) as string[][];
    expect(rows[0]).toContain("Employee Code");

    const statutoryArtifact = artifacts.find(artifact => artifact.type === "statutory");
    expect(statutoryArtifact?.mimeType).toBe("application/pdf");
    const pdfBuffer = Buffer.from(statutoryArtifact!.data, "base64");
    expect(pdfBuffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
