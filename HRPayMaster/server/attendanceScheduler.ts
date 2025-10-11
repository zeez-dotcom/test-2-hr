import { storage, DEFAULT_OVERTIME_LIMIT_MINUTES } from "./storage";
import { log } from "./vite";

const toIsoDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString().split("T")[0];
};

const toStartOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const formatHours = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0";
  }
  return (minutes / 60).toFixed(2);
};

export async function processAttendanceAlerts(now: Date = new Date()): Promise<number> {
  const referenceDay = toStartOfUtcDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const schedules = await storage.getEmployeeSchedules({ start: referenceDay, end: referenceDay });

  let created = 0;

  for (const schedule of schedules) {
    const scheduleDate = toIsoDate(schedule.scheduleDate as any);
    const expected = Number(schedule.expectedMinutes ?? 0);
    if (!(expected > 0)) {
      continue;
    }

    if (
      schedule.actualMinutes === 0 &&
      (schedule.absenceApprovalStatus ?? "pending") !== "approved"
    ) {
      try {
        await storage.createNotification({
          employeeId: schedule.employeeId,
          type: "attendance_missing_punch",
          title: `Missing attendance punch (${scheduleDate})`,
          message: `No punches recorded for the scheduled shift on ${scheduleDate}.`,
          priority: "high",
          status: "unread",
          expiryDate: scheduleDate,
          daysUntilExpiry: 0,
          emailSent: false,
        });
        created += 1;
      } catch (error) {
        log(`warning: failed to create missing punch notification: ${String(error)}`);
      }
      continue;
    }

    const variance = schedule.varianceMinutes ?? schedule.actualMinutes - expected;
    if (!(variance > 0)) {
      continue;
    }

    const limit =
      schedule.shiftTemplate?.overtimeLimitMinutes ?? DEFAULT_OVERTIME_LIMIT_MINUTES;

    if (
      variance > limit &&
      (schedule.overtimeApprovalStatus ?? "pending") !== "approved"
    ) {
      try {
        await storage.createNotification({
          employeeId: schedule.employeeId,
          type: "attendance_overtime_limit",
          title: `Overtime limit exceeded (${scheduleDate})`,
          message: `Recorded ${formatHours(schedule.actualMinutes)}h against an allowed ${formatHours(
            expected + limit,
          )}h on ${scheduleDate}.`,
          priority: "high",
          status: "unread",
          expiryDate: scheduleDate,
          daysUntilExpiry: 0,
          emailSent: false,
        });
        created += 1;
      } catch (error) {
        log(`warning: failed to create overtime limit notification: ${String(error)}`);
      }
    }
  }

  return created;
}
