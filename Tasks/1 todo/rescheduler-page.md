# Rescheduler page

## Summary

Build a rescheduler page for cancelled bookings. Users should be able to see which people have already been called for a cancelled booking, understand the current state of filling that booking, and abort the rebooking procedure from one place. The page should be available from the authenticated app sidebar as `Rescheduler`.

## User story

As an authenticated office user, I want to review and control the rebooking flow for cancelled appointments so that the office can fill cancelled bookings without losing track of who has already been contacted.

## Rescheduler data

- Cancelled appointment / booking
- Original appointment date and time slot
- Original patient/client
- Cancellation reason, optional
- Rebooking state, for example `pending`, `calling`, `filled`, `aborted`, or `failed`
- Candidate people already called
- Candidate call state, for example `not_reached`, `declined`, `interested`, `accepted`, or `skipped`
- Candidate call notes, optional
- Candidate called at timestamp, optional
- Replacement appointment / filled-by appointment, optional
- Rebooking started at, optional
- Rebooking completed at, optional
- Rebooking aborted at, optional
- Created at
- Updated at

## Backend scope

- Add backend persistence for the cancelled-booking rescheduler mechanism if it does not already exist.
- Store enough state to reconstruct which people were contacted for each cancelled booking.
- Link rescheduler records to the cancelled appointment.
- Link contacted people to existing clients where applicable.
- Link a filled cancelled booking to the replacement appointment or client that fills it.
- Add an authenticated API endpoint to list cancelled bookings that are currently in or have gone through the rescheduler flow, for example `GET /api/rescheduler`.
- Return each cancelled booking with its original appointment details, current filling state, contacted people, and replacement/fill details.
- Add an authenticated API endpoint to abort a rescheduler flow, for example `POST /api/rescheduler/:id/abort`.
- Aborting should reset all state related to the rebooking mechanism for that cancelled booking.
- Reset or clear contacted-candidate records, call states, temporary holds, replacement links, pending fill state, and any in-progress rebooking metadata.
- Preserve the underlying cancelled appointment and its cancellation metadata unless the product explicitly decides otherwise.
- Make abort/reset behavior transactional so partial cleanup cannot leave inconsistent rebooking state.
- Ensure aborting an already filled booking is either prevented with a clear validation error or handled by a deliberate rollback policy.
- Keep all rescheduler endpoints protected using the existing Better Auth session pattern.

## Frontend scope

- Add a rescheduler route/page in the authenticated app.
- Add a `Rescheduler` entry to the app sidebar.
- Fetch rescheduler data with a React Router `loader`.
- Render a table or dense list of cancelled bookings that are part of the rebooking flow.
- Show original appointment details, original patient/client, cancellation reason, and current fill state.
- For each cancelled booking, show the people already called and their latest call state.
- Make it clear whether the cancelled booking is still open, currently being filled, filled, or aborted.
- Provide an abort/cancel-rebooking action for active rescheduler flows.
- Submit the abort action through React Router native data APIs, preferably `action`, `Form`, `useNavigation`, and/or `useFetcher`.
- After aborting, revalidate the rescheduler loader data so the page reflects the reset state without a manual refresh.
- Include loading, pending, empty, success, and error states.
- Surface backend validation errors clearly, especially when a rebooking procedure cannot be aborted.

## Acceptance criteria

- Authenticated users can navigate to the rescheduler page.
- The rescheduler page is accessible from the sidebar as `Rescheduler`.
- The page lists cancelled bookings that are in or have gone through the rebooking procedure.
- Users can see who has already been called for each cancelled booking.
- Users can see the call state for each contacted person.
- Users can see the current state of filling each cancelled booking.
- Users can abort an active rebooking procedure from the page.
- Aborting a rebooking procedure resets all backend state related to the rescheduler mechanism for that cancelled booking.
- Aborting does not delete the underlying cancelled appointment record.
- The page refreshes after a successful abort using React Router revalidation.
- Loading, pending, empty, and error states are handled cleanly.
- Unauthenticated requests to the rescheduler API are rejected.

## Implementation notes

- Existing files likely involved:
  - `Backend/src/db/schema.js`
  - `Backend/src/app.js`
  - `Frontend/src/router.tsx`
  - `Frontend/src/routes/`
  - `Frontend/src/components/app-sidebar.tsx`
  - `Frontend/src/components/ui/`
- Coordinate with `Tasks/1 todo/schedule-appointments.md`, especially appointment cancellation status and appointment persistence.
- Keep the frontend aligned with the existing shadcn-style UI components.
- Prefer React Router's loader/action/fetcher APIs over client-side `useEffect` fetching.
- Treat backend data as the source of truth and rely on route revalidation after abort/reset mutations.
- Document the exact reset policy in code or tests so future changes do not accidentally preserve stale rebooking state.
