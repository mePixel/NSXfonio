# Backend Systems

This document is the backend source of truth for NSXfonio.
Use it as shared context for implementation work and for other agents working in this repository.

## Goal

The backend exists to prevent revenue loss from cancelled or unconfirmed appointments.

The core business workflow is:

1. A client has appointments in the system.
2. The system triggers a confirmation call through Fonio.
3. If the customer does not answer, the system triggers a WhatsApp follow-up through Fonio.
4. If the customer does not reply before the deadline, the appointment can become `cancel_pending` or `cancelled`.
5. A cancelled appointment creates an open slot.
6. The system later uses that open slot to fill from a waiting list.

For the MVP in this repository, the focus is the backend needed to support:

- users/clients
- appointment CRUD
- Fonio call trigger
- Fonio webhook handling
- WhatsApp follow-up trigger
- reply parser
- deadline checker
- status updates
- audit logs
- schedule and slot management
- waiting list entries
- waitlist offer cycle (call → WhatsApp → timeout → next person)

## Scope

Backend only.

Fonio is responsible for:

- calls
- WhatsApp messages
- delivery and call statuses
- inbound replies
- communication transport details

Our backend is responsible for:

- authentication
- multi-client data ownership
- appointment lifecycle
- customer records
- triggering outbound communication through Fonio
- receiving and processing Fonio webhooks
- reply interpretation
- deadlines and automated status transitions
- auditability

## Architecture

Current stack:

- Node.js
- Express
- Better Auth
- Drizzle ORM
- PostgreSQL

Recommended backend structure:

- `src/app.js`
  - Express app setup
- `src/server.js`
  - process entrypoint
- `src/config/`
  - environment and config
- `src/db/`
  - database connection and schema
- `src/modules/auth/`
  - auth-related helpers if needed
- `src/modules/clients/`
  - clients and client-user membership
- `src/modules/customers/`
  - customer records
- `src/modules/appointments/`
  - appointment CRUD and appointment workflow
- `src/modules/fonio/`
  - Fonio API client wrapper and webhook processing
- `src/modules/audit/`
  - audit log writes and queries
- `src/modules/jobs/`
  - deadline checking
- `src/lib/`
  - shared helpers, validation, errors

Do not put appointment business rules directly in routes.
Routes should call services.

## Design Rules

These rules should stay stable across the MVP:

1. All appointment status changes must go through one status transition service.
2. Every automatic or manual state change must write an audit log.
3. Every inbound webhook must be stored before business logic runs.
4. Webhook handling must be idempotent.
5. Outbound communication attempts must be persisted before calling Fonio.
6. Client data must stay isolated by client ownership checks.
7. Reply parsing should be deterministic in MVP v1, not AI-driven.

## Main Entities

### clients

Represents a company or practice using the system.

Core fields:

- `id`
- `name`
- `created_at`
- `updated_at`

### users

Authenticated application users.
Current auth tables already exist through Better Auth.

Needed extension:

- associate each user to a client
- optionally support roles later such as `admin`, `staff`

### customers

Represents the person who owns an appointment.

Core fields:

- `id`
- `client_id`
- `first_name`
- `last_name`
- `phone`
- `whatsapp_phone`
- `email`
- `notes`
- `created_at`
- `updated_at`

### appointments

Represents the scheduled appointment and its business state.

Core fields:

- `id`
- `client_id`
- `customer_id`
- `title`
- `starts_at`
- `ends_at`
- `status`
- `confirmation_deadline_at`
- `followup_deadline_at`
- `cancel_reason`
- `notes`
- `created_at`
- `updated_at`

### schedules

Defines recurring availability that a user sets in the frontend.
Used to generate concrete slots.

Core fields:

- `id`
- `client_id`
- `day_of_week` (0 = Sunday, 6 = Saturday)
- `start_time`
- `end_time`
- `slot_duration_minutes`
- `created_at`
- `updated_at`

### slots

