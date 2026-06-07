import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/index.js";
import {
  appointments,
  communicationLogs,
  customers,
  reschedulerCandidateCalls,
  reschedulerFlows,
  slots,
  waitingListEntries,
  waitlistOffers
} from "../../db/schema.js";
import { writeAuditLog } from "../audit/audit.service.js";

const ACTIVE_FLOW_STATES = ["pending", "calling", "failed"];
const replacementCustomers = alias(customers, "replacement_customers");

function mapOfferStatusToCandidateState(status) {
  if (status === "accepted") return "accepted";
  if (status === "declined") return "declined";
  if (status === "call_no_answer" || status === "timed_out") return "not_reached";
  if (status === "pending" || status === "calling" || status === "whatsapp_sent") return "interested";
  return "skipped";
}

function getFlowStateFromOfferResult(result) {
  if (!result) return "pending";
  if (result.started) return "calling";
  if (result.status === "failed") return "failed";
  return "pending";
}

function serializeCustomer(row, prefix) {
  const id = row[`${prefix}Id`];
  if (!id) return null;

  return {
    id,
    firstName: row[`${prefix}FirstName`],
    lastName: row[`${prefix}LastName`],
    phone: row[`${prefix}Phone`],
    whatsappPhone: row[`${prefix}WhatsappPhone`],
    email: row[`${prefix}Email`],
    notes: row[`${prefix}Notes`],
    createdAt: row[`${prefix}CreatedAt`],
    updatedAt: row[`${prefix}UpdatedAt`]
  };
}

function serializeFlowRow(row, candidates) {
  return {
    id: row.id,
    state: row.state,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    abortedAt: row.abortedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cancellationReason: row.cancelReason,
    originalAppointment: {
      id: row.cancelledAppointmentId,
      title: row.originalTitle,
      startsAt: row.originalStartsAt,
      endsAt: row.originalEndsAt,
      status: row.originalStatus,
      cancellationReason: row.cancelReason,
      customer: serializeCustomer(row, "originalCustomer")
    },
    originalSlot: row.originalSlotId
      ? {
          id: row.originalSlotId,
          startsAt: row.originalSlotStartsAt,
          endsAt: row.originalSlotEndsAt,
          status: row.originalSlotStatus
        }
      : null,
    replacement: row.replacementAppointmentId || row.replacementCustomerId
      ? {
          appointmentId: row.replacementAppointmentId,
          customer: serializeCustomer(row, "replacementCustomer")
        }
      : null,
    candidates
  };
}

export async function recordCancellationFlow(clientId, appointment, offerResult, { userId = null } = {}) {
  const now = new Date();
  const state = getFlowStateFromOfferResult(offerResult);

  const [flow] = await db
    .insert(reschedulerFlows)
    .values({
      id: randomUUID(),
      clientId,
      cancelledAppointmentId: appointment.id,
      originalSlotId: appointment.slotId ?? null,
      state,
      startedAt: state === "calling" || state === "failed" ? now : null,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: reschedulerFlows.cancelledAppointmentId,
      set: {
        originalSlotId: appointment.slotId ?? null,
        state,
        replacementAppointmentId: null,
        replacementCustomerId: null,
        startedAt: state === "calling" || state === "failed" ? now : null,
        completedAt: null,
        abortedAt: null,
        updatedAt: now
      }
    })
    .returning();

  if (offerResult?.started && offerResult.offer?.id) {
    await recordCandidateFromOffer(clientId, flow.id, offerResult.offer.id);
  }

  await writeAuditLog({
    clientId,
    userId,
    appointmentId: appointment.id,
    entityType: "rescheduler_flow",
    entityId: flow.id,
    action: "rescheduler_started",
    toState: flow.state,
    metadataJson: JSON.stringify({
      resetPolicy: "Abort deletes candidate call rows, linked waitlist offers, and linked communication logs; filled flows cannot be aborted."
    })
  });

  return flow;
}

