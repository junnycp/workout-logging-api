# Design — Workout Logging API

Status: approved 2026-10-05 (rev. 4). Source of truth for implementation; deviations require an ADR in `docs/adr/`.
Date: 2026-10-02

---

## 1. Requirement breakdown (traceability)

Every requirement gets an ID; tests and README sections reference these IDs.

| ID | Requirement (from brief) | Where it is satisfied |
|----|--------------------------|-----------------------|
| R1.1 | Log entry: userId, date, exerciseName, sets[{reps, weight, unit}] | `POST /users/:userId/workouts` |
| R1.2 | Units kg, lb | Unit registry |
| R1.3 | Store original + normalized kg | `workout_sets.weight`, `unit`, `weight_kg` |
| R1.4 | Bulk: multiple exercises per request | `entries[]` in one transaction |
| R2.1 | History for a user | `GET /users/:userId/workouts` |
| R2.2 | Filter: exercise name, partial match | `exercise` query, trigram index |
| R2.3 | Filter: date range | `from`, `to`, `tz` |
| R2.4 | Filter: muscle group (if metadata exists) | `muscleGroup`, configurable mapping tables |
| R2.5 | Return in requested unit | `unit` query param |
| R2.6 | Pagination (cursor or offset) | Keyset cursor on `(performed_at, id)` |
| R3.1 | PR: heaviest single set | `maxWeight` |
| R3.2 | PR: highest volume set (reps × weight) | `maxVolume` |
| R3.3 | PR: best Epley 1RM = weight × (1 + reps/30) | `bestEstimated1RM` |
| R3.4 | Date each PR was achieved | `achievedAt` + `localDate` on each PR |
| R3.5 | Compare PRs across ranges (this month vs last month) | `GET .../personal-records/compare` |
| E1 | Invalid/unsupported unit | 400 `VALIDATION_ERROR`, detail code `UNSUPPORTED_UNIT` |
| E2 | Missing/malformed fields (null date, negative weight/reps, empty sets) | DTO validation, field paths in `details` |
| E3 | Empty date range → empty result + message, not error | 200, `data: []`, `meta.message` |
| E4 | Timezone strategy documented | UTC storage + request `tz` (Section 5) |
| E5 | Concurrent writes, same user + exercise | Transactions, idempotent catalog upsert, `Idempotency-Key` (Section 6) |
| E6 | 50k+ entries per user performs well | Index design + perf seed + `EXPLAIN ANALYZE` evidence (Section 7) |
| X1 | New unit (e.g. stone) = minimal change | Single registry entry drives validation, Swagger, conversion |
| X2 | Exercise → muscle group mapping configurable | JSON catalog synced to tables, no mapping in code |
| T | NestJS, Postgres/Mongo justified, no auth, userId param | Section 2 |

---

## 2. Technology decisions

| Area | Choice | Why | Rejected alternative |
|------|--------|-----|----------------------|
| Framework | NestJS 12, TypeScript strict (versions: `docs/adr/0001-runtime-versions.md`) | Recommended by brief; DI is an explicit evaluation criterion | Fastify alone (no DI conventions) |
| Database | PostgreSQL 16 | Entry→sets is relational; PR = aggregation over indexed numeric columns; `pg_trgm` for partial match; ACID bulk insert; unique constraints for idempotency; `NUMERIC` for exact weights | MongoDB: sets embedded in documents make per-set PR indexing awkward (multikey index + `$unwind`), no exact decimal arithmetic in aggregations without Decimal128 friction |
| Data access | **Prisma 7.10.0** (pinned; npm `latest` points to an 8.0 RC) + `@prisma/adapter-pg`, `PrismaService` provider (D1) | Team familiarity; type-safe client; reviewable SQL migrations; spike 13a showed trigram GIN, DESC and covering indexes, transactions, `ON CONFLICT DO NOTHING` all work. Two typed raw queries: history keyset page (native cursor is O(depth)) and `similarity()` suggestions | Drizzle via `@nestjs/drizzle` (official Nest package), Kysely, raw `pg` |
| Decimal math | `decimal.js` in the domain layer, `NUMERIC` in DB, `pg` returns numerics as strings | No float drift on lb↔kg (0.45359237) | JS `number` everywhere |
| Time | Luxon (IANA zones, DST-safe) | Month/day boundaries in user timezone | date-fns-tz (fine too), native Date (no zone math) |
| Validation | class-validator + class-transformer, global `ValidationPipe` | Nest idiom; integrates with Swagger | zod (good, but less idiomatic in Nest) |
| Config | `@nestjs/config` + zod env schema, fail fast at boot | Configuration management criterion | — |
| Logging | `nestjs-pino`, JSON, `x-request-id` propagation, redaction | Structured logging criterion | Nest default logger |
| Health | `@nestjs/terminus` (`/health` checks DB) | Docker healthcheck / readiness | — |
| API docs | `@nestjs/swagger` at `/docs` | API documentation deliverable | — |
| Tests | Jest (+ SWC) unit; Jest + Supertest + **Testcontainers Postgres** integration | Real DB for SQL, concurrency and index behaviour | SQLite / mocks for DB (would not test the real queries) |

