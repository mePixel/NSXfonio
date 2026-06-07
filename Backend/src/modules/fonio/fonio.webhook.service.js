import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  communicationLogs,
  customers,
  reschedulerCandidateCalls,
  waitingListEntries,
  webhookEvents,
  waitlistOffers
} from "../../db/schema.js";
import {
  completeAcceptedReschedulerOffer,
  markReschedulerFlowExhausted,
  recordCandidateForOffer,
  syncReschedulerOfferOutcome
} from "../rescheduler/rescheduler.service.js";
import { moveWaitlistEntryToEnd } from "../waitlist/offers.service.js";
import { handleInboundAppointmentWebhook, isInboundAppointmentWebhook } from "./fonio.inbound.service.js";
import { sendNoAnswerFollowupEmail } from "../email/email.service.js";
import { getEmailResponseDeadlineMinutes } from "../settings/settings.service.js";
import { getSlot } from "../slots/slots.service.js";

function extractWaitlistDecision(payload) {
  const rawValues = [
    payload?.waitlist?.decision,
    payload?.offerDecision,
    payload?.decision,
    payload?.intent?.name,
    payload?.intent?.status,
    payload?.outcome,
    payload?.result?.decision
  ].filter(Boolean);

  if (payload?.waitlist?.accepted === true || payload?.accepted === true) {
    return "accepted";
  }
  if (payload?.waitlist?.accepted === false || payload?.accepted === false) {
    return "declined";
  }

  for (const value of rawValues) {
    const normalized = String(value).toLowerCase();
    if (["accept", "accepted", "confirm", "confirmed", "yes", "booked"].includes(normalized)) {
      return "accepted";
    }
    if (["decline", "declined", "reject", "rejected", "no"].includes(normalized)) {
      return "declined";
    }
  }

  return null;
}

function extractSelectedAppointmentId(payload) {
  return payload?.cancellation?.appointmentId
    ?? payload?.selectedAppointmentId
    ?? payload?.appointmentId
    ?? payload?.appointment?.id
    ?? payload?.selectedAppointment?.id
    ?? payload?.reschedule?.appointmentToCancelId
    ?? null;
}

async function storeWebhookEvent(payload) {
  const externalEventId = payload?.eventId ?? payload?.webhookEventId ?? payload?.callId ?? payload?.id ?? null;

  try {
    const [event] = await db.insert(webhookEvents).values({
      id: randomUUID(),
      provider: "fonio",
      eventType: payload?.type ?? payload?.status ?? "unknown",
      externalEventId,
      payloadJson: JSON.stringify(payload),
      processingStatus: "pending"
    }).returning();

    return { event, duplicated: false };
  } catch (error) {
    const isDuplicateExternalEvent = error?.code === "23505"
      && (
        error?.constraint === "webhook_events_external_event_id_unique"
        || String(error?.constraint ?? "").includes("webhook_events")
        || String(error?.detail ?? "").includes("external_event_id")
      );

    if (isDuplicateExternalEvent) {
      return { event: null, duplicated: true };
    }
    throw error;
  }
}

async function sendNoAnswerEmailForOffer(offer) {
  const [entry] = await db
    .select()
    .from(waitingListEntries)
    .where(eq(waitingListEntries.id, offer.waitingListEntryId));

  if (!entry) return { sent: false, reason: "waitlist_entry_not_found" };

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, entry.customerId));

  if (!customer) return { sent: false, reason: "customer_not_found" };

  const slot = await getSlot(offer.clientId, offer.slotId);
  const [candidate] = await db
    .select({ id: reschedulerCandidateCalls.id })
    .from(reschedulerCandidateCalls)
    .where(and(
      eq(reschedulerCandidateCalls.clientId, offer.clientId),
      eq(reschedulerCandidateCalls.waitlistOfferId, offer.id)
    ))
    .limit(1);
  const emailResult = await sendNoAnswerFollowupEmail(customer, offer, slot, {
    candidateId: candidate?.id ?? null
  });

  await db.insert(communicationLogs).values({
    id: randomUUID(),
    clientId: offer.clientId,
    waitlistOfferId: offer.id,
    customerId: customer.id,
    channel: "email",
    direction: "outbound",
    eventType: "no_answer_followup_email",
    status: emailResult.sent ? "sent" : "failed",
    externalMessageId: emailResult.messageId ?? null,
    externalRef: JSON.stringify(emailResult)
  });

  return emailResult;
}

async function getResetResponseDeadline(offer) {
  const configuredWindowMs = offer.responseDeadlineAt && offer.createdAt
    ? new Date(offer.responseDeadlineAt).getTime() - new Date(offer.createdAt).getTime()
    : NaN;
  const windowMs = Number.isFinite(configuredWindowMs) && configuredWindowMs > 0
    ? configuredWindowMs
    : await getEmailResponseDeadlineMinutes() * 60 * 1000;

  return new Date(Date.now() + windowMs);
}