export async function recordCandidateFromOffer(clientId, flowId, offerId) {
  const [offer] = await db
    .select({
      id: waitlistOffers.id,
      status: waitlistOffers.status,
      createdAt: waitlistOffers.createdAt,
      customerId: waitingListEntries.customerId
    })
    .from(waitlistOffers)
    .innerJoin(waitingListEntries, eq(waitlistOffers.waitingListEntryId, waitingListEntries.id))
    .where(and(eq(waitlistOffers.clientId, clientId), eq(waitlistOffers.id, offerId)))
    .limit(1);

  if (!offer) return null;

  const [callLog] = await db
    .select({ occurredAt: communicationLogs.occurredAt })
    .from(communicationLogs)
    .where(and(
      eq(communicationLogs.clientId, clientId),
      eq(communicationLogs.waitlistOfferId, offer.id),
      eq(communicationLogs.channel, "call"),
      eq(communicationLogs.direction, "outbound")
    ))
    .orderBy(desc(communicationLogs.occurredAt))
    .limit(1);

  const [candidate] = await db
    .insert(reschedulerCandidateCalls)
    .values({
      id: randomUUID(),
      clientId,
      reschedulerFlowId: flowId,
      customerId: offer.customerId,
      waitlistOfferId: offer.id,
      state: mapOfferStatusToCandidateState(offer.status),
      calledAt: callLog?.occurredAt ?? offer.createdAt
    })
    .returning();

  return candidate;
}

export async function recordCandidateForOffer(clientId, offerId) {
  const [offer] = await db
    .select({ id: waitlistOffers.id, slotId: waitlistOffers.slotId })
    .from(waitlistOffers)
    .where(and(eq(waitlistOffers.clientId, clientId), eq(waitlistOffers.id, offerId)))
    .limit(1);

  if (!offer) return null;

  const [flow] = await db
    .select()
    .from(reschedulerFlows)
    .where(and(
      eq(reschedulerFlows.clientId, clientId),
      eq(reschedulerFlows.originalSlotId, offer.slotId),
      inArray(reschedulerFlows.state, ACTIVE_FLOW_STATES)
    ))
    .orderBy(desc(reschedulerFlows.createdAt))
    .limit(1);

  if (!flow) return null;

  return recordCandidateFromOffer(clientId, flow.id, offer.id);
}

export async function syncReschedulerOfferOutcome(clientId, offerId) {
  const [offer] = await db
    .select({
      id: waitlistOffers.id,
      status: waitlistOffers.status,
      customerId: waitingListEntries.customerId
    })
    .from(waitlistOffers)
    .innerJoin(waitingListEntries, eq(waitlistOffers.waitingListEntryId, waitingListEntries.id))
    .where(and(eq(waitlistOffers.clientId, clientId), eq(waitlistOffers.id, offerId)))
    .limit(1);

  if (!offer) return null;

  const [candidate] = await db
    .select()
    .from(reschedulerCandidateCalls)
    .where(and(
      eq(reschedulerCandidateCalls.clientId, clientId),
      eq(reschedulerCandidateCalls.waitlistOfferId, offerId)
    ))
    .limit(1);

  if (!candidate) {
    return recordCandidateForOffer(clientId, offerId);
  }

  const state = mapOfferStatusToCandidateState(offer.status);
  const now = new Date();

  await db
    .update(reschedulerCandidateCalls)
    .set({ state, updatedAt: now })
    .where(eq(reschedulerCandidateCalls.id, candidate.id));

  if (offer.status === "accepted") {
    await db
      .update(reschedulerFlows)
      .set({
        state: "filled",
        replacementCustomerId: offer.customerId,
        completedAt: now,
        updatedAt: now
      })
      .where(and(
        eq(reschedulerFlows.clientId, clientId),
        eq(reschedulerFlows.id, candidate.reschedulerFlowId)
      ));
  }

  return { candidateId: candidate.id, state };
}

