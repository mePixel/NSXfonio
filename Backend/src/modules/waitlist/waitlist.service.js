import { randomUUID } from "crypto";
import { asc, and, desc, eq } from "drizzle-orm";
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

export async function listWaitlistEntriesByCustomerIds(clientId, customerIds) {
  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return [];
  }

  const uniqueCustomerIds = [...new Set(customerIds)];
  const entries = await listWaitlistEntries(clientId);
  return entries.filter((entry) => uniqueCustomerIds.includes(entry.customerId));
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

export async function findWaitlistEntryByCustomer(clientId, customerId) {
  const [row] = await db
    .select()
    .from(waitingListEntries)
    .where(and(
      eq(waitingListEntries.clientId, clientId),
      eq(waitingListEntries.customerId, customerId)
    ))
    .orderBy(asc(waitingListEntries.position));
  return row ?? null;
}

export async function createWaitlistEntryForCustomer(clientId, customerId, { notes = null } = {}) {
  const existingEntry = await findWaitlistEntryByCustomer(clientId, customerId);
  if (existingEntry) {
    return { entry: existingEntry, created: false };
  }

  const [lastEntry] = await db
    .select({ position: waitingListEntries.position })
    .from(waitingListEntries)
    .where(eq(waitingListEntries.clientId, clientId))
    .orderBy(desc(waitingListEntries.position))
    .limit(1);

  const [entry] = await db
    .insert(waitingListEntries)
    .values({
      id: randomUUID(),
      clientId,
      customerId,
      position: (lastEntry?.position ?? 0) + 1,
      notes
    })
    .returning();

  return { entry, created: true };
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

export async function deleteWaitlistEntryByCustomer(clientId, customerId) {
  const existingEntry = await findWaitlistEntryByCustomer(clientId, customerId);
  if (!existingEntry) {
    return null;
  }

  return deleteWaitlistEntry(clientId, existingEntry.id);
}
