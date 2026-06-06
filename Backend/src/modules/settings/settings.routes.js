import { Router } from "express";
import { requireAuth, requireClient } from "../../lib/middleware.js";
import { str } from "../../lib/sanitize.js";
import { getActiveFonioApiKey, revokeFonioApiKey, rotateFonioApiKey } from "./settings.service.js";

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireClient);

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