Concrete time blocks derived from a schedule.
Each slot has an independent status and can be displayed in a calendar view.

Core fields:

- `id`
- `client_id`
- `schedule_id`
- `starts_at`
- `ends_at`
- `status` (`available`, `booked`, `blocked`)
- `appointment_id` (nullable — set when a slot is booked)
- `created_at`
- `updated_at`

When an appointment is cancelled, its slot status flips back to `available`.
The frontend calendar reads slots directly.

### waiting_list_entries

Customers queued for an available slot, ordered by position.

Core fields:

- `id`
- `client_id`
- `customer_id`
- `notes`
- `position`
- `created_at`
- `updated_at`

### waitlist_offers

One offer cycle per waitlist contact per slot.
Tracks the full outreach state so the frontend can display progress in real time.

Core fields:

- `id`
- `client_id`
- `slot_id`
- `waiting_list_entry_id`
- `status` (`pending`, `calling`, `call_no_answer`, `whatsapp_sent`, `accepted`, `declined`, `timed_out`)
- `response_deadline_at` (user-configured timeout — if no reply by this time, move to next entry)
- `created_at`
- `updated_at`

Status meaning:

- `pending` — offer created, outreach not yet started
- `calling` — Fonio call triggered
- `call_no_answer` — call had no answer, WhatsApp follow-up will be sent
- `whatsapp_sent` — WhatsApp follow-up sent, waiting for reply
- `accepted` — customer replied positively, appointment will be created
- `declined` — customer replied negatively, move to next entry
- `timed_out` — `response_deadline_at` passed without a reply, move to next entry

### communication_logs

Tracks all outbound and inbound communication events relevant to the appointment workflow.

Core fields:

- `id`
- `client_id`
- `appointment_id`
- `customer_id`
- `channel`
- `direction`
- `event_type`
- `status`
- `external_message_id`
- `external_call_id`
- `external_ref`
- `payload_json`
- `occurred_at`
- `created_at`

Examples:

- outbound confirmation call triggered
- call answered
- call no-answer
- WhatsApp follow-up sent
- inbound WhatsApp reply received

### webhook_events

Stores raw Fonio webhook requests for traceability and idempotency.

Core fields:

- `id`
- `provider`
- `event_type`
- `external_event_id`
- `payload_json`
- `received_at`
- `processed_at`
- `processing_status`

### audit_logs

Tracks all important actions and state transitions.

Core fields:

- `id`
- `client_id`
- `user_id`
- `appointment_id`
- `entity_type`
- `entity_id`
- `action`
- `from_state`
- `to_state`
- `reason`
- `metadata_json`
- `created_at`

## Appointment Status Model

Keep the initial status model explicit and small.

Allowed statuses for MVP:

- `scheduled`
- `confirmation_pending`
- `confirmed`
- `followup_sent`
- `cancel_pending`
- `cancelled`
- `completed`
- `no_show`

Status meaning:

- `scheduled`
  - appointment exists, no confirmation workflow started yet
- `confirmation_pending`
  - call has been triggered and we are waiting for outcome or reply
- `confirmed`
  - customer confirmed the appointment
- `followup_sent`
  - call failed or had no answer, WhatsApp follow-up has been sent
- `cancel_pending`
  - no reply was received before the configured deadline
- `cancelled`
  - appointment is considered cancelled and can later create an open slot
- `completed`
  - appointment happened
- `no_show`
  - customer did not appear

## Allowed MVP Transitions

Only allow controlled transitions.

- `scheduled -> confirmation_pending`
  - confirmation call triggered
- `confirmation_pending -> confirmed`
  - positive call result or positive reply
- `confirmation_pending -> followup_sent`
  - no answer or unsuccessful call followed by WhatsApp trigger
- `confirmation_pending -> cancel_pending`
  - confirmation deadline expired
- `followup_sent -> confirmed`
  - positive reply
- `followup_sent -> cancel_pending`
  - follow-up deadline expired
