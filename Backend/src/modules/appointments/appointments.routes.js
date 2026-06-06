import { Router } from "express";
import { requireAuth, requireClient } from "../../lib/middleware.js";
import { isoDate, str, uuid } from "../../lib/sanitize.js";
import * as service from "./appointments.service.js";
import { transitionStatus } from "./status.service.js";
import { triggerConfirmationCall } from "../fonio/fonio.service.js";
import { getCustomer } from "../customers/customers.service.js";

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAuth, requireClient);

appointmentsRouter.get("/", async (req, res, next) => {
  try {
    const list = await service.listAppointments(req.user.clientId);
    res.json(list);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.post("/", async (req, res, next) => {
  try {
    const title      = str(req.body.title, { required: true, max: 200 });
    const customerId = uuid(req.body.customerId);
    const startsAt   = isoDate(req.body.startsAt);
    const endsAt     = isoDate(req.body.endsAt);

    if (!title) {
      res.status(400).json({ error: "title is required and must be under 200 characters" });
      return;
    }
    if (!customerId) {
      res.status(400).json({ error: "customerId must be a valid UUID" });
      return;
    }
    if (!startsAt) {
      res.status(400).json({ error: "startsAt must be a valid ISO date string" });
      return;
    }
    if (!endsAt) {
      res.status(400).json({ error: "endsAt must be a valid ISO date string" });
      return;
    }
    if (endsAt <= startsAt) {
      res.status(400).json({ error: "endsAt must be after startsAt" });
      return;
    }

    let slotId = null;
    if (req.body.slotId !== undefined && req.body.slotId !== null) {
      slotId = uuid(req.body.slotId);
      if (!slotId) {
        res.status(400).json({ error: "slotId must be a valid UUID" });
        return;
      }
    }

    const confirmationDeadlineAt = req.body.confirmationDeadlineAt !== undefined
      ? isoDate(req.body.confirmationDeadlineAt)
      : undefined;
    const followupDeadlineAt = req.body.followupDeadlineAt !== undefined
      ? isoDate(req.body.followupDeadlineAt)
      : undefined;

    if (confirmationDeadlineAt === undefined && req.body.confirmationDeadlineAt !== undefined) {
      res.status(400).json({ error: "confirmationDeadlineAt must be a valid ISO date string or null" });
      return;
    }
    if (followupDeadlineAt === undefined && req.body.followupDeadlineAt !== undefined) {
      res.status(400).json({ error: "followupDeadlineAt must be a valid ISO date string or null" });
      return;
    }

    const notes = str(req.body.notes, { max: 2000 });

    const appointment = await service.createAppointment(
      req.user.clientId,
      { title, customerId, slotId, startsAt, endsAt, confirmationDeadlineAt, followupDeadlineAt, notes },
      { userId: req.user.id }
    );
    res.status(201).json(appointment);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const appointment = await service.getAppointment(req.user.clientId, id);
    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    res.json(appointment);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const updates = {};

    if (req.body.title !== undefined) {
      const v = str(req.body.title, { required: true, max: 200 });
      if (!v) { res.status(400).json({ error: "title must be a non-empty string under 200 characters" }); return; }
      updates.title = v;
    }

    if (req.body.startsAt !== undefined) {
      const v = isoDate(req.body.startsAt);
      if (!v) { res.status(400).json({ error: "startsAt must be a valid ISO date string" }); return; }
      updates.startsAt = v;
    }

    if (req.body.endsAt !== undefined) {
      const v = isoDate(req.body.endsAt);
      if (!v) { res.status(400).json({ error: "endsAt must be a valid ISO date string" }); return; }
      updates.endsAt = v;
    }

    if (updates.startsAt && updates.endsAt && updates.endsAt <= updates.startsAt) {
      res.status(400).json({ error: "endsAt must be after startsAt" });
      return;
    }

    if (req.body.confirmationDeadlineAt !== undefined) {
      const v = isoDate(req.body.confirmationDeadlineAt);
      if (v === undefined) { res.status(400).json({ error: "confirmationDeadlineAt must be a valid ISO date string or null" }); return; }
      updates.confirmationDeadlineAt = v;
    }

    if (req.body.followupDeadlineAt !== undefined) {
      const v = isoDate(req.body.followupDeadlineAt);
      if (v === undefined) { res.status(400).json({ error: "followupDeadlineAt must be a valid ISO date string or null" }); return; }
      updates.followupDeadlineAt = v;
    }

    if (req.body.notes !== undefined) updates.notes = str(req.body.notes, { max: 2000 });

    const appointment = await service.updateAppointment(req.user.clientId, id, updates);
    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    res.json(appointment);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.post("/:id/trigger-call", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const appointment = await service.getAppointment(req.user.clientId, id);
    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    const customer = await getCustomer(req.user.clientId, appointment.customerId);
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const result = await triggerConfirmationCall(
      req.user.clientId,
      appointment,
      customer,
      { userId: req.user.id }
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const appointment = await transitionStatus(
      req.user.clientId,
      id,
      "cancelled",
      { userId: req.user.id }
    );
    res.json(appointment);
  } catch (error) {
    next(error);
  }
});
