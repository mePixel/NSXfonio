import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { db } from "../../db/index.js";
import { communicationLogs, webhookEvents, waitlistOffers, waitingListEntries } from "../../db/schema.js";
import { advanceOfferCycle } from "../waitlist/offers.service.js";
import { sendWaitlistOfferEmail } from "../email/email.service.js";
import { getCustomer } from "../customers/customers.service.js";
import { getSlot } from "../slots/slots.service.js";

export const webhooksRouter = Router();

webhooksRouter.post("/fonio", async (req, res, next) => {
  try {
    const payload = req.body;

    // Store raw webhook before doing anything else
    await db.insert(webhookEvents).values({
      id: randomUUID(),
      provider: "fonio",
      eventType: payload?.type ?? payload?.status ?? "unknown",
      externalEventId: payload?.callId ?? payload?.id ?? null,
      payloadJson: JSON.stringify(payload),
      processingStatus: "pending"
    });

    console.log("[fonio webhook]", JSON.stringify(payload, null, 2));

    // Try to find the waitlist offer from context.offerId
    const offerId = payload?.context?.offerId;
    const callStatus = payload?.status ?? payload?.callStatus ?? payload?.outcome;

    if (offerId && callStatus) {
      const [offer] = await db
        .select()
        .from(waitlistOffers)
        .where(eq(waitlistOffers.id, offerId));

      if (offer && offer.status === "calling") {
        const noAnswer = ["no-answer", "no_answer", "noanswer", "missed", "unanswered"].includes(
          String(callStatus).toLowerCase()
        );
        const answered = ["completed", "answered", "success"].includes(
          String(callStatus).toLowerCase()
        );

        if (noAnswer) {
          // Log the no-answer outcome
          await db.update(waitlistOffers)
            .set({ status: "call_no_answer", updatedAt: new Date() })
            .where(eq(waitlistOffers.id, offerId));

          // Fetch customer and slot details to send email
          try {
            const entry = await db.select().from(waitingListEntries).where(eq(waitingListEntries.id, offer.waitingListEntryId));
            if (entry?.[0]) {
              const customer = await getCustomer(offer.clientId, entry[0].customerId);
              const slot = await getSlot(offer.clientId, offer.slotId);

              if (customer?.email) {
                // Log email communication attempt
                const emailLogId = randomUUID();
                await db.insert(communicationLogs).values({
                  id: emailLogId,
                  clientId: offer.clientId,
                  waitlistOfferId: offer.id,
                  customerId: customer.id,
                  channel: "email",
                  direction: "outbound",
                  eventType: "no_answer_followup_email",
                  status: "requested"
                });

                // Send email
                try {
                  const emailResult = await sendWaitlistOfferEmail(customer, slot, offer, "Service");
                  await db.update(communicationLogs)
                    .set({
                      status: emailResult ? "sent" : "skipped",
                      externalRef: emailResult ? JSON.stringify(emailResult) : null
                    })
                    .where(eq(communicationLogs.id, emailLogId));
                } catch (emailError) {
                  console.error("[webhook] Email send failed:", emailError.message);
                  await db.update(communicationLogs)
                    .set({
                      status: "failed",
                      externalRef: JSON.stringify({ error: emailError.message })
                    })
                    .where(eq(communicationLogs.id, emailLogId));
                }
              }
            }
          } catch (emailContextError) {
            console.error("[webhook] Failed to send email due to context fetch error:", emailContextError.message);
          }

          // Immediately call the next person on the waitlist (after 3 minutes in real implementation)
          await advanceOfferCycle(offer.clientId, offerId);
        } else if (answered) {
          await db.update(waitlistOffers)
            .set({ status: "accepted", updatedAt: new Date() })
            .where(eq(waitlistOffers.id, offerId));
        }
      }
    }

    // Always 200 — Fonio must not retry
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});
