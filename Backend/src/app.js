import cors from "cors";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { env } from "./config/env.js";
import { db } from "./db/index.js";
import { appointmentSettings, appointments, clients } from "./db/schema.js";

export const app = express();

app.set("trust proxy", 1);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || env.clientOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
};

const DEFAULT_APPOINTMENT_SETTINGS_ID = "default";
const DEFAULT_TIME_SLOT_SIZE = 30;
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_OFFICE_HOURS_START = "08:00";
const DEFAULT_OFFICE_HOURS_END = "17:00";
const SUPPORTED_TIME_SLOT_SIZES = new Set([15, 30, 60]);

app.use(
  cors(corsOptions)
);

app.options("/{*path}", cors(corsOptions));

app.use(helmet());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

// Better Auth must receive the raw request body, so this is mounted before express.json().
app.all("/api/auth/{*auth}", toNodeHandler(auth));

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "nsxfonio-backend" });
});

async function getRequestSession(req) {
  return auth.api.getSession({
    headers: fromNodeHeaders(req.headers)
  });
}

async function requireSession(req, res) {
  const session = await getRequestSession(req);

  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return session;
}

function readRequiredString(body, field, label, errors) {
  const value = typeof body?.[field] === "string" ? body[field].trim() : "";

  if (!value) {
    errors[field] = `${label} is required.`;
  }

  return value;
}

