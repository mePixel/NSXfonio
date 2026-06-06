import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth, requireClient } from "../../lib/middleware.js";
import { db } from "../../db/index.js";
import { clients, user } from "../../db/schema.js";
import { str } from "../../lib/sanitize.js";
import { getActiveFonioApiKey, revokeFonioApiKey, rotateFonioApiKey } from "./settings.service.js";

export const settingsRouter = Router();

const DEFAULT_CLIENT_ID = "default-client";

async function ensureFonioClient(req, _res, next) {
  if (req.user?.clientId) {
    next();
    return;
  }

  try {
    const now = new Date();

    const [createdClient] = await db
      .insert(clients)
      .values({
        id: DEFAULT_CLIENT_ID,
        name: "Default Practice",
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoNothing()
      .returning({ id: clients.id });

    const ensuredClient =
      createdClient
      ?? (
        await db
          .select({ id: clients.id })
          .from(clients)
          .where(eq(clients.id, DEFAULT_CLIENT_ID))
          .limit(1)
      )[0];

    if (!ensuredClient) {
      next();
      return;
    }

    const [updatedUser] = await db
      .update(user)
      .set({ clientId: ensuredClient.id })
      .where(eq(user.id, req.user.id))
      .returning();

    if (updatedUser) {
      req.user = updatedUser;
    }

    next();
  } catch (error) {
    next(error);
  }
}

settingsRouter.use(requireAuth, ensureFonioClient, requireClient);

settingsRouter.get("/fonio-api-key", async (req, res, next) => {
  try {
    const apiKey = await getActiveFonioApiKey(req.user.clientId);
    res.json({ apiKey });
  } catch (error) {
    next(error);
  }
});

settingsRouter.post("/fonio-api-key", async (req, res, next) => {
  try {
    const name = str(req.body?.name, { max: 100 }) ?? "Fonio";
    const result = await rotateFonioApiKey(req.user.clientId, {
      userId: req.user.id,
      name
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

settingsRouter.delete("/fonio-api-key", async (req, res, next) => {
  try {
    const revoked = await revokeFonioApiKey(req.user.clientId);
    res.json({ revoked });
  } catch (error) {
    next(error);
  }
});