- `cancel_pending -> cancelled`
  - automatic or manual cancellation decision
- `cancel_pending -> confirmed`
  - late positive reply accepted by business rule
- `scheduled -> cancelled`
  - manual cancellation
- `confirmed -> cancelled`
  - manual cancellation
- `confirmed -> completed`
  - appointment fulfilled
- `confirmed -> no_show`
  - customer did not attend

Any transition outside this list should fail unless explicitly added to the status service.

## Communication Model

Channels:

- `call`
- `whatsapp`

Directions:

- `outbound`
- `inbound`

Event types:

- `confirmation_call_requested`
- `confirmation_call_started`
- `confirmation_call_completed`
- `whatsapp_followup_requested`
- `whatsapp_followup_sent`
- `whatsapp_reply_received`
- `webhook_received`

Communication logs are business-facing records.
Webhook events are raw integration-facing records.
Do not merge those responsibilities.

## Reply Parser

MVP reply parsing should be deterministic and easy to reason about.

Categories:

- `positive`
- `negative`
- `callback`
- `unclear`

Examples:

- positive
  - `yes`
  - `ja`
  - `ok`
  - `confirm`
- negative
  - `no`
  - `nein`
  - `cancel`
- callback
  - `call me`
  - `later`
  - `please call`

Rules:

- normalize case
- trim whitespace
- use exact matches and a small synonym set first
- fall back to `unclear`

The parser should return both:

- parsed category
- normalized text

Business logic should decide what each category means for the appointment.

## Fonio Integration Boundaries

Fonio-specific implementation should be isolated behind a small client/service layer.

The backend should expose operations like:

- trigger confirmation call
- trigger WhatsApp follow-up
- process webhook event

The rest of the application should not depend on raw Fonio payload structure.

Important integration behaviors:

- persist intent before outbound request
- persist raw webhook before processing
- use external IDs for idempotency and reconciliation
- handle duplicate webhook deliveries safely

## Deadline Checker

MVP deadline logic should stay simple.

Each appointment may have:

- `confirmation_deadline_at`
- `followup_deadline_at`

Deadline checker responsibilities:

1. Find overdue appointments in `confirmation_pending`
2. Move them to `cancel_pending` or trigger follow-up depending on rule
3. Find overdue appointments in `followup_sent`
4. Move them to `cancel_pending`
5. Write audit logs for every automatic action

For MVP, this can be triggered manually or via a simple scheduled process.
Do not introduce a heavy job system unless needed.

## API Surface

Recommended MVP endpoints:

### Auth

- `GET /api/me`

### Clients and users

- `GET /api/clients/:id`

### Customers

- `POST /api/customers`
- `GET /api/customers`
- `GET /api/customers/:id`
- `PATCH /api/customers/:id`

### Appointments

- `POST /api/appointments`
- `GET /api/appointments`
- `GET /api/appointments/:id`
- `PATCH /api/appointments/:id`
- `DELETE /api/appointments/:id`

### Communication actions

- `POST /api/appointments/:id/trigger-call`
- `POST /api/appointments/:id/trigger-whatsapp`

### Webhooks

- `POST /api/webhooks/fonio`

### Jobs

- `POST /api/jobs/check-deadlines`

### Schedules and slots

- `POST /api/schedules`
- `GET /api/schedules`
- `PATCH /api/schedules/:id`
- `DELETE /api/schedules/:id`
- `GET /api/slots`
- `PATCH /api/slots/:id` (for manual status changes e.g. blocking)

### Waiting list

- `POST /api/waiting-list`
- `GET /api/waiting-list`
- `GET /api/waiting-list/:id`
- `PATCH /api/waiting-list/:id`
- `DELETE /api/waiting-list/:id`

### Waitlist offers

- `GET /api/waitlist-offers`
- `GET /api/waitlist-offers/:id`
- `POST /api/slots/:id/start-offer-cycle` (triggers outreach for a slot)

### Logs

- `GET /api/audit-logs`
- `GET /api/communication-logs`

