# NSXfonio Backend

Express backend using Better Auth for email/password and Google OAuth, with Drizzle ORM on SQLite.

## Setup

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

The server defaults to `http://localhost:3005`.

## Google OAuth

Create OAuth credentials in Google Cloud Console and add this redirect URI:

```text
http://localhost:3005/api/auth/callback/google
```

Then set these values in `.env`:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Useful Endpoints

- `GET /health` checks the API process.
- `GET /api/auth/ok` checks Better Auth.
- `GET /api/me` returns the current authenticated session or `401`.

Better Auth owns the `/api/auth/*` routes. Mount new JSON routes after that handler so auth requests keep their raw body.
