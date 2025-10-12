import { beforeEach, describe, expect, it, vi } from "vitest";
import { processScheduledReports } from "./reportScheduler";
import { storage, computeNextReportRun } from "./storage";
import { sendEmail } from "./emailService";
import type { ReportSchedule } from "@shared/schema";

vi.mock("./storage", () => ({
  storage: {
    getDueReportSchedules: vi.fn(),
    getDepartmentCostAnalytics: vi.fn(),
    getDepartmentOvertimeMetrics: vi.fn(),
    getDepartmentLoanExposure: vi.fn(),
    getAttendanceForecast: vi.fn(),
    createNotification: vi.fn(),
    updateReportSchedule: vi.fn(),
  },
  computeNextReportRun: vi.fn(),
}));

vi.mock("./emailService", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("./vite", () => ({
  log: vi.fn(),
}));

describe("processScheduledReports", () => {
  const NOW = new Date("2024-03-01T08:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes due schedules by emailing recipients and notifying employees", async () => {
    const nextRun = new Date("2024-04-01T08:00:00Z");
    const schedule = {
      id: "sched-1",
      name: "Monthly cost digest",
      description: "Finance summary",
      reportType: "department-costs",
      cadence: "monthly",
      runTime: "08:00",
      timezone: "UTC",
      filters: {
        startDate: "2024-02-01",
        endDate: "2024-02-29",
        groupBy: "month",
        departmentIds: ["dept-1"],
      },
      groupings: ["month"],
      exportFormat: "json",
      recipients: ["finance@example.com"],
      notifyEmployeeIds: ["emp-1"],
      deliveryChannels: ["email"],
      status: "active",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    } as unknown as ReportSchedule;

    vi.mocked(storage.getDueReportSchedules).mockResolvedValue([schedule]);
    vi.mocked(storage.getDepartmentCostAnalytics).mockResolvedValue([
      {
        period: "2024-02",
        departmentId: "dept-1",
        departmentName: "Engineering",
        totals: {
          grossPay: 10000,
          netPay: 8200,
          baseSalary: 7000,
          bonuses: 1500,
          overtimeEstimate: 800,
          deductions: {
            tax: 900,
            socialSecurity: 200,
            healthInsurance: 150,
            loan: 300,
            other: 150,
          },
        },
      },
    ]);
    vi.mocked(storage.createNotification).mockResolvedValue({ id: "notif-1" } as any);
    vi.mocked(storage.updateReportSchedule).mockResolvedValue(undefined as any);
    vi.mocked(computeNextReportRun).mockReturnValue(nextRun);
    vi.mocked(sendEmail).mockResolvedValue(undefined as any);

    const processed = await processScheduledReports(NOW);

    expect(processed).toBe(1);
    expect(storage.getDueReportSchedules).toHaveBeenCalledWith(NOW);
    expect(storage.getDepartmentCostAnalytics).toHaveBeenCalledWith({
      startDate: "2024-02-01",
      endDate: "2024-02-29",
      groupBy: "month",
      departmentIds: ["dept-1"],
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "finance@example.com",
        subject: expect.stringContaining("Monthly cost digest"),
      }),
    );
    expect(storage.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "emp-1",
        type: "report_schedule",
        title: expect.stringContaining("Monthly cost digest"),
        deliveryChannels: ["email"],
      }),
    );
    expect(computeNextReportRun).toHaveBeenCalledWith("monthly", "08:00", NOW);
    expect(storage.updateReportSchedule).toHaveBeenCalledWith(
      "sched-1",
      expect.objectContaining({
        lastRunStatus: "success",
        nextRunAt: nextRun,
      }),
    );
  });
});
