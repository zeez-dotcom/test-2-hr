# Repository Guidelines

## Project Structure & Module Organization
- Root E2E tests: `tests/*.spec.ts` (Playwright) with helpers in `tests/utils`.
- App code in `HRPayMaster/`:
  - Server: `server` (Express + Drizzle; routes in `server/routes`).
  - Client: `client` (React + Vite + Tailwind).
  - Shared: `shared` (schemas, helpers).
  - DB: `migrations/*` and `drizzle.config.ts`.
- Docs: `docs/`. Config: `playwright.config.ts`, Vite configs under `HRPayMaster/`.

## Build, Test, and Development Commands
- Required: Node 20.x LTS and npm 10.x.
- Install deps: `npm install --prefix HRPayMaster`
- Dev (API + client): `npm run dev --prefix HRPayMaster`
- Build bundle: `npm run build --prefix HRPayMaster`
- Start prod: `npm run start --prefix HRPayMaster`
- Push DB schema: `npm run db:push` (from repo root)
- All tests: `npm test` (Vitest in `HRPayMaster` then Playwright E2E)

## Coding Style & Naming Conventions
- TypeScript everywhere; indent with 2 spaces.
- Filenames: server/util files kebab-case; React files kebab-case exporting PascalCase components.
- Names: camelCase for vars/functions; PascalCase for types/interfaces.
- Styling: Tailwind in client. Prefer utilities in `client/src/lib` and existing patterns.

## Testing Guidelines
- Unit/integration (Vitest): co-locate `*.test.ts[x]` or use `client/src/__tests__`.
- E2E (Playwright): `tests/*.spec.ts`.
- Coverage targets: server/utils and critical modules (payroll, normalization, auth, API routes) ≥80% lines; client overall ≥60%.
- Run coverage: `npm run test:coverage` (root) or `npm run test --prefix HRPayMaster -- --coverage`.

## Commit & Pull Request Guidelines
- Conventional Commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`.
- PRs: use `.github/pull_request_template.md`; include summary, linked issues, screenshots (for UI), and a test plan (commands + results).
- Keep diffs focused; update docs/tests with behavior changes.

## Security & Configuration
- Copy `HRPayMaster/.env.example` to `.env`; set `DATABASE_URL`, `SESSION_SECRET`, `VITE_API_BASE_URL`.
- Never commit secrets or `.env`.
- After pulling migrations, run `npm run db:push`.

## Quickstart for Agents
- Install and env: `npm install --prefix HRPayMaster` then copy `HRPayMaster/.env.example` to `.env` and set `VITE_API_BASE_URL=http://localhost:5000` and a `SESSION_SECRET`.
- Dev server: `npm run dev --prefix HRPayMaster` (Express serves API; Vite serves client in development).
- Production run: `npm run build --prefix HRPayMaster` then `npm run start --prefix HRPayMaster` (serves built client + API from the same port).
- Tests: `npm test` at repo root runs Vitest in `HRPayMaster` then Playwright E2E in `tests/`.

## Architecture Notes
- Server: Express app with session + Passport local strategy. Routes mounted in `server/routes.ts` under `/api/*` (auth, employees, reports, payroll, loans, cars, chatbot). Additional helpers in `server/utils` (e.g., `normalize.ts`, `payroll.ts`), storage/API in `server/storage.ts`, email/alerts in `server/emailService.ts`, and metrics at `/metrics`.
- Client: React + Vite. Routing via `wouter` in `client/src/App.tsx`. Feature pages under `client/src/pages`, shared UI components under `client/src/components/ui`, utilities under `client/src/lib` (HTTP wrapper, i18n, date helpers, PDF generation), and hooks in `client/src/hooks`.
- Shared: Cross-cutting types and validators in `shared/` (Zod schemas in `schema.ts`, chatbot helpers in `chatbot.ts`).
- DB/Migrations: `drizzle.config.ts` and `migrations/*.sql`. Apply with `npm run db:push` from repo root (for Neon/Postgres).

## Auth & Defaults
- Default admin user: username `admin`, password `admin` (seeded/assumed for local). The server warns if `SESSION_SECRET` is missing in dev and refuses to start in production without it.
- Single port: app listens on `PORT` (default `5000`). Client uses `VITE_API_BASE_URL` to call the API.

## Agent Do/Don’t
- Do keep changes minimal and targeted; match existing patterns in `client/src/lib` and `server/routes`.
- Do co-locate unit tests next to the module or under `client/src/__tests__` using Vitest.
- Do not introduce new frameworks or restructure modules without a clearly scoped need.
- Do verify TypeScript types compile (`npm run check --prefix HRPayMaster`) before shipping larger changes.

## Common Pitfalls
- Upload limits: Express caps JSON/form bodies at 1 MB; large images are optimized with `sharp` where available. Handle 413/415 responses in UI via `toastError`.
- Date parsing: Server normalization tolerates multiple formats; prefer `YYYY-MM-DD` and `toLocalYMD` on the client.
- E2E flakiness: Prefer `tests/utils/formHelper.ts` helpers and explicit waits for network where needed.
