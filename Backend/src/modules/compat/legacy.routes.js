import { randomUUID } from "crypto";
import { Router } from "express";
import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { db, pool } from "../../db/index.js";
import { appointments, customers, schedules, slots } from "../../db/schema.js";
import { requireAuth, requireClient } from "../../lib/middleware.js";
import { transitionStatus } from "../appointments/status.service.js";
import { createWaitlistEntryForCustomer } from "../waitlist/waitlist.service.js";
import { listWaitlistEntriesByCustomerIds } from "../waitlist/waitlist.service.js";

const DEFAULT_APPOINTMENT_SETTINGS_ID = "default";
const DEFAULT_TIME_SLOT_SIZE = 30;
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_OFFICE_HOURS_START = "08:00";
const DEFAULT_OFFICE_HOURS_END = "17:00";
const SUPPORTED_TIME_SLOT_SIZES = new Set([15, 30, 60]);
const SLOT_GENERATION_DAYS = 30;

export const legacyRouter = Router();

function readRequiredString(body, field, label, errors) {
  const value = typeof body?.[field] === "string" ? body[field].trim() : "";

  if (!value) {
    errors[field] = `${label} is required.`;
  }

  return value;
}

function validateClientPayload(body, prefix = "") {
  const errors = {};
  const firstName = readRequiredString(body, "firstName", "First name", errors);
  const lastName = readRequiredString(body, "lastName", "Last name", errors);
  const telephoneNumber = readRequiredString(body, "telephoneNumber", "Telephone number", errors);
  const email = readRequiredString(body, "email", "Email", errors);
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Email must be valid.";
  }

  return {
    values: {
      firstName,
      lastName,
      telephoneNumber,
      email,
      description
    },
    errors: Object.fromEntries(
      Object.entries(errors).map(([field, message]) => [`${prefix}${field}`, message])
    )
  };
}

