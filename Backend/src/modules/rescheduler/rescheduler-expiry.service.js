import { pool } from "../../db/index.js";
import {
  recordCandidateForOffer,
  syncReschedulerOfferOutcome
} from "./rescheduler.service.js";
import {
  advanceOfferCycle,
  moveWaitlistEntryToEnd
} from "../waitlist/offers.service.js";

const SWEEP_INTERVAL_MS = 30_000;
const SWEEP_BATCH_SIZE = 25;

async function processExpiredOffer(offer) {
  const connection = await pool.connect();
  let locked = false;

  try {
    const lockResult = await connection.query(
      `SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS "locked"`,
      ["rescheduler-expiry", offer.id]
    );
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) return false;

    const { rows: currentRows } = await connection.query(
      `
        SELECT "id", "client_id", "slot_id", "waiting_list_entry_id"
        FROM "waitlist_offers"
        WHERE "id" = $1
          AND "status" = 'call_no_answer'
          AND "response_deadline_at" IS NOT NULL
          AND "response_deadline_at" <= now()
      `,
      [offer.id]
    );
    const currentOffer = currentRows[0];
    if (!currentOffer) return false;

    await syncReschedulerOfferOutcome(currentOffer.client_id, currentOffer.id);
    await moveWaitlistEntryToEnd(currentOffer.client_id, currentOffer.waiting_list_entry_id);

    const { rows: successorRows } = await connection.query(
      `
        SELECT "id"
        FROM "waitlist_offers"
        WHERE "client_id" = $1
          AND "slot_id" = $2
          AND "id" <> $3
          AND "status" IN ('pending', 'calling', 'whatsapp_sent')
        ORDER BY "created_at" DESC
        LIMIT 1
      `,
      [currentOffer.client_id, currentOffer.slot_id, currentOffer.id]
    );

    let nextOfferId = successorRows[0]?.id ?? null;
    if (!nextOfferId) {
      const advanced = await advanceOfferCycle(currentOffer.client_id, currentOffer.id);
      nextOfferId = advanced.nextOffer?.id ?? null;
    }

    if (nextOfferId) {
      await recordCandidateForOffer(currentOffer.client_id, nextOfferId);
    }

    await connection.query(
      `
        UPDATE "waitlist_offers"
        SET "status" = 'timed_out', "updated_at" = now()
        WHERE "id" = $1
          AND "status" = 'call_no_answer'
      `,
      [currentOffer.id]
    );

    return true;
  } finally {
    try {
      if (locked) {
        await connection.query(
          `SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`,
          ["rescheduler-expiry", offer.id]
        );
      }
    } finally {
      connection.release();
    }
  }
}

async function removeAcceptedEmailOfferFromWaitlist(offer) {
  const connection = await pool.connect();
  let locked = false;

  try {
    const lockResult = await connection.query(
      `SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS "locked"`,
      ["rescheduler-email-expiry", offer.id]
    );
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) return false;

    const { rowCount } = await connection.query(
      `
        DELETE FROM "waiting_list_entries"
        WHERE "id" = (
          SELECT offers."waiting_list_entry_id"
          FROM "waitlist_offers" offers
          INNER JOIN "rescheduler_candidate_calls" candidates
            ON candidates."waitlist_offer_id" = offers."id"
          WHERE offers."id" = $1
            AND offers."status" = 'accepted'
            AND offers."response_deadline_at" IS NOT NULL
            AND offers."response_deadline_at" <= now()
            AND candidates."fulfilled_by" = 'email'
          LIMIT 1
        )
      `,
      [offer.id]
    );

    return rowCount > 0;
  } finally {
    try {
      if (locked) {
        await connection.query(
          `SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`,
          ["rescheduler-email-expiry", offer.id]
        );
      }
    } finally {
      connection.release();
    }
  }
}

export async function processExpiredReschedulerOffers() {
  const [{ rows: expiredOffers }, { rows: acceptedEmailOffers }] = await Promise.all([
    pool.query(
      `
        SELECT "id"
        FROM "waitlist_offers"
        WHERE "status" = 'call_no_answer'
          AND "response_deadline_at" IS NOT NULL
          AND "response_deadline_at" <= now()
        ORDER BY "response_deadline_at"
        LIMIT $1
      `,
      [SWEEP_BATCH_SIZE]
    ),
    pool.query(
      `
        SELECT offers."id"
        FROM "waitlist_offers" offers
        INNER JOIN "rescheduler_candidate_calls" candidates
          ON candidates."waitlist_offer_id" = offers."id"
        WHERE offers."status" = 'accepted'
          AND offers."response_deadline_at" IS NOT NULL
          AND offers."response_deadline_at" <= now()
          AND candidates."fulfilled_by" = 'email'
        ORDER BY offers."response_deadline_at"
        LIMIT $1
      `,
      [SWEEP_BATCH_SIZE]
    )
  ]);

  let processedCount = 0;
  for (const offer of expiredOffers) {
    try {
      if (await processExpiredOffer(offer)) processedCount += 1;
    } catch (error) {
      console.error("[rescheduler expiry] failed to advance expired offer", {
        offerId: offer.id,
        error: error?.message ?? error
      });
    }
  }

  for (const offer of acceptedEmailOffers) {
    try {
      if (await removeAcceptedEmailOfferFromWaitlist(offer)) processedCount += 1;
    } catch (error) {
      console.error("[rescheduler expiry] failed to remove accepted email offer from waitlist", {
        offerId: offer.id,
        error: error?.message ?? error
      });
    }
  }

  return processedCount;
}

export function startReschedulerExpiryWorker() {
  let running = false;

  const sweep = async () => {
    if (running) return;
    running = true;

    try {
      await processExpiredReschedulerOffers();
    } catch (error) {
      console.error("[rescheduler expiry] sweep failed", error);
    } finally {
      running = false;
    }
  };

  void sweep();
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref();

  return timer;
}
