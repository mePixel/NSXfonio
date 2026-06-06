import { Router } from "express";
import { processFonioWebhook } from "../fonio/fonio.webhook.service.js";

export const webhooksRouter = Router();

webhooksRouter.post("/fonio", async (req, res, next) => {
  try {
    const result = await processFonioWebhook(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
