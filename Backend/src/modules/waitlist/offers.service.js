import { randomUUID } from "crypto";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../db/index.js";
import { communicationLogs, waitingListEntries, waitlistOffers } from "../../db/schema.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { getCustomer } from "../customers/customers.service.js";
import { triggerOutboundCall } from "../fonio/fonio.client.js";
import { getSlot } from "../slots/slots.service.js";

const ACTIVE_STATUSES  = ["pending", "calling", "call_no_answer", "whatsapp_sent"];
const DEFAULT_DEADLINE_MINUTES = 60;

// Finds the next waitlist entry that has not yet been offered (or all previous offers are terminal).
async function getNextEntry(clientId, slotId) {
  const entries = await db
    .select()
    .from(waitingListEntries)
    .where(eq(waitingListEntries.clientId, clientId))
    .orderBy(asc(waitingListEntries.position));

  if (entries.length === 0) return null;

  const existingOffers = await db
    .select()
    .from(waitlistOffers)
    .where(and(eq(waitlistOffers.clientId, clientId), eq(waitlistOffers.slotId, slotId)));

  const activeOffersOtherSlots = await db
    .select()
    .from(waitlistOffers)
    .where(and(
      eq(waitlistOffers.clientId, clientId),
      ne(waitlistOffers.slotId, slotId),
      inArray(waitlistOffers.status, ACTIVE_STATUSES)
    ));

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  for (const entry of entries) {
    const entryOffers = existingOffers.filter(o => o.waitingListEntryId === entry.id);
    const hasActive   = entryOffers.some(o => ACTIVE_STATUSES.includes(o.status));
    const hasAccepted = entryOffers.some(o => o.status === "accepted");
    const hasOtherActiveOffer = activeOffersOtherSlots.some((offer) => {
      const offeredEntry = entryById.get(offer.waitingListEntryId);
      return offeredEntry?.customerId === entry.customerId;
    });

    if (!hasActive && !hasAccepted && !hasOtherActiveOffer) return entry;
  }

  return null;
}

async function callEntry(clientId, slot, entry, offer) {
  const customer = await getCustomer(clientId, entry.customerId);
  if (!customer?.phone) {
    throw Object.assign(new Error("Customer has no phone number"), { status: 422 });
  }

  const logId = randomUUID();
  await db.insert(communicationLogs).values({
    id: logId,
    clientId,
    waitlistOfferId: offer.id,
    customerId: customer.id,
    channel: "call",
    direction: "outbound",
    eventType: "confirmation_call_requested",
    status: "requested"
  });

  let result;
  try {
    result = await triggerOutboundCall({
      toNumber: customer.phone,
      context: {
        name: `${customer.firstName} ${customer.lastName}`,
        slotId: slot.id,
        offerId: offer.id
      }
    });
  } catch (error) {
    await db.update(communicationLogs)
      .set({ status: "failed" })
      .where(eq(communicationLogs.id, logId));
    throw error;
  }

  await db.update(communicationLogs)
    .set({
      status: "sent",
      externalCallId: result?.callId ?? result?.id ?? null,
      externalRef: result ? JSON.stringify(result) : null
    })
    .where(eq(communicationLogs.id, logId));

  return result;
}

export async function startOfferCycle(clientId, slotId, { userId = null, responseDeadlineMinutes = DEFAULT_DEADLINE_MINUTES } = {}) {
  const slot = await getSlot(clientId, slotId);
  if (!slot)                    throw Object.assign(new Error("Slot not found"), { status: 404 });
  if (slot.status !== "available") throw Object.assign(new Error("Slot is not available"), { status: 409 });

  // Block if an active offer already exists for this slot
  const [activeOffer] = await db
    .select()
    .from(waitlistOffers)
    .where(and(
      eq(waitlistOffers.clientId, clientId),
      eq(waitlistOffers.slotId, slotId),
      inArray(waitlistOffers.status, ACTIVE_STATUSES)
    ));
  if (activeOffer) throw Object.assign(new Error("An active offer already exists for this slot"), { status: 409 });

  const entry = await getNextEntry(clientId, slotId);
  if (!entry) throw Object.assign(new Error("Waitlist is empty or all entries have been tried"), { status: 404 });

  const responseDeadlineAt = new Date(Date.now() + responseDeadlineMinutes * 60 * 1000);

  const [offer] = await db
    .insert(waitlistOffers)
    .values({
      id: randomUUID(),
      clientId,
      slotId,
      waitingListEntryId: entry.id,
      status: "calling",
      responseDeadlineAt
    })
    .returning();

  try {
    await callEntry(clientId, slot, entry, offer);
  } catch (error) {
    await db.update(waitlistOffers)
      .set({ status: "timed_out" })
      .where(eq(waitlistOffers.id, offer.id));
    throw error;
  }

  await writeAuditLog({
    clientId,
    userId,
    entityType: "waitlist_offer",
    entityId: offer.id,
    action: "offer_cycle_started",
    toState: "calling"
  });

  return offer;
}

export async function advanceOfferCycle(clientId, offerId, { userId = null } = {}) {
  const [currentOffer] = await db
    .select()
    .from(waitlistOffers)
    .where(and(eq(waitlistOffers.clientId, clientId), eq(waitlistOffers.id, offerId)));

  if (!currentOffer) throw Object.assign(new Error("Offer not found"), { status: 404 });

  const advanceable = ["call_no_answer", "declined", "timed_out"];
  if (!advanceable.includes(currentOffer.status)) {
    throw Object.assign(
      new Error(`Cannot advance from status '${currentOffer.status}'`),
      { status: 422 }
    );
  }

  const nextEntry = await getNextEntry(clientId, currentOffer.slotId);
  if (!nextEntry) {
    return { nextOffer: null, message: "Waitlist exhausted — slot remains available" };
  }

  const slot = await getSlot(clientId, currentOffer.slotId);
  const responseDeadlineAt = new Date(Date.now() + DEFAULT_DEADLINE_MINUTES * 60 * 1000);

  const [nextOffer] = await db
    .insert(waitlistOffers)
    .values({
      id: randomUUID(),
      clientId,
      slotId: currentOffer.slotId,
      waitingListEntryId: nextEntry.id,
      status: "calling",
      responseDeadlineAt
    })
    .returning();

  await callEntry(clientId, slot, nextEntry, nextOffer);

  await writeAuditLog({
    clientId,
    userId,
    entityType: "waitlist_offer",
    entityId: nextOffer.id,
    action: "offer_advanced",
    fromState: currentOffer.status,
    toState: "calling"
  });

  return { nextOffer };
}

export function listOffers(clientId) {
  return db.select().from(waitlistOffers).where(eq(waitlistOffers.clientId, clientId));
}

export async function autoStartOfferCycle(clientId, slotId, options = {}) {
  try {
    return await startOfferCycle(clientId, slotId, options);
  } catch (error) {
    if (error?.status === 404 || error?.status === 409) {
      return null;
    }

    console.error("[waitlist] automatic offer cycle failed", {
      clientId,
      slotId,
      error: error?.message ?? error
    });
    return null;
  }
}
