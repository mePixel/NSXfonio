import { Router } from "express";
import { requireAuth, requireClient } from "../../lib/middleware.js";
import { uuid } from "../../lib/sanitize.js";
import * as service from "./rescheduler.service.js";

export const reschedulerRouter = Router();

reschedulerRouter.get("/offers/:offerId", async (req, res, next) => {
  try {
    const offerId = uuid(req.params.offerId);
    if (!offerId) {
      res.status(400).json({ error: "Invalid offer id" });
      return;
    }

    res.json(await service.getPublicOfferSummary(offerId));
  } catch (error) {
    next(error);
  }
});

reschedulerRouter.post("/offers/:offerId/accept-public", async (req, res, next) => {
  try {
    const offerId = uuid(req.params.offerId);
    const selectedAppointmentId =
      req.body.selectedAppointmentId === undefined || req.body.selectedAppointmentId === null || req.body.selectedAppointmentId === ""
        ? null
        : uuid(req.body.selectedAppointmentId);

    if (!offerId) {
      res.status(400).json({ error: "Invalid offer id" });
      return;
    }

    if (req.body.selectedAppointmentId !== undefined && req.body.selectedAppointmentId !== null && req.body.selectedAppointmentId !== "" && !selectedAppointmentId) {
      res.status(400).json({ error: "Invalid selected appointment id" });
      return;
    }

    const result = await service.completeAcceptedReschedulerOfferPublic(offerId, {
      selectedAppointmentId,
      payload: {
        source: "public_offer_acceptance_page"
      }
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

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
