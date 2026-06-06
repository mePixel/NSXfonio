import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { env } from "./config/env.js";
import { requireAuth } from "./lib/middleware.js";
import { legacyRouter } from "./modules/compat/legacy.routes.js";
import { customersRouter } from "./modules/customers/customers.routes.js";
import { appointmentsRouter } from "./modules/appointments/appointments.routes.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { waitlistRouter } from "./modules/waitlist/waitlist.routes.js";
import { slotsRouter } from "./modules/slots/slots.routes.js";
import { webhooksRouter } from "./modules/webhooks/webhooks.routes.js";

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

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user, session: req.session });
});

app.use("/api", legacyRouter);
app.use("/api/customers", customersRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/waiting-list", waitlistRouter);
app.use("/api/slots", slotsRouter);
app.use("/api/webhooks", webhooksRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = env.nodeEnv === "production" && status === 500 ? "Internal server error" : err.message;

  res.status(status).json({ error: message });
});