export async function acceptReschedulerOffer(clientId, offerId, { payload = {}, userId = null } = {}) {
  const [offerContext] = await db
    .select({
      offerId: waitlistOffers.id,
      offerStatus: waitlistOffers.status,
      slotId: waitlistOffers.slotId,
      waitingListEntryId: waitlistOffers.waitingListEntryId,
      customerId: waitingListEntries.customerId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      slotStartsAt: slots.startsAt,
      slotEndsAt: slots.endsAt,
      slotStatus: slots.status
    })
    .from(waitlistOffers)
    .innerJoin(waitingListEntries, eq(waitlistOffers.waitingListEntryId, waitingListEntries.id))
    .innerJoin(customers, eq(waitingListEntries.customerId, customers.id))
    .innerJoin(slots, eq(waitlistOffers.slotId, slots.id))
    .where(and(eq(waitlistOffers.clientId, clientId), eq(waitlistOffers.id, offerId)))
    .limit(1);

  if (!offerContext) {
    throw Object.assign(new Error("Rescheduler offer not found"), { status: 404 });
  }

  const [flow] = await db
    .select()
    .from(reschedulerFlows)
    .where(and(
      eq(reschedulerFlows.clientId, clientId),
      eq(reschedulerFlows.originalSlotId, offerContext.slotId)
    ))
    .orderBy(desc(reschedulerFlows.createdAt))
    .limit(1);

  if (!flow) {
    throw Object.assign(new Error("Rescheduler flow not found for offer"), { status: 404 });
  }

  if (flow.state === "filled" && flow.replacementAppointmentId) {
    return {
      handled: true,
      mode: "rescheduler_accept",
      alreadyFilled: true,
      appointmentId: flow.replacementAppointmentId,
      customerId: flow.replacementCustomerId,
      slotId: offerContext.slotId
    };
  }

  if (flow.state === "aborted") {
    throw Object.assign(new Error("This rebooking procedure has been aborted."), { status: 422 });
  }

  if (offerContext.slotStatus !== "available") {
    throw Object.assign(new Error("The offered slot is no longer available."), { status: 409 });
  }

  if (!["pending", "calling", "whatsapp_sent"].includes(offerContext.offerStatus)) {
    throw Object.assign(
      new Error(`Cannot accept offer from status '${offerContext.offerStatus}'`),
      { status: 422 }
    );
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [appointment] = await tx
      .insert(appointments)
      .values({
        id: randomUUID(),
        clientId,
        customerId: offerContext.customerId,
        slotId: offerContext.slotId,
        title: `${offerContext.customerFirstName} ${offerContext.customerLastName}`.trim() || "Rescheduled appointment",
        startsAt: offerContext.slotStartsAt,
        endsAt: offerContext.slotEndsAt,
        status: "scheduled",
        notes: payload?.notes ?? "Booked from cancelled-slot rescheduler call"
      })
      .returning();

    await tx
      .update(slots)
      .set({
        status: "booked",
        appointmentId: appointment.id,
        updatedAt: now
      })
      .where(and(eq(slots.clientId, clientId), eq(slots.id, offerContext.slotId)));

    await tx
      .update(waitlistOffers)
      .set({ status: "accepted", updatedAt: now })
      .where(and(eq(waitlistOffers.clientId, clientId), eq(waitlistOffers.id, offerId)));

    const [candidate] = await tx
      .select()
      .from(reschedulerCandidateCalls)
      .where(and(
        eq(reschedulerCandidateCalls.clientId, clientId),
        eq(reschedulerCandidateCalls.waitlistOfferId, offerId)
      ))
      .limit(1);

    if (candidate) {
      await tx
        .update(reschedulerCandidateCalls)
        .set({
          state: "accepted",
          notes: payload?.summary ?? payload?.formattedPlainTranscript ?? payload?.formattedTranscript ?? null,
          updatedAt: now
        })
        .where(eq(reschedulerCandidateCalls.id, candidate.id));
    }

    await tx
      .update(reschedulerFlows)
      .set({
        state: "filled",
        replacementAppointmentId: appointment.id,
        replacementCustomerId: offerContext.customerId,
        completedAt: now,
        updatedAt: now
      })
      .where(and(eq(reschedulerFlows.clientId, clientId), eq(reschedulerFlows.id, flow.id)));

    await tx.insert(communicationLogs).values({
      id: randomUUID(),
      clientId,
      appointmentId: appointment.id,
      customerId: offerContext.customerId,
      waitlistOfferId: offerId,
      channel: "call",
      direction: "outbound",
      eventType: "rescheduler_offer_accepted",
      status: "accepted",
      externalCallId: payload?.callId ?? payload?.id ?? null,
      payloadJson: JSON.stringify(payload)
    });

    await writeAuditLog(
      {
        clientId,
        userId,
        appointmentId: appointment.id,
        entityType: "rescheduler_flow",
        entityId: flow.id,
        action: "rescheduler_filled",
        fromState: flow.state,
        toState: "filled",
        metadataJson: JSON.stringify({ offerId, replacementAppointmentId: appointment.id })
      },
      tx
    );

    return appointment;
  });

  return {
    handled: true,
    mode: "rescheduler_accept",
    alreadyFilled: false,
    appointmentId: result.id,
    customerId: offerContext.customerId,
    slotId: offerContext.slotId,
    startsAt: result.startsAt,
    endsAt: result.endsAt
  };
}

