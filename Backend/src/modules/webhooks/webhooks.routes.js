import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { db } from "../../db/index.js";
import { communicationLogs, webhookEvents, waitlistOffers } from "../../db/schema.js";
import { advanceOfferCycle } from "../waitlist/offers.service.js";

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
          // Immediately call the next person on the waitlist
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
