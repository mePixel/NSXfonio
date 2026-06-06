# API Endpoints

Base URL: `http://127.0.0.1:3005`

Auth uses session cookies (Better Auth). Sign in first — the cookie is sent automatically on all subsequent requests.

---

## Health

### `GET /health`
No auth required.

**Response 200**
```json
{ "status": "ok", "service": "nsxfonio-backend" }
```

---

## Auth

### `POST /api/auth/sign-up/email`
Register a new user.

**Body**
```json
{
  "email": "admin@praxis.at",
  "name": "Dr. Müller",
  "password": "Password123!"
}
```

**Response 200** — user + session object

---

### `POST /api/auth/sign-in/email`
Sign in and receive a session cookie.

**Body**
```json
{
  "email": "admin@praxis.at",
  "password": "Password123!"
}
```

**Response 200** — user + session object. Sets `better-auth.session_token` cookie.

---

### `POST /api/auth/sign-out`
Invalidate the current session.

**Response 200**

---

### `GET /api/me`
Auth required. Returns the current user including `clientId`.

**Response 200**
```json
{
  "user": {
    "id": "...",
    "email": "admin@praxis.at",
    "name": "Dr. Müller",
    "clientId": "seed-client-1"
  },
  "session": { ... }
}
```

**Errors**
- `401` — not signed in

---

## Customers

All endpoints require auth + a client association on the user.

### `GET /api/customers`
List all customers for the current client.

**Response 200** — array of customer objects

---

### `POST /api/customers`
Create a new customer.

**Body**
```json
{
  "firstName": "Anna",
  "lastName": "Müller",
  "phone": "+43 664 1234567",
  "whatsappPhone": "+43 664 1234567",
  "email": "anna@example.at",
  "notes": "Stammkundin"
}
```

Required: `firstName`, `lastName`
Optional: `phone`, `whatsappPhone`, `email`, `notes`

Limits: names max 100 chars · phone max 30 chars · email max 254 chars · notes max 2000 chars

**Response 201** — created customer object

**Errors**
- `400` — missing required fields or value exceeds limit

---

### `GET /api/customers/:id`

**Response 200** — customer object
**Errors**
- `400` — invalid UUID
- `404` — not found

---

### `PATCH /api/customers/:id`
Update any subset of customer fields.

**Body** — any of: `firstName`, `lastName`, `phone`, `whatsappPhone`, `email`, `notes`

**Response 200** — updated customer object
**Errors**
- `400` — invalid UUID or invalid field value
- `404` — not found

---

## Appointments

All endpoints require auth + a client association.

### `GET /api/appointments`
List all appointments for the current client.

**Response 200** — array of appointment objects

---

### `POST /api/appointments`
Create a new appointment. Status starts as `scheduled`.

**Body**
```json
{
  "title": "Erstgespräch",
  "customerId": "<uuid>",
  "startsAt": "2026-06-09T09:00:00Z",
  "endsAt": "2026-06-09T09:30:00Z",
  "slotId": "<uuid>",
  "confirmationDeadlineAt": "2026-06-08T12:00:00Z",
  "followupDeadlineAt": "2026-06-08T18:00:00Z",
  "notes": "Erster Termin"
}
```

Required: `title`, `customerId`, `startsAt`, `endsAt`
Optional: `slotId`, `confirmationDeadlineAt`, `followupDeadlineAt`, `notes`

If `slotId` is provided: the slot must be `available` and belong to the same client. It will be set to `booked` atomically.

**Response 201** — created appointment object

**Errors**
- `400` — missing/invalid fields or `endsAt` not after `startsAt`
- `404` — `customerId` or `slotId` not found
- `409` — slot is not available

---

### `GET /api/appointments/:id`

**Response 200** — appointment object
**Errors**
- `400` — invalid UUID
- `404` — not found

---

### `PATCH /api/appointments/:id`
Update non-status fields only. Status changes use `DELETE` (cancel) or dedicated action endpoints.

**Body** — any of: `title`, `startsAt`, `endsAt`, `confirmationDeadlineAt`, `followupDeadlineAt`, `notes`

Set `confirmationDeadlineAt` or `followupDeadlineAt` to `null` to clear them.

**Response 200** — updated appointment object
**Errors**
- `400` — invalid UUID or field value
- `404` — not found

---

### `DELETE /api/appointments/:id`
Cancel an appointment. Sets status to `cancelled` and releases the linked slot back to `available`. Writes an audit log entry.

Cannot cancel an appointment already in `cancelled`, `completed`, or `no_show`.

**Response 200** — cancelled appointment object
**Errors**
- `400` — invalid UUID
- `404` — not found
- `422` — transition not allowed from current status

---

## Audit Logs

### `GET /api/audit-logs`
Auth required. Returns all audit log entries for the current client, newest first.

**Response 200**
```json
[
  {
    "id": "...",
    "entityType": "appointment",
    "entityId": "...",
    "action": "status_changed",
    "fromState": "scheduled",
    "toState": "cancelled",
    "userId": "...",
    "reason": null,
    "createdAt": "2026-06-06T10:00:00.000Z"
  }
]
```

---

## Planned (not yet implemented)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/clients/:id` | Get client info |
| `POST` | `/api/schedules` | Create availability schedule |
| `GET` | `/api/schedules` | List schedules |
| `PATCH` | `/api/schedules/:id` | Update schedule |
| `DELETE` | `/api/schedules/:id` | Delete schedule |
| `GET` | `/api/slots` | List slots (calendar view) |
| `PATCH` | `/api/slots/:id` | Block/unblock a slot manually |
| `POST` | `/api/waiting-list` | Add entry to waitlist |
| `GET` | `/api/waiting-list` | List waitlist entries |
| `PATCH` | `/api/waiting-list/:id` | Update entry (reorder, notes) |
| `DELETE` | `/api/waiting-list/:id` | Remove entry |
| `POST` | `/api/slots/:id/start-offer-cycle` | Trigger waitlist outreach for a slot |
| `GET` | `/api/waitlist-offers` | List offer cycles |
| `POST` | `/api/appointments/:id/trigger-call` | Trigger Fonio confirmation call |
| `POST` | `/api/appointments/:id/trigger-whatsapp` | Trigger Fonio WhatsApp follow-up |
| `POST` | `/api/webhooks/fonio` | Receive Fonio webhook events |
| `POST` | `/api/jobs/check-deadlines` | Run deadline checker manually |
| `GET` | `/api/communication-logs` | List communication events |
