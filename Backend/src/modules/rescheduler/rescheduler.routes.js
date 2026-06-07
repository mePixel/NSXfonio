import { Router } from "express";
import { requireAuth, requireClient } from "../../lib/middleware.js";
import { uuid } from "../../lib/sanitize.js";
import * as service from "./rescheduler.service.js";

export const reschedulerRouter = Router();

reschedulerRouter.use(requireAuth, requireClient);

reschedulerRouter.get("/", async (req, res, next) => {
  try {
    res.json(await service.listReschedulerFlows(req.user.clientId));
  } catch (error) {
    next(error);
  }
});

reschedulerRouter.post("/:id/abort", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const flow = await service.abortReschedulerFlow(req.user.clientId, id, {
      userId: req.user.id
    });

    res.json({ reschedulerFlow: flow });
  } catch (error) {
    next(error);
  }
});