async function syncCandidatesFromOffers(clientId, flow) {
  if (!flow.originalSlotId) return;
  if (!isActiveFlowState(flow.state)) return;

  const existingCandidates = await db
    .select({ waitlistOfferId: reschedulerCandidateCalls.waitlistOfferId })
    .from(reschedulerCandidateCalls)
    .where(and(
      eq(reschedulerCandidateCalls.clientId, clientId),
      eq(reschedulerCandidateCalls.reschedulerFlowId, flow.id)
    ));
  const existingOfferIds = new Set(
    existingCandidates.map((candidate) => candidate.waitlistOfferId).filter(Boolean)
  );

  const offers = await db
    .select({ id: waitlistOffers.id })
    .from(waitlistOffers)
    .where(and(eq(waitlistOffers.clientId, clientId), eq(waitlistOffers.slotId, flow.originalSlotId)))
    .orderBy(asc(waitlistOffers.createdAt));

  for (const offer of offers) {
    if (!existingOfferIds.has(offer.id)) {
      await recordCandidateFromOffer(clientId, flow.id, offer.id);
    }
  }
}

export async function listReschedulerFlows(clientId) {
  const flowRows = await db
    .select()
    .from(reschedulerFlows)
    .where(eq(reschedulerFlows.clientId, clientId))
    .orderBy(desc(reschedulerFlows.createdAt));

  for (const flow of flowRows) {
    await syncCandidatesFromOffers(clientId, flow);
  }

  const rows = await db
    .select({
      id: reschedulerFlows.id,
      state: reschedulerFlows.state,
      cancelledAppointmentId: reschedulerFlows.cancelledAppointmentId,
      originalSlotId: reschedulerFlows.originalSlotId,
      replacementAppointmentId: reschedulerFlows.replacementAppointmentId,
      replacementCustomerId: reschedulerFlows.replacementCustomerId,
      startedAt: reschedulerFlows.startedAt,
      completedAt: reschedulerFlows.completedAt,
      abortedAt: reschedulerFlows.abortedAt,
      createdAt: reschedulerFlows.createdAt,
      updatedAt: reschedulerFlows.updatedAt,
      originalTitle: appointments.title,
      originalStartsAt: appointments.startsAt,
      originalEndsAt: appointments.endsAt,
      originalStatus: appointments.status,
      cancelReason: appointments.cancelReason,
      originalCustomerId: customers.id,
      originalCustomerFirstName: customers.firstName,
      originalCustomerLastName: customers.lastName,
      originalCustomerPhone: customers.phone,
      originalCustomerWhatsappPhone: customers.whatsappPhone,
      originalCustomerEmail: customers.email,
      originalCustomerNotes: customers.notes,
      originalCustomerCreatedAt: customers.createdAt,
      originalCustomerUpdatedAt: customers.updatedAt,
      replacementCustomerId: replacementCustomers.id,
      replacementCustomerFirstName: replacementCustomers.firstName,
      replacementCustomerLastName: replacementCustomers.lastName,
      replacementCustomerPhone: replacementCustomers.phone,
      replacementCustomerWhatsappPhone: replacementCustomers.whatsappPhone,
      replacementCustomerEmail: replacementCustomers.email,
      replacementCustomerNotes: replacementCustomers.notes,
      replacementCustomerCreatedAt: replacementCustomers.createdAt,
      replacementCustomerUpdatedAt: replacementCustomers.updatedAt,
      originalSlotStartsAt: slots.startsAt,
      originalSlotEndsAt: slots.endsAt,
      originalSlotStatus: slots.status
    })
    .from(reschedulerFlows)
    .innerJoin(appointments, eq(reschedulerFlows.cancelledAppointmentId, appointments.id))
    .innerJoin(customers, eq(appointments.customerId, customers.id))
    .leftJoin(replacementCustomers, eq(reschedulerFlows.replacementCustomerId, replacementCustomers.id))
    .leftJoin(slots, eq(reschedulerFlows.originalSlotId, slots.id))
    .where(eq(reschedulerFlows.clientId, clientId))
    .orderBy(desc(reschedulerFlows.createdAt));

  const flowIds = rows.map((row) => row.id);
  const candidateRows = flowIds.length
    ? await db
      .select({
        id: reschedulerCandidateCalls.id,
        reschedulerFlowId: reschedulerCandidateCalls.reschedulerFlowId,
        state: reschedulerCandidateCalls.state,
        notes: reschedulerCandidateCalls.notes,
        calledAt: reschedulerCandidateCalls.calledAt,
        createdAt: reschedulerCandidateCalls.createdAt,
        updatedAt: reschedulerCandidateCalls.updatedAt,
        waitlistOfferId: reschedulerCandidateCalls.waitlistOfferId,
        offerStatus: waitlistOffers.status,
        customerId: customers.id,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerPhone: customers.phone,
        customerWhatsappPhone: customers.whatsappPhone,
        customerEmail: customers.email,
        customerNotes: customers.notes,
        customerCreatedAt: customers.createdAt,
        customerUpdatedAt: customers.updatedAt
      })
      .from(reschedulerCandidateCalls)
      .leftJoin(customers, eq(reschedulerCandidateCalls.customerId, customers.id))
      .leftJoin(waitlistOffers, eq(reschedulerCandidateCalls.waitlistOfferId, waitlistOffers.id))
      .where(and(
        eq(reschedulerCandidateCalls.clientId, clientId),
        inArray(reschedulerCandidateCalls.reschedulerFlowId, flowIds)
      ))
      .orderBy(asc(reschedulerCandidateCalls.calledAt), asc(reschedulerCandidateCalls.createdAt))
    : [];

  const candidatesByFlowId = new Map();
  for (const candidate of candidateRows) {
    const list = candidatesByFlowId.get(candidate.reschedulerFlowId) ?? [];
    list.push({
      id: candidate.id,
      state: candidate.offerStatus
        ? mapOfferStatusToCandidateState(candidate.offerStatus)
        : candidate.state,
      notes: candidate.notes,
      calledAt: candidate.calledAt,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      waitlistOfferId: candidate.waitlistOfferId,
      customer: serializeCustomer(candidate, "customer")
    });
    candidatesByFlowId.set(candidate.reschedulerFlowId, list);
  }

  return {
    reschedulerFlows: rows.map((row) =>
      serializeFlowRow(row, candidatesByFlowId.get(row.id) ?? [])
    )
  };
}

