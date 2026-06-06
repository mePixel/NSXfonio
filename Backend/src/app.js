import cors from "cors";
import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { env } from "./config/env.js";
import { db } from "./db/index.js";
import { clients } from "./db/schema.js";

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

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = env.nodeEnv === "production" && status === 500 ? "Internal server error" : err.message;

  res.status(status).json({ error: message });
});
