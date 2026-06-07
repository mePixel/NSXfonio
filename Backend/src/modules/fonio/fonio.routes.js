import { Router } from "express";
import { requireFonioApiKey } from "../../lib/middleware.js";
import { isoDate, str } from "../../lib/sanitize.js";
import { acceptReschedulerOffer } from "../rescheduler/rescheduler.service.js";
import {
  buildInboundContext,
  handleInboundAppointmentWebhook,
  handleInboundCancellation,
  handleInboundWaitlist,
  listFonioUpcomingAppointments,
  searchFonioAvailableSlots,
  listFonioAvailableSlots
} from "./fonio.inbound.service.js";

export const fonioRouter = Router();

fonioRouter.use(requireFonioApiKey);

fonioRouter.post("/inbound-context", async (req, res, next) => {
  try {
    const maxSlotsRaw = Number(req.body?.maxSlots ?? req.query?.maxSlots ?? 3);
    const maxSlots = Number.isInteger(maxSlotsRaw) && maxSlotsRaw > 0 && maxSlotsRaw <= 10
      ? maxSlotsRaw
      : 3;

    const context = await buildInboundContext(
      { ...(req.body ?? {}), authenticatedClientId: req.fonioAuth.clientId },
      { maxSlots }
    );
    res.json(context);
  } catch (error) {
    next(error);
  }
});

fonioRouter.post("/inbound-booking", async (req, res, next) => {
  try {
    const result = await handleInboundAppointmentWebhook({
      ...(req.body ?? {}),
      authenticatedClientId: req.fonioAuth.clientId
    });

    if (result.handled) {
      res.status(201).json(result);
      return;
    }

    const statusByReason = {
      unresolved_client: 422,
      no_booking_intent: 422,
      no_matching_available_slot: 409
    };

    res.status(statusByReason[result.reason] ?? 422).json(result);
  } catch (error) {
    next(error);
  }
});

fonioRouter.post("/inbound-search-slots", async (req, res, next) => {
  try {
    const maxSlotsRaw = Number(req.body?.maxSlots ?? req.query?.maxSlots ?? 6);
    const maxSlots = Number.isInteger(maxSlotsRaw) && maxSlotsRaw > 0 && maxSlotsRaw <= 12
      ? maxSlotsRaw
      : 6;

    const result = await searchFonioAvailableSlots(
      { ...(req.body ?? {}), authenticatedClientId: req.fonioAuth.clientId },
      { maxSlots }
    );

    if (result.handled) {
      res.json(result);
      return;
    }

    const statusByReason = {
      unresolved_client: 422,
      invalid_range: 400
    };

    res.status(statusByReason[result.reason] ?? 422).json(result);
  } catch (error) {
    next(error);
  }
});

fonioRouter.post("/inbound-upcoming-appointments", async (req, res, next) => {
  try {
    const result = await listFonioUpcomingAppointments({
      ...(req.body ?? {}),
      authenticatedClientId: req.fonioAuth.clientId
    });

    if (result.handled) {
      res.json(result);
      return;
    }

    const statusByReason = {
      unresolved_client: 422
    };

    res.status(statusByReason[result.reason] ?? 422).json(result);
  } catch (error) {
    next(error);
  }
});

fonioRouter.post("/inbound-cancel", async (req, res, next) => {
  try {
    const result = await handleInboundCancellation({
      ...(req.body ?? {}),
      authenticatedClientId: req.fonioAuth.clientId
    });

    if (result.handled) {
      res.json(result);
      return;
    }

    const statusByReason = {
      unresolved_client: 422,
      missing_appointment_id: 422,
      appointment_not_found_for_caller: 404
    };

    res.status(statusByReason[result.reason] ?? 422).json(result);
  } catch (error) {
    next(error);
  }
});

fonioRouter.post("/inbound-waitlist", async (req, res, next) => {
  try {
    const result = await handleInboundWaitlist({
      ...(req.body ?? {}),
      authenticatedClientId: req.fonioAuth.clientId
    });

    if (result.handled) {
      res.status(201).json(result);
      return;
    }

    const statusByReason = {
      unresolved_client: 422
    };

    res.status(statusByReason[result.reason] ?? 422).json(result);
  } catch (error) {
    next(error);
  }
});

fonioRouter.post("/rescheduler/accept", async (req, res, next) => {
  try {
    const offerId = req.body?.offerId ?? req.body?.context?.offerId ?? null;

    if (!offerId || typeof offerId !== "string") {
      res.status(400).json({
        handled: false,
        reason: "missing_offer_id",
        error: "offerId is required"
      });
      return;
    }

    const result = await acceptReschedulerOffer(req.fonioAuth.clientId, offerId, {
      payload: req.body ?? {}
    });

    res.status(result.alreadyFilled ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
});

fonioRouter.get("/availability", async (req, res, next) => {
  try {
    const clientId = req.fonioAuth.clientId ?? str(req.query.clientId, { required: true, max: 100 });
    if (!clientId) {
      res.status(400).json({ error: "clientId is required" });
      return;
    }

    const from = req.query.from !== undefined ? isoDate(String(req.query.from)) : undefined;
    const to = req.query.to !== undefined ? isoDate(String(req.query.to)) : undefined;

    if (req.query.from !== undefined && from === undefined) {
      res.status(400).json({ error: "from must be a valid ISO date string" });
      return;
    }
    if (req.query.to !== undefined && to === undefined) {
      res.status(400).json({ error: "to must be a valid ISO date string" });
      return;
    }

    const slots = await listFonioAvailableSlots(clientId, { from, to });
    res.json({
      clientId,
      slots,
      count: slots.length
    });
  } catch (error) {
    next(error);
  }
});
