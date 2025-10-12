import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type {
  NotificationEscalationStep,
  NotificationRoutingRuleWithSteps,
  NotificationWithEmployee,
} from "@shared/schema";
import type { IStorage } from "./storage";
import * as emailService from "./emailService";

const NOW = new Date("2024-03-01T08:00:00Z");

const createStep = (overrides: Partial<NotificationEscalationStep> = {}): NotificationEscalationStep => ({
  id: overrides.id ?? "step-1",
  ruleId: overrides.ruleId ?? "rule-1",
  level: overrides.level ?? 1,
  escalateAfterMinutes: overrides.escalateAfterMinutes ?? 30,
  targetRole: overrides.targetRole ?? "ops-lead",
  channel: overrides.channel ?? "email",
  messageTemplate: overrides.messageTemplate ?? null,
  createdAt: overrides.createdAt ?? NOW,
});

const createRule = (
  overrides: Partial<NotificationRoutingRuleWithSteps> = {},
  steps: NotificationEscalationStep[] = [createStep()],
): NotificationRoutingRuleWithSteps => ({
  id: overrides.id ?? "rule-1",
  name: overrides.name ?? "Critical escalations",
  description: overrides.description ?? null,
  triggerType: overrides.triggerType ?? "visa_expiry",
  slaMinutes: overrides.slaMinutes ?? 30,
  deliveryChannels: overrides.deliveryChannels ?? ["email"],
  escalationStrategy: overrides.escalationStrategy ?? "sequential",
  metadata: overrides.metadata ?? {},
  createdAt: overrides.createdAt ?? NOW,
  updatedAt: overrides.updatedAt ?? NOW,
  organizationId: overrides.organizationId ?? "org-1",
  steps,
});

const createNotification = (
  overrides: Partial<NotificationWithEmployee> = {},
  stepOverrides: Partial<NotificationEscalationStep>[] = [],
): NotificationWithEmployee => {
  const steps =
    stepOverrides.length > 0
      ? stepOverrides.map((step, index) =>
          createStep({ id: `step-${index + 1}`, level: index + 1, ...step }),
        )
      : [createStep()];
  const rule = createRule({}, steps);

  return {
    id: overrides.id ?? "notif-1",
    employeeId: overrides.employeeId ?? "emp-1",
    type: overrides.type ?? "visa_expiry",
    title: overrides.title ?? "Visa expiring",
    message: overrides.message ?? "Visa will expire soon",
    priority: overrides.priority ?? "high",
    status: overrides.status ?? "unread",
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
    snoozedUntil: overrides.snoozedUntil ?? null,
    slaDueAt: overrides.slaDueAt ?? new Date(NOW.getTime() - 5 * 60 * 1000),
    routingRuleId: overrides.routingRuleId ?? rule.id,
    deliveryChannels: overrides.deliveryChannels ?? ["email"],
    escalationStatus: overrides.escalationStatus ?? "pending",
    escalationLevel: overrides.escalationLevel ?? 0,
    escalationHistory: overrides.escalationHistory ?? [],
    routingRule: overrides.routingRule ?? rule,
    lastEscalatedAt: overrides.lastEscalatedAt ?? null,
    employee:
      overrides.employee ??
      ({
        id: "emp-1",
        firstName: "Casey",
        lastName: "Doe",
        email: "casey@example.com",
        phone: "+1-555-0100",
      } as unknown as NotificationWithEmployee["employee"]),
  } as NotificationWithEmployee;
};

const createStorageMock = (notifications: NotificationWithEmployee[]) => {
  const appendNotificationEscalationHistory = vi.fn().mockResolvedValue(undefined);
  const updateNotification = vi.fn().mockResolvedValue(undefined);

  const storage: Partial<IStorage> = {
    getNotifications: vi.fn().mockResolvedValue(notifications),
    appendNotificationEscalationHistory,
    updateNotification,
    getNotificationRoutingRules: vi.fn().mockResolvedValue([]),
  };

  return { storage: storage as IStorage, appendNotificationEscalationHistory, updateNotification };
};

describe("escalateOverdueNotifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("escalates overdue notifications to the next step and updates SLA", async () => {
    const notification = createNotification();
    const { storage, appendNotificationEscalationHistory, updateNotification } = createStorageMock([
      notification,
    ]);

    const escalated = await emailService.escalateOverdueNotifications(storage);

    expect(escalated).toBe(1);

    const historyCall = appendNotificationEscalationHistory.mock.calls.find(
      (call) => call[0] === notification.id,
    );
    expect(historyCall?.[1]).toMatchObject({
      level: 1,
      status: "escalated",
      notes: "Automatic escalation — SLA breached",
    });

    const updateCall = updateNotification.mock.calls.find((call) => call[0] === notification.id);
    expect(updateCall).toBeTruthy();
    const updatePayload = updateCall?.[1] as Record<string, unknown>;
    expect(updatePayload?.escalationStatus).toBe("escalated");
    expect(updatePayload?.deliveryChannels).toEqual(["email"]);
    expect(updatePayload?.slaDueAt).toEqual(new Date(NOW.getTime() + 30 * 60 * 1000));
  });

  it("closes escalations when no additional steps are available", async () => {
    const notification = createNotification(
      {
        id: "notif-closed",
        escalationLevel: 1,
        routingRuleId: "rule-closed",
      },
      [
        {
          id: "step-final",
          ruleId: "rule-closed",
          level: 1,
          escalateAfterMinutes: 0,
        },
      ],
    );

    const { storage, updateNotification } = createStorageMock([notification]);

    const escalated = await emailService.escalateOverdueNotifications(storage);

    expect(escalated).toBe(0);
    expect(updateNotification).toHaveBeenCalledWith(
      notification.id,
      expect.objectContaining({ escalationStatus: "closed", slaDueAt: null }),
    );
  });
});
