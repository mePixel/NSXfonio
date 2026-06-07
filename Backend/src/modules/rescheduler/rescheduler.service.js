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
import { listUpcomingAppointmentsForCustomer } from "../appointments/appointments.service.js";
import { getReschedulerCandidateWindow } from "../settings/settings.service.js";
import { autoStartOfferCycle } from "../waitlist/offers.service.js";
import { deleteWaitlistEntryByCustomer } from "../waitlist/waitlist.service.js";

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

export async function completeAcceptedReschedulerOffer(
  clientId,
  offerId,
  { selectedAppointmentId = null, userId = null, payload = null } = {}
) {
  const [offer] = await db
    .select({
      id: waitlistOffers.id,
      slotId: waitlistOffers.slotId,
      waitingListEntryId: waitlistOffers.waitingListEntryId,
      status: waitlistOffers.status,
      customerId: waitingListEntries.customerId,
      slotStartsAt: slots.startsAt,
      slotEndsAt: slots.endsAt,
      slotStatus: slots.status
    })
    .from(waitlistOffers)
    .innerJoin(waitingListEntries, eq(waitlistOffers.waitingListEntryId, waitingListEntries.id))
    .innerJoin(slots, eq(waitlistOffers.slotId, slots.id))
    .where(and(eq(waitlistOffers.clientId, clientId), eq(waitlistOffers.id, offerId)))
    .limit(1);

  if (!offer) {
    throw Object.assign(new Error("Offer not found"), { status: 404 });
  }

  if (!["calling", "pending", "whatsapp_sent"].includes(offer.status)) {
    throw Object.assign(new Error(`Offer cannot be accepted from status '${offer.status}'`), { status: 422 });
  }

  if (offer.slotStatus !== "available") {
    throw Object.assign(new Error("Offered slot is no longer available"), { status: 409 });
  }

  const candidateWindow = await getReschedulerCandidateWindow();
  const upcomingAppointments = (await listUpcomingAppointmentsForCustomer(clientId, offer.customerId))
    .slice(0, candidateWindow);
  let appointmentToReplace = null;

  if (selectedAppointmentId) {
    appointmentToReplace = upcomingAppointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null;
    if (!appointmentToReplace) {
      throw Object.assign(new Error("Selected appointment is not an upcoming appointment for this customer"), {
        status: 422
      });
    }
  } else if (upcomingAppointments.length === 1) {
    [appointmentToReplace] = upcomingAppointments;
  } else if (upcomingAppointments.length > 1) {
    throw Object.assign(
      new Error("Customer has multiple upcoming appointments. The call must specify which appointment to cancel."),
      { status: 422 }
    );
  }

  const now = new Date();
  let releasedAppointment = null;
  let nextOfferResult = null;

  const { replacementAppointment } = await db.transaction(async (tx) => {
    const [createdAppointment] = await tx
      .insert(appointments)
      .values({
        id: randomUUID(),
        clientId,
        customerId: offer.customerId,
        slotId: offer.slotId,
        title: appointmentToReplace?.title ?? "Waitlist rescheduled appointment",
        startsAt: offer.slotStartsAt,
        endsAt: offer.slotEndsAt,
        notes: appointmentToReplace?.notes
          ? `${appointmentToReplace.notes}\n\nMoved into earlier slot via waitlist offer ${offer.id}.`
          : "Moved into earlier slot via waitlist offer."
      })
      .returning();

    const bookedSlots = await tx
      .update(slots)
      .set({ status: "booked", appointmentId: createdAppointment.id, updatedAt: now })
      .where(and(
        eq(slots.clientId, clientId),
        eq(slots.id, offer.slotId),
        eq(slots.status, "available")
      ))
      .returning({ id: slots.id });

    if (bookedSlots.length === 0) {
      throw Object.assign(new Error("Offered slot is no longer available"), { status: 409 });
    }

    await writeAuditLog(
      {
        clientId,
        userId,
        appointmentId: createdAppointment.id,
        entityType: "appointment",
        entityId: createdAppointment.id,
        action: "created",
        toState: createdAppointment.status
      },
      tx
    );

    if (appointmentToReplace) {
      const [cancelledAppointment] = await tx
        .update(appointments)
        .set({
          status: "cancelled",
          cancelReason: `Rescheduled into earlier slot via waitlist offer ${offer.id}`,
          updatedAt: now
        })
        .where(and(
          eq(appointments.clientId, clientId),
          eq(appointments.id, appointmentToReplace.id)
        ))
        .returning();

      if (!cancelledAppointment) {
        throw Object.assign(new Error("Appointment selected for cancellation could not be updated"), { status: 409 });
      }

      if (appointmentToReplace.slotId) {
        await tx
          .update(slots)
          .set({ status: "available", appointmentId: null, updatedAt: now })
          .where(and(eq(slots.clientId, clientId), eq(slots.id, appointmentToReplace.slotId)));
      }

      await writeAuditLog(
        {
          clientId,
          userId,
          appointmentId: cancelledAppointment.id,
          entityType: "appointment",
          entityId: cancelledAppointment.id,
          action: "status_changed",
          fromState: appointmentToReplace.status,
          toState: "cancelled",
          reason: cancelledAppointment.cancelReason
        },
        tx
      );

      releasedAppointment = cancelledAppointment;
    }

    await tx
      .update(waitlistOffers)
      .set({ status: "accepted", updatedAt: now })
      .where(eq(waitlistOffers.id, offer.id));

    await tx
      .update(reschedulerCandidateCalls)
      .set({ state: "accepted", updatedAt: now })
      .where(and(
        eq(reschedulerCandidateCalls.clientId, clientId),
        eq(reschedulerCandidateCalls.waitlistOfferId, offer.id)
      ));

    const [flow] = await tx
      .update(reschedulerFlows)
      .set({
        state: "filled",
        replacementAppointmentId: createdAppointment.id,
        replacementCustomerId: offer.customerId,
        completedAt: now,
        updatedAt: now
      })
      .where(and(
        eq(reschedulerFlows.clientId, clientId),
        eq(reschedulerFlows.originalSlotId, offer.slotId),
        inArray(reschedulerFlows.state, ACTIVE_FLOW_STATES)
      ))
      .returning();

    if (flow) {
      await writeAuditLog(
        {
          clientId,
          userId,
          appointmentId: flow.cancelledAppointmentId,
          entityType: "rescheduler_flow",
          entityId: flow.id,
          action: "rescheduler_filled",
          fromState: flow.state,
          toState: "filled",
          metadataJson: {
            offerId: offer.id,
            selectedAppointmentId: appointmentToReplace?.id ?? null,
            replacementAppointmentId: createdAppointment.id
          }
        },
        tx
      );
    }

    await tx.insert(communicationLogs).values({
      id: randomUUID(),
      clientId,
      appointmentId: createdAppointment.id,
      customerId: offer.customerId,
      waitlistOfferId: offer.id,
      channel: "call",
      direction: "outbound",
      eventType: "waitlist_offer_accepted_and_rescheduled",
      status: "processed",
      payloadJson: payload ? JSON.stringify(payload) : null
    });

    return { replacementAppointment: createdAppointment };
  });

  await deleteWaitlistEntryByCustomer(clientId, offer.customerId);

  if (releasedAppointment?.slotId) {
    nextOfferResult = await autoStartOfferCycle(clientId, releasedAppointment.slotId, { userId });
    await recordCancellationFlow(clientId, releasedAppointment, nextOfferResult, { userId });
  }

  return {
    offerId: offer.id,
    replacementAppointment,
    cancelledAppointmentId: releasedAppointment?.id ?? appointmentToReplace?.id ?? null,
    nextOfferResult
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
