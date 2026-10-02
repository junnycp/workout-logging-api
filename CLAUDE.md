# CLAUDE.md

Workout Logging API — Everfit Backend Engineer assignment. Coaches log client workouts
(exercises, sets, weights) and query history and personal records (PRs).
The assignment brief is the source of truth: `Everfit_Test for Backend Engineer..pdf` (repo root, gitignored).

IMPORTANT: This repo is evaluated on **how AI is used**, not only on the result.
The git log and `AI_WORKFLOW.md` are deliverables. Follow "AI adoption rules" below on every task.

## Stack (decided — do not change without an ADR in `docs/adr/`)

- Node.js 20 LTS, TypeScript `strict: true`, NestJS 11
- PostgreSQL 16 (relational sets/entries, window functions for PRs, `pg_trgm` for partial name match,
  transactional bulk insert). ORM: Prisma; use typed raw SQL (`$queryRaw` / TypedSQL) for aggregations
- Validation: `class-validator` + global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- Config: `@nestjs/config` with schema validation at boot (fail fast on missing env)
- Logging: `nestjs-pino` (JSON logs, request id, no PII in logs)
- Docs: `@nestjs/swagger` (OpenAPI at `/docs`)
- Tests: Jest + Supertest; integration tests run against real Postgres (Testcontainers or docker compose), never SQLite
- Runtime: `docker compose up` must start API + DB, run migrations and seed with zero manual steps

## Commands

```bash
docker compose up --build        # full stack (api + postgres)
npm run start:dev                # api only, needs DATABASE_URL
npm run lint && npm run typecheck
npm test                         # unit tests
npm run test:e2e                 # integration tests (needs Postgres)
npx prisma migrate dev --name <change>   # new migration; never edit an applied migration
npm run seed                     # exercises + muscle-group mapping, optional 50k-entry perf dataset
```

Keep this section in sync with `package.json` when scripts change.

## Architecture

```
src/
  common/        # error filter, error codes, pagination, logging, request-id
  config/        # env schema + typed config
  units/         # WeightUnit registry + conversion (pure, no Nest deps in core logic)
  exercises/     # exercise catalog + configurable muscle-group mapping
  workouts/      # POST /workouts (bulk), GET history
  records/       # PR queries + period comparison
  database/      # Prisma service, transactions
prisma/          # schema, migrations, seed (seed data in JSON/YAML, not in code)
test/            # e2e specs + fixtures/factories
docs/adr/        # short architecture decision records
```

- Layering: controller (HTTP + DTO) -> service (business rules) -> repository (SQL). Controllers contain no logic;
  services never import Prisma types into their public signatures.
- Pure domain functions (unit conversion, Epley 1RM, volume, period math) live in plain TS files and are unit-tested
  without Nest.

## Domain rules (non-obvious)

- Units: registry maps unit -> kg factor (`kg: 1`, `lb: 0.45359237`). Adding `stone` must be one registry entry
  plus nothing else in business logic. Do not use a Postgres ENUM for units (use text + CHECK sourced from registry
  or a lookup table) so adding a unit needs no type migration pain.
- Store original `weight` + `unit` AND normalized `weight_kg` (NUMERIC, not float). Round only at the API boundary.
- Epley: `e1rm = weight_kg * (1 + reps / 30)`. Define and document behaviour for reps = 1 and bodyweight (weight 0).
- Volume per set = `reps * weight_kg`.
- Muscle-group mapping is data (seeded table driven by `prisma/seed/exercise-muscle-groups.json`), never a
  `switch` in services.
- Exercise names: trim + case-insensitive matching via a normalized column; partial match uses `pg_trgm` index.

## Time and dates

- Store `performed_at` as `timestamptz` (UTC). Accept ISO-8601 with offset; reject dates without one or default
  explicitly and document it.
- Date-range filters and "this month vs last month" accept a `tz` (IANA) query param, default `UTC`.
  Compute boundaries in that tz, compare in UTC. Trade-offs go in README.

## API conventions

- Base path `/api/v1`. JSON camelCase. `userId` passed as path param (no auth by design).
- Errors always: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] }, "requestId": "..." }`
  via one global exception filter. Codes live in `src/common/errors/error-codes.ts`.
- Empty result is `200` with `data: []` and a `meta.message`, never 404.
- Lists use cursor pagination (`limit`, `cursor` = opaque base64 of `(performed_at, id)`); `limit` capped at 100.
- Bulk create is all-or-nothing in one transaction; support `Idempotency-Key` header for safe retries.
- Every query path must be backed by an index; check new queries with `EXPLAIN ANALYZE` on the 50k seed.

## Testing rules

- TDD for domain logic: write the failing test first (conversion, Epley, PR selection, tie-breaking, period
  boundaries, DST edges).
- Integration tests cover each endpoint's happy path, validation errors, empty ranges, pagination continuity, and
  concurrent bulk writes.
- Test names describe behaviour ("returns earliest date when two sets tie on max weight").
- Run `npm run lint && npm run typecheck && npm test` before every commit; report the actual output.

## Git

- Small commits, one logical step each, Conventional Commits (`feat(records): ...`, `test(units): ...`,
  `fix: ...`, `refactor: ...`, `docs: ...`). No "WIP"/"update" messages. Never squash history.
- When AI-generated code is corrected after review, commit the correction separately with a message that says
  what was wrong (e.g. `fix(records): use earliest date on PR ties (AI draft picked latest)`).
- No force push, no `git add -f`, no committing `.env`.

## AI adoption rules

- Explore -> plan -> implement -> verify -> commit. For multi-file work, write the plan to `plan/<task>.md`
  (gitignored) first and get approval.
- Delegate architecture decisions, non-trivial features and reviews to the `technical-leader` subagent.
- After implementing, run an independent review (fresh subagent or `/code-review`) before committing.
- IMPORTANT: When AI output turns out wrong, suboptimal, or a suggestion is rejected, append a factual entry to
  `AI_WORKFLOW.md` ("Corrections log") right away: date, task, what the AI produced, how it was detected,
  what was done instead, commit hash. Never invent or embellish entries — only record what actually happened.
- Record the prompting strategy changes (new rules added here, context given, task splits) in `AI_WORKFLOW.md`.

## Deliverables checklist

README (architecture diagram, setup, API docs + error codes, schema + indexes, trade-offs, scaling to
10k coaches), `AI_WORKFLOW.md`, clean git history, Docker setup, time estimate (`docs/ESTIMATION.md`).
