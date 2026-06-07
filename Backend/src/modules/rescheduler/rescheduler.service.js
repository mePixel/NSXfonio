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

const ACTIVE_FLOW_STATES = ["pending", "calling"];
const ACTIVE_OFFER_STATUSES = ["pending", "calling", "whatsapp_sent"];
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
  if (result.status === "failed" || result.status === "skipped") return "failed";
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
      completedAt: state === "failed" ? now : null,
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
        completedAt: state === "failed" ? now : null,
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

export async function markReschedulerFlowExhausted(clientId, offerId, { userId = null } = {}) {
  const [offer] = await db
    .select({ id: waitlistOffers.id, slotId: waitlistOffers.slotId, status: waitlistOffers.status })
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

  const now = new Date();
  const [updated] = await db
    .update(reschedulerFlows)
    .set({
      state: "failed",
      completedAt: now,
      updatedAt: now
    })
    .where(and(eq(reschedulerFlows.clientId, clientId), eq(reschedulerFlows.id, flow.id)))
    .returning();

  if (updated) {
    await writeAuditLog({
      clientId,
      userId,
      appointmentId: flow.cancelledAppointmentId,
      entityType: "rescheduler_flow",
      entityId: flow.id,
      action: "rescheduler_not_responded",
      fromState: flow.state,
      toState: "failed",
      metadataJson: JSON.stringify({
        finalOfferId: offer.id,
        finalOfferStatus: offer.status,
        outcome: "No rescheduler candidate accepted before the waitlist was exhausted."
      })
    });
  }

  return updated;
}

function extractSelectedAppointmentId(payload) {
  return payload?.selectedAppointmentId
    ?? payload?.cancellation?.appointmentId
    ?? payload?.appointmentId
    ?? payload?.appointment?.id
    ?? payload?.selectedAppointment?.id
    ?? payload?.reschedule?.appointmentToCancelId
    ?? null;
}

async function getAppointmentToReplace(clientId, customerId, selectedAppointmentId) {
  const candidateWindow = await getReschedulerCandidateWindow();
  const upcomingAppointments = (await listUpcomingAppointmentsForCustomer(clientId, customerId))
    .slice(0, candidateWindow);

  if (selectedAppointmentId) {
    const appointment = upcomingAppointments.find((item) => item.id === selectedAppointmentId) ?? null;
    if (!appointment) {
      throw Object.assign(new Error("Selected appointment is not an upcoming appointment for this customer"), {
        status: 422
      });
    }
    return appointment;
  }

  if (upcomingAppointments.length === 1) {
    return upcomingAppointments[0];
  }

  if (upcomingAppointments.length > 1) {
    throw Object.assign(
      new Error("Customer has multiple upcoming appointments. The call must specify which appointment to cancel."),
      { status: 422 }
    );
  }

  return null;
}

function serializeAcceptResult(result) {
  return {
    handled: true,
    mode: "rescheduler_accept",
    alreadyFilled: Boolean(result.alreadyFilled),
    appointmentId: result.replacementAppointment.id,
    replacementAppointmentId: result.replacementAppointment.id,
    cancelledAppointmentId: result.cancelledAppointmentId,
    customerId: result.replacementAppointment.customerId ?? null,
    slotId: result.replacementAppointment.slotId ?? null,
    startsAt: result.replacementAppointment.startsAt ?? null,
    endsAt: result.replacementAppointment.endsAt ?? null,
    nextOfferResult: result.nextOfferResult
  };
}