function mapCustomerToLegacyClient(row, waitlistEntry = null) {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    telephoneNumber: row.phone ?? row.whatsappPhone ?? "",
    email: row.email ?? "",
    description: row.notes ?? "",
    waitlist: {
      isOnWaitlist: Boolean(waitlistEntry),
      entryId: waitlistEntry?.id ?? null,
      position: waitlistEntry?.position ?? null,
      notes: waitlistEntry?.notes ?? null
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function isDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeSlot(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeSlotToMinutes(value) {
  if (!isTimeSlot(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map((part) => Number(part));

  return hours * 60 + minutes;
}

function minutesToSlot(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function parseWorkingDays(value) {
  if (Array.isArray(value)) {
    return value.map((day) => Number(day)).filter((day) => Number.isInteger(day));
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((day) => Number(day.trim()))
      .filter((day) => Number.isInteger(day));
  }

  return [];
}

function serializeWorkingDays(days) {
  return [...new Set(days)].sort((a, b) => a - b).join(",");
}

function normalizeAppointmentSettings(row) {
  return {
    id: row.id,
    timeSlotSize: row.time_slot_size,
    workingDays: parseWorkingDays(row.working_days),
    officeHoursStart: row.office_hours_start ?? DEFAULT_OFFICE_HOURS_START,
    officeHoursEnd: row.office_hours_end ?? DEFAULT_OFFICE_HOURS_END,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getWeekday(dateString) {
  return new Date(`${dateString}T00:00:00`).getDay();
}

function generateTimeSlots({ timeSlotSize, officeHoursStart, officeHoursEnd }) {
  const slots = [];
  const startMinutes = timeSlotToMinutes(officeHoursStart);
  const endMinutes = timeSlotToMinutes(officeHoursEnd);

  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    return slots;
  }

  for (let minutes = startMinutes; minutes < endMinutes; minutes += timeSlotSize) {
    slots.push(minutesToSlot(minutes));
  }

  return slots;
}

function dateAndTimeToDate(date, time) {
  return new Date(`${date}T${time}:00`);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function ensureAppointmentSettings() {
  const now = new Date();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "appointment_settings" (
      "id" text PRIMARY KEY NOT NULL,
      "time_slot_size" integer NOT NULL,
      "working_days" text NOT NULL,
      "office_hours_start" text DEFAULT '08:00' NOT NULL,
      "office_hours_end" text DEFAULT '17:00' NOT NULL,
      "created_at" timestamp NOT NULL,
      "updated_at" timestamp NOT NULL
    )
  `);

  await pool.query(
    `
      INSERT INTO "appointment_settings" (
        "id",
        "time_slot_size",
        "working_days",
        "office_hours_start",
        "office_hours_end",
        "created_at",
        "updated_at"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6)
      ON CONFLICT ("id") DO NOTHING
    `,
    [
      DEFAULT_APPOINTMENT_SETTINGS_ID,
      DEFAULT_TIME_SLOT_SIZE,
      serializeWorkingDays(DEFAULT_WORKING_DAYS),
      DEFAULT_OFFICE_HOURS_START,
      DEFAULT_OFFICE_HOURS_END,
      now
    ]
  );

  const { rows } = await pool.query(
    `
      SELECT
        "id",
        "time_slot_size",
        "working_days",
        "office_hours_start",
        "office_hours_end",
        "created_at",
        "updated_at"
      FROM "appointment_settings"
      WHERE "id" = $1
      LIMIT 1
    `,
    [DEFAULT_APPOINTMENT_SETTINGS_ID]
  );

  return rows[0];
}

async function ensureClientSchedules(clientId, settings) {
  const existingSchedules = await db
    .select()
    .from(schedules)
    .where(eq(schedules.clientId, clientId))
    .orderBy(asc(schedules.createdAt));

  const scheduleIdsByDay = new Map();

  for (const dayOfWeek of settings.workingDays) {
    const existing = existingSchedules.find((schedule) => schedule.dayOfWeek === dayOfWeek);

    if (existing) {
      const [updated] = await db
        .update(schedules)
        .set({
          startTime: settings.officeHoursStart,
          endTime: settings.officeHoursEnd,
          slotDurationMinutes: settings.timeSlotSize,
          updatedAt: new Date()
        })
        .where(eq(schedules.id, existing.id))
        .returning();
      scheduleIdsByDay.set(dayOfWeek, updated.id);
      continue;
    }

    const id = randomUUID();
    await db.insert(schedules).values({
      id,
      clientId,
      dayOfWeek,
      startTime: settings.officeHoursStart,
      endTime: settings.officeHoursEnd,
      slotDurationMinutes: settings.timeSlotSize
    });
    scheduleIdsByDay.set(dayOfWeek, id);
  }

  return scheduleIdsByDay;
}

async function syncSlotsFromAppointmentSettings(clientId, settings, { now = new Date(), horizonDays = SLOT_GENERATION_DAYS } = {}) {
  const scheduleIdsByDay = await ensureClientSchedules(clientId, settings);
  const rangeStart = startOfDay(now);
  const rangeEnd = addDays(rangeStart, horizonDays);

  const existingSlots = await db
    .select()
    .from(slots)
    .where(and(
      eq(slots.clientId, clientId),
      gte(slots.startsAt, rangeStart),
      lt(slots.startsAt, rangeEnd)
    ))
    .orderBy(asc(slots.startsAt));

  const activeAppointments = await db
    .select({
      id: appointments.id,
      slotId: appointments.slotId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt
    })
    .from(appointments)
    .where(and(
      eq(appointments.clientId, clientId),
      gte(appointments.startsAt, rangeStart),
      lt(appointments.startsAt, rangeEnd),
      ne(appointments.status, "cancelled")
    ))
    .orderBy(asc(appointments.startsAt));

  const slotsByRange = new Map(
    existingSlots.map((slot) => [`${slot.startsAt.toISOString()}|${slot.endsAt.toISOString()}`, slot])
  );

  for (const appointment of activeAppointments) {
    const key = `${appointment.startsAt.toISOString()}|${appointment.endsAt.toISOString()}`;
    let slot = slotsByRange.get(key);

    if (!slot) {
      const id = randomUUID();
      const scheduleId = scheduleIdsByDay.get(appointment.startsAt.getDay()) ?? null;
      await db.insert(slots).values({
        id,
        clientId,
        scheduleId,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: "booked",
        appointmentId: appointment.id
      });
      slot = {
        id,
        clientId,
        scheduleId,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: "booked",
        appointmentId: appointment.id
      };
      slotsByRange.set(key, slot);
    } else if (slot.status !== "booked" || slot.appointmentId !== appointment.id) {
      const [updated] = await db
        .update(slots)
        .set({
          status: "booked",
          appointmentId: appointment.id,
          updatedAt: new Date()
        })
        .where(eq(slots.id, slot.id))
        .returning();
      slot = updated;
      slotsByRange.set(key, slot);
    }

    if (appointment.slotId !== slot.id) {
      await db
        .update(appointments)
        .set({
          slotId: slot.id,
          updatedAt: new Date()
        })
        .where(eq(appointments.id, appointment.id));
    }
  }

  const startMinutes = timeSlotToMinutes(settings.officeHoursStart);
  const endMinutes = timeSlotToMinutes(settings.officeHoursEnd);
  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    return;
  }

  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset += 1) {
    const date = addDays(rangeStart, dayOffset);
    const dayOfWeek = date.getDay();

    if (!settings.workingDays.includes(dayOfWeek)) {
      continue;
    }

    const scheduleId = scheduleIdsByDay.get(dayOfWeek) ?? null;

    for (let minutes = startMinutes; minutes < endMinutes; minutes += settings.timeSlotSize) {
      const startsAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
      const endsAt = addMinutes(startsAt, settings.timeSlotSize);
      const key = `${startsAt.toISOString()}|${endsAt.toISOString()}`;

      if (slotsByRange.has(key)) {
        continue;
      }

      const id = randomUUID();
      await db.insert(slots).values({
        id,
        clientId,
        scheduleId,
        startsAt,
        endsAt,
        status: "available"
      });

      slotsByRange.set(key, {
        id,
        clientId,
        scheduleId,
        startsAt,
        endsAt,
        status: "available",
        appointmentId: null
      });
    }
  }
}

function validateAppointmentSettingsPayload(body) {
  const errors = {};
  const timeSlotSize = Number(body?.timeSlotSize);
  const workingDays = parseWorkingDays(body?.workingDays);
  const uniqueWorkingDays = [...new Set(workingDays)].sort((a, b) => a - b);
  const officeHoursStart =
    typeof body?.officeHoursStart === "string" ? body.officeHoursStart.trim() : "";
  const officeHoursEnd =
    typeof body?.officeHoursEnd === "string" ? body.officeHoursEnd.trim() : "";
  const startMinutes = timeSlotToMinutes(officeHoursStart);
  const endMinutes = timeSlotToMinutes(officeHoursEnd);

  if (!SUPPORTED_TIME_SLOT_SIZES.has(timeSlotSize)) {
    errors.timeSlotSize = "Choose 15, 30, or 60 minutes.";
  }

  if (
    uniqueWorkingDays.length === 0 ||
    uniqueWorkingDays.some((day) => day < 0 || day > 6)
  ) {
    errors.workingDays = "Choose at least one valid working day.";
  }

  if (startMinutes === null) {
    errors.officeHoursStart = "Choose a valid opening time.";
  }

  if (endMinutes === null) {
    errors.officeHoursEnd = "Choose a valid closing time.";
  }

  if (startMinutes !== null && endMinutes !== null && startMinutes >= endMinutes) {
    errors.officeHoursEnd = "Closing time must be after opening time.";
  }

  return {
    values: {
      timeSlotSize,
      workingDays: uniqueWorkingDays,
      officeHoursStart,
      officeHoursEnd
    },
    errors
  };
}

async function readCustomerForAppointment(clientId, body, errors) {
  const mode = typeof body?.clientMode === "string" ? body.clientMode : "existing";

  if (mode === "new") {
    const { values, errors: clientErrors } = validateClientPayload(
      body?.newClient ?? body,
      "newClient."
    );

    Object.assign(errors, clientErrors);

    if (Object.keys(clientErrors).length > 0) {
      return null;
    }

    return {
      mode,
      values
    };
  }

  const customerId = typeof body?.clientId === "string" ? body.clientId.trim() : "";

  if (!customerId) {
    errors.clientId = "Choose a client.";
    return null;
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.clientId, clientId), eq(customers.id, customerId)))
    .limit(1);

  if (!customer) {
    errors.clientId = "Choose an existing client.";
    return null;
  }

  return {
    mode,
    customer
  };
}

async function validateAppointmentPayload(clientId, body) {
  const errors = {};
  const appointmentDate =
    typeof body?.appointmentDate === "string" ? body.appointmentDate.trim() : "";
  const timeSlot = typeof body?.timeSlot === "string" ? body.timeSlot.trim() : "";
  const moreInfo = typeof body?.moreInfo === "string" ? body.moreInfo.trim() : "";
  const joinWaitlist = body?.joinWaitlist === true || body?.joinWaitlist === "true" || body?.joinWaitlist === "on";
  const settings = normalizeAppointmentSettings(await ensureAppointmentSettings());
  const customerInput = await readCustomerForAppointment(clientId, body, errors);

  if (!appointmentDate) {
    errors.appointmentDate = "Appointment date is required.";
  } else if (!isDateString(appointmentDate)) {
    errors.appointmentDate = "Use a YYYY-MM-DD appointment date.";
  } else if (!settings.workingDays.includes(getWeekday(appointmentDate))) {
    errors.appointmentDate = "Choose one of the configured working days.";
  }

  if (!timeSlot) {
    errors.timeSlot = "Time slot is required.";
  } else if (!isTimeSlot(timeSlot)) {
    errors.timeSlot = "Use an HH:MM time slot.";
  } else if (!generateTimeSlots(settings).includes(timeSlot)) {
    errors.timeSlot = "Choose an available configured time slot.";
  }

  return {
    values: {
      appointmentDate,
      timeSlot,
      moreInfo,
      joinWaitlist,
      settings,
      customerInput
    },
    errors
  };
}

function mapAppointmentRow(row) {
  const startsAt = row.startsAt instanceof Date ? row.startsAt : new Date(row.startsAt);
  const customer = {
    id: row.customerId,
    firstName: row.customerFirstName,
    lastName: row.customerLastName,
    phone: row.customerPhone,
    whatsappPhone: row.customerWhatsappPhone,
    email: row.customerEmail,
    notes: row.customerNotes,
    createdAt: row.customerCreatedAt,
    updatedAt: row.customerUpdatedAt
  };

  return {
    id: row.id,
    clientId: row.customerId,
    appointmentDate: formatDate(startsAt),
    timeSlot: formatTime(startsAt),
    status: row.status,
    moreInfo: row.notes ?? "",
    cancellationReason: row.cancelReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cancelledAt: null,
    client: mapCustomerToLegacyClient(customer)
  };
}

function appointmentSelect() {
  return {
    id: appointments.id,
    customerId: appointments.customerId,
    startsAt: appointments.startsAt,
    status: appointments.status,
    cancelReason: appointments.cancelReason,
    notes: appointments.notes,
    createdAt: appointments.createdAt,
    updatedAt: appointments.updatedAt,
    customerFirstName: customers.firstName,
    customerLastName: customers.lastName,
    customerPhone: customers.phone,
    customerWhatsappPhone: customers.whatsappPhone,
    customerEmail: customers.email,
    customerNotes: customers.notes,
    customerCreatedAt: customers.createdAt,
    customerUpdatedAt: customers.updatedAt
  };
}

async function readLegacyAppointment(clientId, id) {
  const [row] = await db
    .select(appointmentSelect())
    .from(appointments)
    .innerJoin(customers, eq(appointments.customerId, customers.id))
    .where(and(eq(appointments.clientId, clientId), eq(appointments.id, id)))
    .limit(1);

  return row ? mapAppointmentRow(row) : null;
}

legacyRouter.get("/clients", requireAuth, requireClient, async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.clientId, req.user.clientId))
      .orderBy(asc(customers.createdAt));

    const waitlistEntries = await listWaitlistEntriesByCustomerIds(
      req.user.clientId,
      rows.map((row) => row.id)
    );
    const waitlistByCustomerId = new Map(waitlistEntries.map((entry) => [entry.customerId, entry]));

    res.json({
      clients: rows.map((row) => mapCustomerToLegacyClient(row, waitlistByCustomerId.get(row.id) ?? null))
    });
  } catch (error) {
    next(error);
  }
});

legacyRouter.post("/clients", requireAuth, requireClient, async (req, res, next) => {
  try {
    const { values, errors } = validateClientPayload(req.body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: "Validation failed", errors });
      return;
    }

    const [customer] = await db
      .insert(customers)
      .values({
        id: randomUUID(),
        clientId: req.user.clientId,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.telephoneNumber,
        whatsappPhone: values.telephoneNumber,
        email: values.email,
        notes: values.description
      })
      .returning();

    res.status(201).json({ clients: [mapCustomerToLegacyClient(customer)] });
  } catch (error) {
    next(error);
  }
});

legacyRouter.get("/appointment-settings", requireAuth, requireClient, async (req, res, next) => {
  try {
    const settings = await ensureAppointmentSettings();
    await syncSlotsFromAppointmentSettings(req.user.clientId, normalizeAppointmentSettings(settings));

    res.json({ settings: normalizeAppointmentSettings(settings) });
  } catch (error) {
    next(error);
  }
});

legacyRouter.patch("/appointment-settings", requireAuth, requireClient, async (req, res, next) => {
  try {
    const { values, errors } = validateAppointmentSettingsPayload(req.body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: "Validation failed", errors });
      return;
    }

    const now = new Date();
    const { rows } = await pool.query(
      `
        INSERT INTO "appointment_settings" (
          "id",
          "time_slot_size",
          "working_days",
          "office_hours_start",
          "office_hours_end",
          "created_at",
          "updated_at"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT ("id") DO UPDATE SET
          "time_slot_size" = EXCLUDED."time_slot_size",
          "working_days" = EXCLUDED."working_days",
          "office_hours_start" = EXCLUDED."office_hours_start",
          "office_hours_end" = EXCLUDED."office_hours_end",
          "updated_at" = EXCLUDED."updated_at"
        RETURNING
          "id",
          "time_slot_size",
          "working_days",
          "office_hours_start",
          "office_hours_end",
          "created_at",
          "updated_at"
      `,
      [
        DEFAULT_APPOINTMENT_SETTINGS_ID,
        values.timeSlotSize,
        serializeWorkingDays(values.workingDays),
        values.officeHoursStart,
        values.officeHoursEnd,
        now
      ]
    );

    await syncSlotsFromAppointmentSettings(req.user.clientId, normalizeAppointmentSettings(rows[0]));

    res.json({ settings: normalizeAppointmentSettings(rows[0]) });
  } catch (error) {
    next(error);
  }
});

legacyRouter.get("/appointments", requireAuth, requireClient, async (req, res, next) => {
  if (
    typeof req.query.date !== "string" &&
    (typeof req.query.start !== "string" || typeof req.query.end !== "string")
  ) {
    next();
    return;
  }

  try {
    if (typeof req.query.start === "string" && typeof req.query.end === "string") {
      const startDate = req.query.start.trim();
      const endDate = req.query.end.trim();

      if (!isDateString(startDate) || !isDateString(endDate)) {
        res.status(400).json({
          error: "Validation failed",
          errors: { date: "Use YYYY-MM-DD start and end dates." }
        });
        return;
      }

      const start = dateAndTimeToDate(startDate, "00:00");
      const end = addMinutes(dateAndTimeToDate(endDate, "00:00"), 24 * 60);
      const rows = await db
        .select({ startsAt: appointments.startsAt })
        .from(appointments)
        .where(
          and(
            eq(appointments.clientId, req.user.clientId),
            gte(appointments.startsAt, start),
            lt(appointments.startsAt, end),
            ne(appointments.status, "cancelled")
          )
        )
        .orderBy(asc(appointments.startsAt));

      res.json({
        appointmentDates: Array.from(
          new Set(
            rows.map((row) =>
              formatDate(row.startsAt instanceof Date ? row.startsAt : new Date(row.startsAt))
            )
          )
        )
      });
      return;
    }

    const date = req.query.date.trim();

    if (!isDateString(date)) {
      res.status(400).json({
        error: "Validation failed",
        errors: { date: "Use a YYYY-MM-DD date." }
      });
      return;
    }

    const start = dateAndTimeToDate(date, "00:00");
    const end = addMinutes(start, 24 * 60);
    const rows = await db
      .select(appointmentSelect())
      .from(appointments)
      .innerJoin(customers, eq(appointments.customerId, customers.id))
      .where(
        and(
          eq(appointments.clientId, req.user.clientId),
          gte(appointments.startsAt, start),
          lt(appointments.startsAt, end)
        )
      )
      .orderBy(asc(appointments.startsAt));

    res.json({ appointments: rows.map(mapAppointmentRow) });
  } catch (error) {
    next(error);
  }
});

legacyRouter.post("/appointments", requireAuth, requireClient, async (req, res, next) => {
  if (req.body?.appointmentDate === undefined && req.body?.timeSlot === undefined) {
    next();
    return;
  }

  try {
    const { values, errors } = await validateAppointmentPayload(req.user.clientId, req.body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: "Validation failed", errors });
      return;
    }

    const startsAt = dateAndTimeToDate(values.appointmentDate, values.timeSlot);
    const endsAt = addMinutes(startsAt, values.settings.timeSlotSize);
    const [existingAppointment] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.clientId, req.user.clientId),
          eq(appointments.startsAt, startsAt),
          ne(appointments.status, "cancelled")
        )
      )
      .limit(1);

    if (existingAppointment) {
      res.status(409).json({
        error: "This time slot is already booked.",
        errors: { timeSlot: "This time slot is already booked." }
      });
      return;
    }

    const appointment = await db.transaction(async (tx) => {
      let customer = values.customerInput.customer;

      if (values.customerInput.mode === "new") {
        [customer] = await tx
          .insert(customers)
          .values({
            id: randomUUID(),
            clientId: req.user.clientId,
            firstName: values.customerInput.values.firstName,
            lastName: values.customerInput.values.lastName,
            phone: values.customerInput.values.telephoneNumber,
            whatsappPhone: values.customerInput.values.telephoneNumber,
            email: values.customerInput.values.email,
            notes: values.customerInput.values.description
          })
          .returning();
      }

      const [createdAppointment] = await tx
        .insert(appointments)
        .values({
          id: randomUUID(),
          clientId: req.user.clientId,
          customerId: customer.id,
          title: `${customer.firstName} ${customer.lastName}`.trim() || "Appointment",
          startsAt,
          endsAt,
          status: "scheduled",
          notes: values.moreInfo
        })
        .returning();

      const [existingSlot] = await tx
        .select()
        .from(slots)
        .where(and(
          eq(slots.clientId, req.user.clientId),
          eq(slots.startsAt, startsAt),
          eq(slots.endsAt, endsAt)
        ))
        .limit(1);

      let createdSlot = existingSlot;

      if (createdSlot && createdSlot.status !== "available") {
        throw Object.assign(new Error("This time slot is not available."), { status: 409 });
      }

      if (createdSlot) {
        const [updatedSlot] = await tx
          .update(slots)
          .set({
            status: "booked",
            appointmentId: createdAppointment.id,
            updatedAt: new Date()
          })
          .where(eq(slots.id, createdSlot.id))
          .returning();
        createdSlot = updatedSlot;
      } else {
        const [insertedSlot] = await tx
          .insert(slots)
          .values({
            id: randomUUID(),
            clientId: req.user.clientId,
            startsAt,
            endsAt,
            status: "booked",
            appointmentId: createdAppointment.id
          })
          .returning();
        createdSlot = insertedSlot;
      }

      const [linkedAppointment] = await tx
        .update(appointments)
        .set({
          slotId: createdSlot.id,
          updatedAt: new Date()
        })
        .where(eq(appointments.id, createdAppointment.id))
        .returning();

      return {
        ...(linkedAppointment ?? createdAppointment),
        customerId: customer.id,
        customerFirstName: customer.firstName,
        customerLastName: customer.lastName,
        customerPhone: customer.phone,
        customerWhatsappPhone: customer.whatsappPhone,
        customerEmail: customer.email,
        customerNotes: customer.notes,
        customerCreatedAt: customer.createdAt,
        customerUpdatedAt: customer.updatedAt
      };
    });

    let waitlist = null;
    if (values.joinWaitlist) {
      const waitlistResult = await createWaitlistEntryForCustomer(
        req.user.clientId,
        appointment.customerId,
        {
          notes: `Wants earlier appointment times after booking ${values.appointmentDate} ${values.timeSlot}.`
        }
      );

      waitlist = {
        entryId: waitlistResult.entry.id,
        created: waitlistResult.created,
        position: waitlistResult.entry.position
      };
    }

    res.status(201).json({
      appointments: [mapAppointmentRow(appointment)],
      waitlist
    });
  } catch (error) {
    next(error);
  }
});

legacyRouter.patch("/appointments/:id/cancel", requireAuth, requireClient, async (req, res, next) => {
  try {
    const cancellationReason =
      typeof req.body?.cancellationReason === "string"
        ? req.body.cancellationReason.trim()
        : "";

    const appointment = await transitionStatus(
      req.user.clientId,
      req.params.id,
      "cancelled",
      {
        userId: req.user.id,
        reason: cancellationReason || null
      }
    );

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found." });
      return;
    }

    if (appointment.cancelReason !== (cancellationReason || null)) {
      await db
        .update(appointments)
        .set({
          cancelReason: cancellationReason || null,
          updatedAt: new Date()
        })
        .where(and(eq(appointments.clientId, req.user.clientId), eq(appointments.id, req.params.id)));
    }

    const mappedAppointment = await readLegacyAppointment(req.user.clientId, req.params.id);

    res.json({ appointments: [mappedAppointment] });
  } catch (error) {
    next(error);
  }
});
