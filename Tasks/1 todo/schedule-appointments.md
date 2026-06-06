# Schedule appointments

## Summary

Build an appointment scheduling flow for the doctor's office. Users should be able to pick a specific date, view all appointments for that date sorted by appointment time, open a top-right appointment popover, select an existing client or create a new one, assign the appointment to an available time slot, add more appointment details, cancel appointments, and persist all appointment data in the backend.

Users should also be able to open a settings dialog from the sidebar popover that appears when they click their user name. The settings dialog should let them configure appointment scheduling options such as time slot size and working days.

## User story

As an authenticated office user, I want to schedule, review, and cancel patient appointments for a specific date so that the doctor's office can manage the daily appointment calendar reliably.

## Appointment fields

- Patient/client
- Appointment date
- Time slot
- Appointment status, for example `scheduled` or `cancelled`
- More info / notes
- Cancellation reason, optional
- Created at
- Updated at
- Cancelled at, optional

## Scheduling settings fields

- Time slot size, for example 15, 30, or 60 minutes
- Working days, for example Monday through Friday
- Created at
- Updated at

## Backend scope

- Add an `appointments` table to the Drizzle schema.
- Store `id`, `clientId`, `appointmentDate`, `timeSlot`, `status`, `moreInfo`, `cancellationReason`, `createdAt`, `updatedAt`, and `cancelledAt`.
- Add a migration for the new table.
- Link appointments to clients using a foreign key.
- Add an authenticated API endpoint to list appointments for a specific date, for example `GET /api/appointments?date=YYYY-MM-DD`.
- Return appointments sorted by appointment date and time slot ascending.
- Add an authenticated API endpoint to create appointments, for example `POST /api/appointments`.
- Add support for choosing an existing client when creating an appointment.
- Add support for creating a new client as part of appointment creation, reusing the client validation rules and persistence flow.
- Validate that appointment date, time slot, and patient/client information are present before inserting.
- Prevent double booking the same time slot on the same date unless the product explicitly allows it later.
- Add an authenticated API endpoint to cancel an appointment, for example `PATCH /api/appointments/:id/cancel`.
- Persist cancellation status and cancellation metadata instead of deleting the appointment.
- Add backend persistence for appointment scheduling settings.
- Add an authenticated API endpoint to read scheduling settings, for example `GET /api/appointment-settings`.
- Add an authenticated API endpoint to update scheduling settings, for example `PATCH /api/appointment-settings`.
- Validate that time slot size is a supported positive minute interval.
- Validate that working days are stored as a clear, backend-readable set of weekdays.
- Use the configured time slot size and working days when generating or validating available appointment slots.
- Keep all appointment endpoints protected using the existing Better Auth session pattern.

## Frontend scope

- Add an appointments route/page in the authenticated app.
- Add an Appointments entry to the app sidebar that navigates to the appointments page.
- Provide a date picker or date input so the user can choose the appointment date to manage.
- Fetch appointments for the selected date with a React Router `loader`.
- Fetch scheduling settings with the appointments page data or a dedicated settings loader.
- Render a list or table of all appointments for the selected date.
- Sort the visible appointment list by time slot from earliest to latest.
- Show useful appointment details in the list, including time slot, patient name, status, and more info preview.
- Place a create-appointment button in the top right of the list header.
- Clicking the button opens a popover containing the create-appointment form.
- Add an appointment settings entry to the sidebar user popover that appears when the user clicks their user name.
- Clicking the appointment settings entry opens a settings dialog.
- Install the shadcn dialog component with `npx shadcn@latest add dialog` if it is not already available.
- In the settings dialog, allow the user to change the time slot size.
- In the settings dialog, allow the user to change the working days.
- Save settings changes through React Router native data APIs, preferably `action`, `Form`, `useNavigation`, and/or `useFetcher`.
- After saving settings, close/reset the dialog where appropriate and revalidate the appointment/settings loader data.
- In the popover, allow the user to either select an existing client or switch to creating a new client.
- When creating a new client inside the appointment flow, collect the required client fields and save the client together with the appointment.
- Include a time slot selector in the appointment form.
- Generate or filter available time slots using the configured time slot size and working days.
- Include a more info section for additional appointment notes/context.
- Submit create and cancel actions through React Router native data APIs, preferably `action`, `Form`, `useNavigation`, and/or `useFetcher`.
- After creating or cancelling an appointment, close/reset the popover where appropriate and revalidate the appointment loader data.
- Surface validation, conflict, loading, pending, empty, success, and error states cleanly.

## Acceptance criteria

- Authenticated users can navigate to the appointments page.
- The appointments page is accessible from the sidebar.
- Users can choose a specific date and see appointments for that date.
- The appointment list is loaded from the backend through a route loader.
- Appointments are displayed in ascending time-slot order.
- The top-right create button opens a popover form.
- Users can open a settings dialog from the sidebar user popover that appears after clicking their user name.
- The settings dialog is built using the shadcn dialog component.
- Users can change the time slot size in the settings dialog.
- Users can change the working days in the settings dialog.
- Scheduling settings are persisted in the backend.
- Appointment time slot options respect the configured time slot size.
- Appointment scheduling respects the configured working days.
- The create form supports selecting an existing client.
- The create form supports creating a new client during appointment creation.
- The create form includes appointment date, time slot, and more info fields.
- Submitting the form creates a persisted backend appointment record.
- Appointment data remains available after a page refresh.
- Users can cancel an appointment from the appointment list.
- Cancelling an appointment persists a cancelled status in the backend.
- The appointment list refreshes after successful create or cancel operations using React Router revalidation.
- Double booking the same date and time slot is prevented or surfaced as a clear validation error.
- Unauthenticated requests to the appointment API are rejected.

## Implementation notes

- Existing files likely involved:
  - `Backend/src/db/schema.js`
  - `Backend/src/app.js`
  - `Frontend/src/router.tsx`
  - `Frontend/src/routes/`
  - `Frontend/src/components/app-sidebar.tsx`
  - `Frontend/src/components/ui/`
- Coordinate with `Tasks/1 todo/create-clients-flow.md` if the clients table and clients API are not implemented yet.
- Run `npx shadcn@latest add dialog` before implementing the settings dialog if the dialog component is missing.
- Keep the frontend aligned with the existing shadcn-style UI components.
- Prefer React Router's loader/action/fetcher APIs over client-side `useEffect` fetching.
- Treat the backend as the source of truth for appointment data and rely on route revalidation after mutations.