## Workflow Definitions

### Confirmation workflow

1. Appointment is created as `scheduled`.
2. A user or automation triggers a confirmation call.
3. Appointment becomes `confirmation_pending`.
4. A communication log is created for the outbound call request.
5. Fonio processes the call.
6. Fonio webhook arrives with call outcome.
7. If confirmed, appointment becomes `confirmed`.
8. If no answer, backend triggers WhatsApp follow-up.
9. Appointment becomes `followup_sent`.
10. If no reply before deadline, appointment becomes `cancel_pending`.

### Reply workflow

1. Fonio sends inbound reply webhook.
2. Backend stores raw webhook event.
3. Backend creates communication log entry for the inbound message.
4. Reply parser categorizes the reply.
5. Status transition service applies the business decision.
6. Audit log records the result.

### Cancellation workflow

1. Appointment reaches `cancel_pending`.
2. A rule or user confirms cancellation.
3. Appointment becomes `cancelled`.
4. The slot linked to the appointment flips to `available`.

### Waitlist-filling workflow

1. A slot becomes `available` (from cancellation or manual unblock).
2. A user or automation triggers an offer cycle for that slot.
3. The system picks the first `waiting_list_entry` by position.
4. A `waitlist_offer` is created with status `pending`.
5. A Fonio call is triggered → offer status becomes `calling`.
6. If no answer → WhatsApp follow-up sent → offer status becomes `whatsapp_sent`.
7. `response_deadline_at` is set based on the user-configured timeout.
8. If the customer replies positively → offer status becomes `accepted`.
   - An appointment is created for that customer.
   - The slot status becomes `booked`.
9. If the customer replies negatively or the deadline passes → offer status becomes `declined` or `timed_out`.
   - The system moves to the next entry in the waiting list and repeats from step 3.
10. If the waiting list is exhausted without a positive reply, the slot remains `available`.

## Security and Ownership

Every non-webhook endpoint must enforce authenticated access.

Rules:

- users can only access records belonging to their client
- webhook endpoint must verify provider signature if available
- raw webhook payloads should be stored carefully
- avoid exposing raw provider payloads directly to the frontend

## Observability

Minimum observability requirements for MVP:

- request logging
- raw webhook storage
- communication log history
- audit log history
- deterministic error responses

## Implementation Order

Use this exact order unless a dependency forces a change:

1. Extend database schema for `clients`, `customers`, `appointments`, `communication_logs`, `webhook_events`, `audit_logs`
2. Link auth users to clients
3. Add customer CRUD
4. Add appointment CRUD
5. Add status transition service
6. Add audit log service
7. Add Fonio client wrapper
8. Add call trigger endpoint
9. Add WhatsApp follow-up trigger endpoint
10. Add webhook ingestion and idempotent processing
11. Add reply parser
12. Add deadline checker
13. Add `schedules` and `slots` schema and CRUD
14. Add slot status transition (available → booked → available on cancel)
15. Add `waiting_list_entries` schema and CRUD
16. Add `waitlist_offers` schema and state machine
17. Add offer cycle trigger endpoint
18. Add offer deadline checker (advance to next entry on timeout)

## Current Decisions

These decisions are now assumed unless we explicitly change them:

- backend remains Express + Drizzle + PostgreSQL for MVP
- Better Auth remains the auth solution
- appointment workflow is the main business workflow
- all status changes go through a central service
- deterministic reply parser first, not AI classification
- availability is modelled as `schedules` (templates) + `slots` (concrete blocks)
- when an appointment is cancelled its slot flips back to `available`
- waitlist outreach is modelled as `waitlist_offers` with an explicit state machine
- waiting list entries are ordered by position; the offer cycle advances through them until one accepts

## Future Systems

Not MVP, but the schema and services should not block them:

- client-specific automation rules (e.g. auto-start offer cycle on cancellation)
- scoring and priority-based matching for waitlist ordering
- reporting and recovery metrics
