import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { slots } from "../../db/schema.js";

export function listSlots(clientId) {
  return db.select().from(slots).where(eq(slots.clientId, clientId));
}

export async function getSlot(clientId, id) {
  const [row] = await db
    .select()
    .from(slots)
    .where(and(eq(slots.clientId, clientId), eq(slots.id, id)));
  return row ?? null;
}

export async function updateSlotStatus(clientId, id, status) {
  const allowed = ["available", "blocked"];
  if (!allowed.includes(status)) {
    throw Object.assign(new Error(`Manual status must be 'available' or 'blocked'`), { status: 422 });
  }

  const [row] = await db
    .update(slots)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(slots.clientId, clientId), eq(slots.id, id)))
    .returning();
  return row ?? null;
}
