ALTER TABLE "rescheduler_candidate_calls"
  ADD COLUMN IF NOT EXISTS "fulfilled_by" text;
