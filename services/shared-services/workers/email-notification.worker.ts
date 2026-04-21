import { Job } from 'bullmq';
import { Logger } from '@t3ck/shared';
import nodemailer, { Transporter } from 'nodemailer';

const logger = new Logger('email-worker');

/**
 * Email notification worker
 * Processes email tasks from the queue
 */

interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  data?: Record<string, any>;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}

let emailTransporter: Transporter | null = null;

/**
 * Initialize email transporter
 */
function getEmailTransporter(): Transporter {
  if (emailTransporter) {
    return emailTransporter;
  }

  const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  };

  emailTransporter = nodemailer.createTransport(smtpConfig);
  logger.info('Email transporter initialized', { host: smtpConfig.host });
  return emailTransporter;
}

/**
 * Email templates mapping
 */
const emailTemplates: Record<string, (data: any) => {subject: string; html: string}> = {
  welcome: (data: any) => ({
    subject: `Welcome to T3CK Core, ${data.firstName}!`,
    html: `
      <h1>Welcome to T3CK Core</h1>
      <p>Hi ${data.firstName},</p>
      <p>Your account has been successfully created.</p>
      <p>Start exploring our e-commerce platform today!</p>
      <a href="${data.loginUrl}">Sign In</a>
    `,
  }),

  passwordReset: (data: any) => ({
    subject: 'Password Reset Request',
    html: `
      <h1>Password Reset</h1>
      <p>Hi ${data.firstName},</p>
      <p>We received a password reset request for your account.</p>
      <a href="${data.resetUrl}">Reset Password</a>
      <p>This link expires in 1 hour.</p>
    `,
  }),

  orderConfirmation: (data: any) => ({
    subject: `Order Confirmation #${data.orderId}`,
    html: `
      <h1>Order Confirmation</h1>
      <p>Thank you for your order!</p>
      <p>Order ID: ${data.orderId}</p>
      <p>Total: ${data.total}</p>
      <a href="${data.orderUrl}">View Order</a>
    `,
  }),

  shipmentNotification: (data: any) => ({
    subject: `Your order is on its way!`,
    html: `
      <h1>Shipment Notification</h1>
      <p>Hi ${data.firstName},</p>
      <p>Your order #${data.orderId} has been shipped!</p>
      <p>Tracking Number: ${data.trackingNumber}</p>
      <a href="${data.trackingUrl}">Track Shipment</a>
    `,
  }),

  paymentReceipt: (data: any) => ({
    subject: `Payment Receipt - ${data.paymentId}`,
    html: `
      <h1>Payment Receipt</h1>
      <p>Payment ID: ${data.paymentId}</p>
      <p>Amount: ${data.amount}</p>
      <p>Status: ${data.status}</p>
    `,
  }),

  tenantInvitation: (data: any) => ({
    subject: `You're invited to ${data.tenantName}!`,
    html: `
      <h1>Tenant Invitation</h1>
      <p>Hi ${data.firstName},</p>
      <p>You've been invited to join ${data.tenantName} on T3CK Core.</p>
      <a href="${data.inviteUrl}">Accept Invitation</a>
      <p>This invitation expires in 7 days.</p>
    `,
  }),
};

/**
 * Process email job
 */
export async function processEmailJob(job: Job<EmailJobData>) {
  try {
    logger.info(`Processing email job: ${job.id}`, {
      to: job.data.to,
      template: job.data.template,
    });

    const transporter = getEmailTransporter();

    // Get template
    const template = emailTemplates[job.data.template];
    if (!template) {
      throw new Error(`Unknown email template: ${job.data.template}`);
    }

    const { subject, html } = template(job.data.data || {});

    // Send email
    const info = await transporter.sendMail({
      from: `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
      to: job.data.to,
      cc: job.data.cc,
      bcc: job.data.bcc,
      replyTo: job.data.replyTo,
      subject,
      html,
    });

    logger.info(`Email sent successfully: ${job.id}`, {
      messageId: info.messageId,
      to: job.data.to,
    });

    return {
      success: true,
      messageId: info.messageId,
      recipients: info.accepted,
    };
  } catch (error) {
    logger.error(`Email job failed: ${job.id}`, {
      attempt: job.attemptsMade,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Register email worker
 * Call this in your service initialization
 */
import { createWorker } from '@t3ck/shared/queue';

export function registerEmailWorker() {
  const concurrency = parseInt(process.env.EMAIL_WORKER_CONCURRENCY || '5');
  createWorker('email-notifications', processEmailJob, concurrency);
  logger.info('Email worker registered', { concurrency });
}