async function handleOutboundWebhook(payload) {
  const offerId = payload?.context?.offerId;
  const callStatus = payload?.status
    ?? payload?.callStatus
    ?? payload?.outcome
    ?? payload?.disconnectReason
    ?? payload?.endReason
    ?? payload?.hangupReason;

  if (!offerId || !callStatus) {
    return { handled: false, mode: "outbound", reason: "no_offer_context" };
  }

  const [offer] = await db
    .select()
    .from(waitlistOffers)
    .where(eq(waitlistOffers.id, offerId));

  if (!offer || offer.status !== "calling") {
    return { handled: false, mode: "outbound", reason: "offer_not_active" };
  }

  const normalizedStatus = String(callStatus).toLowerCase();
  const noAnswer = [
    "no-answer",
    "no_answer",
    "noanswer",
    "missed",
    "unanswered",
    "inactivity",
    "timeout",
    "timed_out",
    "busy",
    "failed"
  ].includes(normalizedStatus);
  const answered = ["completed", "answered", "success"].includes(normalizedStatus);

  if (noAnswer) {
    const responseDeadlineAt = await getResetResponseDeadline(offer);
    const [updatedOffer] = await db.update(waitlistOffers)
      .set({ status: "call_no_answer", responseDeadlineAt, updatedAt: new Date() })
      .where(and(
        eq(waitlistOffers.id, offerId),
        eq(waitlistOffers.status, "calling")
      ))
      .returning();

    if (!updatedOffer) {
      return { handled: false, mode: "outbound", reason: "offer_not_active" };
    }

    await syncReschedulerOfferOutcome(offer.clientId, offerId);

    let emailResult = { sent: false, reason: "not_attempted" };
    try {
      emailResult = await sendNoAnswerEmailForOffer(updatedOffer);
    } catch (error) {
      console.error("[fonio webhook] Error sending follow-up email:", error);
      emailResult = { sent: false, reason: "send_or_log_failed", error: error?.message ?? String(error) };
    }

    await moveWaitlistEntryToEnd(offer.clientId, offer.waitingListEntryId);
    let advanced = { nextOffer: null };
    try {
      advanced = await advanceOfferCycle(offer.clientId, offerId);
      if (advanced.nextOffer?.id) {
        await recordCandidateForOffer(offer.clientId, advanced.nextOffer.id);
      } else {
        await markReschedulerFlowExhausted(offer.clientId, offerId);
      }
    } catch (error) {
      console.error("[fonio webhook] failed to advance waitlist offer after no answer", {
        offerId,
        error: error?.message ?? error
      });
    }
    return {
      handled: true,
      mode: "outbound",
      outcome: "call_no_answer",
      offerId,
      email: emailResult,
      advanced: false,
      responseDeadlineAt
    };
  }

  if (answered) {
    const decision = extractWaitlistDecision(payload);

    if (decision === "declined") {
      await db.update(waitlistOffers)
        .set({ status: "declined", updatedAt: new Date() })
        .where(eq(waitlistOffers.id, offerId));
      await syncReschedulerOfferOutcome(offer.clientId, offerId);
      const advanced = await advanceOfferCycle(offer.clientId, offerId);
      if (advanced.nextOffer?.id) {
        await recordCandidateForOffer(offer.clientId, advanced.nextOffer.id);
      } else {
        await markReschedulerFlowExhausted(offer.clientId, offerId);
      }
      return { handled: true, mode: "outbound", outcome: "declined", offerId };
    }

    if (decision === "accepted") {
      const selectedAppointmentId = extractSelectedAppointmentId(payload);
      const result = await completeAcceptedReschedulerOffer(offer.clientId, offerId, {
        selectedAppointmentId,
        payload
      });
      return {
        handled: true,
        mode: "outbound",
        outcome: "accepted",
        offerId,
        replacementAppointmentId: result.replacementAppointment.id,
        cancelledAppointmentId: result.cancelledAppointmentId
      };
    }

    return {
      handled: true,
      mode: "outbound",
      outcome: "call_completed",
      offerId,
      nextAction: "Call /api/fonio/rescheduler/accept only if the patient clearly accepted the offered appointment."
    };
  }

  return { handled: false, mode: "outbound", reason: "status_not_mapped", offerId };
}

export async function processFonioWebhook(payload) {
  const stored = await storeWebhookEvent(payload);
  if (stored.duplicated) {
    return { received: true, duplicate: true };
  }

  console.log("[fonio webhook]", JSON.stringify(payload, null, 2));

  const result = payload?.context?.offerId
    ? await handleOutboundWebhook(payload)
    : isInboundAppointmentWebhook(payload)
      ? await handleInboundAppointmentWebhook(payload)
      : await handleOutboundWebhook(payload);

  if (stored.event) {
    await db.update(webhookEvents)
      .set({
        processingStatus: result.handled ? "processed" : "ignored",
        processedAt: new Date()
      })
      .where(eq(webhookEvents.id, stored.event.id));
  }

  return { received: true, ...result };
}
