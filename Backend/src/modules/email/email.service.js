import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

// Initialize email transporter (only if email is configured)
let transporter = null;

function initializeTransporter() {
  if (transporter) return transporter;

  if (!env.smtpHost || !env.smtpPort || !env.smtpUser || !env.smtpPassword) {
    console.warn("[email] SMTP not configured - email sending disabled");
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPassword
      }
    });

    // Verify connection
    transporter.verify((error) => {
      if (error) {
        console.error("[email] SMTP connection failed:", error);
        transporter = null;
      } else {
        console.log("[email] SMTP connection successful");
      }
    });

    return transporter;
  } catch (error) {
    console.error("[email] Failed to initialize transporter:", error);
    return null;
  }
}

export async function sendNoAnswerFollowupEmail(customer, offer, slot) {
  const emailTransporter = initializeTransporter();
  if (!emailTransporter) {
    console.warn("[email] Email service not available, skipping email send");
    return { sent: false, reason: "email_service_unavailable" };
  }

  if (!customer?.email) {
    console.log(`[email] Customer ${customer?.id} has no email address, skipping`);
    return { sent: false, reason: "no_customer_email" };
  }

  try {
    const customerName = `${customer.firstName} ${customer.lastName}`;
    const subject = `We Tried to Reach You - About Your ${slot?.title || "Appointment"}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>We Tried to Reach You</h2>
        <p>Hi ${customerName},</p>
        
        <p>We recently tried to give you a call about your ${slot?.title || "appointment"}, but we weren't able to reach you.</p>
        
        <p>We'd still love to help! Here are some ways you can follow up:</p>
        <ul>
          <li>Call us back at your earliest convenience</li>
          <li>Reply to this email to let us know your availability</li>
          <li>Check our website for available time slots</li>
        </ul>
        
        <p style="margin-top: 24px; font-size: 14px; color: #666;">
          <strong>Appointment Details:</strong><br>
          ${slot?.title ? `Title: ${slot.title}` : ''}<br>
          ${slot?.startTime ? `Scheduled for: ${new Date(slot.startTime).toLocaleString()}` : ''}
        </p>
        
        <p style="margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px; font-size: 12px; color: #999;">
          This is an automated message. Please do not reply to this email if you need immediate assistance.
        </p>
      </div>
    `;

    const textContent = `
      We Tried to Reach You

      Hi ${customerName},

      We recently tried to give you a call about your ${slot?.title || "appointment"}, but we weren't able to reach you.

      We'd still love to help! Here are some ways you can follow up:
      - Call us back at your earliest convenience
      - Reply to this email to let us know your availability
      - Check our website for available time slots

      Appointment Details:
      ${slot?.title ? `Title: ${slot.title}` : ''}
      ${slot?.startTime ? `Scheduled for: ${new Date(slot.startTime).toLocaleString()}` : ''}

      This is an automated message. Please do not reply to this email if you need immediate assistance.
    `;

    const info = await emailTransporter.sendMail({
      from: env.smtpFromEmail || env.smtpUser,
      to: customer.email,
      subject,
      html: htmlContent,
      text: textContent,
      replyTo: env.smtpReplyTo || env.smtpUser
    });

    console.log(`[email] Email sent to ${customer.email}. Message ID: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[email] Failed to send email to ${customer.email}:`, error);
    return { sent: false, reason: "send_failed", error: error.message };
  }
}

export async function sendCallFailureNotification(customer, offer, slot, failureReason = "no-answer") {
  // General fallback for other failure reasons
  return sendNoAnswerFollowupEmail(customer, offer, slot);
}

export function isEmailServiceAvailable() {
  const transporter = initializeTransporter();
  return transporter !== null;
}
