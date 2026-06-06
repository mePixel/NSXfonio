# Fonio Setup

This file defines the split between outbound and inbound Fonio workflows.

## Direction Split

- Outbound logic lives in `src/modules/fonio/fonio.outbound.service.js`
- Inbound booking logic lives in `src/modules/fonio/fonio.inbound.service.js`
- Webhook dispatch lives in `src/modules/fonio/fonio.webhook.service.js`

This keeps booking intake separate from confirmation and waitlist calls.

## What Fonio Must Send Us

For an inbound booking call, Fonio should POST to `POST /api/webhooks/fonio` with:

```json
{
  "id": "evt_123",
  "callId": "call_123",
  "direction": "inbound",
  "type": "appointment_booking",
  "status": "booked",
  "summary": "Caller booked a first consultation.",
  "caller": {
    "name": "Anna Mueller",
    "phone": "+436641234567",
    "email": "anna@example.com"
  },
  "toNumber": "+43123456789",
  "booking": {
    "title": "First consultation",
    "appointmentType": "Consultation",
    "slotId": "optional-exact-slot-id",
    "startsAt": "2026-06-10T09:00:00.000Z",
    "endsAt": "2026-06-10T09:30:00.000Z",
    "notes": "Prefers morning appointments"
  }
}
```

Minimum fields for automatic booking:

- `direction: "inbound"`
- either a resolvable `toNumber` or an explicit client ID
- customer phone number
- either `booking.slotId` or a precise `booking.startsAt`

If Fonio cannot determine an exact slot, it should still send the webhook and set:

- `status: "needs_human"`
- `summary`
- requested date or time preference in `booking.notes`

## What We Must Provide Fonio

Fonio needs live availability so the agent does not promise a slot we cannot book.

For Fonio's inbound context webhook, use:

- `POST /api/fonio/inbound-context`

Example request body:

```json
{
  "fromNumber": "+436641234567",
  "toNumber": "+43123456789"
}
```

Example response:

```json
{
  "clientId": "actual-client-id",
  "practiceName": "Praxis Mueller",
  "callerPhone": "+436641234567",
  "calledNumber": "+43123456789",
  "customer": {
    "id": "customer-id",
    "name": "Anna Mueller",
    "firstName": "Anna",
    "lastName": "Mueller",
    "isExistingCustomer": true,
    "notes": null
  },
  "availableSlots": [
    {
      "id": "slot-1",
      "startsAt": "2026-06-10T09:00:00.000Z",
      "endsAt": "2026-06-10T09:30:00.000Z",
      "status": "available"
    }
  ],
  "bookingRules": {
    "timezone": "Europe/Vienna",
    "maxSlotsToOffer": 3
  },
  "promptHints": {
    "bookingAvailable": true,
    "reason": null
  }
}
```

Fonio can use `{{practiceName}}`, `{{customer.firstName}}`, and the `availableSlots` array directly in the prompt.

For the booking confirmation step during or after the call, use:

- `POST /api/fonio/inbound-booking`

Example request body:

```json
{
  "fromNumber": "+436641234567",
  "toNumber": "+43123456789",
  "customer": {
    "firstName": "Anna",
    "lastName": "Mueller",
    "email": "anna@example.com"
  },
  "booking": {
    "slotId": "slot-1",
    "title": "First consultation",
    "appointmentType": "Consultation",
    "notes": "Booked by Fonio during inbound call"
  },
  "status": "booked",
  "direction": "inbound"
}
```

Success response:

```json
{
  "handled": true,
  "mode": "inbound",
  "clientId": "actual-client-id",
  "appointmentId": "appointment-id",
  "customerId": "customer-id",
  "slotId": "slot-1"
}
```

Failure responses:

- `409` if the selected slot is no longer available
- `422` if the client cannot be resolved or the payload is missing booking intent

Client resolution order is:

1. explicit client ID in the payload
2. `toNumber` mapped through `FONIO_TO_NUMBER_CLIENT_MAP`
3. `FONIO_DEFAULT_CLIENT_ID`
4. the only client in the database, if exactly one exists

For manual availability checks or future agent flows, keep:

- `GET /api/fonio/availability?clientId=<id>&from=<iso>&to=<iso>`

Optional security:

- set `FONIO_SHARED_SECRET`
- Fonio sends it as `x-fonio-secret`

Response:

```json
{
  "clientId": "seed-client-1",
  "count": 2,
  "slots": [
    {
      "id": "slot-1",
      "startsAt": "2026-06-10T09:00:00.000Z",
      "endsAt": "2026-06-10T09:30:00.000Z",
      "status": "available"
    }
  ]
}
```

## Recommended Call Model

Use live slots, not the whole recurring schedule, for the voice agent.

Reason:

- slots are concrete and bookable
- recurring schedules still need slot generation and conflict checks
- the agent should only offer times the backend can immediately reserve

The safer flow is:

1. Fonio calls `POST /api/fonio/inbound-context` when the inbound call rings.
2. Our backend returns known customer info plus the next concrete bookable slots.
3. Fonio uses that JSON in the live prompt.
4. When the caller confirms a slot, Fonio calls `POST /api/fonio/inbound-booking`.
5. We create the customer if needed and book the slot atomically.
6. Fonio confirms success to the caller only after the booking API succeeds.

## Current MVP Limits

- automatic booking currently requires the client to be resolvable
- slot matching is exact by `slotId` or narrow by requested datetime
- if no slot matches, the webhook is stored but no appointment is created

The next improvement would be a dedicated `inbound_leads` table for unresolved calls.
