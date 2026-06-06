import { randomUUID } from "crypto";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import { clients, communicationLogs, slots } from "../../db/schema.js";
import { createAppointment } from "../appointments/appointments.service.js";
import { createCustomer, findCustomerByPhone } from "../customers/customers.service.js";

function normalizePhone(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[^\d+]/g, "");
  return cleaned || null;
}

function parseDate(value) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function timeOfDayMatches(date, timeOfDay) {
  if (!timeOfDay) return true;

  const hour = date.getUTCHours();
  const normalized = String(timeOfDay).toLowerCase();

  if (normalized === "morning") return hour >= 6 && hour < 12;
  if (normalized === "afternoon") return hour >= 12 && hour < 17;
  if (normalized === "evening") return hour >= 17 && hour < 21;

  return true;
}

function getBookingPayload(payload) {
  return payload?.booking ?? payload?.appointment ?? payload?.intent?.booking ?? null;
}

function getCustomerPayload(payload) {
  return payload?.customer ?? payload?.caller ?? payload?.contact ?? null;
}

function getRequestedPhone(payload) {
  return normalizePhone(
    payload?.fromNumber
      ?? payload?.callerNumber
      ?? payload?.phoneNumber
      ?? payload?.call?.from
      ?? payload?.customer?.phone
      ?? payload?.caller?.phone
      ?? payload?.contact?.phone
      ?? null
  );
}

function getResolvedClientIdFromPayload(payload) {
  return payload?.context?.clientId
    ?? payload?.clientId
    ?? payload?.booking?.clientId
    ?? payload?.defaultValues?.clientId
    ?? null;
}

function getCalledNumber(payload) {
  return normalizePhone(
    payload?.toNumber
      ?? payload?.call?.to
      ?? payload?.calleeNumber
      ?? null
  );
}

function isTruthyIntent(value) {
  return ["booked", "confirmed", "create_appointment", "appointment_booking"].includes(
    String(value ?? "").toLowerCase()
  );
}

export function isInboundAppointmentWebhook(payload) {
  const direction = String(payload?.direction ?? payload?.callDirection ?? "").toLowerCase();
  const eventType = String(payload?.type ?? payload?.eventType ?? payload?.intent?.name ?? "").toLowerCase();

  return direction === "inbound"
    || eventType.includes("inbound")
    || eventType.includes("appointment")
    || payload?.booking !== undefined
    || payload?.appointment !== undefined;
}

async function resolveClient(payload) {
  const explicitClientId = getResolvedClientIdFromPayload(payload);
  if (explicitClientId) {
    const [client] = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.id, explicitClientId));
    return client ?? null;
  }

  const calledNumber = getCalledNumber(payload);
  if (calledNumber) {
    const mappedClientId = env.fonioToNumberClientMap[calledNumber];
    if (mappedClientId) {
      const [client] = await db
        .select({ id: clients.id, name: clients.name })
        .from(clients)
        .where(eq(clients.id, mappedClientId));
      if (client) return client;
    }
  }

  if (env.fonioDefaultClientId) {
    const [client] = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.id, env.fonioDefaultClientId));
    if (client) return client;
  }

  const availableClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .limit(2);

  if (availableClients.length === 1) {
    return availableClients[0];
  }

  return null;
}

export async function resolveFonioClient(payload) {
  return resolveClient(payload);
}

async function findAvailableSlot(clientId, booking) {
  const directSlotId = booking?.slotId ?? booking?.slot?.id ?? null;
  if (directSlotId) {
    const [slot] = await db
      .select()
      .from(slots)
      .where(and(
        eq(slots.clientId, clientId),
        eq(slots.id, directSlotId),
        eq(slots.status, "available")
      ));
    return slot ?? null;
  }

  const startsAt = parseDate(booking?.startsAt ?? booking?.requestedStartsAt ?? booking?.time);
  const endsAt = parseDate(booking?.endsAt ?? booking?.requestedEndsAt ?? null);
  if (!startsAt) return null;

  const effectiveEndsAt = endsAt ?? new Date(startsAt.getTime() + 30 * 60 * 1000);

  const [slot] = await db
    .select()
    .from(slots)
    .where(and(
      eq(slots.clientId, clientId),
      eq(slots.status, "available"),
      gte(slots.startsAt, startsAt),
      lte(slots.endsAt, effectiveEndsAt)
    ));

  return slot ?? null;
}

async function findOrCreateInboundCustomer(clientId, payload) {
  const phone = getRequestedPhone(payload);
  const incomingCustomer = getCustomerPayload(payload);

  if (phone) {
    const existing = await findCustomerByPhone(clientId, phone);
    if (existing) return existing;
  }

  const fullName = typeof incomingCustomer?.name === "string" ? incomingCustomer.name.trim() : "";
  const [firstName = "Inbound", ...rest] = fullName ? fullName.split(/\s+/) : [];
  const lastName = rest.join(" ") || "Caller";

  return createCustomer(clientId, {
    firstName: incomingCustomer?.firstName ?? firstName,
    lastName: incomingCustomer?.lastName ?? lastName,
    phone,
    whatsappPhone: phone,
    email: incomingCustomer?.email ?? null,
    notes: "Created from Fonio inbound call"
  });
}

