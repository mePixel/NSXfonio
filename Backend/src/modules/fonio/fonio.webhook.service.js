import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { webhookEvents, waitlistOffers, customers, waitingListEntries, communicationLogs } from "../../db/schema.js";
import { advanceOfferCycle } from "../waitlist/offers.service.js";
import { handleInboundAppointmentWebhook, isInboundAppointmentWebhook } from "./fonio.inbound.service.js";
import { sendNoAnswerFollowupEmail } from "../email/email.service.js";
import { getSlot } from "../slots/slots.service.js";

async function storeWebhookEvent(payload) {
  const externalEventId = payload?.callId ?? payload?.id ?? null;

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
    if (error?.code === "23505") {
      return { event: null, duplicated: true };
    }
    throw error;
  }
}

async function handleOutboundWebhook(payload) {
  const offerId = payload?.context?.offerId;
  const callStatus = payload?.status ?? payload?.callStatus ?? payload?.outcome;

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
  const noAnswer = ["no-answer", "no_answer", "noanswer", "missed", "unanswered"].includes(normalizedStatus);
  const answered = ["completed", "answered", "success"].includes(normalizedStatus);

  if (noAnswer) {
    await db.update(waitlistOffers)
      .set({ status: "call_no_answer", updatedAt: new Date() })
      .where(eq(waitlistOffers.id, offerId));

    // Send follow-up email to customer
    try {
      const [entry] = await db
        .select()
        .from(waitingListEntries)
        .where(eq(waitingListEntries.id, offer.waitingListEntryId));

      if (entry) {
        const [customer] = await db
          .select()
          .from(customers)
          .where(eq(customers.id, entry.customerId));

        if (customer) {
          const slot = await getSlot(offer.clientId, offer.slotId);
          const emailResult = await sendNoAnswerFollowupEmail(customer, offer, slot);
          
          // Log the email communication attempt
          await db.insert(communicationLogs).values({
            id: randomUUID(),
            clientId: offer.clientId,
            waitlistOfferId: offer.id,
            customerId: customer.id,
            channel: "email",
            direction: "outbound",
            eventType: "no_answer_followup_email",
            status: emailResult.sent ? "sent" : "failed",
            externalRef: emailResult.messageId ? JSON.stringify({ messageId: emailResult.messageId }) : null
          }).catch(err => {
            console.warn("[fonio webhook] Failed to log email communication:", err);
          });
        }
      }
    } catch (error) {
      console.error("[fonio webhook] Error sending follow-up email:", error);
      // Continue with the offer cycle even if email fails
    }

    await advanceOfferCycle(offer.clientId, offerId);
    return { handled: true, mode: "outbound", outcome: "call_no_answer", offerId };
  }

  if (answered) {
    await db.update(waitlistOffers)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(waitlistOffers.id, offerId));
    return { handled: true, mode: "outbound", outcome: "accepted", offerId };
  }

  return { handled: false, mode: "outbound", reason: "status_not_mapped", offerId };
}

export async function processFonioWebhook(payload) {
  const stored = await storeWebhookEvent(payload);
  if (stored.duplicated) {
    return { received: true, duplicate: true };
  }

  console.log("[fonio webhook]", JSON.stringify(payload, null, 2));

  const result = isInboundAppointmentWebhook(payload)
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
