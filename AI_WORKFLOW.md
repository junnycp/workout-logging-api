# AI Workflow

How AI was used to build this project, including where it was wrong and what was rejected.
Entries are added as events happen (not reconstructed at the end). Dates are local (UTC+7).

**Summary**
- **Tools.** Claude Code (Claude Opus 5.5) wrote nearly all code, tests and docs. A `technical-leader` subagent
  reviewed each milestone independently, and from M7 on each plan too. I approved the design decisions (D1–D13)
  before they were implemented.
- **Strategy.** A rules file (`CLAUDE.md`), then plans with numbered decisions before code. Spikes on a real
  Postgres decided questions instead of model memory. Tests came first for the domain logic, correction commits are
  separate, and an independent review ran before every merge. §2 shows how the rules changed after mistakes.
- **27 corrections** where AI output was wrong or suboptimal (§3). The most instructive:
  - C17: stored instants were shifted by the database session time zone.
  - C21: PRs were ranked on rounded values.
  - C22: future-dated logs became permanent PRs.
  - C24: performance claims were not backed by committed evidence.
  - C26: personal data was written to the access logs.
- **7 rejected suggestions** (§4), e.g. auto-creating unknown exercises, and special-casing Epley at 1 rep against
  the brief.
- **Line-by-line explanation** of one AI-written piece: the keyset history query (§5).

