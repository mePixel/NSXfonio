# Database Schema

This file is the authoritative description of every table, field, and relationship in the NSXfonio database.
Update it whenever the schema changes.

## Stack

- PostgreSQL 16
- Drizzle ORM (node-postgres driver)
- Migrations in `drizzle/`

---

## Enums

### `appointment_status`
The lifecycle state of an appointment.

| Value | Meaning |
|---|---|
| `scheduled` | Created, no confirmation workflow started |
| `confirmation_pending` | Confirmation call triggered, waiting for outcome |
| `confirmed` | Customer confirmed |
| `followup_sent` | Call had no answer, WhatsApp follow-up sent |
| `cancel_pending` | Deadline passed without a reply |
| `cancelled` | Appointment is cancelled, slot becomes available |
| `completed` | Appointment happened |
| `no_show` | Customer did not attend |

### `slot_status`
The booking state of a time slot.

| Value | Meaning |
|---|---|
| `available` | Open, can be booked or offered to waitlist |
| `booked` | Linked to an active appointment |
| `blocked` | Manually blocked, not available for booking |

### `waitlist_offer_status`
The outreach state of one offer cycle toward a waitlist contact.

| Value | Meaning |
|---|---|
| `pending` | Offer created, outreach not yet started |
| `calling` | Fonio call triggered |
| `call_no_answer` | Call had no answer, WhatsApp will be sent |
| `whatsapp_sent` | WhatsApp follow-up sent, waiting for reply |
| `accepted` | Customer replied positively — appointment will be created |
| `declined` | Customer replied negatively — move to next entry |
| `timed_out` | `response_deadline_at` passed without reply — move to next entry |

### `communication_channel`
`call` | `whatsapp`

### `communication_direction`
`outbound` | `inbound`

---

## Tables

