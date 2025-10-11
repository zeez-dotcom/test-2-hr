import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import PdfPrinter from "pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import * as XLSX from "xlsx";
import {
  type EmployeeWithDepartment,
  type PayrollExportArtifact,
  type PayrollExportFormatConfig,
  type PayrollRun,
} from "@shared/schema";

export interface PayrollExportRequest {
  id?: string;
  type: PayrollExportFormatConfig["type"];
  format?: PayrollExportFormatConfig["format"];
  filename?: string;
}

export interface PayrollExportBuildContext {
  run: PayrollRun;
  entries: Array<{
    employeeId: string;
    grossPay: number;
    netPay: number;
    loanDeduction: number;
    otherDeductions: number;
    bonusAmount: number;
    taxDeduction: number;
    socialSecurityDeduction: number;
    healthInsuranceDeduction: number;
  }>;
  employees: EmployeeWithDepartment[];
  scenarioKey: string;
  toggles: Record<string, boolean>;
  requests: PayrollExportRequest[];
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.resolve(moduleDir, "../../client/src/assets/fonts");

const printer = new PdfPrinter({
  Cairo: {
    normal: path.join(fontsDir, "Cairo-Regular.ttf"),
    bold: path.join(fontsDir, "Amiri-Bold.ttf"),
    italics: path.join(fontsDir, "Cairo-Regular.ttf"),
    bolditalics: path.join(fontsDir, "Amiri-Bold.ttf"),
  },
});

const toCurrency = (value: number) => value.toFixed(2);

const downloadLabel = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());