---

## 3. Data model

```
exercises
  id            uuid PK (UUIDv7)
  name          varchar(100) NOT NULL UNIQUE   -- canonical display name from the catalog
  created_at, updated_at timestamptz

exercise_names                            -- every accepted spelling: canonical name + aliases (M2 refinement)
  name_key      varchar(100) PK           -- normalized: NFKC, trim, collapse spaces, lower-case
  exercise_id   uuid FK -> exercises
  is_primary    boolean                   -- true for the canonical name
  INDEX GIN (name_key gin_trgm_ops)       -- exact lookup, partial match (ILIKE '%bench%'), suggestions

muscle_groups
  code          text PK                   -- 'chest', 'triceps', ...
  name          text

exercise_muscle_groups                    -- configurable mapping (seeded from JSON)
  exercise_id        uuid FK -> exercises
  muscle_group_code  text FK -> muscle_groups
  role               text  -- 'primary' | 'secondary'
  PK (exercise_id, muscle_group_code)
  INDEX (muscle_group_code, exercise_id)

workout_entries                           -- one exercise performed by one user at one time
  id            uuid PK (UUIDv7, time-ordered, generated in app)
  user_id       varchar(64) NOT NULL      -- no users table: auth out of scope
  exercise_id   uuid FK -> exercises
  performed_at  timestamptz NOT NULL      -- UTC instant
  utc_offset_minutes smallint NOT NULL    -- offset the client logged with, to rebuild local date
  created_at    timestamptz
  INDEX (user_id, performed_at DESC, id DESC)               -- history + keyset pagination
  INDEX (user_id, exercise_id, performed_at DESC, id DESC)  -- history filtered by exercise

workout_sets
  id            uuid PK
  entry_id      uuid FK -> workout_entries ON DELETE CASCADE
  set_number    smallint NOT NULL         -- 1-based order within the entry
  reps          integer  NOT NULL CHECK (reps > 0)
  weight        numeric(8,3) NOT NULL CHECK (weight >= 0)   -- as entered
  unit          varchar(16)  NOT NULL                       -- as entered (validated by registry)
  weight_kg     numeric(10,4) NOT NULL                      -- normalized
  volume_kg     numeric(12,4) NOT NULL                      -- reps * weight_kg
  e1rm_kg       numeric(10,4) NOT NULL                      -- Epley
  -- deliberate denormalization for index-only PR queries:
  user_id       varchar(64) NOT NULL
  exercise_id   uuid NOT NULL
  performed_at  timestamptz NOT NULL
  UNIQUE (entry_id, set_number)
  INDEX (user_id, exercise_id, performed_at, weight_kg, reps, volume_kg, e1rm_kg, id)  -- index-only PR scans (D10);
        -- trailing key columns instead of INCLUDE (INCLUDE unsupported by Prisma schema, prisma#8584; same effect here)

idempotency_keys
  user_id       varchar(64)
  key           varchar(128)
  request_hash  char(64)                 -- sha256 of canonical body
  response_status smallint
  response_body jsonb
  created_at    timestamptz
  PK (user_id, key)
```

Design notes (go into README):
- **Normalization**: original `weight` + `unit` are kept verbatim (audit, display); `weight_kg` is the single
  comparable value. Derived metrics (`volume_kg`, `e1rm_kg`) are computed once at write time by the tested TS
  domain functions (one implementation, unit-tested) rather than SQL generated columns (would duplicate the
  formula in two languages). Trade-off: changing the 1RM formula later needs a backfill migration.
- **Unit column has no DB CHECK/ENUM**: the code registry is the single source of truth, so adding `stone`
  needs no migration. Trade-off: DB alone does not reject bad units; the API boundary does.
- **Denormalized `user_id/exercise_id/performed_at` on sets**: PR queries become an index-only scan of one
  covering index without joining entries. Entries are immutable in this scope, so no drift risk; if an
  update endpoint is added, both rows are updated in one transaction.
- **Exercise catalog is a closed list** (D5) defined in `prisma/seed/exercise-catalog.json` (18 muscle groups,
  57 exercises, 90 aliases, primary/secondary muscles), validated at load and synced idempotently by
  `npm run seed` / the compose `migrate` job. Aliases live in `exercise_names` (M2 refinement: one table and one
  trigram index serve lookup, partial match and suggestions). Logging an unknown exercise is rejected
  (`UNKNOWN_EXERCISE` + suggestions). Adding an exercise = edit JSON + re-sync; no code change. The sync never
  deletes exercises (entries may reference them): stale ones are reported and lose their names, so they can no
  longer be logged. Exercises are matched by canonical name, so renaming one creates a new exercise and leaves
  history on the old id — fix spellings by adding an alias instead of renaming (trade-off, see README).
- **No `users` table**: brief says no auth, userId is a parameter. Validated format `^[A-Za-z0-9_-]{1,64}$`.

---

## 4. API design

