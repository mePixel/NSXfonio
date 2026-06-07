import { randomUUID } from "crypto";
import { and, eq, gte, inArray, asc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { appointments, customers, slots } from "../../db/schema.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { deleteWaitlistEntryByCustomer } from "../waitlist/waitlist.service.js";

export function listAppointments(clientId) {
  return db
    .select()
    .from(appointments)
    .where(eq(appointments.clientId, clientId));
}

export function listAppointmentsForCustomer(clientId, customerId) {
  return db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.clientId, clientId),
        eq(appointments.customerId, customerId)
      )
    )
    .orderBy(asc(appointments.startsAt));
}

export async function getAppointment(clientId, id) {
  const [row] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.clientId, clientId), eq(appointments.id, id)));
  return row ?? null;
}

export function listUpcomingAppointmentsForCustomer(clientId, customerId, { now = new Date() } = {}) {
  return db
    .select()
    .from(appointments)
    .where(and(
      eq(appointments.clientId, clientId),
      eq(appointments.customerId, customerId),
      gte(appointments.startsAt, now),
      inArray(appointments.status, ["scheduled", "confirmation_pending", "confirmed", "followup_sent", "cancel_pending"])
    ))
    .orderBy(asc(appointments.startsAt));
}

export async function createAppointment(clientId, data, { userId = null } = {}) {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.clientId, clientId), eq(customers.id, data.customerId)));

  if (!customer) {
    throw Object.assign(new Error("Customer not found"), { status: 404 });
  }

  if (data.slotId) {
    const [slot] = await db
      .select({ id: slots.id, status: slots.status })
      .from(slots)
      .where(and(eq(slots.clientId, clientId), eq(slots.id, data.slotId)));

    if (!slot) {
      throw Object.assign(new Error("Slot not found"), { status: 404 });
    }
    if (slot.status !== "available") {
      throw Object.assign(new Error("Slot is not available"), { status: 409 });
    }
  }

  return db.transaction(async (tx) => {
    const [appointment] = await tx
      .insert(appointments)
      .values({
        id: randomUUID(),
        clientId,
        customerId: data.customerId,
        slotId: data.slotId ?? null,
        title: data.title,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        confirmationDeadlineAt: data.confirmationDeadlineAt ?? null,
        followupDeadlineAt: data.followupDeadlineAt ?? null,
        notes: data.notes ?? null
      })
      .returning();

    if (data.slotId) {
      await tx
        .update(slots)
        .set({ status: "booked", appointmentId: appointment.id, updatedAt: new Date() })
        .where(eq(slots.id, data.slotId));
    }

    await writeAuditLog(
      {
        clientId,
        userId,
        appointmentId: appointment.id,
        entityType: "appointment",
        entityId: appointment.id,
        action: "created",
        toState: appointment.status
      },
      tx
    );

    await deleteWaitlistEntryByCustomer(clientId, appointment.customerId, tx);

    return appointment;
  });
}

export async function updateAppointment(clientId, id, data) {
  // Only non-status fields are updated here.
  // Status changes go through the status transition service.
  const updates = { updatedAt: new Date() };
  if (data.title !== undefined)                   updates.title = data.title;
  if (data.startsAt !== undefined)                updates.startsAt = data.startsAt;
  if (data.endsAt !== undefined)                  updates.endsAt = data.endsAt;
  if (data.confirmationDeadlineAt !== undefined)  updates.confirmationDeadlineAt = data.confirmationDeadlineAt;
  if (data.followupDeadlineAt !== undefined)      updates.followupDeadlineAt = data.followupDeadlineAt;
  if (data.notes !== undefined)                   updates.notes = data.notes;

  const [row] = await db
    .update(appointments)
    .set(updates)
    .where(and(eq(appointments.clientId, clientId), eq(appointments.id, id)))
    .returning();
  return row ?? null;
}
