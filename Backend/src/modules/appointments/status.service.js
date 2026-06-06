import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { appointments, slots } from "../../db/schema.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { autoStartOfferCycle } from "../waitlist/offers.service.js";
import { getAppointment } from "./appointments.service.js";

// Enforces the allowed transition matrix from SYSTEMS.md.
const ALLOWED_TRANSITIONS = {
  scheduled:            ["confirmation_pending", "cancelled"],
  confirmation_pending: ["confirmed", "followup_sent", "cancel_pending"],
  followup_sent:        ["confirmed", "cancel_pending"],
  cancel_pending:       ["cancelled", "confirmed"],
  confirmed:            ["cancelled", "completed", "no_show"]
};

export async function transitionStatus(clientId, appointmentId, toStatus, { userId = null, reason = null } = {}) {
  const existing = await getAppointment(clientId, appointmentId);
  if (!existing) {
    throw Object.assign(new Error("Appointment not found"), { status: 404 });
  }

  const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(toStatus)) {
    throw Object.assign(
      new Error(`Transition from '${existing.status}' to '${toStatus}' is not allowed`),
      { status: 422 }
    );
  }

  const updated = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(appointments)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(and(eq(appointments.clientId, clientId), eq(appointments.id, appointmentId)))
      .returning();

    if (toStatus === "cancelled" && existing.slotId) {
      await tx
        .update(slots)
        .set({ status: "available", appointmentId: null, updatedAt: new Date() })
        .where(eq(slots.id, existing.slotId));
    }

    await writeAuditLog(
      {
        clientId,
        userId,
        appointmentId,
        entityType: "appointment",
        entityId: appointmentId,
        action: "status_changed",
        fromState: existing.status,
        toState: toStatus,
        reason
      },
      tx
    );

    return updated;
  });

  if (toStatus === "cancelled" && updated?.slotId) {
    await autoStartOfferCycle(clientId, updated.slotId, { userId });
  }

  return updated;
}