export async function completeReschedulerSlotBooking(
  clientId,
  { slotId, customerId, selectedAppointmentId = null, userId = null, payload = null } = {}
) {
  const [slot] = await db
    .select()
    .from(slots)
    .where(and(eq(slots.clientId, clientId), eq(slots.id, slotId)))
    .limit(1);

  if (!slot) {
    throw Object.assign(new Error("Slot not found"), { status: 404 });
  }

  const [flow] = await db
    .select()
    .from(reschedulerFlows)
    .where(and(
      eq(reschedulerFlows.clientId, clientId),
      eq(reschedulerFlows.originalSlotId, slot.id)
    ))
    .orderBy(desc(reschedulerFlows.createdAt))
    .limit(1);

  if (flow?.state === "filled" && flow.replacementAppointmentId) {
    const [replacementAppointment] = await db
      .select()
      .from(appointments)
      .where(and(
        eq(appointments.clientId, clientId),
        eq(appointments.id, flow.replacementAppointmentId)
      ))
      .limit(1);

    return {
      offerId: null,
      replacementAppointment: replacementAppointment ?? { id: flow.replacementAppointmentId },
      cancelledAppointmentId: flow.cancelledAppointmentId,
      nextOfferResult: null,
      alreadyFilled: true
    };
  }

  if (flow?.state === "aborted") {
    throw Object.assign(new Error("This rebooking procedure has been aborted."), { status: 422 });
  }

  const [matchingOffer] = await db
    .select({
      id: waitlistOffers.id,
      waitingListEntryId: waitlistOffers.waitingListEntryId,
      customerId: waitingListEntries.customerId
    })
    .from(waitlistOffers)
    .innerJoin(waitingListEntries, eq(waitlistOffers.waitingListEntryId, waitingListEntries.id))
    .where(and(
      eq(waitlistOffers.clientId, clientId),
      eq(waitlistOffers.slotId, slot.id),
      inArray(waitlistOffers.status, ["calling", "pending", "whatsapp_sent"])
    ))
    .orderBy(desc(waitlistOffers.createdAt))
    .limit(1);

  const resolvedCustomerId = matchingOffer?.customerId ?? customerId ?? null;
  if (!resolvedCustomerId) {
    throw Object.assign(new Error("Patient/customer id is required when no active offer exists for the slot."), {
      status: 400
    });
  }

  if (customerId && matchingOffer?.customerId && customerId !== matchingOffer.customerId) {
    console.warn("[rescheduler accept] customerId mismatch; using active slot offer customer", {
      slotId: slot.id,
      activeOfferId: matchingOffer.id,
      activeOfferCustomerId: matchingOffer.customerId,
      requestedCustomerId: customerId
    });
  }

  if (slot.status !== "available") {
    throw Object.assign(new Error("Offered slot is no longer available"), { status: 409 });
  }

  const appointmentToReplace = await getAppointmentToReplace(clientId, resolvedCustomerId, selectedAppointmentId);
  if (!appointmentToReplace) {
    throw Object.assign(new Error("Customer has no upcoming appointment to replace."), { status: 422 });
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
        customerId: resolvedCustomerId,
        slotId: slot.id,
        title: appointmentToReplace?.title ?? "Waitlist rescheduled appointment",
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        notes: appointmentToReplace?.notes
          ? `${appointmentToReplace.notes}\n\nMoved into earlier slot via Fonio rescheduler call.`
          : "Moved into earlier slot via Fonio rescheduler call."
      })
      .returning();

    const bookedSlots = await tx
      .update(slots)
      .set({ status: "booked", appointmentId: createdAppointment.id, updatedAt: now })
      .where(and(
        eq(slots.clientId, clientId),
        eq(slots.id, slot.id),
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
          cancelReason: "Rescheduled into earlier slot via Fonio rescheduler call",
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

    if (matchingOffer) {
      await tx
        .update(waitlistOffers)
        .set({ status: "accepted", updatedAt: now })
        .where(eq(waitlistOffers.id, matchingOffer.id));
    }

    const candidateUpdateWhere = matchingOffer
      ? and(
        eq(reschedulerCandidateCalls.clientId, clientId),
        eq(reschedulerCandidateCalls.waitlistOfferId, matchingOffer.id)
      )
      : flow
        ? and(
          eq(reschedulerCandidateCalls.clientId, clientId),
          eq(reschedulerCandidateCalls.reschedulerFlowId, flow.id),
          eq(reschedulerCandidateCalls.customerId, resolvedCustomerId)
        )
        : null;

    if (candidateUpdateWhere) {
      await tx
        .update(reschedulerCandidateCalls)
        .set({
          state: "accepted",
          notes: payload?.summary ?? payload?.formattedPlainTranscript ?? payload?.formattedTranscript ?? null,
          updatedAt: now
        })
        .where(candidateUpdateWhere);
    }

    const [filledFlow] = await tx
      .update(reschedulerFlows)
      .set({
        state: "filled",
        replacementAppointmentId: createdAppointment.id,
        replacementCustomerId: resolvedCustomerId,
        completedAt: now,
        updatedAt: now
      })
      .where(and(
        eq(reschedulerFlows.clientId, clientId),
        eq(reschedulerFlows.originalSlotId, slot.id),
        inArray(reschedulerFlows.state, ACTIVE_FLOW_STATES)
      ))
      .returning();

    if (filledFlow) {
      await writeAuditLog(
        {
          clientId,
          userId,
          appointmentId: filledFlow.cancelledAppointmentId,
          entityType: "rescheduler_flow",
          entityId: filledFlow.id,
          action: "rescheduler_filled",
          fromState: flow?.state ?? null,
          toState: "filled",
          metadataJson: {
            offerId: matchingOffer?.id ?? null,
            slotId: slot.id,
            customerId: resolvedCustomerId,
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
      customerId: resolvedCustomerId,
      waitlistOfferId: matchingOffer?.id ?? null,
      channel: "call",
      direction: "outbound",
      eventType: "rescheduler_call_accepted_and_rescheduled",
      status: "processed",
      externalCallId: payload?.callId ?? payload?.id ?? null,
      payloadJson: payload ? JSON.stringify(payload) : null
    });

    return { replacementAppointment: createdAppointment };
  });

  await deleteWaitlistEntryByCustomer(clientId, resolvedCustomerId);

  if (releasedAppointment?.slotId) {
    nextOfferResult = await autoStartOfferCycle(clientId, releasedAppointment.slotId, { userId });
    await recordCancellationFlow(clientId, releasedAppointment, nextOfferResult, { userId });
  }

  return {
    offerId: matchingOffer?.id ?? null,
    replacementAppointment,
    cancelledAppointmentId: releasedAppointment?.id ?? appointmentToReplace?.id ?? null,
    nextOfferResult
  };
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

  const [flow] = await db
    .select()
    .from(reschedulerFlows)
    .where(and(
      eq(reschedulerFlows.clientId, clientId),
      eq(reschedulerFlows.originalSlotId, offer.slotId)
    ))
    .orderBy(desc(reschedulerFlows.createdAt))
    .limit(1);

  if (flow?.state === "filled" && flow.replacementAppointmentId) {
    const [replacementAppointment] = await db
      .select()
      .from(appointments)
      .where(and(
        eq(appointments.clientId, clientId),
        eq(appointments.id, flow.replacementAppointmentId)
      ))
      .limit(1);

    return {
      offerId: offer.id,
      replacementAppointment: replacementAppointment ?? { id: flow.replacementAppointmentId },
      cancelledAppointmentId: flow.cancelledAppointmentId,
      nextOfferResult: null,
      alreadyFilled: true
    };
  }

  if (flow?.state === "aborted") {
    throw Object.assign(new Error("This rebooking procedure has been aborted."), { status: 422 });
  }

  if (!["calling", "pending", "whatsapp_sent"].includes(offer.status)) {
    throw Object.assign(new Error(`Offer cannot be accepted from status '${offer.status}'`), { status: 422 });
  }

  if (offer.slotStatus !== "available") {
    throw Object.assign(new Error("Offered slot is no longer available"), { status: 409 });
  }

  const appointmentToReplace = await getAppointmentToReplace(clientId, offer.customerId, selectedAppointmentId);

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
      .set({
        state: "accepted",
        notes: payload?.summary ?? payload?.formattedPlainTranscript ?? payload?.formattedTranscript ?? null,
        updatedAt: now
      })
      .where(and(
        eq(reschedulerCandidateCalls.clientId, clientId),
        eq(reschedulerCandidateCalls.waitlistOfferId, offer.id)
      ));

    const [filledFlow] = await tx
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

    if (filledFlow) {
      await writeAuditLog(
        {
          clientId,
          userId,
          appointmentId: filledFlow.cancelledAppointmentId,
          entityType: "rescheduler_flow",
          entityId: filledFlow.id,
          action: "rescheduler_filled",
          fromState: flow?.state ?? null,
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
      externalCallId: payload?.callId ?? payload?.id ?? null,
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

export async function acceptReschedulerOffer(clientId, offerId, { payload = {}, userId = null } = {}) {
  const result = await completeAcceptedReschedulerOffer(clientId, offerId, {
    selectedAppointmentId: extractSelectedAppointmentId(payload),
    payload,
    userId
  });

  return serializeAcceptResult(result);
}

export async function acceptCurrentReschedulerOffer(clientId, { payload = {}, userId = null } = {}) {
  const activeOffers = await db
    .select({
      id: waitlistOffers.id
    })
    .from(waitlistOffers)
    .innerJoin(reschedulerFlows, and(
      eq(reschedulerFlows.clientId, waitlistOffers.clientId),
      eq(reschedulerFlows.originalSlotId, waitlistOffers.slotId)
    ))
    .where(and(
      eq(waitlistOffers.clientId, clientId),
      inArray(waitlistOffers.status, ACTIVE_OFFER_STATUSES),
      inArray(reschedulerFlows.state, ACTIVE_FLOW_STATES)
    ))
    .orderBy(desc(waitlistOffers.createdAt))
    .limit(2);

  if (activeOffers.length === 0) {
    throw Object.assign(new Error("Offer not found"), { status: 404 });
  }

  if (activeOffers.length > 1) {
    throw Object.assign(
      new Error("Multiple active rescheduler offers exist; offerId or slotId is required."),
      { status: 409 }
    );
  }

  console.warn("[rescheduler accept] accepting only active offer because supplied offerId was not found", {
    activeOfferId: activeOffers[0].id,
    requestedOfferId: payload?.offerId ?? null
  });

  return acceptReschedulerOffer(clientId, activeOffers[0].id, { payload, userId });
}

export async function acceptReschedulerSlotBooking(
  clientId,
  { slotId, customerId, payload = {}, userId = null } = {}
) {
  const result = await completeReschedulerSlotBooking(clientId, {
    slotId,
    customerId,
    selectedAppointmentId: extractSelectedAppointmentId(payload),
    payload,
    userId
  });

  return serializeAcceptResult(result);
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

async function markFlowFailedIfNoActiveOffersRemain(clientId, flow) {
  if (!flow.originalSlotId) return;
  if (!isActiveFlowState(flow.state)) return;

  const offers = await db
    .select({ status: waitlistOffers.status })
    .from(waitlistOffers)
    .where(and(eq(waitlistOffers.clientId, clientId), eq(waitlistOffers.slotId, flow.originalSlotId)));

  const hasAcceptedOffer = offers.some((offer) => offer.status === "accepted");
  const hasActiveOffer = offers.some((offer) => ACTIVE_OFFER_STATUSES.includes(offer.status));
  if (hasAcceptedOffer || hasActiveOffer) return;

  const now = new Date();
  await db
    .update(reschedulerFlows)
    .set({
      state: "failed",
      completedAt: now,
      updatedAt: now
    })
    .where(and(eq(reschedulerFlows.clientId, clientId), eq(reschedulerFlows.id, flow.id)));
}

export async function listReschedulerFlows(clientId) {
  const flowRows = await db
    .select()
    .from(reschedulerFlows)
    .where(eq(reschedulerFlows.clientId, clientId))
    .orderBy(desc(reschedulerFlows.createdAt));

  for (const flow of flowRows) {
    await syncCandidatesFromOffers(clientId, flow);
    await markFlowFailedIfNoActiveOffersRemain(clientId, flow);
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
