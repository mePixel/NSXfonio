import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

let transporter = null;

function buildOfferConfirmationLink(candidateId) {
  return `${env.publicAppUrl}/reschedule-offer/${encodeURIComponent(candidateId)}`;
}

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

function formatSlotTime(slot) {
  const startsAt = slot?.startsAt ?? slot?.startTime ?? null;
  if (!startsAt) return null;

  return new Date(startsAt).toLocaleString("de-AT", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatResponseDeadline(value) {
  if (!value) return null;

  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return null;

  return deadline.toLocaleString("de-AT", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Vienna"
  });
}

export async function sendNoAnswerFollowupEmail(
  customer,
  offer,
  slot,
  { candidateId = null } = {}
) {
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
    const confirmationLink = candidateId ? buildOfferConfirmationLink(candidateId) : null;
    const slotTime = formatSlotTime(slot);
    const responseDeadline = formatResponseDeadline(offer?.responseDeadlineAt);

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>We Tried to Reach You</h2>
        <p>Hi ${customerName},</p>
        
        <p>We recently tried to give you a call about your ${slot?.title || "appointment"}, but we weren't able to reach you.</p>
        ${confirmationLink ? `
        <p>An earlier appointment is currently available for you. Use the link below to confirm the new appointment and choose which of your next appointments should be cancelled.</p>
        <p style="margin: 24px 0;">
          <a
            href="${confirmationLink}"
            style="display: inline-block; background: #111827; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;"
          >
            Confirm earlier appointment
          </a>
        </p>
        <p>If the button does not work, open this link in your browser:<br><a href="${confirmationLink}">${confirmationLink}</a></p>
        ${responseDeadline ? `
        <p style="margin: 16px 0; padding: 12px 16px; border-left: 4px solid #d97706; background: #fffbeb; color: #92400e;">
          <strong>Please respond before ${responseDeadline}.</strong><br>
          After this time, the invitation expires and the appointment may be offered to another patient.
        </p>
        ` : ""}
        ` : ""}
        
        <p>We'd still love to help! Here are some ways you can follow up:</p>
        <ul>
          <li>Call us back at your earliest convenience</li>
          <li>Reply to this email to let us know your availability</li>
          ${confirmationLink ? "<li>Use the confirmation link above to accept the earlier slot</li>" : ""}
        </ul>
        
        <p style="margin-top: 24px; font-size: 14px; color: #666;">
          <strong>Appointment Details:</strong><br>
          ${slotTime ? `Available slot: ${slotTime}` : "An earlier slot is available."}
        </p>
        
        <p style="margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px; font-size: 12px; color: #999;">
          This is an automated message. Please do not reply to this email if you need immediate assistance.
        </p>
      </div>
    `;

    const textContent = `
      We Tried to Reach You

      Hi ${customerName},

      We recently tried to give you a call about an earlier appointment, but we weren't able to reach you.

      ${confirmationLink ? `An earlier appointment is currently available for you. Open this link to confirm the new appointment and choose which of your next appointments should be cancelled:
      ${confirmationLink}
      ${responseDeadline ? `
      Please respond before ${responseDeadline}. After this time, the invitation expires and the appointment may be offered to another patient.` : ""}` : ""}

      We'd still love to help! Here are some ways you can follow up:
      - Call us back at your earliest convenience
      - Reply to this email to let us know your availability
      ${confirmationLink ? "- Use the confirmation link above to accept the earlier slot" : ""}

      Appointment Details:
      ${slotTime ? `Available slot: ${slotTime}` : "An earlier slot is available."}

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
