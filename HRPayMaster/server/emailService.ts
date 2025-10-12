import { MailService } from '@sendgrid/mail';
import { readFile } from 'node:fs/promises';
import type {
  DocumentExpiryCheck,
  Employee,
  NotificationWithEmployee,
  NotificationRoutingRuleWithSteps,
  NotificationEscalationHistoryEntry,
  NotificationChannel,
  NotificationEscalationStep,
} from '@shared/schema';
import type { IStorage } from './storage';

const mailService = new MailService();
const apiKey = process.env.SENDGRID_API_KEY;
let sendGridConfigured = false;
let warnedSendgridAtRuntime = false;

const passwordResetTemplateUrl = new URL('./files/password-reset.html', import.meta.url);
let cachedPasswordResetTemplate: string | null = null;
const defaultEmailFrom = process.env.EMAIL_FROM ?? 'no-reply@hrpaymaster.local';
const appName = process.env.APP_NAME ?? 'HR PayMaster';

const smsProviderKey = process.env.SMS_PROVIDER_API_KEY;
const chatWebhookUrl = process.env.CHAT_PROVIDER_WEBHOOK_URL;

if (!apiKey) {
  console.warn(
    'SENDGRID_API_KEY environment variable not set. Email notifications will be disabled.'
  );
} else if (apiKey.startsWith('SG.')) {
  mailService.setApiKey(apiKey);
  sendGridConfigured = true;
} else {
  console.warn("Invalid SendGrid API key format. Key should start with 'SG.'");
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const mockEmails: EmailParams[] = [];
type SmsParams = { to: string; message: string; notificationId?: string };
type ChatParams = {
  channel: string;
  message: string;
  notificationId?: string;
  targetRole?: string;
};

export const mockSmsMessages: SmsParams[] = [];
export const mockChatMessages: ChatParams[] = [];

async function getPasswordResetTemplate(): Promise<string> {
  if (cachedPasswordResetTemplate) {
    return cachedPasswordResetTemplate;
  }
  try {
    cachedPasswordResetTemplate = await readFile(passwordResetTemplateUrl, 'utf-8');
  } catch (error) {
    console.warn('Failed to load password reset template, falling back to plaintext.', error);
    cachedPasswordResetTemplate = `<!doctype html><html><body><p>{{APP_NAME}}</p><p><a href="{{RESET_URL}}">Reset Password</a></p><p>{{EXPIRES_AT}}</p></body></html>`;
  }
  return cachedPasswordResetTemplate;
}

function applyTemplate(template: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce((output, [key, value]) => {
    const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    return output.replace(pattern, value);
  }, template);
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!params.to) {
    console.warn('No recipient email provided');
    return false;
  }

  if (!params.from || !emailRegex.test(params.from)) {
    console.warn('Invalid sender email provided');
    return false;
  }

  if (!sendGridConfigured) {
    // Mock transport when SendGrid isn't configured
    mockEmails.push(params);
    if (!warnedSendgridAtRuntime) {
      console.warn('SENDGRID_API_KEY not set; email sending is disabled (mock).');
      warnedSendgridAtRuntime = true;
    }
    return false;
  }

  try {
    const message: any = {
      to: params.to,
      from: params.from,
      subject: params.subject,
    };
    if (params.text) message.text = params.text;
    if (params.html) message.html = params.html;
    await mailService.send(message);
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

async function sendSms(params: SmsParams): Promise<boolean> {
  if (!params.to) {
    console.warn('No SMS recipient provided');
    return false;
  }

  if (!smsProviderKey) {
    mockSmsMessages.push(params);
    return false;
  }

  mockSmsMessages.push(params);
  console.info('SMS provider configured; message dispatched (simulated).');
  return true;
}

async function sendChatMessage(params: ChatParams): Promise<boolean> {
  if (!params.channel) {
    console.warn('No chat channel provided');
    return false;
  }

  if (!chatWebhookUrl) {
    mockChatMessages.push(params);
    return false;
  }

  mockChatMessages.push(params);
  console.info('Chat webhook configured; message dispatched (simulated).');
  return true;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
  expiresAt: Date;
  username?: string | null;
}): Promise<boolean> {
  const template = await getPasswordResetTemplate();
  const replacements = {
    APP_NAME: appName,
    RESET_URL: params.resetUrl,
    EXPIRES_AT: params.expiresAt.toUTCString(),
    USERNAME: params.username && params.username.trim() ? params.username : 'there',
  } satisfies Record<string, string>;

  const html = applyTemplate(template, replacements);
  const text = `Hello ${replacements.USERNAME},\n\nA password reset was requested for your ${appName} account. Use the link below to choose a new password:\n\n${params.resetUrl}\n\nThis link will expire on ${replacements.EXPIRES_AT}. If you did not request this change you can safely ignore this email.`;

  return sendEmail({
    to: params.to,
    from: defaultEmailFrom,
    subject: `${appName} password reset`,
    text,
    html,
  });
}

export function generateExpiryWarningEmail(
  employee: Employee,
  documentType: 'visa' | 'civil_id' | 'passport' | 'driving_license',
  expiryDate: string,
  daysUntilExpiry: number,
  documentNumber: string
) {
  const urgencyLevel = daysUntilExpiry <= 7 ? 'URGENT' : daysUntilExpiry <= 30 ? 'Important' : 'Reminder';
  const documentName = documentType === 'civil_id' ? 'Civil ID' : 
                       documentType === 'visa' ? 'Visa' : 
                       documentType === 'driving_license' ? 'Driving License' : 'Passport';
  
  const subject = `${urgencyLevel}: ${documentName} Expiring in ${daysUntilExpiry} days - ${employee.firstName} ${employee.lastName}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${daysUntilExpiry <= 7 ? '#fee2e2' : daysUntilExpiry <= 30 ? '#fef3c7' : '#f3f4f6'}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: ${daysUntilExpiry <= 7 ? '#dc2626' : daysUntilExpiry <= 30 ? '#d97706' : '#374151'}; margin: 0;">
          ${documentName} Expiry Alert
        </h2>
      </div>
      
      <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
        <h3 style="color: #374151; margin-top: 0;">Employee Information</h3>
        <p><strong>Name:</strong> ${employee.firstName} ${employee.lastName}</p>
        <p><strong>Email:</strong> ${employee.email}</p>
        <p><strong>Position:</strong> ${employee.position}</p>
        
        <h3 style="color: #374151;">Document Details</h3>
        <p><strong>${documentName} Number:</strong> ${documentNumber}</p>
        <p><strong>Expiry Date:</strong> ${new Date(expiryDate).toLocaleDateString()}</p>
        <p><strong>Days Until Expiry:</strong> <span style="color: ${daysUntilExpiry <= 7 ? '#dc2626' : daysUntilExpiry <= 30 ? '#d97706' : '#374151'}; font-weight: bold;">${daysUntilExpiry} days</span></p>
        
        <div style="background: ${daysUntilExpiry <= 7 ? '#fee2e2' : '#f9fafb'}; padding: 15px; border-radius: 6px; margin-top: 20px;">
          <p style="margin: 0; font-weight: 500;">
            ${daysUntilExpiry <= 7 ? 
              '⚠️ This document expires very soon! Immediate action required.' : 
              daysUntilExpiry <= 30 ? 
                '📅 Please begin the renewal process for this document.' :
                '🔔 This is an advance notice to prepare for renewal.'
            }
          </p>
        </div>
        
        <h3 style="color: #374151;">Next Steps</h3>
        <ul>
          <li>Contact the employee to confirm renewal status</li>
          <li>Ensure all required documentation is prepared</li>
          <li>Schedule appointments if necessary</li>
          <li>Update the HR system once renewed</li>
        </ul>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
          <p>This is an automated notification from the HR Management System.</p>
          <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
        </div>
      </div>
    </div>
  `;
  
  const text = `
${documentName} Expiry Alert

Employee: ${employee.firstName} ${employee.lastName}
Email: ${employee.email}
Position: ${employee.position}

${documentName} Number: ${documentNumber}
Expiry Date: ${new Date(expiryDate).toLocaleDateString()}
Days Until Expiry: ${daysUntilExpiry} days

${daysUntilExpiry <= 7 ? 
  'This document expires very soon! Immediate action required.' : 
  daysUntilExpiry <= 30 ? 
    'Please begin the renewal process for this document.' :
    'This is an advance notice to prepare for renewal.'
}

Next Steps:
- Contact the employee to confirm renewal status
- Ensure all required documentation is prepared
- Schedule appointments if necessary
- Update the HR system once renewed

This is an automated notification from the HR Management System.
Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
  `;

  return { subject, html, text };
}

export function calculateDaysUntilExpiry(expiryDate: string): number {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function shouldSendAlert(expiryDate: string, alertDays: number): boolean {
  const daysUntilExpiry = calculateDaysUntilExpiry(expiryDate);
  return daysUntilExpiry <= alertDays && daysUntilExpiry >= 0;
}

const defaultFromEmail = process.env.ALERT_FROM_EMAIL ?? 'alerts@example.com';

const normalizeChannel = (channel?: string | null): NotificationChannel => {
  switch ((channel ?? '').toLowerCase()) {
    case 'sms':
      return 'sms';
    case 'chat':
      return 'chat';
    case 'push':
      return 'push';
    default:
      return 'email';
  }
};

type SendChannelResult = { channel: NotificationChannel; delivered: boolean };

export async function sendNotificationViaChannels(
  notification: NotificationWithEmployee,
  channels: NotificationChannel[],
  options: {
    reason?: string;
    step?: NotificationEscalationStep;
    recipientEmail?: string;
    smsRecipient?: string;
    chatChannel?: string;
  } = {},
): Promise<SendChannelResult[]> {
  const uniqueChannels = Array.from(new Set(channels.map(normalizeChannel)));
  const results: SendChannelResult[] = [];
  const employeeName = `${notification.employee.firstName ?? ''} ${
    notification.employee.lastName ?? ''
  }`.trim();
  const baseMessage =
    options.step?.messageTemplate?.replace(/\{\{employeeName\}\}/g, employeeName) ??
    notification.message;
  const reasonSuffix = options.reason ? `\n\nReason: ${options.reason}` : '';

  for (const channel of uniqueChannels) {
    if (channel === 'email') {
      const to = options.recipientEmail ?? notification.employee.email ?? '';
      if (!to) {
        results.push({ channel, delivered: false });
        continue;
      }
      const delivered = await sendEmail({
        to,
        from: defaultFromEmail,
        subject: `[${notification.priority.toUpperCase()}] ${notification.title}`,
        text: `${baseMessage}${reasonSuffix}`,
        html: `<p>${baseMessage}</p>${options.reason ? `<p><strong>Reason:</strong> ${options.reason}</p>` : ''}`,
      });
      results.push({ channel, delivered });
    } else if (channel === 'sms') {
      const smsRecipient = options.smsRecipient ?? notification.employee.phone ?? '';
      const delivered = await sendSms({
        to: smsRecipient,
        message: `${notification.title}: ${baseMessage}`,
        notificationId: notification.id,
      });
      results.push({ channel, delivered });
    } else if (channel === 'chat') {
      const delivered = await sendChatMessage({
        channel: options.chatChannel ?? options.step?.targetRole ?? 'hr-alerts',
        message: `@${options.step?.targetRole ?? 'team'} ${notification.title} - ${baseMessage}`,
        notificationId: notification.id,
        targetRole: options.step?.targetRole,
      });
      results.push({ channel, delivered });
    } else {
      // push notifications fall back to chat log for visibility
      mockChatMessages.push({
        channel: 'push-fallback',
        message: `${notification.title}: ${baseMessage}`,
        notificationId: notification.id,
      });
      results.push({ channel, delivered: false });
    }
  }

  return results;
}

export async function sendNotificationDigest(params: {
  notifications: NotificationWithEmployee[];
  recipientEmail: string;
  from?: string;
}): Promise<boolean> {
  if (!params.recipientEmail || params.notifications.length === 0) {
    return false;
  }

  const subject = `Notification Digest (${params.notifications.length})`;
  const rows = params.notifications
    .map((notification) => {
      const due = notification.slaDueAt ? new Date(notification.slaDueAt) : undefined;
      const dueText = due ? due.toLocaleString() : 'N/A';
      return `<li><strong>${notification.title}</strong> — ${notification.priority.toUpperCase()} — SLA Due: ${dueText}</li>`;
    })
    .join('');
  const html = `<p>You have ${params.notifications.length} pending notifications.</p><ul>${rows}</ul>`;
  const textRows = params.notifications
    .map((notification) => {
      const due = notification.slaDueAt ? new Date(notification.slaDueAt) : undefined;
      const dueText = due ? due.toLocaleString() : 'N/A';
      return `- ${notification.title} [${notification.priority}] SLA Due: ${dueText}`;
    })
    .join('\n');
  const text = `You have ${params.notifications.length} pending notifications.\n${textRows}`;

  return await sendEmail({
    to: params.recipientEmail,
    from: params.from ?? defaultFromEmail,
    subject,
    html,
    text,
  });
}

async function resolveRoutingRule(
  storage: IStorage,
  notification: NotificationWithEmployee,
): Promise<NotificationRoutingRuleWithSteps | undefined> {
  if (notification.routingRule) {
    return notification.routingRule;
  }
  if (!('routingRuleId' in notification) || !notification.routingRuleId) {
    return undefined;
  }
  const rules = await storage.getNotificationRoutingRules();
  return rules.find((rule) => rule.id === notification.routingRuleId);
}

export async function escalateNotification(args: {
  storage: IStorage;
  notification: NotificationWithEmployee;
  reason?: string;
  now?: Date;
}): Promise<{
  step?: NotificationEscalationStep;
  historyEntry?: NotificationEscalationHistoryEntry;
  channels?: NotificationChannel[];
}> {
  const { storage, notification, reason } = args;
  const now = args.now ?? new Date();
  const rule = await resolveRoutingRule(storage, notification);

  if (!rule || rule.steps.length === 0) {
    await storage.updateNotification(notification.id, {
      escalationStatus: 'closed',
      slaDueAt: null,
    });
    return {};
  }

  const sortedSteps = [...rule.steps].sort((a, b) => a.level - b.level);
  const currentLevel = notification.escalationLevel ?? 0;
  const nextStep = sortedSteps.find((step) => step.level > currentLevel);

  if (!nextStep) {
    await storage.updateNotification(notification.id, {
      escalationStatus: 'closed',
      slaDueAt: null,
    });
    return {};
  }

  const stepChannel = normalizeChannel(nextStep.channel);
  const channels = Array.from(
    new Set<NotificationChannel>([
      ...(notification.deliveryChannels ?? []),
      stepChannel,
    ]),
  );

  await sendNotificationViaChannels(notification, channels, {
    reason,
    step: nextStep,
  });

  const historyEntry: NotificationEscalationHistoryEntry = {
    level: nextStep.level,
    channel: stepChannel,
    recipient: nextStep.targetRole ?? notification.employee.email ?? notification.employee.firstName,
    escalatedAt: now.toISOString(),
    status: 'escalated',
    notes: reason ?? nextStep.messageTemplate ?? null,
  };

  await storage.appendNotificationEscalationHistory(
    notification.id,
    historyEntry,
    'escalated',
  );

  const nextDue = nextStep.escalateAfterMinutes
    ? new Date(now.getTime() + nextStep.escalateAfterMinutes * 60_000)
    : null;

  await storage.updateNotification(notification.id, {
    deliveryChannels: channels,
    slaDueAt: nextDue ?? null,
    escalationStatus: 'escalated',
  });

  return { step: nextStep, historyEntry, channels };
}

export async function escalateOverdueNotifications(storage: IStorage): Promise<number> {
  const notifications = await storage.getNotifications();
  let escalated = 0;
  const now = new Date();

  for (const notification of notifications) {
    if (
      !notification.slaDueAt ||
      notification.status === 'read' ||
      notification.status === 'dismissed' ||
      notification.escalationStatus === 'closed'
    ) {
      continue;
    }

    const dueAt = new Date(notification.slaDueAt);
    if (Number.isNaN(dueAt.getTime())) {
      continue;
    }

    if (dueAt.getTime() <= now.getTime()) {
      const result = await escalateNotification({
        storage,
        notification,
        reason: 'Automatic escalation — SLA breached',
        now,
      });
      if (result.step) {
        escalated += 1;
      }
    }
  }

  return escalated;
}
