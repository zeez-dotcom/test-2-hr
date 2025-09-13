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

## Error handling & date formatting

- [`http.ts`](HRPayMaster/client/src/lib/http.ts) wraps fetch and returns an `ApiResult` rather than throwing on failed requests.
- [`toastError`](HRPayMaster/client/src/lib/toastError.ts) converts failed results into user-friendly toast messages.
- [`toLocalYMD`](HRPayMaster/client/src/lib/date.ts) formats `Date` objects into `YYYY-MM-DD` strings.

Uploads have a default 1 MB limit enforced by Express. Requests exceeding this size respond with **413 Payload Too Large**, and unsupported file types yield **415 Unsupported Media Type**. Import interfaces surface these errors to users via destructive toasts.
