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