### `clients`
A company or practice using the system. All business data is scoped to a client.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `name` | text | |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### `user`
Authenticated application users. Managed by Better Auth, extended with `client_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `name` | text | |
| `email` | text UNIQUE | |
| `email_verified` | boolean | |
| `image` | text | nullable |
| `client_id` | text FK → `clients` | SET NULL on delete — links user to a client |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

Related Better Auth tables: `session`, `account`, `verification` — managed by the auth library, not touched directly.

---

### `customers`
The people who receive appointments. Owned by a client.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `client_id` | text FK → `clients` | CASCADE on delete |
| `first_name` | text | |
| `last_name` | text | |
| `phone` | text | nullable — used for Fonio calls |
| `whatsapp_phone` | text | nullable — used for WhatsApp messages, may differ from `phone` |
| `email` | text | nullable |
| `notes` | text | nullable |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### `schedules`
Recurring availability templates set by a user in the frontend.
Used to generate concrete `slots`.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `client_id` | text FK → `clients` | CASCADE on delete |
| `day_of_week` | integer | 0 = Sunday … 6 = Saturday |
| `start_time` | text | `"09:00"` — wall clock time |
| `end_time` | text | `"17:00"` — wall clock time |
| `slot_duration_minutes` | integer | default 30 |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### `slots`
Concrete time blocks derived from a schedule.
Displayed in the frontend calendar. Can be available, booked, or blocked.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `client_id` | text FK → `clients` | CASCADE on delete |
| `schedule_id` | text FK → `schedules` | SET NULL on delete — nullable if slot was created manually |
| `starts_at` | timestamp | |
| `ends_at` | timestamp | |
| `status` | `slot_status` | default `available` |
| `appointment_id` | text | nullable — set when booked. No FK to avoid circular reference with `appointments`; managed at app level |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Status transitions:**
- `available` → `booked` when an appointment is created for this slot
- `booked` → `available` when the appointment is cancelled
- `available` ↔ `blocked` manually by a user

---

### `appointments`
A scheduled appointment between a client and a customer.
The main business entity with its own status lifecycle.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `client_id` | text FK → `clients` | CASCADE on delete |
| `customer_id` | text FK → `customers` | CASCADE on delete |
| `slot_id` | text FK → `slots` | SET NULL on delete — nullable if booked without a slot |
| `title` | text | |
| `starts_at` | timestamp | |
| `ends_at` | timestamp | |
| `status` | `appointment_status` | default `scheduled` — all changes go through the status transition service |
| `confirmation_deadline_at` | timestamp | nullable — deadline for confirming before moving to `cancel_pending` |
| `followup_deadline_at` | timestamp | nullable — deadline for WhatsApp reply before moving to `cancel_pending` |
| `cancel_reason` | text | nullable |
| `notes` | text | nullable |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Allowed status transitions** (enforced by the status transition service):

```
scheduled            → confirmation_pending
confirmation_pending → confirmed
confirmation_pending → followup_sent
confirmation_pending → cancel_pending
followup_sent        → confirmed
followup_sent        → cancel_pending
cancel_pending       → cancelled
cancel_pending       → confirmed
scheduled            → cancelled
confirmed            → cancelled
confirmed            → completed
confirmed            → no_show
```

---

### `waiting_list_entries`
Customers queued to receive an available slot.
Ordered by `position` — lower is higher priority.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `client_id` | text FK → `clients` | CASCADE on delete |
| `customer_id` | text FK → `customers` | CASCADE on delete |
| `position` | integer | ordering within the client's waitlist |
| `notes` | text | nullable |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### `waitlist_offers`
One outreach cycle per waitlist contact per slot.
Tracks the full call → WhatsApp → timeout state so the frontend can display live progress.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `client_id` | text FK → `clients` | CASCADE on delete |
| `slot_id` | text FK → `slots` | CASCADE on delete |
| `waiting_list_entry_id` | text FK → `waiting_list_entries` | CASCADE on delete |
| `status` | `waitlist_offer_status` | default `pending` |
| `response_deadline_at` | timestamp | nullable — user-configured timeout; when passed → `timed_out` and next entry is tried |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Offer cycle flow:**
1. Offer created → `pending`
2. Fonio call triggered → `calling`
3. No answer → `call_no_answer` → WhatsApp sent → `whatsapp_sent`
4. Positive reply → `accepted` → appointment created, slot → `booked`
5. Negative reply → `declined` → next waitlist entry gets a new offer
6. Deadline passes → `timed_out` → next waitlist entry gets a new offer

---

### `communication_logs`
Business-facing record of every outbound and inbound communication event.
Covers both appointment confirmation workflows and waitlist offer outreach.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `client_id` | text FK → `clients` | CASCADE on delete |
| `appointment_id` | text | nullable — no FK, references `appointments.id` at app level |
| `customer_id` | text FK → `customers` | SET NULL on delete |
| `waitlist_offer_id` | text | nullable — no FK, references `waitlist_offers.id` at app level |
| `channel` | `communication_channel` | `call` or `whatsapp` |
| `direction` | `communication_direction` | `outbound` or `inbound` |
| `event_type` | text | e.g. `confirmation_call_requested`, `whatsapp_reply_received` |
| `status` | text | nullable — delivery or call status |
| `external_message_id` | text | nullable — Fonio message ID |
| `external_call_id` | text | nullable — Fonio call ID |
| `external_ref` | text | nullable — any other external reference |
| `payload_json` | text | nullable — sanitized event payload |
| `occurred_at` | timestamp | when the event happened |
| `created_at` | timestamp | when the record was written |

---

### `webhook_events`
Raw Fonio webhook payloads stored before any business logic runs.
Used for traceability, replay, and idempotency.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `provider` | text | e.g. `fonio` |
| `event_type` | text | as sent by the provider |
| `external_event_id` | text UNIQUE | nullable — provider's own event ID, used for deduplication |
| `payload_json` | text | raw body exactly as received |
| `received_at` | timestamp | |
| `processed_at` | timestamp | nullable — set when processing completes |
| `processing_status` | text | `pending` / `processed` / `failed` |

**Rule:** always insert here before running any business logic. Never process the same `external_event_id` twice.

---

### `audit_logs`
Append-only record of every important action and state change in the system.
Written by the audit service — never updated or deleted.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `client_id` | text FK → `clients` | SET NULL on delete |
| `user_id` | text FK → `user` | SET NULL on delete — nullable for automated actions |
| `appointment_id` | text | nullable — no FK, for soft reference |
| `entity_type` | text | e.g. `appointment`, `slot`, `waitlist_offer` |
| `entity_id` | text | ID of the affected record |
| `action` | text | e.g. `status_changed`, `offer_created`, `call_triggered` |
| `from_state` | text | nullable — previous status/state |
| `to_state` | text | nullable — new status/state |
| `reason` | text | nullable — human or system reason for the change |
| `metadata_json` | text | nullable — additional context |
| `created_at` | timestamp | |

---

## Relationships Summary

```
clients
  ├── users              (one client → many users)
  ├── customers          (one client → many customers)
  ├── schedules          (one client → many schedules)
  │     └── slots        (one schedule → many slots)
  ├── slots              (also directly owned by client)
  ├── appointments       (one client → many appointments)
  │     ├── customer     (many appointments → one customer)
  │     └── slot         (many appointments → one slot, nullable)
  ├── waiting_list_entries (one client → many entries)
  │     └── customer     (many entries → one customer)
  ├── waitlist_offers    (one client → many offers)
  │     ├── slot         (many offers → one slot)
  │     └── waiting_list_entry (many offers → one entry)
  ├── communication_logs (covers both appointment and waitlist outreach)
  └── audit_logs
```
