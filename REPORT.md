# NSXfonio Technical Report

## One-line pitch

NSXfonio turns a cancelled appointment into an immediate, trackable waitlist recovery flow: release the slot, pick the next suitable patient, call them through Fonio, and book the slot when they accept.

## What we built

NSXfonio is a web dashboard and backend for a single practice, modelled around a realistic receptionist workflow:

1. A patient cancels an existing appointment.
2. The appointment status changes and the linked slot is released.
3. A rescheduler flow starts for that open slot.
4. The system selects a waitlist candidate and triggers a Fonio outbound call.
5. The call context tells the agent exactly which slot is available, who is being called, and how to phrase the offer.
6. When the patient accepts, Fonio calls back into the backend and the slot is booked for the replacement patient.
7. The dashboard shows the active recovery flow, candidates, status, and outcome.

The product angle is "operator cockpit": the receptionist can see what is happening live and intervene when a slot is not automatically recovered.

## Architecture

### Backend

- Node.js and Express
- PostgreSQL
- Drizzle ORM and migrations
- Better Auth for email/password sessions and Google OAuth support
- Modular route/service structure under `Backend/src/modules`

Important backend modules:

- `appointments`: appointment CRUD, cancellation, slot release, and status rules
- `slots`: concrete calendar slots
- `waitlist`: waiting list entries and waitlist offer cycles
- `rescheduler`: cancellation recovery flow, candidate tracking, accept/abort handling
- `fonio`: outbound call trigger, inbound booking/cancellation/rescheduler endpoints, webhook handling
- `audit`: persisted audit log for state changes

### Frontend

- React
- TypeScript
- Vite
- shadcn/ui style component structure
- React Router
- Tailwind CSS

The frontend focuses on operational screens rather than a marketing site: appointments, clients, settings, onboarding, and the rescheduler view.

## Data model

The backend persists the main entities needed for the workflow:

- `clients`
- `customers`
- `appointments`
- `schedules`
- `slots`
- `waiting_list_entries`
- `waitlist_offers`
- `communication_logs`
- `rescheduler_flows`
- `rescheduler_candidate_calls`
- Better Auth user/session tables

Client ownership is part of the schema so practice data can be scoped safely, even though the hackathon demo targets one practice.

## Fonio integration

Outbound calls use Fonio's public outbound call API:

- API URL: `https://app.fonio.ai/api/public/v1/outbound_call`
- Required env vars:
  - `API_FONIO`
  - `FONIO_FROM_NUMBER`
  - `FONIO_AGENT_ID`

For waitlist recovery calls, the backend sends Fonio structured context including:

- patient profile
- slot id
- readable appointment time label
- first message text
- waitlist offer id
- rescheduler scenario name

The Fonio agent is expected to call `POST /api/fonio/rescheduler/accept` only after the patient clearly accepts the offered slot.

## What is working

- Authenticated backend with session-based access control
- Seeded demo practice with customers, appointments, slots, and waitlist entries
- Appointment cancellation releases the linked slot
- Rescheduler flow records the cancellation recovery attempt
- Waitlist candidate tracking for recovery calls
- Fonio outbound call client with explicit configuration checks
- Inbound Fonio endpoints for booking, cancellation, waitlist enrollment, slot search, and rescheduler acceptance
- Audit log writes for important state changes
- Dashboard-oriented frontend routes for the core workflows

## Honest call-outs

- This is an MVP for a hackathon demo, not a production deployment.
- Consent handling is represented in the workflow and data assumptions, but the full legal consent capture and proof trail is not production-grade yet.
- Real EHR, calendar, CRM, and billing integrations are mocked through our own schema.
- The demo is single-practice focused. The schema supports client scoping, but full multi-tenant administration is not finished.
- The Fonio call depends on valid hackathon Fonio credentials and an agent configured to use the documented context and callback endpoints.
- Some operational controls are intentionally simple, especially around manual overrides, retries, reporting, and long-running background jobs.
- The candidate choice is currently pragmatic waitlist progression with guardrails, not a full scoring model over urgency, preferences, fairness, and contact history.

## What we would build next

- Production consent records for outbound communication
- A richer candidate ranking model using preferences, urgency, treatment type, history, and fairness
- Background workers for deadline checks, retries, and timeout advancement
- More detailed owner metrics: recovered revenue, refill rate, time-to-fill, attempts per slot, and failure reasons
- Manual receptionist override controls for skip, call next, abort, and reassign
- Better observability around webhook idempotency, Fonio failures, and partial recovery states
- Calendar and EHR integrations once the core recovery loop is proven

## Running locally

Backend:

```bash
cd Backend
cp .env.example .env
npm install
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Frontend:

```bash
cd Frontend
cp .env.example .env
npm install
npm run dev
```

Default backend URL: `http://localhost:3005`

Set the frontend API origin in `Frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:3005
```

## Repository notes

- Backend API docs: `Backend/ENDPOINTS.md`
- Database schema docs: `Backend/SCHEMA.md`
- Fonio integration notes: `Backend/FONIO_SETUP.md`
- Backend architecture notes: `Backend/SYSTEMS.md`
