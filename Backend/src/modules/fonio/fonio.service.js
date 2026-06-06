import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { communicationLogs } from "../../db/schema.js";
import { transitionStatus } from "../appointments/status.service.js";
import { triggerOutboundCall } from "./fonio.client.js";

export async function triggerConfirmationCall(clientId, appointment, customer, { userId = null } = {}) {
  if (!customer.phone) {
    throw Object.assign(new Error("Customer has no phone number"), { status: 422 });
  }

  // Retries should be allowed after a previous failed outbound attempt already
  // moved the appointment into confirmation_pending.
  if (appointment.status !== "confirmation_pending") {
    await transitionStatus(clientId, appointment.id, "confirmation_pending", { userId });
  }

  // Persist intent before calling Fonio
  const logId = randomUUID();
  await db.insert(communicationLogs).values({
    id: logId,
    clientId,
    appointmentId: appointment.id,
    customerId: customer.id,
    channel: "call",
    direction: "outbound",
    eventType: "confirmation_call_requested",
    status: "requested"
  });

  // Call Fonio
  let result;
  try {
    result = await triggerOutboundCall({
      toNumber: customer.phone,
      context: {
        name: `${customer.firstName} ${customer.lastName}`,
        appointmentId: appointment.id,
        appointmentTitle: appointment.title
      }
    });
  } catch (error) {
    await db
      .update(communicationLogs)
      .set({ status: "failed" })
      .where(eq(communicationLogs.id, logId));
    throw error;
  }

  // Update log with Fonio's response
  await db
    .update(communicationLogs)
    .set({
      status: "sent",
      externalCallId: result?.callId ?? result?.id ?? null,
      externalRef: result ? JSON.stringify(result) : null
    })
    .where(eq(communicationLogs.id, logId));

  return { communicationLogId: logId, fonioResponse: result };
}
