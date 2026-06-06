import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (env.smtpHost && env.smtpPort) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: Number(env.smtpPort),
      secure: env.smtpSecure === "true", // true for 465, false for other ports
      auth: env.smtpUser ? {
        user: env.smtpUser,
        pass: env.smtpPassword
      } : undefined
    });
  } else if (env.nodeEnv === "development") {
    // For development, use ethereal (fake SMTP)
    console.warn("[email] No SMTP configured, email will NOT be sent in development mode");
    return null;
  }

  return transporter;
}

export async function sendWaitlistOfferEmail(customer, slot, offer, clientName) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[email] Transporter not configured, skipping email send");
    return null;
  }

  if (!customer?.email) {
    console.warn(`[email] Customer ${customer?.id} has no email, skipping`);
    return null;
  }

  const subject = `${clientName} — Appointment Slot Available`;
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>An appointment slot just became available!</h2>
        <p>Hi ${customer.firstName},</p>
        <p>We have an available appointment slot for <strong>${clientName}</strong>.</p>
        <p>
          <strong>Slot Details:</strong><br>
          Date & Time: ${slot?.startTime ? new Date(slot.startTime).toLocaleString() : "Soon"}<br>
          Duration: ${slot?.durationMinutes || "TBD"} minutes
        </p>
        <p>
          You just missed our call, but we're sending you this reminder so you don't forget!
        </p>
        <p>Please reply to this email or contact us if you'd like to confirm this appointment.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">
          This is an automated message. Please do not reply directly to this email if you've already confirmed via phone.
        </p>
      </body>
    </html>
  `;

  const textContent = `
An appointment slot just became available!

Hi ${customer.firstName},

We have an available appointment slot for ${clientName}.

Slot Details:
Date & Time: ${slot?.startTime ? new Date(slot.startTime).toLocaleString() : "Soon"}
Duration: ${slot?.durationMinutes || "TBD"} minutes

You just missed our call, but we're sending you this reminder so you don't forget!

Please reply to this email or contact us if you'd like to confirm this appointment.

---
This is an automated message.
  `;

  try {
    const result = await transporter.sendMail({
      from: env.smtpFromEmail || "noreply@nsxfonio.com",
      to: customer.email,
      subject,
      html: htmlContent,
      text: textContent,
      headers: {
        "X-Waitlist-Offer-Id": offer.id,
        "X-Client-Id": offer.clientId,
        "X-Slot-Id": offer.slotId
      }
    });

    console.log(`[email] Email sent to ${customer.email} for offer ${offer.id}:`, result.messageId);
    return result;
  } catch (error) {
    console.error(`[email] Failed to send email to ${customer.email}:`, error.message);
    throw error;
  }
}
