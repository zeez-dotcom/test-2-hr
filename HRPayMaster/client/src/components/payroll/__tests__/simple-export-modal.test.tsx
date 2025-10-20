import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import { SimpleExportModal } from "../simple-export-modal";
import type { Employee, PayrollRunWithEntries } from "@shared/schema";

const mockRegistry = vi.hoisted(() => ({
  toast: vi.fn(),
  openPdf: vi.fn(),
  downloadCsv: vi.fn().mockReturnValue({ filename: "file.csv", entryCount: 2 }),
  downloadBank: vi.fn().mockReturnValue({ filename: "file.txt", entryCount: 1, totalAmount: 1234 }),
}));

const employeesMock: Employee[] = [
  {
    id: "emp-1",
    employeeCode: "E-001",
    firstName: "Alice",
    lastName: "Johnson",
    arabicName: null,
    nickname: null,
    email: "alice@example.com",
    phone: null,
    position: "Engineer",
    role: "employee",
    departmentId: "dept-1",
    companyId: null,
    salary: "1200",
    additions: null,
    workLocation: "HQ",
    startDate: "2022-01-01",
    status: "active",
    bankIban: "KW81CBKU0000000000000000001",
    bankName: "Gulf Bank",
    iban: null,
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
    drivingLicenseNumber: null,
    drivingLicenseIssueDate: null,
    drivingLicenseExpiryDate: null,
    drivingLicenseImage: null,
    drivingLicenseAlertDays: 30,
    otherDocs: null,
    additionalDocs: null,
    residencyName: null,
    residencyOnCompany: null,
    professionCategory: null,
    visaNumber: null,
    visaType: null,
    visaIssueDate: null,
    visaExpiryDate: null,
    visaAlertDays: 30,
    civilId: null,
    civilIdIssueDate: null,
    civilIdExpiryDate: null,
    civilIdAlertDays: 60,
    passportNumber: null,
    passportIssueDate: null,
    passportExpiryDate: null,
    passportAlertDays: 90,
    profileImage: null,
    visaImage: null,
    civilIdImage: null,
    passportImage: null,
    standardWorkingDays: 26,
  },
  {
    id: "emp-2",
    employeeCode: "E-002",
    firstName: "Bob",
    lastName: "Smith",
    arabicName: null,
    nickname: null,
    email: "bob@example.com",
    phone: null,
    position: "Designer",
    role: "employee",
    departmentId: "dept-2",
    companyId: null,
    salary: "1100",
    additions: null,
    workLocation: "Remote",
    startDate: "2021-05-15",
    status: "active",
    bankIban: null,
    bankName: null,
    iban: null,
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
    drivingLicenseNumber: null,
    drivingLicenseIssueDate: null,
    drivingLicenseExpiryDate: null,
    drivingLicenseImage: null,
    drivingLicenseAlertDays: 30,
    otherDocs: null,
    additionalDocs: null,
    residencyName: null,
    residencyOnCompany: null,
    professionCategory: null,
    visaNumber: null,
    visaType: null,
    visaIssueDate: null,
    visaExpiryDate: null,
    visaAlertDays: 30,
    civilId: null,
    civilIdIssueDate: null,
    civilIdExpiryDate: null,
    civilIdAlertDays: 60,
    passportNumber: null,
    passportIssueDate: null,
    passportExpiryDate: null,
    passportAlertDays: 90,
    profileImage: null,
    visaImage: null,
    civilIdImage: null,
    passportImage: null,
    standardWorkingDays: 26,
  },
];

const departmentsMock = [
  { id: "dept-1", name: "Engineering" },
  { id: "dept-2", name: "Design" },
] as const;

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    QueryClient: actual.QueryClient,
    QueryClientProvider: actual.QueryClientProvider,
    useQuery: vi.fn().mockImplementation(({ queryKey }: { queryKey: [string] }) => {
      if (queryKey[0] === "/api/employees") {
        return { data: employeesMock };
      }
      if (queryKey[0] === "/api/departments") {
        return { data: departmentsMock };
      }
      return { data: undefined };
    }),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/ui/select", () => {
  const React = require("react");

  const cloneChildren = (children: any, onValueChange: (value: string) => void) =>
    React.Children.map(children, (child: any) =>
      React.isValidElement(child)
        ? React.cloneElement(child, { onValueChange })
        : child,
    );

  return {
    Select: ({ children, onValueChange }: any) => <div>{cloneChildren(children, onValueChange)}</div>,
    SelectTrigger: ({ children }: any) => <div>{children}</div>,
    SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
    SelectContent: ({ children, onValueChange }: any) => <div>{cloneChildren(children, onValueChange)}</div>,
    SelectItem: ({ children, value, onValueChange }: any) => (
      <button type="button" onClick={() => onValueChange(value)}>
        {children}
      </button>
    ),
  };
});

