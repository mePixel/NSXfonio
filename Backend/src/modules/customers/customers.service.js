import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { customers } from "../../db/schema.js";

export function listCustomers(clientId) {
  return db.select().from(customers).where(eq(customers.clientId, clientId));
}

export async function getCustomer(clientId, id) {
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.clientId, clientId), eq(customers.id, id)));
  return row ?? null;
}

export async function createCustomer(clientId, data) {
  const [row] = await db
    .insert(customers)
    .values({
      id: randomUUID(),
      clientId,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone ?? null,
      whatsappPhone: data.whatsappPhone ?? null,
      email: data.email ?? null,
      notes: data.notes ?? null
    })
    .returning();
  return row;
}

export async function updateCustomer(clientId, id, data) {
  const updates = { updatedAt: new Date() };
  if (data.firstName !== undefined) updates.firstName = data.firstName;
  if (data.lastName !== undefined) updates.lastName = data.lastName;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.whatsappPhone !== undefined) updates.whatsappPhone = data.whatsappPhone;
  if (data.email !== undefined) updates.email = data.email;
  if (data.notes !== undefined) updates.notes = data.notes;

  const [row] = await db
    .update(customers)
    .set(updates)
    .where(and(eq(customers.clientId, clientId), eq(customers.id, id)))
    .returning();
  return row ?? null;
}
