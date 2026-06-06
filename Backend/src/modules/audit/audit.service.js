import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLogs } from "../../db/schema.js";

// Accepts an optional Drizzle transaction (tx). When called inside a
// transaction, pass tx so the log and the triggering change are atomic.
export async function writeAuditLog(data, tx) {
  const executor = tx ?? db;
  await executor.insert(auditLogs).values({
    id: randomUUID(),
    clientId: data.clientId ?? null,
    userId: data.userId ?? null,
    appointmentId: data.appointmentId ?? null,
    entityType: data.entityType,
    entityId: data.entityId,
    action: data.action,
    fromState: data.fromState ?? null,
    toState: data.toState ?? null,
    reason: data.reason ?? null,
    metadataJson: data.metadataJson ? JSON.stringify(data.metadataJson) : null
  });
}

export function listAuditLogs(clientId) {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.clientId, clientId));
}
