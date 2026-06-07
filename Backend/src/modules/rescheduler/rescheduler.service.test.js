import test from "node:test";
import assert from "node:assert/strict";

import {
  assertPublicOfferAvailability,
  finalizePublicOfferDecline
} from "./rescheduler.service.js";

test("finalizePublicOfferDecline advances immediately and records the next candidate", async () => {
  const calls = [];

  const result = await finalizePublicOfferDecline(
    { clientId: "client-1", offerId: "offer-1" },
    {
      updateOfferStatus: async () => {
        calls.push("update");
      },
      syncOfferOutcome: async (clientId, offerId) => {
        calls.push(["sync", clientId, offerId]);
      },
      advanceOffer: async (clientId, offerId) => {
        calls.push(["advance", clientId, offerId]);
        return { nextOffer: { id: "offer-2" } };
      },
      recordNextCandidate: async (clientId, offerId) => {
        calls.push(["record", clientId, offerId]);
      }
    }
  );

  assert.deepEqual(calls, [
    "update",
    ["sync", "client-1", "offer-1"],
    ["advance", "client-1", "offer-1"],
    ["record", "client-1", "offer-2"]
  ]);
  assert.equal(result.nextOfferStarted, true);
  assert.equal(result.mode, "rescheduler_decline");
});

test("finalizePublicOfferDecline skips candidate recording when no next offer starts", async () => {
  const calls = [];

  const result = await finalizePublicOfferDecline(
    { clientId: "client-1", offerId: "offer-1" },
    {
      updateOfferStatus: async () => {
        calls.push("update");
      },
      syncOfferOutcome: async () => {
        calls.push("sync");
      },
      advanceOffer: async () => {
        calls.push("advance");
        return { nextOffer: null };
      },
      recordNextCandidate: async () => {
        calls.push("record");
      }
    }
  );

  assert.deepEqual(calls, ["update", "sync", "advance"]);
  assert.equal(result.nextOfferStarted, false);
});

test("assertPublicOfferAvailability rejects inactive offers after decline", () => {
  assert.throws(
    () => assertPublicOfferAvailability({
      flowState: null,
      responseDeadlineAt: null,
      status: "declined"
    }),
    (error) => error?.status === 409 && error.message === "This reschedule invitation is no longer active."
  );
});
