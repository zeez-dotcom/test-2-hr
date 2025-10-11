import { storage } from "./storage";
import { log } from "./vite";
import type { VacationRequestWithEmployee, Notification } from "@shared/schema";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toStartOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const VACATION_RETURN_LOOKAHEAD_DAYS = 2;
export const VACATION_RETURN_OVERDUE_LOOKBACK_DAYS = 7;

const formatName = (vacation: VacationRequestWithEmployee) => {
  const first = vacation.employee?.firstName?.trim() ?? "";
  const last = vacation.employee?.lastName?.trim() ?? "";
  const full = `${first} ${last}`.trim();
  return full.length > 0 ? full : "the employee";
};

const buildNotificationContent = (
  vacation: VacationRequestWithEmployee,
  daysUntilReturn: number,
) => {
  const employeeName = formatName(vacation);
  const baseTitle = daysUntilReturn < 0 ? "Vacation return overdue" : "Vacation return due";
  const title = `${baseTitle} (${vacation.endDate})`;

  const dueDescription =
    daysUntilReturn < 0
      ? `${Math.abs(daysUntilReturn)} day${Math.abs(daysUntilReturn) === 1 ? "" : "s"} overdue`
      : daysUntilReturn === 0
        ? "due today"
        : `due in ${daysUntilReturn} day${daysUntilReturn === 1 ? "" : "s"}`;

  const message = `Vacation for ${employeeName} ${
    daysUntilReturn < 0 ? "ended" : "ends"
  } on ${vacation.endDate} (${dueDescription}). Reactivate the employee or adjust the return date if they remain on leave.`;

  return { title, message };
};

export async function processVacationReturnAlerts(now: Date = new Date()): Promise<number> {
  const today = toStartOfUtcDay(now);
  const windowStart = new Date(today.getTime() - VACATION_RETURN_OVERDUE_LOOKBACK_DAYS * MS_PER_DAY);
  const windowEnd = new Date(today.getTime() + VACATION_RETURN_LOOKAHEAD_DAYS * MS_PER_DAY);

  const vacations = await storage.getVacationRequests(windowStart, windowEnd);
  let processed = 0;

  for (const vacation of vacations) {
    if ((vacation.status || "").toLowerCase() !== "approved") continue;
    if ((vacation.employee?.status || "").toLowerCase() !== "on_leave") continue;

    const vacationEnd = new Date(vacation.endDate);
    if (Number.isNaN(vacationEnd.getTime())) continue;
    const endOfVacation = toStartOfUtcDay(vacationEnd);

    const daysUntilReturn = Math.round((endOfVacation.getTime() - today.getTime()) / MS_PER_DAY);
    if (daysUntilReturn > VACATION_RETURN_LOOKAHEAD_DAYS) continue;
    if (daysUntilReturn < -VACATION_RETURN_OVERDUE_LOOKBACK_DAYS) continue;

    const { title, message } = buildNotificationContent(vacation, daysUntilReturn);

    let notification: Notification | undefined;
    try {
      notification = await storage.createNotification({
        employeeId: vacation.employeeId,
        type: "vacation_return_due",
        title,
        message,
        priority: "critical",
        expiryDate: endOfVacation as any,
        daysUntilExpiry: daysUntilReturn,
        emailSent: false,
      });
    } catch (error) {
      log(`warning: failed to create vacation return notification: ${String(error)}`);
      continue;
    }

    const requiresUpdate =
      notification.message !== message ||
      notification.priority !== "critical" ||
      notification.daysUntilExpiry !== daysUntilReturn ||
      notification.status !== "unread";

    if (requiresUpdate) {
      try {
        await storage.updateNotification(notification.id, {
          message,
          priority: "critical",
          daysUntilExpiry: daysUntilReturn,
          status: "unread",
        });
      } catch (error) {
        log(`warning: failed to update vacation return notification: ${String(error)}`);
      }
    }

    processed += 1;
  }

  return processed;
}

const toMonthStartISO = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().split("T")[0];

const toMonthStartDate = (date: Date) => new Date(`${toMonthStartISO(date)}T00:00:00Z`);

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function postMonthlyLeaveAccruals(
  now: Date = new Date(),
): Promise<{ processed: number; postings: number; skipped: number }> {
  const accrualDateISO = toMonthStartISO(now);
  const accrualDate = toMonthStartDate(now);

  const policies = await storage.getLeaveAccrualPolicies();
  if (policies.length === 0) {
    return { processed: 0, postings: 0, skipped: 0 };
  }

  const assignments = await storage.getEmployeeLeavePolicies({ activeOn: accrualDate });
  let postings = 0;
  let skipped = 0;

  for (const assignment of assignments) {
    const policy = policies.find(item => item.id === assignment.policyId);
    if (!policy) {
      skipped += 1;
      continue;
    }

    if (policy.expiresOn && policy.expiresOn < accrualDateISO) {
      skipped += 1;
      continue;
    }

    const existing = await storage.getLeaveAccrualLedger({
      policyId: assignment.policyId,
      employeeId: assignment.employeeId,
      startDate: accrualDateISO,
      endDate: accrualDateISO,
    });

    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    const overrideRate = assignment.customAccrualRatePerMonth ?? null;
    const baseRate = toNumber(policy.accrualRatePerMonth);
    const accrualAmount = overrideRate !== null && overrideRate !== undefined ? toNumber(overrideRate) : baseRate;

    if (!Number.isFinite(accrualAmount) || accrualAmount === 0) {
      skipped += 1;
      continue;
    }

    try {
      await storage.recordLeaveAccrual({
        employeeId: assignment.employeeId,
        policyId: assignment.policyId,
        leaveType: policy.leaveType,
        accrualDate: accrualDateISO,
        amount: accrualAmount,
        note: `Automated accrual for ${accrualDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`,
      });
      postings += 1;
    } catch (error) {
      console.warn('Failed to record leave accrual:', error);
      skipped += 1;
    }
  }

  return { processed: assignments.length, postings, skipped };
}