Base: `/api/v1`. JSON camelCase. All errors use one envelope.

### 4.1 `POST /api/v1/users/:userId/workouts` — bulk log (R1.x)
Headers: optional `Idempotency-Key`.
```json
{
  "entries": [
    {
      "exerciseName": "Bench Press",
      "date": "2026-10-01T18:30:00+07:00",
      "sets": [ { "reps": 5, "weight": 100, "unit": "kg" }, { "reps": 8, "weight": 185, "unit": "lb" } ]
    }
  ]
}
```
- `date`: ISO-8601 datetime **with offset** (`Z` or `±hh:mm`), or date-only `YYYY-MM-DD` interpreted at 00:00
  local in the **required** `timezone` body field (IANA) (decision D2). Datetime without offset → 400. A date more
  than 24 hours after the server's now → 400 `DATE_IN_FUTURE` (D12).
  Years 1900–2100. Weight has at most 3 decimals (column scale).
- Limits: 1–100 entries, 1–50 sets per entry, reps integer 1–1000, weight 0–2000 (in given unit), body ≤ 1 MB.
- `timezone` is a single top-level field (M4-A1), needed only when an entry uses a date-only `date`.
- All-or-nothing transaction. `201` with `{ data: { entries: [{ id, exercise, performedAt, localDate,
  utcOffsetMinutes, sets: [{ setNumber, reps, weight, unit, weightKg }] }] }, meta: { created } }`.
- Same `Idempotency-Key` + same body (key order irrelevant) → replays the stored response (`200`, header
  `Idempotent-Replayed: true`; same content, object key order may differ because it is stored as JSONB);
  same key + different body → `409 IDEMPOTENCY_KEY_REUSED`. Keys are per user, kept indefinitely (M4-E1).
  "Same body" is strict (raw JSON, key order ignored): a retry that only changes the case of `exerciseName`
  is a different body and gets 409, like Stripe. Number formatting (`10` vs `10.0`) does not matter.

### 4.2 `GET /api/v1/users/:userId/workouts` — history (R2.x)
Query (all optional, combined with AND; unknown parameters → 400 `UNKNOWN_FIELD`):

| Param | Meaning | Errors |
|-------|---------|--------|
| `exercise` | Part of a canonical name or alias, normalized like names (case/space-insensitive), matched literally (`%`, `_` escaped) | `MAX_LENGTH`, `BLANK` |
| `muscleGroup` | Catalog code, case-insensitive; matches exercises that train it as **primary or secondary** (M5-B) | 400 `UNKNOWN_MUSCLE_GROUP` (lists valid codes) |
| `from`, `to` | Inclusive; date-only (whole local day in `tz`) or datetime with offset | `INVALID_DATE`, `MISSING_OFFSET`; 400 `INVALID_DATE_RANGE` if from > to |
| `tz` | IANA zone for date-only bounds, default `UTC` | `INVALID_TIMEZONE` |
| `unit` | Return every weight in this unit; omitted = each set as logged | `UNSUPPORTED_UNIT` |
| `limit` | 1–100, default 20 | `IS_INT`, `MIN`, `MAX` |
| `cursor` | `meta.nextCursor` of the previous page | 400 `INVALID_CURSOR` |

```json
{
  "data": [ { "id": "...", "performedAt": "2026-10-01T11:30:00.000Z", "localDate": "2026-10-01", "utcOffsetMinutes": 420,
             "exercise": { "id": "...", "name": "Bench Press",
                           "muscleGroups": [ { "code": "chest", "role": "primary" }, { "code": "triceps", "role": "secondary" } ] },
             "sets": [ { "setNumber": 1, "reps": 5, "weight": 220.46, "unit": "lb" } ] } ],
  "meta": { "limit": 20, "hasMore": true, "nextCursor": "eyJ...", "unit": "lb", "timezone": "Asia/Ho_Chi_Minh" }
}
```
- Order: `(performed_at DESC, id DESC)`; sets by `setNumber`. `localDate` is the date at the offset the entry was
  logged with (M5-C), the same value POST returned; `tz` only decides range boundaries.
- Weights: in their logged unit, returned exactly as logged; otherwise converted from the logged value and rounded
  once to 2 decimals (§5 Rounding).
- Empty (no data, a name that matches no exercise (M5-D), or past the last page): `200`, `data: []`,
  `hasMore: false`, `nextCursor: null`, `meta.message: "No workouts found for the given filters."`.
- No total count (an exact `COUNT(*)` over 50k rows per page request is wasted work for infinite scroll).
  A cursor is a position, not bound to the filters: reused with other filters it continues from that point.
- Queries (at most 5): name match and/or muscle-group ids, the page, its sets, its exercises. The page is one
  parameterized raw query: without an exercise filter a row-comparison scan of `(user_id, performed_at DESC, id DESC)`;
  with one, a `LATERAL` per matched exercise on `(user_id, exercise_id, performed_at DESC, id DESC)`, each `LIMIT
  limit+1`, then merged (M5-A). Cost ≤ matched exercises × (limit + 1) index rows, independent of page depth and
  of how the user's data is distributed (`exercise_id = ANY(...)` skipped ~21k rows on skewed data in the M5
  spike). Trade-off: a broad term (`?exercise=e`) can match most of the closed catalog (~50 ids → ~5k index rows);
  acceptable for a curated catalog, revisit if it grows to thousands.

