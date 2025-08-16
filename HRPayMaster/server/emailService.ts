import { MailService } from '@sendgrid/mail';
import type { DocumentExpiryCheck, Employee } from '@shared/schema';

const mailService = new MailService();
const apiKey = process.env.SENDGRID_API_KEY;
let sendGridConfigured = false;

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
    console.error('SENDGRID_API_KEY not set or invalid. Email not sent.');
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

export function generateExpiryWarningEmail(
  employee: Employee,
  documentType: 'visa' | 'civil_id' | 'passport',
  expiryDate: string,
  daysUntilExpiry: number,
  documentNumber: string
) {
  const urgencyLevel = daysUntilExpiry <= 7 ? 'URGENT' : daysUntilExpiry <= 30 ? 'Important' : 'Reminder';
  const documentName = documentType === 'civil_id' ? 'Civil ID' : 
                       documentType === 'visa' ? 'Visa' : 'Passport';
  
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