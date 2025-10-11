import type {
  AttendanceForecastMetric,
  DepartmentCostPeriod,
  DepartmentLoanExposureMetric,
  DepartmentOvertimeMetric,
} from "./storage";
import { storage, computeNextReportRun } from "./storage";
import { sendEmail } from "./emailService";
import { log } from "./vite";
import type { ReportSchedule } from "@shared/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

const toIsoDate = (date: Date) => date.toISOString().split("T")[0];

const coerceDepartmentIds = (value: unknown): string[] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
    return normalized.length ? normalized : undefined;
  }
  if (typeof value === "string") {
    const normalized = value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return normalized.length ? normalized : undefined;
  }
  return undefined;
};

type ScheduleResolvedFilters = {
  startDate: string;
  endDate: string;
  groupBy: "month" | "year";
  departmentIds?: string[];
};

const resolveFilters = (schedule: ReportSchedule, now: Date): ScheduleResolvedFilters => {
  const filters = (schedule.filters as Record<string, unknown>) ?? {};
  const groupings = schedule.groupings ?? [];
  const fallbackStart = new Date(now.getTime() - 30 * DAY_MS);
  const rawStart = typeof filters.startDate === "string" ? filters.startDate : undefined;
  const rawEnd = typeof filters.endDate === "string" ? filters.endDate : undefined;
  const startDate = rawStart && !Number.isNaN(Date.parse(rawStart)) ? rawStart : toIsoDate(fallbackStart);
  const endDate = rawEnd && !Number.isNaN(Date.parse(rawEnd)) ? rawEnd : toIsoDate(now);
  const groupByFilter = typeof filters.groupBy === "string" ? filters.groupBy : undefined;
  const groupByOption = groupings.find((value) => value === "month" || value === "year") as "month" | "year" | undefined;
  const groupBy: "month" | "year" =
    groupByFilter === "year" || groupByOption === "year" ? "year" : "month";
  const departmentIds = coerceDepartmentIds(filters.departmentIds ?? filters.departments);
  return { startDate, endDate, groupBy, departmentIds };
};

const summarizeDepartmentCosts = (
  data: DepartmentCostPeriod[],
  filters: { startDate: string; endDate: string },
): string => {
  if (!data.length) {
    return `No payroll costs recorded between ${filters.startDate} and ${filters.endDate}.`;
  }
  let gross = 0;
  let net = 0;
  const byDepartment = new Map<string, number>();
  data.forEach((entry) => {
    gross += entry.totals.grossPay;
    net += entry.totals.netPay;
    const current = byDepartment.get(entry.departmentName) ?? 0;
    byDepartment.set(entry.departmentName, current + entry.totals.netPay);
  });
  const top = [...byDepartment.entries()].sort((a, b) => b[1] - a[1])[0];
  const topLabel = top ? `${top[0]} (${top[1].toFixed(2)})` : "N/A";
  return `Gross ${gross.toFixed(2)} / Net ${net.toFixed(2)} across ${byDepartment.size} departments. Top contributor: ${topLabel}.`;
};

const summarizeOvertime = (data: DepartmentOvertimeMetric[]): string => {
  if (!data.length) {
    return "No overtime recorded for the selected range.";
  }
  const top = [...data].sort((a, b) => b.totalOvertimeHours - a.totalOvertimeHours)[0];
  return `Peak overtime: ${top.departmentName} (${top.totalOvertimeHours.toFixed(2)}h, est. cost ${top.overtimeCostEstimate.toFixed(2)}).`;
};

const summarizeLoanExposure = (data: DepartmentLoanExposureMetric[]): string => {
  if (!data.length) {
    return "No active loans detected in the selected window.";
  }
  const outstanding = data.reduce((sum, item) => sum + item.totalOutstandingAmount, 0);
  const overdueCount = data.reduce((sum, item) => sum + item.overdueInstallments, 0);
  return `Outstanding balance ${outstanding.toFixed(2)} across ${data.length} departments with ${overdueCount} overdue installments.`;
};

const summarizeForecast = (data: AttendanceForecastMetric[]): string => {
  if (!data.length) {
    return "No attendance variance detected for the upcoming period.";
  }
  const top = [...data].sort((a, b) => b.projectedAbsenceHours - a.projectedAbsenceHours)[0];
  return `Highest projected absence: ${top.departmentName} (${top.projectedAbsenceHours.toFixed(2)}h, confidence ${Math.round(top.confidence * 100)}%).`;
};

