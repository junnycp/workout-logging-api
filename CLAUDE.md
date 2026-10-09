# CLAUDE.md

Workout Logging API — Everfit Backend Engineer assignment. Coaches log client workouts
(exercises, sets, weights) and query history and personal records (PRs).
The assignment brief is the source of truth: `Everfit_Test for Backend Engineer..pdf` (repo root, gitignored).

IMPORTANT: This repo is evaluated on **how AI is used**, not only on the result.
The git log and `AI_WORKFLOW.md` are deliverables. Follow "AI adoption rules" below on every task.

## Stack (decided — do not change without an ADR in `docs/adr/`)

- Node.js 24 LTS (24.21.0, `.nvmrc`; run `nvm use` first), NestJS 12 as a **CommonJS** app,
  TypeScript **6.0.x pinned** (TS 7 breaks `@nestjs/swagger` and `typescript-eslint` peers), `strict: true`
- Lint: ESLint + typescript-eslint type-aware rules; format: Prettier. See `docs/adr/0001-runtime-versions.md`
- PostgreSQL 16 (relational entries/sets, `pg_trgm` for partial name match, transactional bulk insert)
- Prisma **7.10.0, pinned exact** (npm `latest` is an 8.0 RC) with `@prisma/adapter-pg` and `prisma.config.ts`;
  exposed through a `PrismaService` provider. Use the Prisma client by default. Only two typed raw queries
  (`$queryRaw` / TypedSQL, always parameterized): the history keyset page (Prisma's native cursor is O(depth))
  and `similarity()` name suggestions (plus the `SELECT 1` health ping)
- Index needs Prisma can't express (e.g. `INCLUDE`) are replaced by key columns. SQL Prisma cannot express at all
  (CHECK constraints, statistics) is hand-added to a new `--create-only` migration before it is applied; an applied
  migration is never edited
- Validation: `class-validator` + global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- Config: `@nestjs/config` with schema validation at boot (fail fast on missing env)
- Logging: `nestjs-pino` (JSON logs, request id, no PII in logs)
- Docs: `@nestjs/swagger` (OpenAPI at `/docs`)
- Tests: Jest + Supertest; integration tests run against real Postgres (Testcontainers or docker compose), never SQLite
- Runtime: `docker compose up` must start API + DB, run migrations and seed with zero manual steps

## Commands

```bash
nvm use                          # Node 24.21.0 from .nvmrc
docker compose up --build        # full stack: postgres -> migrate (one-shot) -> api on :3000
npm run start:dev                # api only, needs DATABASE_URL (e.g. the compose postgres on :5432)
npm run lint && npm run typecheck
npm test                         # unit tests (Jest via node --experimental-vm-modules; plain `npx jest` fails)
npm run test:e2e                 # integration tests, Testcontainers Postgres (Colima socket auto-detected)
npm run prisma:generate          # regenerate src/generated/prisma after schema changes
npx prisma migrate dev --name <change>   # new migration; never edit an applied migration
npm run seed                     # build, then sync prisma/seed/exercise-catalog.json (idempotent; needs DATABASE_URL)
npm run seed:perf                # 50k-entry perf dataset from prisma/seed/perf-profile.json (~2 min; `-- --include-optional` adds perf-single)
npm run perf:plans -- --label warm      # auto_explain plans of every scenario -> docs/perf/plans/<label>/
npm run perf:latency -- --label warm    # p50/p95 against a running API (PERF_API_URL) -> docs/perf/latency-<label>.md
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

- Units: registry maps unit -> kg factor as a decimal string (`kg: '1'`, `lb: '0.45359237'`). Adding `stone` must be
  one registry entry and nothing else. The DB `unit` column is plain varchar (no ENUM/CHECK); the registry is the
  single source of truth, enforced at the API boundary.
- Store original `weight` + `unit` AND normalized `weight_kg` (NUMERIC, not float). Round only at the API boundary.
- Response values are recomputed from the original `reps`/`weight`/`unit` with the domain functions, then rounded
  once. Never round the stored 4-decimal `weight_kg`/`volume_kg`/`e1rm_kg` again (double rounding: 32 lb -> 14.52
  instead of 14.51). Stored kg columns are for filtering, sorting and PR selection.
- Epley: `e1rm = weight_kg * (1 + reps / 30)` applied literally for ALL reps, including reps = 1 (decided; the
  brief's formula wins over the r > 1 convention — documented in README). Do not special-case reps = 1.
- Volume per set = `reps * weight_kg`. Derived values (`weight_kg`, `volume_kg`, `e1rm_kg`) are computed once at
  write time by the domain functions, with `decimal.js`/Prisma `Decimal`, never JS floats.
- Bodyweight sets (weight 0) are valid logs but never PRs; only-bodyweight history -> records `null` + message.
- PR tie-break: higher value -> more reps -> earliest `performed_at` -> lowest set id.
- Exercise catalog is a CLOSED list in `prisma/seed/exercise-catalog.json` (name, aliases, muscle groups), synced
  into tables by `npm run seed`. Unknown names are rejected (`UNKNOWN_EXERCISE` + up to 3 trigram suggestions);
  never auto-create exercises. Mapping is data, never a `switch` in services. No catalog endpoint.
- Exercise names: trim + collapse spaces + lower-case into `name_key`; partial match uses the `pg_trgm` index.

## Time and dates

- Store `performed_at` as `timestamptz` (UTC) plus `utc_offset_minutes`. Input `date` is either an ISO-8601
  datetime WITH offset (`Z` or `+07:00`), or date-only `YYYY-MM-DD` together with an IANA `timezone`.
  A datetime without offset is rejected with 400 — never parse it with `new Date()` (it would use server time).
  A `date` more than 24 h after now (injected `CLOCK`) is rejected with `DATE_IN_FUTURE` (D12): logs are retrospective.
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
- Scope is fixed by the approved plan: Swagger yes; no CI workflow, no catalog/admin endpoints, no auth.

## Testing rules

- TDD for domain logic: write the failing test first (conversion, Epley, PR selection, tie-breaking, period
  boundaries, DST edges).
- Integration tests cover each endpoint's happy path, validation errors, empty ranges, pagination continuity, and
  concurrent bulk writes.
- Test names describe behaviour ("returns earliest date when two sets tie on max weight").
- Run `npm run lint && npm run typecheck && npm test` before every commit; report the actual output. A deliberate red
  test commit is the exception: it fails `npm test` (and `typecheck` if it imports a symbol not written yet).

## Git

- Small commits, one logical step each, Conventional Commits (`feat(records): ...`, `test(units): ...`,
  `fix: ...`, `refactor: ...`, `docs: ...`). No "WIP"/"update" messages. Never squash history.
- When AI-generated code is corrected after review, commit the correction separately with a message that says
  what was wrong (e.g. `fix(records): use earliest date on PR ties (AI draft picked latest)`).
- No force push, no `git add -f`, no committing `.env`.
- One branch per milestone (`m4`, `m5`, ...). Merge it into `main` with `git merge --no-ff mN` (keeps every
  commit plus a merge commit marking the boundary; never squash) and tag the merge `mN-done` (annotated).
- IMPORTANT: Never `git push` (or create/modify anything on GitHub) unless the user explicitly asked for that push
  in the current request. Approval to commit is NOT approval to push.

## AI adoption rules

- Explore -> plan -> implement -> verify -> commit. For multi-file work, write the plan to `plan/<task>.md`
  (gitignored) first and get approval.
- Delegate architecture decisions, non-trivial features and reviews to the `technical-leader` subagent.
- After implementing, run an independent review (fresh subagent or `/code-review`) before committing.
- IMPORTANT: When AI output turns out wrong, suboptimal, or a suggestion is rejected, append a factual entry to
  `AI_WORKFLOW.md` ("Corrections log") right away: date, task, what the AI produced, how it was detected,
  what was done instead, commit hash. Never invent or embellish entries — only record what actually happened.
- Record the prompting strategy changes (new rules added here, context given, task splits) in `AI_WORKFLOW.md`.
- Every number in a document comes from a committed artifact (file, test, commit) or is marked as command output.

## Deliverables checklist

README (architecture diagram, setup, API docs + error codes, schema + indexes, trade-offs, scaling to
10k coaches), `AI_WORKFLOW.md`, clean git history, Docker setup, time estimate (`docs/ESTIMATION.md`).