export async function listFonioAvailableSlots(clientId, { from, to, limit } = {}) {
  const clauses = [eq(slots.clientId, clientId), eq(slots.status, "available")];

  if (from) clauses.push(gte(slots.startsAt, from));
  if (to) clauses.push(lte(slots.endsAt, to));

  const query = db
    .select({
      id: slots.id,
      startsAt: slots.startsAt,
      endsAt: slots.endsAt,
      status: slots.status
    })
    .from(slots)
    .where(and(...clauses))
    .orderBy(asc(slots.startsAt));

  if (limit) {
    return query.limit(limit);
  }

  return query;
}

export async function searchFonioAvailableSlots(payload, { now = new Date(), defaultWindowDays = 14, maxSlots = 6 } = {}) {
  const client = await resolveClient(payload);
  const clientId = client?.id ?? null;
  const callerPhone = getRequestedPhone(payload);
  const calledNumber = getCalledNumber(payload);
  const search = payload?.search ?? {};

  if (!clientId) {
    return {
      handled: false,
      reason: "unresolved_client",
      callerPhone,
      calledNumber,
      matches: []
    };
  }

  const from = parseDate(search?.from) ?? now;
  const to = parseDate(search?.to) ?? new Date(from.getTime() + defaultWindowDays * 24 * 60 * 60 * 1000);
  const timeOfDay = typeof search?.timeOfDay === "string" ? search.timeOfDay : null;

  if (to <= from) {
    return {
      handled: false,
      reason: "invalid_range",
      clientId,
      practiceName: client.name,
      callerPhone,
      calledNumber,
      matches: []
    };
  }

  const rawMatches = await listFonioAvailableSlots(clientId, {
    from,
    to,
    limit: maxSlots * 3
  });

  const matches = rawMatches
    .filter((slot) => timeOfDayMatches(slot.startsAt, timeOfDay))
    .slice(0, maxSlots);

  return {
    handled: true,
    clientId,
    practiceName: client.name,
    callerPhone,
    calledNumber,
    requestedRange: {
      from,
      to,
      timeOfDay
    },
    matches,
    promptHints: {
      bookingAvailable: matches.length > 0,
      reason: matches.length > 0 ? null : "no_matching_slots"
    }
  };
}

export async function buildInboundContext(payload, { now = new Date(), maxSlots = 3 } = {}) {
  const client = await resolveClient(payload);
  const clientId = client?.id ?? null;
  const callerPhone = getRequestedPhone(payload);
  const calledNumber = getCalledNumber(payload);

  if (!clientId) {
    return {
      clientId: null,
      practiceName: null,
      callerPhone,
      calledNumber,
      customer: null,
      availableSlots: [],
      bookingRules: {
        timezone: "Europe/Vienna",
        maxSlotsToOffer: maxSlots
      },
      promptHints: {
        bookingAvailable: false,
        reason: "unresolved_client"
      }
    };
  }

  const customer = callerPhone
    ? await findCustomerByPhone(clientId, callerPhone)
    : null;

  const availableSlots = await listFonioAvailableSlots(clientId, {
    from: now,
    limit: maxSlots
  });

  return {
    clientId,
    practiceName: client?.name ?? null,
    callerPhone,
    calledNumber,
    customer: customer
      ? {
          id: customer.id,
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          firstName: customer.firstName,
          lastName: customer.lastName,
          isExistingCustomer: true,
          notes: customer.notes ?? null
        }
      : {
          id: null,
          name: null,
          firstName: null,
          lastName: null,
          isExistingCustomer: false,
          notes: null
        },
    availableSlots,
    bookingRules: {
      timezone: "Europe/Vienna",
      maxSlotsToOffer: maxSlots
    },
    promptHints: {
      bookingAvailable: availableSlots.length > 0,
      reason: availableSlots.length > 0 ? null : "no_available_slots"
    }
  };
}

export async function handleInboundAppointmentWebhook(payload) {
  const client = await resolveClient(payload);
  const clientId = client?.id ?? null;
  if (!clientId) {
    return { handled: false, reason: "unresolved_client" };
  }

  const booking = getBookingPayload(payload);
  if (!booking || !isTruthyIntent(payload?.intent?.name ?? payload?.booking?.status ?? "appointment_booking")) {
    return { handled: false, reason: "no_booking_intent" };
  }

  const slot = await findAvailableSlot(clientId, booking);
  if (!slot) {
    return { handled: false, reason: "no_matching_available_slot" };
  }

  const customer = await findOrCreateInboundCustomer(clientId, payload);

  const appointment = await createAppointment(clientId, {
    customerId: customer.id,
    slotId: slot.id,
    title: booking?.title ?? booking?.appointmentType ?? "Inbound phone appointment",
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    notes: booking?.notes ?? payload?.summary ?? "Booked by Fonio inbound call"
  });

  await db.insert(communicationLogs).values({
    id: randomUUID(),
    clientId,
    appointmentId: appointment.id,
    customerId: customer.id,
    channel: "call",
    direction: "inbound",
    eventType: "appointment_booked_from_inbound_call",
    status: payload?.status ?? "processed",
    externalCallId: payload?.callId ?? payload?.id ?? null,
    payloadJson: JSON.stringify(payload)
  });

  return {
    handled: true,
    mode: "inbound",
    clientId,
    appointmentId: appointment.id,
    customerId: customer.id,
    slotId: slot.id
  };
}