vi.mock("lucide-react", () => {
  const Icon = ({ children }: any) => <span>{children}</span>;
  return {
    Download: Icon,
    FileText: Icon,
    Building: Icon,
    Users: Icon,
    DollarSign: Icon,
    Printer: Icon,
    FileSpreadsheet: Icon,
    CreditCard: Icon,
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockRegistry.toast }),
}));

vi.mock("@/lib/pdf", () => ({
  openPdf: mockRegistry.openPdf,
}));

vi.mock("@/lib/payroll-export", () => ({
  downloadPayrollCsv: mockRegistry.downloadCsv,
  downloadPayrollBankFile: mockRegistry.downloadBank,
}));

const {
  toast: toastMock,
  openPdf: openPdfMock,
  downloadCsv: downloadPayrollCsvMock,
  downloadBank: downloadPayrollBankFileMock,
} = mockRegistry;

describe("SimpleExportModal", () => {
  const payrollRun: PayrollRunWithEntries = {
    id: "run-1",
    period: "Jan 2023",
    startDate: "2023-01-01",
    endDate: "2023-01-31",
    grossAmount: "1900",
    totalDeductions: "0",
    netAmount: "1900",
    status: "completed",
    calendarId: null,
    cycleLabel: "Monthly",
    scenarioKey: "baseline",
    scenarioToggles: {},
    exportArtifacts: [],
    createdAt: new Date("2023-02-01T00:00:00Z"),
    entries: [
      {
        id: "entry-1",
        payrollRunId: "run-1",
        employeeId: "emp-1",
        baseSalary: "800",
        grossPay: "1000",
        netPay: "1000",
        allowances: {},
        workingDays: 22,
        actualWorkingDays: 22,
        vacationDays: 0,
        taxDeduction: "0",
        socialSecurityDeduction: "0",
        healthInsuranceDeduction: "0",
        loanDeduction: "0",
        otherDeductions: "0",
        bonusAmount: "0",
        adjustmentReason: null,
        createdAt: null,
        employee: {
          id: "emp-1",
          firstName: "Alice",
          lastName: "Johnson",
          salary: "800",
        },
      },
      {
        id: "entry-2",
        payrollRunId: "run-1",
        employeeId: "emp-2",
        baseSalary: "700",
        grossPay: "900",
        netPay: "900",
        allowances: {},
        workingDays: 22,
        actualWorkingDays: 20,
        vacationDays: 2,
        taxDeduction: "0",
        socialSecurityDeduction: "0",
        healthInsuranceDeduction: "0",
        loanDeduction: "0",
        otherDeductions: "0",
        bonusAmount: "0",
        adjustmentReason: null,
        createdAt: null,
        employee: {
          id: "emp-2",
          firstName: "Bob",
          lastName: "Smith",
          salary: "700",
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports PDF payslips by default", async () => {
    const user = userEvent.setup();

    render(<SimpleExportModal payrollRun={payrollRun} isOpen onClose={() => {}} />);

    await user.click(screen.getByText(/Export All Locations/i));

    expect(openPdfMock).toHaveBeenCalledTimes(1);
    expect(downloadPayrollCsvMock).not.toHaveBeenCalled();
    expect(downloadPayrollBankFileMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("Payroll for All Locations opened for printing"),
      }),
    );
  });

  it("exports an Excel file when selected", async () => {
    const user = userEvent.setup();

    render(<SimpleExportModal payrollRun={payrollRun} isOpen onClose={() => {}} />);

    await user.click(screen.getByText(/Excel Export/i));
    await user.click(screen.getByText(/Export All Locations/i));

    expect(downloadPayrollCsvMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeLabel: "All Locations",
      }),
    );
    expect(openPdfMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Excel file generated for All Locations",
      }),
    );
  });

  it("exports a bank transfer file with the selected department scope", async () => {
    const user = userEvent.setup();

    render(<SimpleExportModal payrollRun={payrollRun} isOpen onClose={() => {}} />);

    await user.click(screen.getByText(/Department/i));
    await user.click(screen.getAllByRole("button", { name: /Engineering/i })[0]);
    await user.click(screen.getByText(/Bank Transfer File/i));
    await user.click(screen.getByText(/Export Engineering/i));

    expect(downloadPayrollBankFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeLabel: "Engineering",
      }),
    );
    expect(downloadPayrollBankFileMock.mock.calls[0][0].entries).toHaveLength(1);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("Bank transfer file generated for Engineering"),
      }),
    );
  });
});