const escapeCsvCell = (value: string | number) => {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const buildBankCsv = (
  context: PayrollExportBuildContext,
  employeeMap: Map<string, EmployeeWithDepartment>,
) => {
  const header = ["Employee Code", "Employee Name", "Bank", "IBAN", "Net Pay"];
  const rows = context.entries.map(entry => {
    const employee = employeeMap.get(entry.employeeId);
    const fullName = employee ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || employee.employeeCode || employee.id : entry.employeeId;
    return [
      employee?.employeeCode ?? "",
      fullName,
      employee?.bankName ?? "",
      employee?.iban ?? employee?.bankIban ?? "",
      toCurrency(entry.netPay),
    ];
  });

  const csv = [header, ...rows].map(row => row.map(escapeCsvCell).join(",")).join("\r\n");
  return Buffer.from(csv, "utf8");
};

const buildGlWorkbook = (
  context: PayrollExportBuildContext,
  employeeMap: Map<string, EmployeeWithDepartment>,
) => {
  const header = [
    "Employee Code",
    "Employee Name",
    "Department",
    "Gross Pay",
    "Bonus",
    "Statutory Deductions",
    "Loan Deduction",
    "Other Deductions",
    "Net Pay",
  ];
  const rows = context.entries.map(entry => {
    const employee = employeeMap.get(entry.employeeId);
    const department = (employee as any)?.departmentName ?? "";
    const fullName = employee ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || employee.employeeCode || employee.id : entry.employeeId;
    return [
      employee?.employeeCode ?? "",
      fullName,
      department,
      toCurrency(entry.grossPay),
      toCurrency(entry.bonusAmount),
      toCurrency(entry.taxDeduction + entry.socialSecurityDeduction + entry.healthInsuranceDeduction),
      toCurrency(entry.loanDeduction),
      toCurrency(entry.otherDeductions),
      toCurrency(entry.netPay),
    ];
  });
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Payroll GL");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const createPdfBuffer = (definition: TDocumentDefinitions): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    try {
      const doc = printer.createPdfKitDocument(definition);
      const chunks: Buffer[] = [];
      doc.on("data", chunk => chunks.push(chunk as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });

const buildStatutoryPdf = async (
  context: PayrollExportBuildContext,
  totals: { gross: number; net: number; deductions: number },
): Promise<Buffer> => {
  const toggleRows = Object.entries(context.toggles).map(([key, value]) => [downloadLabel(key), value ? "Enabled" : "Disabled"]);
  const doc: TDocumentDefinitions = {
    content: [
      { text: `Statutory Summary - ${context.run.period}`, style: "header" },
      {
        text: `Scenario: ${context.scenarioKey}${context.run.cycleLabel ? ` | Cycle: ${context.run.cycleLabel}` : ""}`,
        margin: [0, 8, 0, 12],
      },
      {
        table: {
          widths: ["*", "auto"],
          body: [
            ["Total Employees", context.entries.length],
            ["Gross Pay", toCurrency(totals.gross)],
            ["Total Deductions", toCurrency(totals.deductions)],
            ["Net Pay", toCurrency(totals.net)],
          ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 16],
      },
      toggleRows.length
        ? {
            table: {
              widths: ["*", "auto"],
              body: [[{ text: "Scenario Toggles", colSpan: 2, style: "tableHeader" }, {}], ...toggleRows],
            },
            layout: "lightHorizontalLines",
          }
        : { text: "" },
    ],
    styles: {
      header: { fontSize: 18, bold: true },
      tableHeader: { bold: true },
    },
    defaultStyle: { font: "Cairo" },
  };

  return await createPdfBuffer(doc);
};

const resolveFilename = (
  run: PayrollRun,
  request: PayrollExportRequest,
  scenarioKey: string,
  extension: string,
) => {
  if (request.filename) {
    return request.filename;
  }
  const safePeriod = run.period.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${request.type}-export-${safePeriod}-${scenarioKey}.${extension}`;
};

export async function buildPayrollExports(
  context: PayrollExportBuildContext,
): Promise<PayrollExportArtifact[]> {
  if (!Array.isArray(context.requests) || context.requests.length === 0) {
    return [];
  }

  const employeeMap = new Map(context.employees.map(employee => [employee.id, employee] as const));
  const totals = context.entries.reduce(
    (acc, entry) => {
      acc.gross += entry.grossPay;
      acc.net += entry.netPay;
      acc.deductions += entry.grossPay - entry.netPay;
      return acc;
    },
    { gross: 0, net: 0, deductions: 0 },
  );

  const artifacts: PayrollExportArtifact[] = [];
  const timestamp = new Date().toISOString();

  for (const request of context.requests) {
    const format = request.format ?? (request.type === "bank" ? "csv" : request.type === "gl" ? "xlsx" : "pdf");
    const artifactId = request.id ?? randomUUID();

    try {
      if (request.type === "bank" && format === "csv") {
        const buffer = buildBankCsv(context, employeeMap);
        artifacts.push({
          id: artifactId,
          type: request.type,
          format,
          filename: resolveFilename(context.run, request, context.scenarioKey, "csv"),
          mimeType: "text/csv",
          data: buffer.toString("base64"),
          createdAt: timestamp,
          scenarioKey: context.scenarioKey,
        });
        continue;
      }

      if (request.type === "gl" && format === "xlsx") {
        const buffer = buildGlWorkbook(context, employeeMap);
        artifacts.push({
          id: artifactId,
          type: request.type,
          format,
          filename: resolveFilename(context.run, request, context.scenarioKey, "xlsx"),
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          data: buffer.toString("base64"),
          createdAt: timestamp,
          scenarioKey: context.scenarioKey,
        });
        continue;
      }

      if (request.type === "statutory" && format === "pdf") {
        const buffer = await buildStatutoryPdf(context, totals);
        artifacts.push({
          id: artifactId,
          type: request.type,
          format,
          filename: resolveFilename(context.run, request, context.scenarioKey, "pdf"),
          mimeType: "application/pdf",
          data: buffer.toString("base64"),
          createdAt: timestamp,
          scenarioKey: context.scenarioKey,
        });
        continue;
      }
    } catch (error) {
      console.error(`Failed to build ${request.type} export`, error);
      continue;
    }
  }

  return artifacts;
}
