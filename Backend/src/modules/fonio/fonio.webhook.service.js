import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { webhookEvents, waitlistOffers } from "../../db/schema.js";
import { recordCandidateForOffer, syncReschedulerOfferOutcome } from "../rescheduler/rescheduler.service.js";
import { advanceOfferCycle, moveWaitlistEntryToEnd } from "../waitlist/offers.service.js";
import { handleInboundAppointmentWebhook, isInboundAppointmentWebhook } from "./fonio.inbound.service.js";

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
    await db.update(waitlistOffers)
      .set({ status: "call_no_answer", updatedAt: new Date() })
      .where(eq(waitlistOffers.id, offerId));
    await syncReschedulerOfferOutcome(offer.clientId, offerId);
    await moveWaitlistEntryToEnd(offer.clientId, offer.waitingListEntryId);
    let advanced = { nextOffer: null };
    try {
      advanced = await advanceOfferCycle(offer.clientId, offerId);
      if (advanced.nextOffer?.id) {
        await recordCandidateForOffer(offer.clientId, advanced.nextOffer.id);
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
      advanced: Boolean(advanced.nextOffer)
    };
  }

  if (answered) {
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