### 4.3 `GET /api/v1/users/:userId/personal-records` — PRs (R3.1–R3.4)
Query: `exercise` (**required**; canonical name or alias, normalized, exact), optional `from`, `to`, `tz` (same rules
as history), `unit` (default `kg`). Unknown exercise → 400 `VALIDATION_ERROR`, detail `UNKNOWN_EXERCISE` with up to
3 `suggestions` (D11).
```json
{ "data": {
    "exercise": { "id": "...", "name": "Bench Press" }, "unit": "kg",
    "range": { "from": "2026-09-01T17:00:00.000Z", "to": null, "timezone": "Asia/Ho_Chi_Minh" },
    "maxWeight":        { "value": 100,    "set": { "reps": 1,  "weight": 100 }, "achievedAt": "2026-09-01T16:30:00.000Z",
                          "localDate": "2026-09-01", "entryId": "...", "setNumber": 1 },
    "maxVolume":        { "value": 800,    "set": { "reps": 10, "weight": 80 }, ... },
    "bestEstimated1RM": { "value": 106.67, "set": { "reps": 10, "weight": 80 }, ... } },
  "meta": {} }
```
- `range.from`/`to` are the resolved **inclusive** UTC instants (`null` = open); a date-only `to` becomes the next
  local midnight − 1 ms. `localDate` is the date at the offset the set was logged with (as in history).
- `value` and `set.weight` are in `unit`, recomputed from the winning set as logged and rounded once (§5); a weight in
  its own unit is returned as logged.
- Ranking (D4 on exact values): each record reads the top 50 sets by the stored 4-decimal column (Index Only Scan,
  D10), keeps those tied on the highest stored value — rounding is monotonic, so the true record is among them —
  and `pickRecord` settles them on exact values, then more reps, earliest date, lowest set id. If all 50 tie, a
  second query fetches every tied set. (Ranking on the stored value alone picked 20.051 lb × 10 = 9.09498 kg over
  9.095 kg × 5, both stored 9.0950 — review finding, C21.)
- Bodyweight sets (weight 0) never win. No weighted sets → records `null` with `meta.message` "No weighted sets
  found for this exercise in the given range." or, when only bodyweight sets exist, "Only bodyweight sets were
  logged in the given range; weighted records need a weight above 0."
- Queries: exercise lookup, 3 candidate queries, 1 detail query (+1 bodyweight check when empty).

### 4.4 `GET /api/v1/users/:userId/personal-records/compare` — period comparison (R3.5)
`exercise`, `unit`, `tz` as above, plus **either** `period=week|month|year` **or** all four of
`currentFrom, currentTo, previousFrom, previousTo` (neither, both, or an incomplete set → `VALIDATION_ERROR` on
`period` / the missing bounds; an inverted range → `INVALID_DATE_RANGE`).
- `period`: the current period up to and including now (injectable `CLOCK`; future-dated sets do not count) against
  the whole previous period, boundaries at local midnights in `tz` (weeks start Monday). Explicit ranges are taken
  as given, may overlap and may include future dates.
- A period's record is the **best set within that period** (D11), ranked as in 4.3.
- Response: `data.current` / `data.previous` = `{ from, to` (inclusive UTC instants) `, maxWeight, maxVolume,
  bestEstimated1RM }`, `data.delta.<metric>` = `{ absolute, percent, improved }` or `null` when either side is
  `null`. `absolute`/`percent` come from exact values rounded once; `improved` = `absolute > 0`, so it never
  contradicts what the client sees (C21). Both periods empty → `meta.message` "No weighted sets found for this
  exercise in either period."
- The two periods are queried one after the other (at most 3 pool connections per request).

### 4.5 Supporting
- `GET /health`, `GET /docs` (Swagger) — approved (D8)
- No catalog endpoint (D9 rejected): valid names documented in README/Swagger; errors return suggestions

### 4.6 Error envelope and codes
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
             "details": [ { "path": "entries[0].sets[1].unit", "code": "UNSUPPORTED_UNIT",
                            "message": "Unit 'stone' is not supported. Supported: kg, lb" } ] },
  "requestId": "..." }
