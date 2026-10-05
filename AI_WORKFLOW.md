# AI Workflow

How AI was used to build this project, including where it was wrong and what was rejected.
Entries are added as events happen (not reconstructed at the end). Dates are local (UTC+7).

## 1. Tools and purposes

| Tool | Used for |
|------|----------|
| Claude Code (Claude Opus 5.5, VS Code extension) | Requirement analysis, architecture/plan drafting, verification spikes, environment setup, implementation, tests, documentation |
| `technical-leader` subagent (`.claude/agents/technical-leader.md`) | Senior-engineer persona for design decisions, TDD implementation and diff review |
| Official docs fetched by the agent (code.claude.com, docs.nestjs.com, prisma.io, orm.drizzle.team, PostgreSQL, Wikipedia for the 1RM definition) | Grounding claims instead of relying on model memory |

## 2. Prompting strategy

- **Rules file first.** Before any code, `CLAUDE.md` was written from Anthropic's official guidance (kept short,
  concrete and verifiable) with the stack, domain rules, API conventions, testing and git rules, and an explicit
  rule to log AI mistakes here honestly.
- **Specialised subagent.** A `technical-leader` agent with an explicit workflow (understand → plan → test first →
  small steps → verify with real output → self-review) and a review checklist tied to the brief's edge cases.
- **Plan before code, human approval per decision.** The brief was broken into traceable requirement IDs
  (R1.1…R3.5, E1–E6, X1–X2). Every open design question became a numbered decision (D1–D9) that I approved,
  changed or rejected before implementation.
- **"Verify, don't assert."** When a claim mattered (e.g. "can Prisma do this?"), I asked the AI to prove it with a
  runnable spike against a real Postgres instead of answering from memory.
- **Small scopes.** Work is split into milestones (M1–M8) with a stop for my review after each one.

## 3. Corrections log (AI output that was wrong or suboptimal)

### C1 — Unverified claim about Prisma's index support (2026-10-02, planning, D1)
- **AI output:** While revising the stack, the AI recommended replacing Prisma with Kysely, stating that Prisma had
  "no native support for trigram GIN ops or `INCLUDE` covering indexes" and that most core queries would end up as
  `$queryRaw` anyway.
- **How detected:** I said I wanted to keep Prisma and asked the AI to verify whether it actually covers the brief.
  The AI built a throwaway Prisma 7.10 schema and ran migrations and queries against Postgres 16.
