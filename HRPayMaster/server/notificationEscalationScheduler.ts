import type { IStorage } from "./storage";
import { escalateOverdueNotifications } from "./emailService";
import { log } from "./vite";

let notificationEscalationRun: Promise<number> | null = null;

export const runNotificationEscalations = (storage: IStorage): Promise<number> => {
  if (notificationEscalationRun) {
    log("info: notification escalation run already in progress; returning existing run");
    return notificationEscalationRun;
  }

  notificationEscalationRun = (async () => {
    try {
      const escalated = await escalateOverdueNotifications(storage);
      if (escalated > 0) {
        const suffix = escalated === 1 ? "notification" : "notifications";
        log(`notification escalation run escalated ${escalated} ${suffix}`);
      } else {
        log("notification escalation run completed (no escalations due)");
      }
      return escalated;
    } catch (err) {
      log(`warning: notification escalation run failed: ${String(err)}`);
      throw err;
    } finally {
      notificationEscalationRun = null;
    }
  })();

  return notificationEscalationRun;
};