```
| HTTP | code | When |
|------|------|------|
| 400 | `VALIDATION_ERROR` | Any path/header/body/query validation failure. One detail per problem: `{ path, code, message }`, e.g. `IS_DEFINED`, `IS_INT`, `IS_NUMBER`, `MIN`, `MAX`, `MAX_DECIMAL_PLACES`, `ARRAY_MIN_SIZE`, `ARRAY_MAX_SIZE`, `IS_ARRAY`, `BLANK`, `MATCHES`, `UNKNOWN_FIELD`, `UNSUPPORTED_UNIT`, `INVALID_DATE`, `MISSING_OFFSET`, `MISSING_TIMEZONE`, `INVALID_TIMEZONE`, `DATE_IN_FUTURE`, `UNKNOWN_EXERCISE` (+ `suggestions`) |
| 400 | `MALFORMED_JSON` | Body is not valid JSON |
| 400 | `BAD_REQUEST` | Other client errors raised by the HTTP layer (e.g. aborted request) |
| 400 | `INVALID_DATE_RANGE` | `from` > `to` (M5/M6) |
| 400 | `INVALID_CURSOR` | Cursor not decodable (M5) |
| 400 | `UNKNOWN_MUSCLE_GROUP` | `muscleGroup` not in catalog, lists valid codes (M5) |
| 404 | `ROUTE_NOT_FOUND` | Unknown route, inside or outside `/api/v1` |
| 405 | `METHOD_NOT_ALLOWED` | Reserved for the HTTP layer |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same Idempotency-Key, different body |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 1 MB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Unsupported content encoding or charset |
| 503 | `SERVICE_UNAVAILABLE` | `/health` when a dependency is down (details per dependency) |
| 500 | `INTERNAL_ERROR` | Unexpected; message is generic, details only in logs (any non-`AppException` 5xx) |

Codes are defined in `src/common/errors/error-codes.ts`; detail codes come from the validator constraint
(`isInt` → `IS_INT`) unless the validator sets its own (`UNSUPPORTED_UNIT`, `BLANK`).

---

## 5. Domain rules & calculations

- **Unit registry** (`src/units/weight-units.ts`, `WEIGHT_UNITS`): `{ code, label, toKgFactor: '<decimal string>' }`.
  `kg = 1`, `lb = 0.45359237` (exact international pound). Everything derives from it: the `@IsWeightUnit()` DTO
  validator, the Swagger enum, conversion in and out (decimal.js). Adding stone = one line
  `{ code: 'st', label: 'stone', toKgFactor: '6.35029318' }`; a unit test builds a registry with stone to prove
  conversions need no other change.
- **Rounding**: `weight` is stored as entered; `weight_kg`, `volume_kg`, `e1rm_kg` are stored at 4 decimals and
  used to filter, sort and pick PRs. Values returned by the API are recomputed from the original `reps`, `weight`
  and `unit` with the same domain functions (`weightUnits`, `volumeKg`, `epleyOneRepMaxKg`) and rounded once, to
  2 decimals. Rounding the stored 4-decimal value again would round twice: 32 lb = 14.51495584 kg is stored as
  14.5150 and would be answered as 14.52 instead of 14.51.
- **Volume** = `reps × weight_kg`.
- **Epley** = `weight_kg × (1 + reps / 30)`, applied literally for all reps as the brief specifies (D3a). At reps = 1
  this gives 1.033 × weight although the usual convention assumes r > 1; documented in README with an example
  where it changes the PR ranking (100x1 -> 103.33 beats 96x2 -> 102.40).
- **Bodyweight sets** (`weight = 0`) are valid logs but never count as PRs (all metrics are 0); if a user only
  has bodyweight sets, records are `null` with a message.
- **PR tie-breaking** (decision D4): highest value, then more reps, then **earliest** date (the first time the
  record was achieved), then lowest set id (deterministic).
- **Name normalization**: trim, collapse internal whitespace, lower-case → `name_key`; aliases normalized the same way.
- **Unknown exercise** (D5): 400 `VALIDATION_ERROR`, detail code `UNKNOWN_EXERCISE` at `entries[i].exerciseName`,
  `suggestions` = up to 3 catalog names by trigram similarity. Bulk stays all-or-nothing.

## 6. Timezone strategy (E4)

- Store instants as `timestamptz` (UTC) plus the client's `utc_offset_minutes` at logging time.
- Calendar semantics (date-only filters, "this month", `localDate` in responses) are computed for the
  request's `tz` (IANA) with Luxon, then converted to UTC bounds for the query: `[startOfDay(from), startOfDay(to + 1 day))`.
- Trade-offs for README: a workout at 23:30 in Hanoi is "yesterday" in UTC — correct only if the client sends
  its tz; a user who travels will see buckets in the tz they query with; DST days are 23/25 h, handled by Luxon
  not by adding 24 h. Alternative considered: store a `local_date` column (stable buckets regardless of query tz)
  — rejected as primary because ranges across zones become ambiguous; `utc_offset_minutes` keeps it recoverable.
- Database sessions are pinned to `TimeZone=UTC` (`src/database/pg-adapter.ts`): `@prisma/adapter-pg` sends JS
  Dates without an offset, which Postgres reads in the session zone, so a non-UTC server default would shift every
  stored instant and query bound (found in the M5 review, C17; covered by an e2e test on a database whose
  default zone is Asia/Ho_Chi_Minh).

## 7. Concurrency (E5)

| Scenario | Handling |
|----------|----------|
| Same user logs same exercise at the same moment from two devices | Both are valid workout logs (append-only); both commit. No read-modify-write anywhere (PRs computed on read), so no lost updates |
| Two requests reference the same exercise | No write to the catalog at request time (closed list, D5), so no race there |
| Client retries / double-tap | `Idempotency-Key` (M4-B1): looked up first; otherwise the key row is inserted **last** in the same transaction. A concurrent duplicate does the work, blocks on the PK until the first commits, rolls back (no duplicate rows) and replays the stored response, or gets 409 if its body differs. Reserving the key first would avoid the wasted work but needs nullable response columns and a stuck-key timeout (scale-up option) |
| Different key, accidental duplicate content | Accepted (cannot distinguish from a real repeat set); documented |

Proven by integration tests that fire parallel requests (N=20) against real Postgres.

## 8. Performance (E6)

- Dataset (M7): `prisma/seed/perf-profile.json`, generated deterministically by `npm run seed:perf`: `perf-heavy`
  (50k entries / 225k sets, 30 exercises with skewed frequency, plus an old-only, a bodyweight-only, a plateau and a
  same-instant scenario), 50 background users × 2k entries, and optionally `perf-single` (50k entries of one
  exercise). 200k entries / 900k sets in total.
- Queries and the index each relies on (statement counts and plans: `docs/perf/plans/`):
  - History page: `(user_id, performed_at DESC, id DESC)` → `LIMIT limit+1` index scan with a row-comparison cursor,
    then one `entry_id IN (...)` query for sets (no N+1).
  - History by partial name or muscle group: catalog lookup → exercise ids → a `LATERAL` index scan per id on
    `(user_id, exercise_id, performed_at DESC, id DESC)` (M5-A).
  - PRs: covering composite index `(user_id, exercise_id, performed_at, weight_kg, reps, volume_kg, e1rm_kg, id)` →
    index-only scan of one user+exercise slice (or of the date range), top 50 candidates per metric (D10, C21).
  - M6 spike (2026-10-06, 200k sets per heavy user, random weights/reps, warm cache), ms per metric query:

    | Index | 50k entries / 30 exercises, all-time | same, one month | 50k entries / 1 exercise, all-time | same, one month |
    |-------|---:|---:|---:|---:|
    | without `id` (M2) — Bitmap scan + heap reads | 5.9–11.0 | 0.27 | 61–84 | 1.8–2.0 |
    | **with `id` (D10)** — Index Only Scan, 0 heap fetches | **2.6** | **0.13** | **55–63** | **1.9** |
    | D10 + metric-leading `(user, exercise, weight_kg DESC, reps DESC, performed_at, id)` | 0.03–0.07 | 0.6–0.9 | 0.03–0.1 | 16–21 |
- Evidence (M7): `docs/PERFORMANCE.md`. On `perf-heavy` every endpoint meets its target (p95 < 50 ms; max bulk
  POST < 1 s): history p95 ≤ 6.5 ms at any cursor depth, PRs p95 ≤ 32 ms (most-logged exercise, 53k sets), compare
  p95 12.8 ms, POST 1 entry 4.2 ms, 5,000-set bulk 336 ms.
- Known worst case: one user with 50k entries of a single exercise (`perf-single`, 213k sets) → PRs p95 80 ms (three
  index-only scans of the whole slice). Accepted by D10; scale path below.
- Tie overflow (M7-T5): when all 50 candidates tie on the top stored value, the follow-up query fetches every tied
  set without a LIMIT. 174 plateau ties: p95 7.4 ms; ≈ 66k identical sets: ≈ 0.5 s (review spike). Documented as a
  limit, not bounded; the bound would be `ORDER BY reps DESC, performed_at, id LIMIT n` on the tied value.
- Planner estimates (deferred from M6, decided in M7 as D13): the `user_id = ? AND exercise_id = ?` estimate is
  within 2.3× on the realistic multi-user dataset and no misestimate leads to a worse plan, so no extended
  statistics. (The review spike also showed `CREATE STATISTICS` does not change the single-user Seq Scan, whose
  estimate was already accurate.)
- Concurrency: the pg pool is not configured (default 10 connections) and a PR request runs 3 queries in parallel;
  20 PR requests in flight → p95 153 ms (queueing, no errors). Scale path: configurable pool, PgBouncer, replicas.
- Migration `pr_index_with_set_id` rebuilds the PR index without `CONCURRENTLY` (Prisma-generated), which blocks
  writes to `workout_sets` while it builds; fine here, a production rollout would build it concurrently first.
  At scale: per (user, exercise) PR summary table maintained in the write transaction, or monthly rollups.

## 9. Architecture

```
HTTP ─► Controller (DTO validation, mapping) ─► Service (rules, transactions) ─► Repository (Prisma client / TypedSQL)
                                                     │
                                         Domain (pure TS): units, metrics, time, cursor
