import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { env } from "./config/env.js";

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

app.get("/api/me", async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers)
    });

    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.json(session);
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
