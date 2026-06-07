import { Router } from "express";
import { requireAuth, requireClient } from "../../lib/middleware.js";
import { uuid } from "../../lib/sanitize.js";
import * as service from "./rescheduler.service.js";

export const reschedulerRouter = Router();

reschedulerRouter.get("/candidates/:candidateId", async (req, res, next) => {
  try {
    const candidateId = uuid(req.params.candidateId);
    if (!candidateId) {
      res.status(400).json({ error: "Invalid candidate id" });
      return;
    }

    res.json(await service.getPublicOfferSummary(candidateId));
  } catch (error) {
    next(error);
  }
});

reschedulerRouter.post("/candidates/:candidateId/accept-public", async (req, res, next) => {
  try {
    const candidateId = uuid(req.params.candidateId);
    const selectedAppointmentId =
      req.body.selectedAppointmentId === undefined || req.body.selectedAppointmentId === null || req.body.selectedAppointmentId === ""
        ? null
        : uuid(req.body.selectedAppointmentId);

    if (!candidateId) {
      res.status(400).json({ error: "Invalid candidate id" });
      return;
    }

    if (req.body.selectedAppointmentId !== undefined && req.body.selectedAppointmentId !== null && req.body.selectedAppointmentId !== "" && !selectedAppointmentId) {
      res.status(400).json({ error: "Invalid selected appointment id" });
      return;
    }

    const result = await service.completeAcceptedReschedulerOfferPublic(candidateId, {
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

reschedulerRouter.post("/candidates/:candidateId/decline-public", async (req, res, next) => {
  try {
    const candidateId = uuid(req.params.candidateId);
    if (!candidateId) {
      res.status(400).json({ error: "Invalid candidate id" });
      return;
    }

    const result = await service.declineReschedulerOfferPublic(candidateId, {
      payload: {
        source: "public_offer_decline_page"
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