```
Modules: `common` (errors, filter, pagination, request-id), `config`, `database` (PrismaService, transactions),
`units`, `exercises` (catalog + mapping sync), `workouts`, `records`, `health`.
Services, repositories and `PrismaService` are Nest providers. Not everything that varies is a DI token:
- Weight units: a module-level registry (`weightUnits`, built by `createWeightUnitRegistry(WEIGHT_UNITS)`), imported
  directly. The class-validator decorator `@IsWeightUnit()` and the Swagger enum are evaluated outside Nest's
  container, so a DI token would still need this static instance; one shared instance keeps a single source.
  Tests build other registries with `createWeightUnitRegistry`; `computeSetMetrics` takes one as a parameter.
- Exercise catalog: data in `prisma/seed/exercise-catalog.json`, loaded and validated by the seed CLI and synced to
  tables; services read the tables, not the file.
- Clock: `CLOCK` token (`src/common/time/clock.ts`) for "now" in period comparisons (M6).

## 10. Testing strategy

Unit (pure, fast, TDD): unit conversion (round trips, precision, unsupported unit, a registry built with stone),
volume & Epley (brief examples, reps = 1, weight 0), period boundaries (month
ends, leap Feb, DST in America/New_York, Asia/Ho_Chi_Minh), name normalization, cursor codec.

Integration (Testcontainers Postgres, real migrations, Supertest):
- POST: happy path bulk, normalization stored, validation matrix (table-driven: null date, missing offset,
  negative weight, reps 0, empty sets, unsupported unit, too many entries) with exact error paths,
  unknown exercise with suggestions, all-or-nothing rollback, idempotency replay + 409, 20 concurrent
  requests for the same user + exercise (all committed, no duplicates from retried keys).
- GET history: pagination continuity with identical timestamps (no duplicates / gaps), each filter, unit
  conversion, tz boundaries, empty result message, invalid cursor.
- PRs: fixture with known answers incl. ties and mixed units; range filter; compare month vs month incl.
  empty previous period.

Perf: `npm run seed:perf`, `npm run perf:plans` (auto_explain plans), `npm run perf:latency` (endpoint latency
against a running API); scripts, not part of the test suite (timings are machine-dependent). `docs/PERFORMANCE.md`.

## 11. Milestones & commits (stop for review after each)

| M | Scope | Est. (h) | Example commits |
|---|-------|----------|-----------------|
| M1 | Scaffold: Nest, strict TS, lint, config (zod), pino, error envelope + filter, health, Swagger, Dockerfile, compose | 3.5–4.5 | `chore: scaffold NestJS app`, `feat(common): structured error envelope`, `build: docker compose with postgres` |
| M2 | DB: Prisma schema, migrations (tables, indexes, pg_trgm), exercise catalog JSON (~50 exercises + aliases) + sync, Testcontainers harness | 3.5–5 | `feat(db): schema and indexes`, `feat(exercises): configurable muscle-group catalog` |
| M3 | Domain (TDD): units, metrics, time, cursor, normalization | 2 | `test(units): ...` then `feat(units): ...` |
| M4 | POST bulk + idempotency + concurrency tests | 4–5 | `feat(workouts): bulk logging`, `feat(workouts): idempotency key` |
| M5 | GET history + filters + keyset pagination (typed raw query) + unit output | 4.5–5.5 | `feat(workouts): history with keyset pagination` |
| M6 | PRs + compare | 4–5 | `feat(records): personal records`, `feat(records): period comparison` |
| M7 | Perf seed, EXPLAIN evidence, index tuning (revised in plan/M7: 4–4.75) | 1.5–2 | `feat(perf): seed:perf CLI`, `docs(perf): query plans and timings ...` |
| M8 | README (diagram, API, schema, trade-offs, 10k coaches), AI_WORKFLOW.md, review & refactor | 4–5 | `docs: ...` |
| — | Cross-milestone edge-case and integration test hardening | 4–5 | `test: ...` |
| — | Review, refactoring, buffer | 2–3 | `refactor: ...` |
| — | Video (recorded by you; I prepare a script outline) | 2–3 | — |

Milestone hours are a working breakdown and differ slightly by rounding. The authoritative estimate,
including its post-design revision (34–44 h, target ≈ 39 h), is `docs/ESTIMATION.md`.

Within each milestone: write tests first for domain logic → implement → `lint + typecheck + test` →
independent review (`/code-review` or `technical-leader`) → you review → commit(s). Corrections found in review
are separate commits and logged in AI_WORKFLOW.md.

## 12. AI workflow plan (deliverable)

- Rules file: `CLAUDE.md`; specialised subagent: `technical-leader`; plan-first (this document); TDD prompts with
  explicit expected values; small task scope per prompt; adversarial review before commit.
- `AI_WORKFLOW.md` sections: Tools & purposes · Prompting strategy · Corrections log (wrong/suboptimal) ·
  Rejected suggestions · Line-by-line explanation candidate (likely the keyset pagination query or the
  idempotency transaction).
- Only real events are logged. Candidate already observed (needs your OK to log): the AI's initial stack choice
  in CLAUDE.md (Prisma) was revised during this deeper analysis (D1).

## 13. Decisions

| ID | Decision | Status |
|----|----------|--------|
| D1 | Data access: Prisma 7.10.0 (pinned) + `@prisma/adapter-pg`; typed raw SQL for history keyset page and name suggestions | Approved (reviewer choice, verified by spike 13a) |
| D2 | `date` input: ISO-8601 datetime with offset, or date-only + `timezone`; datetime without offset -> 400 | Approved |
| D3 | Epley applied literally for all reps incl. reps = 1 (1.033 x w), as stated in the brief; deviation from the r > 1 convention documented in README | Approved (option a) |
| D4 | PR tie-break: value -> reps -> earliest date -> set id | Approved |
| D5 | Unknown exercise names are rejected; closed catalog from config JSON | Decided by reviewer |
| D6 | PRs computed on read with covering index; summary table = scale-up path | Approved |
| D7 | Stop for review after every milestone | Approved |
| D8 | Extras: Swagger only (no CI workflow, no extra endpoints by default) | Decided by reviewer |
| D9 | Read-only `GET /exercises?search=` | Rejected — catalog discoverable via Swagger docs + `UNKNOWN_EXERCISE` suggestions |
| D10 (M6-A) | PR index: covering index `(user_id, exercise_id, performed_at, weight_kg, reps, volume_kg, e1rm_kg, id)` (set `id` added as the last key column); no metric-leading indexes | Approved 2026-10-07. Reasons: (1) every column the PR query reads, including the `id` tie-break, is in the index, so it is an Index Only Scan with no heap reads, faster than before in every measured case; (2) range queries (and so every compare query) stay ≤ 2 ms because the index is ordered by date; metric-leading indexes made the planner walk metric order for ranged queries, 10× slower (16–21 ms vs 1.9 ms) on skewed data, and Prisma cannot hint indexes; (3) no extra indexes, so no extra write cost per logged set (metric indexes would add 3); (4) the slow case (≈ 60 ms per metric) needs 50k entries of ONE exercise, unrealistic; a realistic 50k-entry user takes ≈ 2.6 ms per metric. Scale path: per-(user, exercise) PR summary table for all-time records (D6), ranges stay on this index. Measurements: section 8 |
| D11 (M6-B/C/D) | PR endpoints: unknown exercise → 400 `UNKNOWN_EXERCISE` + suggestions; a period's record is the best set within that period; compare accepts `period` or four explicit bounds | Approved 2026-10-07 |
| D12 | POST rejects a workout `date` more than 24 h after the server's now (`DATE_IN_FUTURE`). Workouts are logged after they happen; 24 h covers UTC+14 and device clock skew. Found during M6 verification: a typo year (2099) became a permanent all-time PR, and no endpoint can remove it. Alternative rejected: keep accepting future dates and cap PR queries at now (the bad row would remain in history) | Approved 2026-10-08 |
| D13 (M7-C) | No extended statistics on `(user_id, exercise_id)`. Rule set before measuring: add them only if a row estimate is off by ≥ 10× **and** that makes the plan worse. Measured on the M7 dataset: the estimate is within 2.3×; the large ratios are a LIMIT stopping early or a tie query that stays an Index Only Scan. Had they been needed: a `--create-only` migration with hand-added SQL, as for the CHECK constraints (Prisma's diff ignores statistics objects) | Decided 2026-10-09 by the approved M7 rule |

## 13a. D1 spike results (Prisma 7.10.0 + @prisma/adapter-pg, Postgres 16, 2026-10-02)

| Check | Result |
|-------|--------|
| `pg_trgm` extension, GIN `gin_trgm_ops` index via `ops: raw(...)` | PASS (generated SQL correct; `postgresqlExtensions` still a preview flag) |
| DESC composite indexes, covering composite index (key columns) | PASS |
| Second `migrate dev` drift check | PASS ("Already in sync") |
| Bulk createMany in interactive transaction, rollback on failure | PASS |
| `contains` + `mode: insensitive` -> ILIKE, uses trigram index | PASS |
| Muscle group relation filter (`some`) | PASS |
| PR `findFirst` ordered by metric -> index-only scan, `Decimal` type | PASS |
| Idempotency `createMany({ skipDuplicates })` -> `ON CONFLICT DO NOTHING` | PASS |
| `similarity()` suggestions | PASS via parameterized `$queryRaw` |
| Native cursor pagination correctness (10 identical timestamps) | PASS |
| Native cursor pagination performance, page at depth 49,000 of 50k | 5.8 ms, "Rows Removed by Filter: 49000" (O(depth)); tuple keyset `(performed_at,id) < (...)` 0.056 ms; OFFSET 21.9 ms (seq scan) |

Consequence: with Prisma, the history page-id query uses TypedSQL/`$queryRaw` with a row comparison; everything else
uses the Prisma client. Nest integration via a `PrismaService` provider (official recipe, no Nest-maintained package).

## 14. Out of scope (stated in README)

Authentication/authorization, CI pipeline (tests run locally via npm scripts), editing/deleting entries, user profiles/preferences storage (unit/tz come per
request), rate limiting, caching layer, multi-region.
