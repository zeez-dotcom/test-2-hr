# HRPayMaster Deployment Guide

This repository contains the HRPayMaster application. All application code lives in the `HRPayMaster/` folder:

- `HRPayMaster/server`  Express API + Passport auth + Drizzle ORM
- `HRPayMaster/client`  React (Vite) front end
- `HRPayMaster/shared`  Shared schemas, types, helpers
- `HRPayMaster/migrations`  SQL migrations managed by Drizzle

## Prerequisites

- Node.js 20.x LTS
- npm 10.x
- Postgres instance (Neon URL works out of the box)

## Environment Variables

Copy `HRPayMaster/.env.example` to `HRPayMaster/.env` and update the values before running locally or deploying:

```bash
cp HRPayMaster/.env.example HRPayMaster/.env
```

Required values:

- `DATABASE_URL`  Postgres connection string
- `SESSION_SECRET`  Long random string for signing sessions
- `VITE_API_BASE_URL`  Base URL the client uses to call the API (e.g. `http://localhost:5000` in dev)
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL` (recommended for production). If these are omitted, the server falls back to `admin / admin / admin@example.com` for local development only. These values are only used when no active admin account exists,
 allowing you to change credentials later through the UI or API without environment overrides.

## Install Dependencies

From the repository root:

```bash
npm install --prefix HRPayMaster
```

## Database

Apply the current schema (including the `generic_documents` metadata migration) from the repo root:

```bash
npm run db:push
```

Seeding commands (optional, repo root):

```bash
npm run db:seed    # populate demo data, including employees and documents
npm run db:unseed  # remove records inserted by the seed script
```

## Development

Start the dev servers (Express API + Vite client):

```bash
npm run dev --prefix HRPayMaster
```

The app serves both API and client on `http://localhost:5000`. Login with the admin credentials defined in the environment variables (or the `admin / admin` fallbacks if you are in development and left them unset).

## Admin & User Management

- Navigate to **Settings -> User Management** (visible to admins only) to add new users, update roles and contact info, deactivate/reactivate accounts, and reset passwords. Changes take effect immediately and refresh the list.
- User accounts remain in the database when deactivated; inactive users cannot sign in and are excluded from the session bootstrap process.
- The server exposes guarded endpoints under `/api/users` (requires an authenticated admin session):
  - `GET /api/users` - list users without password hashes.
  - `POST /api/users` - create a user (`{ username, email, password, role }`).
  - `PUT /api/users/:id` - update username, email, role, or active flag.
  - `POST /api/users/:id/deactivate` and `/reactivate` - toggle access while ensuring at least one admin stays active.
  - `POST /api/users/:id/reset-password` - hash and store a new password.

On startup the server ensures at least one active admin user exists. If none are present, the environment values above (or the development defaults) seed a new admin account.

## Tests & Type Checks

```bash
npm run check --prefix HRPayMaster    # TypeScript project references
npm test                               # Vitest + Playwright from repo root
```

## Production Build & Deployment

1. Ensure `NODE_ENV=production` and all required env vars are set (especially `SESSION_SECRET`, `ADMIN_*`, `DATABASE_URL`).
2. Build the client bundle and server entry point:

   ```bash
   npm run build --prefix HRPayMaster
   ```

3. Start the production server (serves API + built client on the same port):

   ```bash
   npm run start --prefix HRPayMaster
   ```

The server exposes:

- `GET /healthz`  unauthenticated health check
- `POST /login`, `POST /logout`  authentication endpoints
- `/metrics`  Prometheus metrics (unauthenticated by default; wrap with auth if you need to restrict it)
- `/api/**`  all other routes, protected by session authentication

## Deployment Checklist

- [ ] `HRPayMaster/.env` (or platform secrets) populated with production values
- [ ] `npm run db:push` executed against the production database
- [ ] Optional: `npm run db:seed` if you want starter data, followed by `npm run db:unseed` to clean up
- [ ] `npm run build --prefix HRPayMaster`
- [ ] `npm run start --prefix HRPayMaster`
- [ ] Verify login using the configured admin credentials and confirm `/api/me` succeeds
- [ ] Hit `GET /healthz` for smoke testing

Thats itthe application is ready for a managed host (Render, Fly.io, Heroku, container platform, etc.) as long as it can run Node 20, supply the environment variables, and expose the single port.