function validateClientPayload(body) {
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
    errors
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
    timeSlotSize: row.timeSlotSize,
    workingDays: parseWorkingDays(row.workingDays),
    officeHoursStart: row.officeHoursStart ?? DEFAULT_OFFICE_HOURS_START,
    officeHoursEnd: row.officeHoursEnd ?? DEFAULT_OFFICE_HOURS_END,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function getWeekday(dateString) {
  return new Date(`${dateString}T00:00:00`).getDay();
}

function minutesToSlot(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
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

async function getAppointmentSettings() {
  const [existingSettings] = await db
    .select()
    .from(appointmentSettings)
    .where(eq(appointmentSettings.id, DEFAULT_APPOINTMENT_SETTINGS_ID))
    .limit(1);

  if (existingSettings) {
    return existingSettings;
  }

  const now = new Date();
  const [createdSettings] = await db
    .insert(appointmentSettings)
    .values({
      id: DEFAULT_APPOINTMENT_SETTINGS_ID,
      timeSlotSize: DEFAULT_TIME_SLOT_SIZE,
      workingDays: serializeWorkingDays(DEFAULT_WORKING_DAYS),
      officeHoursStart: DEFAULT_OFFICE_HOURS_START,
      officeHoursEnd: DEFAULT_OFFICE_HOURS_END,
      createdAt: now,
      updatedAt: now
    })
    .returning();

  return createdSettings;
}

function validateAppointmentSettingsPayload(body) {
  const errors = {};
  const timeSlotSize = Number(body?.timeSlotSize);
  const workingDays = parseWorkingDays(body?.workingDays);
  const uniqueWorkingDays = [...new Set(workingDays)].sort((a, b) => a - b);
  const officeHoursStart =
    typeof body?.officeHoursStart === "string"
      ? body.officeHoursStart.trim()
      : "";
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

async function readClientForAppointment(body, errors) {
  const mode = typeof body?.clientMode === "string" ? body.clientMode : "existing";

  if (mode === "new") {
    const { values, errors: clientErrors } = validateClientPayload(body?.newClient ?? body);

    Object.entries(clientErrors).forEach(([field, message]) => {
      errors[`newClient.${field}`] = message;
    });

    if (Object.keys(clientErrors).length > 0) {
      return null;
    }

    return {
      mode,
      values
    };
  }

  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";

  if (!clientId) {
    errors.clientId = "Choose a client.";
    return null;
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);

  if (!client) {
    errors.clientId = "Choose an existing client.";
    return null;
  }

  return {
    mode,
    clientId
  };
}

async function validateAppointmentPayload(body) {
  const errors = {};
  const appointmentDate =
    typeof body?.appointmentDate === "string" ? body.appointmentDate.trim() : "";
  const timeSlot = typeof body?.timeSlot === "string" ? body.timeSlot.trim() : "";
  const moreInfo = typeof body?.moreInfo === "string" ? body.moreInfo.trim() : "";
  const settings = normalizeAppointmentSettings(await getAppointmentSettings());
  const clientInput = await readClientForAppointment(body, errors);

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
      clientInput
    },
    errors
  };
}

function mapAppointmentRow(row) {
  return {
    id: row.id,
    clientId: row.clientId,
    appointmentDate: row.appointmentDate,
    timeSlot: row.timeSlot,
    status: row.status,
    moreInfo: row.moreInfo,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cancelledAt: row.cancelledAt,
    client: {
      id: row.clientId,
      firstName: row.clientFirstName,
      lastName: row.clientLastName,
      telephoneNumber: row.clientTelephoneNumber,
      email: row.clientEmail,
      description: row.clientDescription
    }
  };
}

app.get("/api/me", async (req, res, next) => {
  try {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.get("/api/clients", async (req, res, next) => {
  try {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    const rows = await db.select().from(clients).orderBy(desc(clients.createdAt));

    res.json({ clients: rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/clients", async (req, res, next) => {
  try {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    const { values, errors } = validateClientPayload(req.body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: "Validation failed", errors });
      return;
    }

    const now = new Date();
    const [client] = await db
      .insert(clients)
      .values({
        id: randomUUID(),
        ...values,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    res.status(201).json({ clients: [client] });
  } catch (error) {
    next(error);
  }
});

app.get("/api/appointments", async (req, res, next) => {
  try {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    const date = typeof req.query.date === "string" ? req.query.date.trim() : "";

    if (!isDateString(date)) {
      res.status(400).json({
        error: "Validation failed",
        errors: { date: "Use a YYYY-MM-DD date." }
      });
      return;
    }

    const rows = await db
      .select({
        id: appointments.id,
        clientId: appointments.clientId,
        appointmentDate: appointments.appointmentDate,
        timeSlot: appointments.timeSlot,
        status: appointments.status,
        moreInfo: appointments.moreInfo,
        cancellationReason: appointments.cancellationReason,
        createdAt: appointments.createdAt,
        updatedAt: appointments.updatedAt,
        cancelledAt: appointments.cancelledAt,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientTelephoneNumber: clients.telephoneNumber,
        clientEmail: clients.email,
        clientDescription: clients.description
      })
      .from(appointments)
      .innerJoin(clients, eq(appointments.clientId, clients.id))
      .where(eq(appointments.appointmentDate, date))
      .orderBy(asc(appointments.appointmentDate), asc(appointments.timeSlot));

    res.json({ appointments: rows.map(mapAppointmentRow) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/appointments", async (req, res, next) => {
  try {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    const { values, errors } = await validateAppointmentPayload(req.body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: "Validation failed", errors });
      return;
    }

    const [existingAppointment] = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.appointmentDate, values.appointmentDate),
          eq(appointments.timeSlot, values.timeSlot),
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

    const now = new Date();
    const appointment = await db.transaction(async (tx) => {
      let clientId = values.clientInput.clientId;

      if (values.clientInput.mode === "new") {
        const [client] = await tx
          .insert(clients)
          .values({
            id: randomUUID(),
            ...values.clientInput.values,
            createdAt: now,
            updatedAt: now
          })
          .returning();

        clientId = client.id;
      }

      const [createdAppointment] = await tx
        .insert(appointments)
        .values({
          id: randomUUID(),
          clientId,
          appointmentDate: values.appointmentDate,
          timeSlot: values.timeSlot,
          status: "scheduled",
          moreInfo: values.moreInfo,
          createdAt: now,
          updatedAt: now
        })
        .returning();

      return createdAppointment;
    });

    res.status(201).json({ appointments: [appointment] });
  } catch (error) {
    if (error?.code === "23505") {
      res.status(409).json({
        error: "This time slot is already booked.",
        errors: { timeSlot: "This time slot is already booked." }
      });
      return;
    }

    next(error);
  }
});

app.patch("/api/appointments/:id/cancel", async (req, res, next) => {
  try {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    const id = req.params.id;
    const cancellationReason =
      typeof req.body?.cancellationReason === "string"
        ? req.body.cancellationReason.trim()
        : "";
    const now = new Date();
    const [appointment] = await db
      .update(appointments)
      .set({
        status: "cancelled",
        cancellationReason,
        cancelledAt: now,
        updatedAt: now
      })
      .where(eq(appointments.id, id))
      .returning();

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found." });
      return;
    }

    res.json({ appointments: [appointment] });
  } catch (error) {
    next(error);
  }
});

app.get("/api/appointment-settings", async (req, res, next) => {
  try {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    const settings = await getAppointmentSettings();

    res.json({ settings: normalizeAppointmentSettings(settings) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/appointment-settings", async (req, res, next) => {
  try {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    const { values, errors } = validateAppointmentSettingsPayload(req.body);

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: "Validation failed", errors });
      return;
    }

    await getAppointmentSettings();

    const [settings] = await db
      .update(appointmentSettings)
      .set({
        timeSlotSize: values.timeSlotSize,
        workingDays: serializeWorkingDays(values.workingDays),
        officeHoursStart: values.officeHoursStart,
        officeHoursEnd: values.officeHoursEnd,
        updatedAt: new Date()
      })
      .where(eq(appointmentSettings.id, DEFAULT_APPOINTMENT_SETTINGS_ID))
      .returning();

    res.json({ settings: normalizeAppointmentSettings(settings) });
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = env.nodeEnv === "production" && status === 500 ? "Internal server error" : err.message;

  res.status(status).json({ error: message });
});
