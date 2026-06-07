import { Router } from "express";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../lib/middleware.js";
import { str } from "../../lib/sanitize.js";
import { db } from "../../db/index.js";
import { clients, user as userTable } from "../../db/schema.js";

export const onboardingRouter = Router();

onboardingRouter.use(requireAuth);

/**
 * GET /api/onboarding/status
 * Returns whether the current user is associated with a client.
 */
onboardingRouter.get("/status", (req, res) => {
  res.json({ hasClient: !!req.user.clientId, clientId: req.user.clientId });
});

/**
 * POST /api/onboarding/client
 * Creates a new client and associates the current user with it.
 */
onboardingRouter.post("/client", async (req, res, next) => {
  try {
    if (req.user.clientId) {
      res.status(409).json({ error: "User is already associated with a client" });
      return;
    }

    const name = str(req.body.name, { required: true, max: 200 });
    if (!name) {
      res.status(400).json({ error: "Client name is required and must be under 200 characters" });
      return;
    }

    const [client] = await db
      .insert(clients)
      .values({ id: randomUUID(), name })
      .returning();

    await db
      .update(userTable)
      .set({ clientId: client.id })
      .where(eq(userTable.id, req.user.id));

    res.status(201).json({ client });
  } catch (error) {
    next(error);
  }
});
