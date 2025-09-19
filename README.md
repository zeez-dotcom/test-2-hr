# test 2 hr
test2hr

To push database changes for the `HRPayMaster` project, run the following command from the repository root:

```
npm run db:push
```

## Start development server

Before starting the server, install dependencies and configure environment variables:

1. Install packages:

   ```bash
   npm install --prefix HRPayMaster
   ```

2. Copy `.env.example` to `.env` in `HRPayMaster` and set at least:

   ```bash
   DATABASE_URL="<your Neon connection string>"
   SESSION_SECRET="<random session secret>"
   VITE_API_BASE_URL="http://localhost:5000"
   ```

Then start the development server:

```bash
npm run dev --prefix HRPayMaster
```

Alternatively, run `cd HRPayMaster && npm run dev`.

> **Note**
> Error responses include detailed messages and stack traces only when `NODE_ENV` is not set to `"production"`. The development script above already sets `NODE_ENV=development`; ensure your environment uses a non-production value to see error details during development.

## Database seed data

Seed realistic demo data across companies, departments, employees, payroll, assets, cars, attendance, and notifications.

- Seed:

  ```bash
  npm run db:seed
  ```

- Unseed (removes only records created by the seed script):

  ```bash
  npm run db:unseed
  ```

Seeded records use a `SEED-` prefix (e.g., `SEED-EMP-001`, `SEED-2025-09`) so removal is targeted and safe.

## Auth & test login

- The app includes a hardcoded super admin for local testing:
  - Username: `admin1`
  - Password: `admin1`

Start the server (default port is `5000`; use `PORT=5001` if `5000` is busy):

```bash
# default
npm run dev --prefix HRPayMaster

# or choose another free port
PORT=5001 npm run dev --prefix HRPayMaster
```

Log in and call APIs with curl (cookies required for session):

```bash
# Replace port if different
PORT=5000

# Login (stores session cookie)
curl -i -c cookie.txt \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'username=admin1&password=admin1' \
  http://localhost:$PORT/login

# Verify session
curl -b cookie.txt http://localhost:$PORT/api/me

# Employees
curl -s -b cookie.txt http://localhost:$PORT/api/employees | jq 'map({code: .employeeCode, name: (.firstName+" "+(.lastName//"")), role: .role, dept: .department?.name})'

# Payroll runs
curl -s -b cookie.txt http://localhost:$PORT/api/payroll | jq 'map({id, period, grossAmount, netAmount, status})'

# Assets
curl -s -b cookie.txt http://localhost:$PORT/api/assets | jq 'map({name, status})'
```

If you change the port for the server, update `VITE_API_BASE_URL` in `HRPayMaster/.env` accordingly so the client can reach the API.

## Error handling & date formatting

- [`http.ts`](HRPayMaster/client/src/lib/http.ts) wraps fetch and returns an `ApiResult` rather than throwing on failed requests.
- [`toastError`](HRPayMaster/client/src/lib/toastError.ts) converts failed results into user-friendly toast messages.
- [`toLocalYMD`](HRPayMaster/client/src/lib/date.ts) formats `Date` objects into `YYYY-MM-DD` strings.

Uploads have a default 1 MB limit enforced by Express. Requests exceeding this size respond with **413 Payload Too Large**, and unsupported file types yield **415 Unsupported Media Type**. Import interfaces surface these errors to users via destructive toasts.
