# Create clients flow

## Summary

Build a client management flow for people who visit the doctor's office. Users should be able to view all clients, open a create-client popover from the list, submit a client form, save the client in the backend, and see the list refresh through React Router data revalidation.

## User story

As an authenticated office user, I want to create and view clients so that the doctor's office can keep contact and context information for each visitor.

## Client fields

- First name
- Last name
- Telephone number
- Email
- Description

## Backend scope

- Add a `clients` table to the Drizzle schema.
- Store `id`, `firstName`, `lastName`, `telephoneNumber`, `email`, `description`, `createdAt`, and `updatedAt`.
- Add a migration for the new table.
- Add an authenticated API endpoint to list clients, for example `GET /api/clients`.
- Add an authenticated API endpoint to create clients, for example `POST /api/clients`.
- Validate required fields before inserting.
- Return created clients using the same response shape as the list endpoint.
- Keep the endpoints protected using the existing Better Auth session pattern.

## Frontend scope

- Add a clients route/page in the authenticated app.
- Add a Clients entry to the app sidebar that navigates to the clients page.
- Fetch the clients list with a React Router `loader`.
- Render a list or table of all clients.
- Place a create-client button in the top right of the list header.
- Clicking the button opens a popover containing the create-client form.
- Submit the form through React Router native data APIs, preferably an `action` with `Form`, `useNavigation`, and/or `useFetcher`.
- After creation, close/reset the popover and revalidate the clients loader data so the new client appears without a manual refresh.
- Use React Router revalidation mechanisms such as action-driven route revalidation or `useRevalidator` where needed.
- Surface validation or request errors in the form.

## Acceptance criteria

- Authenticated users can navigate to the clients page.
- The clients page is accessible from the sidebar.
- The clients page loads existing clients from the backend through a route loader.
- The top-right create button opens a popover form.
- The form contains fields for first name, last name, telephone number, email, and description.
- Submitting the form creates a persisted backend record.
- The clients list refreshes after a successful create using React Router revalidation.
- Loading, pending, empty, success, and error states are handled cleanly.
- Unauthenticated requests to the clients API are rejected.

## Implementation notes

- Existing files likely involved:
  - `Backend/src/db/schema.js`
  - `Backend/src/app.js`
  - `Frontend/src/router.tsx`
  - `Frontend/src/routes/`
  - `Frontend/src/components/app-sidebar.tsx`
  - `Frontend/src/components/ui/`
- Keep the frontend aligned with the existing shadcn-style UI components.
- Prefer React Router's loader/action/fetcher APIs over client-side `useEffect` fetching.
- Avoid manually mutating local list state after create unless it is only an optimistic enhancement; the source of truth should be backend data plus route revalidation.
