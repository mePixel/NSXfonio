import { randomUUID } from "crypto";
import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { communicationLogs, waitingListEntries, waitlistOffers } from "../../db/schema.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { getCustomer } from "../customers/customers.service.js";
import { assertOutboundCallConfig, triggerOutboundCall } from "../fonio/fonio.client.js";
import { getSlot } from "../slots/slots.service.js";

const ACTIVE_STATUSES  = ["pending", "calling", "whatsapp_sent"];
const DEFAULT_DEADLINE_MINUTES = 60;
const CANCELLED_SLOT_OPENING_PROMPT =
  "A booked appointment was just cancelled, so this earlier slot is now available. Call the waitlist patient, explain that an earlier appointment opened up, offer this exact slot, and only book it if they clearly accept. If the patient accepts, call the Rescheduler API with the exact offerId from this call context.";

function formatCallDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Vienna"
  }).format(date);
}

function formatCallTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Vienna"
  }).format(date);
}

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

  const offerIds = existingOffers.map((offer) => offer.id);
  const sentCallLogs = offerIds.length
    ? await db
      .select({ waitlistOfferId: communicationLogs.waitlistOfferId })
      .from(communicationLogs)
      .where(and(
        eq(communicationLogs.clientId, clientId),
        eq(communicationLogs.channel, "call"),
        eq(communicationLogs.direction, "outbound"),
        eq(communicationLogs.status, "sent"),
        inArray(communicationLogs.waitlistOfferId, offerIds)
      ))
    : [];
  const sentCallOfferIds = new Set(sentCallLogs.map((log) => log.waitlistOfferId));

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
    const hasTriedThisSlot = entryOffers.some((offer) =>
      ["call_no_answer", "declined", "accepted"].includes(offer.status)
      || (offer.status === "timed_out" && sentCallOfferIds.has(offer.id))
    );
    const hasOtherActiveOffer = activeOffersOtherSlots.some((offer) => {
      const offeredEntry = entryById.get(offer.waitingListEntryId);
      return offeredEntry?.customerId === entry.customerId;
    });

    if (!hasActive && !hasAccepted && !hasTriedThisSlot && !hasOtherActiveOffer) return entry;
  }

  return null;
}

export async function moveWaitlistEntryToEnd(clientId, waitingListEntryId) {
  const [entry] = await db
    .select()
    .from(waitingListEntries)
    .where(and(
      eq(waitingListEntries.clientId, clientId),
      eq(waitingListEntries.id, waitingListEntryId)
    ));

  if (!entry) return null;

  const [lastEntry] = await db
    .select({ position: waitingListEntries.position })
    .from(waitingListEntries)
    .where(eq(waitingListEntries.clientId, clientId))
    .orderBy(desc(waitingListEntries.position))
    .limit(1);

  const nextPosition = lastEntry?.position ?? entry.position;
  if (entry.position >= nextPosition) {
    return entry;
  }

  return db.transaction(async (tx) => {
    await tx
      .update(waitingListEntries)
      .set({
        position: sql`${waitingListEntries.position} - 1`,
        updatedAt: new Date()
      })
      .where(and(
        eq(waitingListEntries.clientId, clientId),
        gt(waitingListEntries.position, entry.position)
      ));

    const [updated] = await tx
      .update(waitingListEntries)
      .set({
        position: nextPosition,
        updatedAt: new Date()
      })
      .where(eq(waitingListEntries.id, entry.id))
      .returning();

    return updated;
  });
}

async function expireStaleActiveOffers(clientId, slotId) {
  await db
    .update(waitlistOffers)
    .set({ status: "timed_out", updatedAt: new Date() })
    .where(and(
      eq(waitlistOffers.clientId, clientId),
      eq(waitlistOffers.slotId, slotId),
      inArray(waitlistOffers.status, ACTIVE_STATUSES),
      lt(waitlistOffers.responseDeadlineAt, new Date())
    ));
}

function buildCancelledSlotCallContext(slot, customer, offer) {
  const name = `${customer.firstName} ${customer.lastName}`.trim();
  const slotStartLabel = formatCallDateTime(slot.startsAt);
  const slotEndLabel = formatCallTime(slot.endsAt);
  const appointmentLabel = slotStartLabel && slotEndLabel
    ? `${slotStartLabel} to ${slotEndLabel}`
    : "";

  return {
    name,
    patientName: name,
    patient: {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      fullName: name,
      phone: customer.phone,
      whatsappPhone: customer.whatsappPhone,
      email: customer.email,
      notes: customer.notes
    },
    customer: {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      fullName: name,
      phone: customer.phone,
      whatsappPhone: customer.whatsappPhone,
      email: customer.email,
      notes: customer.notes
    },
    patientId: customer.id,
    patientFirstName: customer.firstName,
    patientLastName: customer.lastName,
    patientPhone: customer.phone,
    patientWhatsappPhone: customer.whatsappPhone,
    patientEmail: customer.email,
    patientNotes: customer.notes,
    slotId: slot.id,
    slotStartsAt: slot.startsAt?.toISOString?.() ?? slot.startsAt,
    slotEndsAt: slot.endsAt?.toISOString?.() ?? slot.endsAt,
    slotStartLabel,
    slotEndLabel,
    appointmentLabel,
    offerId: offer.id,
    reschedulerAccept: {
      offerId: offer.id,
      slotId: slot.id
    },
    apiInstruction: `If the patient clearly accepts, call the Rescheduler API using offerId ${offer.id}. Do not use an offerId or slotId from any previous call.`,
    scenario: "cancelled_slot_waitlist_offer",
    openingPrompt: CANCELLED_SLOT_OPENING_PROMPT,
    firstMessage: appointmentLabel
      ? `Hello ${name}, this is Smiledent Dental Office. An earlier appointment just became available: ${appointmentLabel}. Would this appointment work for you?`
      : `Hello ${name}, this is Smiledent Dental Office. An earlier appointment just became available. Would this appointment work for you?`
  };
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
      context: buildCancelledSlotCallContext(slot, customer, offer)
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

  await expireStaleActiveOffers(clientId, slotId);

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

  assertOutboundCallConfig();

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
    const offer = await startOfferCycle(clientId, slotId, options);
    return { started: true, offer };
  } catch (error) {
    if (error?.status === 404 || error?.status === 409) {
      return {
        started: false,
        status: "skipped",
        reason: error?.message ?? "No eligible waitlist offer"
      };
    }

    console.error("[waitlist] automatic offer cycle failed", {
      clientId,
      slotId,
      error: error?.message ?? error
    });
    return {
      started: false,
      status: "failed",
      reason: error?.message ?? "Automatic offer cycle failed"
    };
  }
}