const buildSummary = (
  schedule: ReportSchedule,
  payload: unknown,
  filters: { startDate: string; endDate: string },
): string => {
  switch (schedule.reportType) {
    case "department-costs":
      return summarizeDepartmentCosts((payload as DepartmentCostPeriod[]) ?? [], filters);
    case "department-overtime":
      return summarizeOvertime((payload as DepartmentOvertimeMetric[]) ?? []);
    case "loan-exposure":
      return summarizeLoanExposure((payload as DepartmentLoanExposureMetric[]) ?? []);
    case "attendance-forecast":
      return summarizeForecast((payload as AttendanceForecastMetric[]) ?? []);
    default:
      return Array.isArray(payload)
        ? `Report contains ${payload.length} rows.`
        : "Report generated.";
  }
};

const truncate = (value: string, max = 1000) => (value.length > max ? `${value.slice(0, max - 3)}...` : value);

export async function processScheduledReports(now: Date = new Date()): Promise<number> {
  const schedules = await storage.getDueReportSchedules(now);
  if (schedules.length === 0) {
    return 0;
  }
  let processed = 0;
  for (const schedule of schedules) {
    try {
      const filters = resolveFilters(schedule, now);
      let data: unknown;
      switch (schedule.reportType) {
        case "department-costs":
          data = await storage.getDepartmentCostAnalytics({
            startDate: filters.startDate,
            endDate: filters.endDate,
            groupBy: filters.groupBy,
            departmentIds: filters.departmentIds,
          });
          break;
        case "department-overtime":
          data = await storage.getDepartmentOvertimeMetrics({
            startDate: filters.startDate,
            endDate: filters.endDate,
            departmentIds: filters.departmentIds,
          });
          break;
        case "loan-exposure":
          data = await storage.getDepartmentLoanExposure({
            startDate: filters.startDate,
            endDate: filters.endDate,
            departmentIds: filters.departmentIds,
          });
          break;
        case "attendance-forecast":
          data = await storage.getAttendanceForecast({
            startDate: filters.startDate,
            endDate: filters.endDate,
            departmentIds: filters.departmentIds,
          });
          break;
        default:
          throw new Error(`Unsupported report type '${schedule.reportType}'`);
      }

      const summary = buildSummary(schedule, data, filters);
      const bodyJson = JSON.stringify({ filters, summary, data }, null, 2);
      const plainBody = `Scheduled report "${schedule.name}"\nRange: ${filters.startDate} → ${filters.endDate}\nSummary: ${summary}\n\nPreview:\n${truncate(bodyJson, 8000)}`;

      if ((schedule.recipients ?? []).length > 0) {
        for (const email of schedule.recipients ?? []) {
          if (!email) continue;
          await sendEmail({
            to: email,
            from: process.env.FROM_EMAIL || "reports@hrpaymaster.local",
            subject: `Scheduled report ready: ${schedule.name}`,
            text: plainBody,
          });
        }
      }

      if (schedule.notifyEmployeeIds && schedule.notifyEmployeeIds.length > 0) {
        const expiryDate = toIsoDate(new Date(now.getTime() + 7 * DAY_MS));
        const deliveryChannels = schedule.deliveryChannels ?? [];
        for (const employeeId of schedule.notifyEmployeeIds) {
          try {
            await storage.createNotification({
              employeeId,
              type: "report_schedule",
              title: `Report ready: ${schedule.name}`,
              message: truncate(summary, 500),
              priority: "medium",
              status: "unread",
              expiryDate,
              daysUntilExpiry: 7,
              emailSent: false,
              deliveryChannels,
              escalationHistory: [],
            });
          } catch (notificationError) {
            log(`warning: failed to create notification for ${employeeId}: ${String(notificationError)}`);
          }
        }
      }

      await storage.updateReportSchedule(schedule.id, {
        lastRunAt: now,
        lastRunStatus: "success",
        lastRunSummary: truncate(summary, 1000),
        nextRunAt: computeNextReportRun(schedule.cadence, schedule.runTime, now),
      });

      processed += 1;
    } catch (error) {
      log(`warning: failed to process report schedule ${schedule.id}: ${String(error)}`);
      try {
        await storage.updateReportSchedule(schedule.id, {
          lastRunAt: now,
          lastRunStatus: "failed",
          lastRunSummary: truncate(String(error ?? "Unknown error"), 1000),
          nextRunAt: computeNextReportRun(schedule.cadence, schedule.runTime, now),
        });
      } catch (updateError) {
        log(`warning: unable to update report schedule ${schedule.id} after failure: ${String(updateError)}`);
      }
    }
  }
  return processed;
}
