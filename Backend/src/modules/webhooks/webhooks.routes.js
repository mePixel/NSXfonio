import { Router } from "express";
import { processFonioWebhook } from "../fonio/fonio.webhook.service.js";
import { env } from "../../config/env.js";

export const webhooksRouter = Router();

webhooksRouter.post("/fonio", async (req, res, next) => {
  try {
    const result = await processFonioWebhook(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Test endpoint: simulate a no-answer call webhook (development only)
webhooksRouter.post("/fonio/test/simulate-no-answer", async (req, res, next) => {
  try {
    if (env.nodeEnv === "production") {
      res.status(403).json({ error: "Test endpoints not available in production" });
      return;
    }

    const { offerId } = req.body;
    if (!offerId) {
      res.status(400).json({ error: "offerId is required" });
      return;
    }

    // Simulate a no-answer webhook payload
    const simulatedPayload = {
      callId: `test-call-${Date.now()}`,
      status: "no-answer",
      outcome: "no-answer",
      context: {
        offerId
      }
    };

    const result = await processFonioWebhook(simulatedPayload);
    res.json({ ...result, message: "Simulated no-answer call - email should be sent if customer has email" });
  } catch (error) {
    next(error);
  }
});
