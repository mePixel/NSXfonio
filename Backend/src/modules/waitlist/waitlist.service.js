import { randomUUID } from "crypto";
import { asc, and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { waitingListEntries } from "../../db/schema.js";

export function listWaitlistEntries(clientId) {
  return db
    .select()
    .from(waitingListEntries)
    .where(eq(waitingListEntries.clientId, clientId))
    .orderBy(asc(waitingListEntries.position));
}

export async function getWaitlistEntry(clientId, id) {
  const [row] = await db
    .select()
    .from(waitingListEntries)
    .where(and(eq(waitingListEntries.clientId, clientId), eq(waitingListEntries.id, id)));
  return row ?? null;
}

export async function createWaitlistEntry(clientId, data) {
  const [row] = await db
    .insert(waitingListEntries)
    .values({
      id: randomUUID(),
      clientId,
      customerId: data.customerId,
      position: data.position,
      notes: data.notes ?? null
    })
    .returning();
  return row;
}

export async function updateWaitlistEntry(clientId, id, data) {
  const updates = { updatedAt: new Date() };
  if (data.position !== undefined) updates.position = data.position;
  if (data.notes !== undefined)    updates.notes = data.notes;

  const [row] = await db
    .update(waitingListEntries)
    .set(updates)
    .where(and(eq(waitingListEntries.clientId, clientId), eq(waitingListEntries.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteWaitlistEntry(clientId, id) {
  const [row] = await db
    .delete(waitingListEntries)
    .where(and(eq(waitingListEntries.clientId, clientId), eq(waitingListEntries.id, id)))
    .returning();
  return row ?? null;
}