**Contents:** [1. Tools](#1-tools-and-purposes) · [2. Prompting strategy](#2-prompting-strategy) ·
[3. Corrections log](#3-corrections-log-ai-output-that-was-wrong-or-suboptimal) ·
[4. Rejected suggestions](#4-rejected-ai-suggestions) · [5. Code explained line by line](#5-ai-generated-code-explained-line-by-line)

## 1. Tools and purposes

| Tool | Used for |
|------|----------|
| Claude Code (Claude Opus 5.5, VS Code extension) | Requirement analysis, architecture/plan drafting, verification spikes, environment setup, implementation, tests, documentation |
| `technical-leader` subagent (`.claude/agents/technical-leader.md`) | Senior-engineer persona for design decisions, TDD implementation and diff review |
| Official docs fetched by the agent (code.claude.com, docs.nestjs.com, prisma.io, orm.drizzle.team, PostgreSQL, Wikipedia for the 1RM definition) | Grounding claims instead of relying on model memory |
| Fresh `technical-leader` review agents | One per plan and per milestone, plus a final whole-repository review (M8): read-only, they ran spikes on throwaway databases and reported findings that I then had fixed (C12, C13, C17, C21, C23–C27) |
| Spikes run by the agent (Testcontainers, a scratch Postgres, `auto_explain`, `EXPLAIN ANALYZE`) | Settling technical questions with measurements: Prisma capabilities (D1), pagination cost (C3), index choice (D10), performance evidence (M7) |

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

**How the rules changed.** Rules in place from day one (`a68da97`, 2026-10-02): plan first, tests first for domain
logic, independent review before committing, correction commits kept separate, every AI mistake logged here.
Later changes to `CLAUDE.md`, each from its git history:

| Commit | Date | Rule added or changed | Trigger |
|---|---|---|---|
| `2041534` | 10-05 | Approved design decisions written into the rules: exactly two raw SQL queries; the unit column is plain varchar and the registry is the single source | Design approval (D1, X1) |
| `f5efa4a` | 10-05 | Never push without an explicit request; approval to commit is not approval to push | C5 |
| `cee5cef` | 10-05 | Stack versions pinned with an ADR (Node 24, NestJS 12, TypeScript 6.0) | C7 |
| `3352513` | 10-05 | One branch per milestone, merged with `--no-ff`, tagged `mN-done` | Making milestone boundaries visible in the history |
| `28e7f17` | 10-05 | Response values are recomputed from the original weight and rounded once | C16 |
| `fade932` | 10-08 | Dates more than 24 h in the future are rejected (D12) | C22 |
| `b9780db` | 10-09 | Every number in a document comes from a committed artifact or is marked as command output; hand-added migration SQL clarified | C24 |

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

### C16 — A proposed rounding fix that would have introduced double rounding (2026-10-05, pre-M5 check)
- **AI output:** The pre-M5 verification found that POST rounds `weightKg` from the exact conversion while the
  planned history endpoint would round the stored 4-decimal `weight_kg`, so the two could differ by 0.01
  (`0.496 lb` → 0.22 vs 0.23). The AI proposed making POST read the stored value too, and I approved it.
- **How detected:** By the AI, before implementing: while searching for a realistic weight for the test, it
  compared both results with the exact value. The proposed fix makes the endpoints agree on the wrong
  number: 32 lb = 14.51495584 kg → 14.51 correctly, but 14.5150 (stored) → 14.52. It stopped and asked again.
- **Outcome:** I chose the alternative: POST stays as it is (it was correct). Responses are always recomputed
  from the original `reps`/`weight`/`unit` with the domain functions and rounded once; stored kg columns only
  filter, sort and select PRs. Rule added to DESIGN §5 and CLAUDE.md; an e2e test pins 32 lb → 14.51.
- **Commit:** `28e7f17`.

### C17 — Stored instants shifted by the database session time zone (2026-10-05, M5 review)
- **AI output:** The M1 `PrismaService` created the pg adapter with only a connection string. M4 (writes) and the
  M5 history query (range bounds, cursor) passed JS `Date`s through it. All 153 unit and 85 e2e tests passed,
  and real query plans on 50k entries looked right.
- **How detected:** The independent `technical-leader` review of M5 read the `@prisma/adapter-pg` source:
  `formatDateTime` sends Dates as `"YYYY-MM-DD HH:MM:SS"` with no offset, which Postgres reads in the session
  time zone. The tests passed only because the Postgres image defaults to UTC. Reproduced before fixing: on a
  server started with `timezone=Asia/Ho_Chi_Minh`, POST `10:00Z` was stored as `03:00Z`, while the API still
  returned `10:00Z` because reads shifted back the same way. So the bug was invisible through the API. The
  review also said it affected only M5 queries; the repro showed it had been in the write path since M4.
- **Outcome:** One adapter factory (`createPgAdapter`) pins `TimeZone=UTC` for the app, the seed CLI and the test
  helpers. Test first: an e2e test on a database whose default zone is Asia/Ho_Chi_Minh checks the stored
  instant in SQL and a GET by exact instant. DESIGN §6 records the rule.
- **Commit:** `7a800e9` (test), `e62f55e` (fix).

### C18 — Smaller M5 review findings (2026-10-05, M5 review)
- **AI output:** M5 history (`10ecfff`).
- **How detected:** Same review. (1) `muscleGroup=Chest` returned 400 although exercise names are matched
  case-insensitively. (2) Grouping sets copied the array for each set (quadratic). (3) A type cast would have
  returned `exercise: undefined` if the FK invariant ever broke. (4) DESIGN §4.2 still described the pre-M5
  contract. One finding was a false positive: "LIKE escaping is only unit-tested". The e2e spec already
  checks that `%` and `_` return an empty page.
- **Outcome:** (1) Test first, then trim + lower-case the code. (2) Push into the existing list. (3) Throw an
  explicit error. (4) Rewrote DESIGN §4.2, including the cost bound of the LATERAL query as a trade-off.
- **Commit:** `13db533` (test), `c2df428` (fix), `3ea2379` (docs).

### C19 — Swagger listed Idempotency-Key as a required header (2026-10-06, M4 API docs)
- **AI output:** M4 controller with `@ApiHeader({ name: 'Idempotency-Key', required: false })` while the handler
  reads `@Headers('idempotency-key')`. `@nestjs/swagger` documents that parameter as well, marked required.
  The names differed only in case, so the spec contained two headers. The existing OpenAPI test only checked
  that the path existed.
- **How detected:** I tried POST in Swagger UI and asked why a required `idempotency-key` header was needed.
  `/docs-json` showed both entries. The API itself never required the header: a POST without it returned 201.
- **Outcome:** Test first: the spec must contain exactly one Idempotency-Key header, optional. Then gave
  `@ApiHeader` the same lower-case name, so Swagger merges the two and keeps the description.
- **Commit:** `dc2041a` (test), `7069ab0` (fix).

### C20 — "Index-only PR scans" that were never index-only (2026-10-06, M6 analysis)
- **AI output:** The approved design (DESIGN §3/§8, built in M2) described the covering index
  `(user_id, exercise_id, performed_at, weight_kg, reps, volume_kg, e1rm_kg)` as giving "index-only PR scans".
  The M2 review notes said the `id` tie-break would only need "a heap fetch at LIMIT 1, acceptable". The planning
  spike in §13a had checked a PR query without the full D4 tie-break.
- **How detected:** By the AI while analysing M6, before writing any PR code. It ran the real PR query
  (metric, reps, earliest date, set id; `LIMIT 1`) on a 200k-set user. The plan was a Bitmap Index Scan plus a
  heap read for every set of the user and exercise, not one heap read: 6–11 ms per metric for a realistic
  50k-entry user, 61–84 ms in the worst case.
- **Outcome:** Measured three options and explained them to me. I chose to add `id` as the last key column
  (D10, reasons in DESIGN): Index Only Scan, 0 heap fetches, 2.6 ms. Rejected metric-leading indexes: they
  made ranged queries 10× slower and cost 3 extra index writes per set. New migration; the applied one was not
  edited.
- **Commit:** `3c4e906` (decision), `9d44084` (test), `980f7f6` (migration).

### C21 — Records ranked on rounded values, and an "improved" that contradicted the delta (2026-10-07, M6 review)
- **AI output:** The M6 repository ordered each record by the 4-decimal stored kg, then reps, date and id (`bfced62`).
  Its comment claimed rounding "can only create ties". The delta reported `improved` from exact values while
  showing `absolute` rounded. 23 e2e and 12 unit tests passed.
- **How detected:** The independent `technical-leader` review searched lb weights and found a pair:
  20.051 lb × 10 = 9.09498 kg and 9.095 kg × 5 are both stored as 9.0950. The tie then went to more reps, so
  the lighter set won (9.09 instead of 9.10), which breaks D4. Confirmed with a failing e2e test before
  fixing. The same review found `{absolute: 0, improved: true}` for 100 lb against 45.359 kg, and noted that the
  response bounds and messages differed from plan/M6.md.
- **Outcome:**
  - Each record now reads the top 50 stored candidates in the same Index Only Scan, keeps the sets tied on
    the highest stored value, and settles them with a pure `pickRecord` on exact values. If all 50 tie, a
    second query fetches every tie. Tested in unit tests and two e2e cases, one with 51 ties.
  - `improved` = rounded `absolute > 0`.
  - The plan's contract was replaced by the implemented one (inclusive UTC bounds), documented in DESIGN
    4.3/4.4.
  - Also from the review: compare queries its two periods one after the other.
  - Deferred to M7: the planner's row estimate for correlated `user_id/exercise_id`.
- **Commit:** `3291c0a`, `8ae7e6d` (tests), `fc3c5ef`, `581a55f` (fix), `db11226` (51-tie test), `43f3e37` +
  `793fbb2` (improved), `570195d` (docs).

### C22 — Future-dated workouts accepted, so a typo could become a permanent PR (2026-10-08, M6 verification)
- **AI output:** M3/M4 date parsing accepted any year from 1900 to 2100 and had no upper bound relative to
  now. The M6 records endpoints, built on top of it, counted every stored set.
- **How detected:** I asked the AI to wipe the database and verify the whole M6 script itself. All 40 scripted
  checks passed. The AI then probed cases outside the script: POST `500 kg` dated `2099-01-01` → 201, and the
  all-time `maxWeight` became 500 with `localDate 2099-01-01`. No endpoint can remove that row.
- **Outcome:** I chose to reject dates more than 24 h after the server's now on POST (`DATE_IN_FUTURE`, D12)
  rather than capping PR queries. Tests first: unit (24 h boundary, UTC+14) and e2e (year typo, date-only 48 h
  ahead, 23 h accepted, 25 h rejected). One global `CLOCK` provider now serves POST and compare.
- **Commit:** `5b98ad7`, `1769845` (helper), `9bedcc8` (e2e tests), `98b72f1` (POST rule), `fade932` (docs).

### C23 — M7 plan: wrong measurement method, incomplete query inventory, unbounded tie query missed (2026-10-08, M7 analysis)
- **AI output:** The first M7 plan (performance evidence) had five problems:
  - It captured Prisma's SQL and re-ran `EXPLAIN ANALYZE` on it.
  - It measured latency from inside the same process that serves the API.
  - It listed the lookup helpers as one query each.
  - It assumed the perf seed takes about 1 minute.
  - It would have added extended statistics whenever a PR query used a Seq Scan.
  It also generated ids with `uuidv7()` and dates relative to now, while claiming the dataset was deterministic.
- **How detected:** I asked for a review before approving the plan. The `technical-leader` subagent ran spikes on
  a throwaway database:
  - Query events stringify every parameter into one JSON array (the `uuid[]` type is lost), and re-running
    inserts under EXPLAIN ANALYZE would write rows.
  - Prisma 7.10 runs a nested relation `select` as a separate statement.
  - The tie-overflow query in records has no LIMIT: 66,668 tied sets took 73 ms plus 412 ms to load.
  - The seed ran at about 8.9k rows/s.
  - On a single-user table the planner chose a Seq Scan with an accurate estimate, and `CREATE STATISTICS` did
    not change it.
- **Outcome:** Plan rev. 2:
  - Plans are now captured with `auto_explain` notices on a dedicated pool, calling the real services.
  - Latency is measured against a separately running API.
  - The query inventory is corrected, and a "plateau" scenario plus task T5 cover the unbounded tie query.
  - Ids come from the seeded PRNG and dates from a fixed anchor.
  - Statistics are added only on a misestimate of 10× or more that makes the plan worse.
- **Commit:** `faf6580` (this entry). The plan itself is git-ignored; the implementation follows rev. 2
  (`46bc352` … `682db8c`).

### C24 — M7 implementation: plan deviation, uncommitted evidence and overstated claims (2026-10-09, M7 review)
- **AI output:** The first M7 implementation and its write-up had these problems:
  - **It did not follow the approved plan.** M7-A said `perf-single` is measured on its own. The AI seeded it with
    the main dataset and measured everything with it in the table. The seed also never deleted optional users, so
    a plain re-seed could not remove it.
  - **It quoted numbers from a run that was never committed.** The D13 estimates (39,476 / 49,256) came from an
    earlier run whose output was overwritten. "Within 2.3×" was false for committed plans (P4 3.6×, P6 689 vs 0).
  - **It reported targets selectively.** A cold read statement at 84 ms, over the 50 ms DB target set in the plan,
    was marked ✅. "Two unused indexes" was actually six. The bulk POST was described as two statements; the plan
    shows five.
  - **Test and fixture problems.** The parser fixture called "a real notice" had been edited. One test could not
    fail: "independent of other users" generated the same spec twice.
  - **Code defects.**
    - Set ids within an entry were random, while the API's ascend with the set number.
    - Every Bitmap Index Scan was counted as a big-table scan.
    - Scenarios were hard-coded beside the profile and only checked HTTP status.
    - POST scenarios ran before the `perf-single` ones.
    - `idx_scan` was read before backends flushed their statistics.
  - Earlier in the same milestone, the raw plan of the max bulk POST was 2 MB because all ~60,000 bind
    parameters were printed (`e7119ab`).
- **How detected:** The independent `technical-leader` review of the branch. It checked every number in
  PERFORMANCE.md against `docs/perf/`, grepped the committed files for the quoted estimates, re-parsed all 282 scan
  lines of the raw plans, and counted `perf-single` rows in the database.
- **Outcome:**
  - Each defect was fixed test-first in its own commit: the seed deletes every profile user, set ids ascend,
    bitmap scans are attributed to their table, a real fixture is used plus edge cases, and a golden fingerprint
    plus an independence test that can fail.
  - The scripts were fixed: scenarios come from the profile and assert their content, writes run last, `--only`
    is added, and statistics are flushed before reading.
  - Everything was re-measured as approved: the main dataset (cold, warm, latency), then `perf-single` alone.
  - PERFORMANCE.md and DESIGN were rewritten from committed numbers only. The targets are copied verbatim, with the
    cold miss stated (61 ms).
  - New rule followed from here on: a number in a document must come from a committed artifact or be marked as
    command output.
  A second review of the fixes found three more slips in the rewritten documents, now fixed:
  - "Within 1.2×" was still false (the plateau scan is 3.5×).
  - The index bloat from re-seeding was not disclosed (the PR figures are about 30 % pessimistic).
  - Two figures were off by one or too wide.
- **Commit:** `e7119ab`, `cba660d` + `7bf43ae`, `9da8126` + `3cbb15e`, `5799a36`, `b28a09f` + `89741e7`,
  `2e38219`, `d275043`, `05c2552`, `fa59066`, `bee73b0`, `cb67d57`.

### C25 — M8 plan: invented causes, unsourced numbers and a fix aimed at the wrong query (2026-10-09, M8 analysis)
- **AI output:** The first M8 plan had four problems:
  - **Invented causes for two prompting rules.** It said "independent review before every merge" and "separate
    correction commits" came in after C12. Both were already in the first CLAUDE.md (`a68da97`, 2026-10-02),
    three days before C12.
  - **Numbers with no committed source.** It quoted 458 ms (20 concurrent PR requests) and "0.05 ms vs 76 ms" (keyset
    vs OFFSET). Both came from that day's re-run, whose output was never committed. The committed figure is 491 ms.
  - **An unsupported gate figure.** It described the M7 verification as "52/52 pass" without saying where that came
    from. It was the assertion count of an uncommitted runner script.
  - **A fix aimed at the wrong query.** It proposed skipping empty `IN (...)` queries in `resolve`. That `IN (NULL)`
    is Prisma's second query for a nested relation; it runs when the first query finds nothing, not when the input
    list is empty.
- **How detected:** I asked for a review of the plan before approving it. The `technical-leader` subagent:
  - read `git show a68da97:CLAUDE.md` and `git log -p CLAUDE.md`;
  - grepped the committed docs for the quoted numbers;
  - read the plan of statement 2 in `docs/perf/plans/warm/P8-records-unknown-name.txt`.
- **Outcome:** Plan rev. 2:
  - The prompting-strategy history is built only from the CLAUDE.md git log, with a hash for every rule.
  - Only committed figures are used, or a figure is marked as command output.
  - The runner is kept locally as `plan/m7-run.sh` (`plan/` is git-ignored).
  - The `resolve` change is dropped.
- **Commit:** none yet (plan stage).

### C26 — Final whole-repo review: personal data in access logs and seven smaller defects (2026-10-09, M8 review)
- **AI output:** Code written in earlier milestones that passed every test and every per-milestone review:
  - **Personal data in the access log.** M1 relied on pino-http's default request serializer and redacted only
    `authorization` and `cookie`. Every access line still held the client IP, user agent, X-Forwarded-For and
    Idempotency-Key, against the CLAUDE.md "no PII in logs" rule.
  - **Misleading errors for non-JSON bodies.** A text or form body came back as "entries should not be null or
    undefined" instead of 415.
  - **A wrong comment on the PR query.** It claimed the index scan reads "the top 50"; it reads the whole
    (user, exercise) slice.
  - **Detail codes scattered across files.** Thirteen detail codes were string literals in a dozen files, although
    CLAUDE.md says codes live in `error-codes.ts`.
  - **A repository named as a service.** `ExerciseLookupService` queried Prisma directly, breaking the
    service/repository layering.
  - **Incomplete OpenAPI.** POST did not document 413 and 415, and no route documented 500.
  - **A port clash.** `docker compose up` failed on machines where 5432 or 3000 was already taken.
  - **An undocumented catalog.** D9 rejected a catalog endpoint because the valid names would be documented, but
    they were only in the seed JSON.
- **How detected:** For M8 I asked for a timeboxed review of the whole repository, not a diff, by the
  `technical-leader` subagent.
  - It read `pino-std-serializers` to see what the default serializer logs; I confirmed this on a container log
    line.
  - It inferred the 415 gap from the parser setup; I confirmed it with curl.
- **Outcome:** Each fix in its own commit, test first where behaviour changed:
  - Access logs keep only the request id, method and URL.
  - A body that is not JSON gets 415; a request without a body is still validated.
  - OpenAPI documents 413, 415 and 500.
  - The comment now describes what the scan really does.
  - A `DetailCode` list was added, and the repository was renamed.
  - The compose host ports can be overridden.
  - The catalog is published in `docs/CATALOG.md`, with a sync test.
  - Findings outside the M8 scope are listed as follow-ups in the README.
- **Commit:** `a0682b8` + `14a4a22` (logging), `36fd5f4` + `065d905` (415), `1d1a619` + `775c2e2` (OpenAPI),
  `cf32708`, `50ed9f0`, `d3b2526`, `2eaa34a`, `77223f2`.

### C27 — M8 documents and tests that claimed more than they showed (2026-10-09, M8 review)
- **AI output:** The first M8 drafts had these problems:
  - **A wrong capacity formula.** The README estimated throughput as concurrency ÷ p50 of the latency batches. The
    batches are closed loops that last as long as their slowest request, so history came out ~2.5× too high
    (675 instead of ~260 requests/s).
  - **Inaccurate examples.**
    - A validation paragraph referred to problems its example did not contain.
    - A compare example showed explicit-bounds output under a `period` description.
  - **Two tests weaker than their commit messages claimed.**
    - The catalog sync test ignored the muscle columns.
    - The access-log test checked the serializer but not that the logger used it.
  - **Overstated wording.**
    - The OpenAPI descriptions claimed to list every detail code.
    - C26 described fewer findings than the branch fixed.
- **How detected:** The independent `technical-leader` review of the M8 branch.
  - It checked every number, hash and test name in the new documents against the repository.
  - It compared the README with the live API and `/docs-json`.
  - It read `perf-latency.ts` to see how the batches are measured.
- **Outcome:**
  - The estimate now uses 20 ÷ the slowest latency, with the per-coach request rate as a labelled assumption.
  - The examples were corrected.
  - The tests were strengthened. Each was shown to fail on the drift it guards against: editing a muscle in
    `CATALOG.md`, or removing the serializer.
  - The wording was fixed.
- **Commit:** `8ce2c3b`, `a355dc0`, `b26a428`, `afc9419`, and this entry.

## 4. Rejected AI suggestions

| Date | Decision | AI suggested | I decided | Reason |
|------|----------|--------------|-----------|--------|
| 2026-10-02 | D5 Unknown exercise names | Auto-create catalog entries on first use | Reject unknown names; closed catalog in config | Keep scope controlled: auto-creating catalog entries could cause unexpected issues or regressions |
| 2026-10-02 | D8 Extras | GitHub Actions CI + catalog read endpoints + Swagger | Swagger only | Keep scope controlled; avoid over-engineering |
| 2026-10-02 | D9 Catalog endpoint | `GET /exercises?search=` so clients can discover valid names | Rejected | Keep scope controlled; avoid over-engineering |
| 2026-10-05 | D3 Epley at reps = 1 | Special-case reps = 1 → e1RM = weight (convention r > 1) | Apply the brief's formula literally for all reps | Respect the brief: the formula is explicitly specified |
| 2026-10-05 | D1 Data access | Drizzle via `@nestjs/drizzle` | Prisma (verified by spike, C1) | Prior experience with Prisma; spike showed it covers the brief |
| 2026-10-05 | Pre-M5 check, finding F2 | Expose the weight-unit registry as a Nest provider (`WEIGHT_UNIT_REGISTRY`) because DESIGN listed that token and DI is graded | Keep the static registry; correct DESIGN instead | X1 is already met by one registry entry; the DTO validator cannot use DI anyway, so a token would add a second access path to the same object |
| 2026-10-08 | M6 verification | Enable `stopAtFirstError` in the global ValidationPipe so a missing field reports one detail instead of several (`IS_DEFINED, BLANK, MAX_LENGTH, IS_STRING`) | Keep reporting every failed constraint | Reason not recorded |

## 5. AI-generated code explained line by line

**Piece:** `WorkoutHistoryRepository.findPage` in
[src/workouts/workout-history.repository.ts](src/workouts/workout-history.repository.ts), lines 45–79. It was written
by the AI in `10ecfff` (M5). Every commit in this repository carries the Claude co-author trailer; this piece's
history is `10ecfff`, plus the session fix in `e62f55e` (C17) that it depends on.

**What it does.** It returns one page of a user's workout entries, newest first. It continues after a cursor,
optionally limited to a date range and to a set of exercises. Sets and exercise details are loaded afterwards by two
more queries, never per row.

**Why raw SQL.** Prisma's own cursor pagination skips to the cursor row with `OFFSET`-like work. At depth 49,000 it
took 5.8 ms ("Rows Removed by Filter: 49000"), against 0.056 ms for a row-comparison keyset (C3, DESIGN §13a).
`CLAUDE.md` allows exactly two typed raw queries; this is one of them.

| Lines | Code | Why |
|---|---|---|
| 46 | ``conditions = [Prisma.sql`e.user_id = ${query.userId}`]`` | Every condition is a `Prisma.sql` fragment, so values are bind parameters (`$1`), never string-concatenated. The list starts with the user, the leading column of both history indexes |
| 47–50 | `e.performed_at >= ${gte}::timestamptz`, `< ${lt}` | The date range as a half-open UTC interval `[gte, lt)`, already resolved from `from`/`to`/`tz` by the service. The adapter sends JS Dates without an offset, so they are read correctly only because the session is pinned to UTC. C17: on a server whose default zone was Asia/Ho_Chi_Minh, `10:00Z` was stored as `03:00Z` and bounds were read 7 hours off. Reads shifted back the same way, so the API looked right and every test passed |
| 51–54 | `(e.performed_at, e.id) < (${query.after.performedAt}::timestamptz, ${query.after.id}::uuid)` | The keyset cursor. A **row comparison** continues strictly after the last row of the previous page in `(performed_at DESC, id DESC)` order. `id` breaks ties between entries with the same instant, so no entry is skipped or repeated. Postgres uses it as an index condition, so the scan starts at the cursor: the cost is the page size, not the depth |
| 56–57 | `columns` | Only the four columns the service needs, aliased to camelCase for the TypeScript row type |
| 59–65 | No exercise filter | Served by `(user_id, performed_at DESC, id DESC)` and stopped by `LIMIT ${take}`: usually an Index Scan in index order; for a deep cursor the planner may pick a Bitmap scan of the same index plus a sort of the ~20 matching rows (`docs/perf/plans/warm/H2-history-deep-cursor.txt`), which reads the same few rows. The service passes `take = limit + 1`: an extra row means `hasMore` (`workout-history.service.ts` lines 47–49) without a `COUNT(*)` |
| 67–69 | `unnest(${exerciseIds}::uuid[]) AS x(exercise_id)` | With a name or muscle-group filter, the service has already resolved the exercise ids (and returned an empty page itself when there are none, so the array is never empty here). `unnest` turns the array parameter into rows: one per exercise |
| 70–76 | `CROSS JOIN LATERAL (… WHERE e.exercise_id = x.exercise_id AND <conditions> … LIMIT ${take})` | For **each** exercise, the newest `take` matching rows from `(user_id, exercise_id, performed_at DESC, id DESC)`. The user, range and cursor conditions are repeated **inside** each subquery so every per-exercise scan starts at the cursor and stops after `take` rows (decision M5-A). The rejected alternative, `exercise_id = ANY(…)` on the user index, walked the user's whole timeline and skipped about 21k rows when the exercise was only logged long ago |
| 77–78 | `ORDER BY p."performedAt" DESC, p.id DESC LIMIT ${take}` | Merges the per-exercise lists: at most `ids × take` rows are sorted, and the newest `take` win. The outer order must repeat the inner one exactly, or the cursor of the next page would not match |

**Pinned by tests:**
- `workouts-history.e2e-spec.ts`: "serves every entry exactly once across pages, even when many share one instant"
  (25 entries at one instant over pages of 10); the same through the `LATERAL` path and with a date range plus
  `unit=lb`; "covers all 25 hours of a DST fall-back day".
- `session-timezone.e2e-spec.ts`: exact instants on a database whose default zone is not UTC (C17).
- `docs/perf/plans/warm/H2-history-deep-cursor.txt`: the plan of a page at depth 49k reads about 20 index rows.