- **Finding:** Trigram GIN (`ops: raw("gin_trgm_ops")`), DESC composite indexes, transactions, `ON CONFLICT DO
  NOTHING`, relation filters and `Decimal` all worked; the migration drift check was clean. Only `INCLUDE` is
  unsupported (prisma/prisma#8584), and a composite index with the same columns as key columns gives the same
  index-only scan. The claim was overstated.
- **Outcome:** Kept Prisma. Only two typed raw queries are needed (see C3 for one of them).
- **Commit:** n/a (planning phase; reflected in `CLAUDE.md` stack section).

### C2 — Recommendation made without checking current framework integrations (2026-10-02, planning, D1)
- **AI output:** Recommended Kysely as the query layer.
- **How detected:** I asked why NestJS needs Prisma/Kysely at all. While answering from the official NestJS docs,
  the AI found that NestJS now maintains an official `@nestjs/drizzle` package, which it had not checked before
  recommending Kysely (which has no official Nest integration).
- **Outcome:** Recommendation changed to Drizzle, then superseded by my decision to keep Prisma after C1's spike.
  Lesson: integration claims about fast-moving libraries must be checked against current docs.
- **Commit:** n/a (planning phase).

### C3 — Prisma native cursor pagination degrades with page depth (2026-10-02, planning spike)
- **AI output:** The initial plan assumed cursor pagination would be fine with any client.
- **How detected:** The spike logged the SQL Prisma generates for `cursor` + `skip: 1` (an `OR` with three
  sub-selects) and measured it on 50,000 entries for one user: at depth 49,000 the query took 5.8 ms with
  "Rows Removed by Filter: 49000"; a tuple keyset `(performed_at, id) < (...)` took 0.056 ms; `OFFSET` 21.9 ms.
- **Outcome:** The history page query is a typed raw query with a row comparison; everything else uses the client.
- **Commit:** n/a (planning phase).

### C4 — Install failure hidden by the AI's own shell pipeline (2026-10-02, environment setup)
- **AI output:** The AI installed Docker Desktop with `brew install --cask docker-desktop 2>&1 | tail -20`. The
  pipeline reported exit code 0 because `tail` succeeded, and the truncated log hid the actual error.
- **How detected:** The AI checked for `/Applications/Docker.app`, found nothing, re-ran without the pipe and
  captured the real exit code (1): the cask needs `sudo`, which cannot be entered non-interactively.
- **Outcome:** After I chose the option, Colima + Docker CLI + Compose were installed instead (no sudo needed).
- **Commit:** n/a (local environment).

### C5 — Pushed to GitHub without being asked (2026-10-05, repository workflow)
- **AI output:** I approved three documentation commits. The AI made them, added a fourth small fix commit, and
  then ran `git push` on its own.
- **How detected:** The AI's own report stated the push; I had approved commits only, not a push.
- **Outcome:** No harm (private repo, correct account), but the rule was tightened: `CLAUDE.md` now states that
  commit approval is not push approval and pushes need an explicit request. Also stored in the agent's memory.
- **Commit:** pushed range `a68da97..044d005`; rule added in `f5efa4a`.

### C6 — Arithmetic errors in the time estimate (2026-10-05, estimation)
- **AI output:** The pre-start estimate's total row said 33–43 h while its rows sum to 32.5–42 h. The post-design
  revision then listed "all other items" as 22.5–29 h (correct: 18.5–24 h) and a total of 34.5–45 h.
- **How detected:** Before pushing, the AI recomputed every row with a script instead of trusting its own sums.
- **Outcome:** Revision corrected to 34–44 h (target ≈ 39 h); the original table is kept as written, with a note
  about its summing error. Lesson: compute totals with code, not by hand.
- **Commit:** `c84cb62` (correction of `53aa1eb`).

### C7 — Outdated stack versions written from memory (2026-10-05, M1 planning)
- **AI output:** The `CLAUDE.md` written on 2026-10-02 specified "Node.js 20 LTS" and "NestJS 11" without checking
  current releases.
- **How detected:** Planning M1, the AI checked npm and nodejs.org: Node 20 has been end-of-life since spring 2026,
  NestJS 12 was released on 2026-08-27, and TypeScript 7 (npm `latest`) is outside the peer ranges of Swagger and
  typescript-eslint.
- **Outcome:** Node 24.21.0, NestJS 12 (CommonJS), TypeScript 6.0 pinned; recorded in
  `docs/adr/0001-runtime-versions.md` and `CLAUDE.md`. Lesson: check versions against the registry before
  scaffolding, the same way library capabilities were checked in C1.
- **Commit:** `cee5cef` (ADR + CLAUDE.md stack update).

### C8 — Incomplete assumption about Jest with NestJS 12 (2026-10-05, M1 scaffold)
- **AI output:** The M1 plan and ADR 0001 stated that Jest can load NestJS 12's ESM-only packages on Node >= 24.9
  (taken from the NestJS migration guide; the Jest docs say no flag is needed).
- **How detected:** The first DI smoke test failed on Node 24.21 with "Must use import to load ES Module". The AI
  read `jest-runtime`'s source: `require(esm)` is only enabled when `vm.SourceTextModule` exists, which Node exposes
  only with `--experimental-vm-modules`. Verified by running the test with and without the flag.
- **Outcome:** `npm test` / `npm run test:e2e` run Jest through Node with `--experimental-vm-modules`; documented in
  ADR 0001. Lesson: when docs and behaviour disagree, read the source and prove it with a minimal test.
- **Commit:** `8100d7d`.

### C9 — Unit test encoded a wrong assumption about Nest's error pipeline (2026-10-05, M1 error envelope)
- **AI output:** The first exception filter handled raw body-parser errors (`type: 'entity.parse.failed'`), and its
  unit test fed such an error directly to the filter, so the test passed.
- **How detected:** Calling the running app with curl returned `BAD_REQUEST` instead of `MALFORMED_JSON`, and
  `requestId: null`. Reading `@nestjs/platform-express` showed `mapException()` converts every `SyntaxError` into a
  plain `BadRequestException(message)` before filters run, dropping `type`. The null id came from the body parser
  running before the pino middleware.
- **Outcome:** A dedicated Express error middleware right after the JSON parser maps parser errors to
  `AppException` (unit-tested), and a request-id middleware runs before the parser. Verified again with curl.
  Lesson: unit tests with hand-made inputs only prove what you assumed; a live or e2e check is needed at framework
  boundaries.
- **Commit:** `3816cb5`.

### C10 — Error envelope did not cover routes outside the API prefix (2026-10-05, M1 health)
- **AI output:** Commit `3816cb5` claimed every error used the envelope, but `GET /foo` still returned Express' HTML
  404 page. While adding `/health`, the AI also wrote a comment saying the raw DB error "stays in the logs" when
  nothing logged it.
- **How detected:** Live curl checks of paths outside `/api/v1`; reading `@nestjs/core` showed the 404 handler is
  only registered under the global prefix. Re-reading its own diff caught the false comment.
- **Outcome:** A not-found fallback registered after `app.init()` renders the envelope for any unmatched route, a
  shared `errorBody()` keeps one shape, and the health controller now really logs failing dependencies.
- **Commit:** `7308300` (fallback + `errorBody()`), `e820565` (health logs failing dependencies).

### C11 — Committed a health endpoint that broke application startup (2026-10-05, M1 health)
- **AI output:** Commit `e820565` injected the logger with `@InjectPinoLogger(HealthController.name)`. The AI ran
  lint, typecheck and build (all green) but committed before reading the result of its live check, which was
  `[000]`: the app no longer started.
- **How detected:** The AI noticed the `[000]` right after committing, and the log showed Nest could not resolve
  the logger. `@InjectPinoLogger` providers are only created for classes decorated *before*
  `LoggerModule.forRootAsync()` is evaluated; the exception filter worked only because its import sorted earlier.
- **Outcome:** Both classes now inject `PinoLogger` directly and call `setContext()` (no import-order dependency).
  Fixed in a separate commit rather than rewriting history. Lesson: static checks do not prove the app boots;
  the e2e boot test planned for M1 is the safety net, and live-check results must be read before committing.
- **Commit:** `e27decb` (fix of `e820565`).

### C12 — Gaps found by the independent review of M1 (2026-10-05, M1 review)
- **AI output:** The M1 branch passed lint, typecheck, 30 unit and 8 e2e tests and a clean-clone
  `docker compose up`.
- **How detected:** A fresh `technical-leader` subagent reviewed `main..m1` without the implementation context
  and reproduced each issue against a running app:
  1. Body-parser errors other than invalid JSON / too large (e.g. `Content-Encoding: foo`) returned
     **500 INTERNAL_ERROR** and were logged as unhandled — reproduced again by the main session before fixing.
  2. Requests rejected before Nest routing (malformed JSON, 413, unknown routes outside `/api/v1`) produced
     **no access-log line**, although the client received a `requestId` to quote.
  3. (optional) A 5xx `HttpException` leaked its message and was not logged.
  4. (optional) Config wiring (`ConfigModule.forRoot` + schema) was untested.
- **Outcome:** All four fixed with tests first: every 4xx body-parser error keeps its status, 5xx messages are
  hidden and logged, one pino-http instance is mounted before the body parser and shared with nestjs-pino
  (`useExisting`), and a wiring test (which revealed that `forRoot()` is async in Nest 12). Not changed: the
  reviewer's suggestion to add codes for 409/422 — services only throw `AppException` with explicit codes.
- **Commit:** `5f677d4` (items 1, 3), `ae990ba` (item 2), `e6fc159` (item 4).

### C13 — Catalog validation and sync gaps found by the M2 review (2026-10-05, M2 review)
- **AI output:** The catalog parser and sync passed 52 unit and 16 integration tests.
- **How detected:** The independent `technical-leader` review reproduced each issue with a throwaway spec:
  1. (must-fix) duplicate exercise names passed validation because collisions were tracked by display name;
     the seed would then fail with a raw P2002 instead of a readable catalog error;
  2. exercises removed from the catalog still resolved by name, so they could still be logged (breaks D5);
  3. NFKC could expand a valid name beyond the 100-character key column.
- **Outcome:** Fixed with failing tests first. Not done, deliberately: a stable catalog key to survive
  renames (design change, raised with the reviewer) and a composite FK to keep the copied set columns equal
  to their entry (deferred to M4 as an integration assertion, to avoid an extra index on a 50k-row table).
- **Commit:** `94f0518`.

### C14 — Date parsing gaps, a silent spec deviation and a self-inflicted bug (2026-10-05, M3)
- **AI output:** M3 time helpers passed 126 unit tests.
- **How detected:** The independent `technical-leader` review probed the compiled functions:
  1. (must-fix) offsets such as `+07:99` were accepted (Luxon shifts the instant silently);
  2. (must-fix) `periodRanges` returned the *full* current period although the approved DESIGN and plan say
     "current period **to date**" — the AI had changed the rule while implementing without telling the
     reviewer; future-dated logs would have counted as "this month";
  3. invalid zones produced `null` dates instead of errors; `T24:00`, year 0000 and lower-case `t`/`z` were
     accepted; upper-case UUIDs in cursors were not normalized.
  While applying these fixes, the AI's own scripted edit left a stray `return fail('INVALID_DATE')` before the
  success path, rejecting every datetime; the unit tests caught it immediately. Separately, the reviewer's
  suggestion to canonicalize zone names via Intl was adjusted: ICU would rename `Asia/Ho_Chi_Minh` to the
  legacy `Asia/Saigon`, so valid names are kept as given and only UTC spellings are normalized.
- **Outcome:** All fixed test-first; `allowUnreachableCode: false` added to `tsconfig.json` so `tsc` rejects
  unreachable code like that stray return. Lesson: an approved spec is changed by asking, not by implementing.
- **Commit:** `1e1fa6a`.

### C15 — A 500 on tiny weights and three smaller M4 issues (2026-10-05, M4)
- **AI output:** M4 passed 145 unit and 54 e2e tests, including a 20-way concurrency suite.
- **How detected:**
  1. (must-fix, independent review with a live probe) `"weight": 1e-7` returned **500**: class-validator's
     `maxDecimalPlaces` splits `toString()` on ".", and exponent forms have none, so it throws;
  2. (review) if the key was reported taken but could not be re-read, the service would have returned a 201
     for rolled-back rows — impossible today (keys are never deleted) but one retention job away;
  3. (review) the interactive transaction held a pool connection while blocked on a concurrent key;
  4. (self, before implementing) a hand-computed expected volume in the e2e spec was wrong (671.3169 vs
     671.3167); all expected decimals were then recomputed with Python's `decimal`;
  5. (self) the concurrency test compared replayed bodies as strings; JSONB reorders object keys, so equal
     content looked different. Verified the JSONB behaviour, then compared canonical JSON instead.
- **Outcome:** custom `@MaxDecimalPlaces` using decimal.js (e2e cases `1e-7`, `-1e-7`, `1.0005`), the repository
  returns the stored response together with "key taken", batch (array) transaction, DESIGN note that idempotency
  matching is strict (a case-only change of `exerciseName` is a different body → 409).
- **Commit:** `7d44589`.

## 4. Rejected AI suggestions

| Date | Decision | AI suggested | I decided | Reason |
|------|----------|--------------|-----------|--------|
| 2026-10-02 | D5 Unknown exercise names | Auto-create catalog entries on first use | Reject unknown names; closed catalog in config | Keep scope controlled: auto-creating catalog entries could cause unexpected issues or regressions |
| 2026-10-02 | D8 Extras | GitHub Actions CI + catalog read endpoints + Swagger | Swagger only | Keep scope controlled; avoid over-engineering |
| 2026-10-02 | D9 Catalog endpoint | `GET /exercises?search=` so clients can discover valid names | Rejected | Keep scope controlled; avoid over-engineering |
| 2026-10-05 | D3 Epley at reps = 1 | Special-case reps = 1 → e1RM = weight (convention r > 1) | Apply the brief's formula literally for all reps | Respect the brief: the formula is explicitly specified |
| 2026-10-05 | D1 Data access | Drizzle via `@nestjs/drizzle` | Prisma (verified by spike, C1) | Prior experience with Prisma; spike showed it covers the brief |
| 2026-10-05 | Pre-M5 check, finding F2 | Expose the weight-unit registry as a Nest provider (`WEIGHT_UNIT_REGISTRY`) because DESIGN listed that token and DI is graded | Keep the static registry; correct DESIGN instead | X1 is already met by one registry entry; the DTO validator cannot use DI anyway, so a token would add a second access path to the same object |

## 5. AI-generated code explained line by line

_To be chosen after implementation (candidates: keyset pagination query, idempotent bulk-insert transaction)._