export async function abortReschedulerFlow(clientId, flowId, { userId = null } = {}) {
  const [flow] = await db
    .select()
    .from(reschedulerFlows)
    .where(and(eq(reschedulerFlows.clientId, clientId), eq(reschedulerFlows.id, flowId)))
    .limit(1);

  if (!flow) {
    throw Object.assign(new Error("Rescheduler flow not found"), { status: 404 });
  }

  if (flow.state === "filled") {
    throw Object.assign(new Error("A filled rebooking procedure cannot be aborted."), { status: 422 });
  }

  const now = new Date();

  const aborted = await db.transaction(async (tx) => {
    const linkedCandidates = await tx
      .select({ waitlistOfferId: reschedulerCandidateCalls.waitlistOfferId })
      .from(reschedulerCandidateCalls)
      .where(and(
        eq(reschedulerCandidateCalls.clientId, clientId),
        eq(reschedulerCandidateCalls.reschedulerFlowId, flow.id)
      ));

    const offerIds = linkedCandidates
      .map((candidate) => candidate.waitlistOfferId)
      .filter(Boolean);

    if (offerIds.length > 0) {
      await tx
        .delete(communicationLogs)
        .where(and(
          eq(communicationLogs.clientId, clientId),
          inArray(communicationLogs.waitlistOfferId, offerIds)
        ));
    }

    await tx
      .delete(reschedulerCandidateCalls)
      .where(and(
        eq(reschedulerCandidateCalls.clientId, clientId),
        eq(reschedulerCandidateCalls.reschedulerFlowId, flow.id)
      ));

    if (offerIds.length > 0) {
      await tx
        .delete(waitlistOffers)
        .where(and(
          eq(waitlistOffers.clientId, clientId),
          inArray(waitlistOffers.id, offerIds)
        ));
    }

    const [updated] = await tx
      .update(reschedulerFlows)
      .set({
        state: "aborted",
        replacementAppointmentId: null,
        replacementCustomerId: null,
        completedAt: null,
        abortedAt: now,
        updatedAt: now
      })
      .where(and(eq(reschedulerFlows.clientId, clientId), eq(reschedulerFlows.id, flow.id)))
      .returning();

    await writeAuditLog(
      {
        clientId,
        userId,
        appointmentId: flow.cancelledAppointmentId,
        entityType: "rescheduler_flow",
        entityId: flow.id,
        action: "rescheduler_aborted",
        fromState: flow.state,
        toState: "aborted",
        metadataJson: JSON.stringify({
          resetPolicy: "Deleted contacted candidates, linked waitlist offers, and linked communication logs. Preserved cancelled appointment and cancellation metadata."
        })
      },
      tx
    );

    return updated;
  });

  return aborted;
}

export function isActiveFlowState(state) {
  return ACTIVE_FLOW_STATES.includes(state);
}
