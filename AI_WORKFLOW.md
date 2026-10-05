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
- **Commit:** pushed range `a68da97..044d005`; rule added in the commit that follows this entry.

### C6 — Arithmetic errors in the time estimate (2026-10-05, estimation)
- **AI output:** The pre-start estimate's total row said 33–43 h while its rows sum to 32.5–42 h. The post-design
  revision then listed "all other items" as 22.5–29 h (correct: 18.5–24 h) and a total of 34.5–45 h.
- **How detected:** Before pushing, the AI recomputed every row with a script instead of trusting its own sums.
- **Outcome:** Revision corrected to 34–44 h (target ≈ 39 h); the original table is kept as written, with a note
  about its summing error. Lesson: compute totals with code, not by hand.
- **Commit:** correction committed separately after `53aa1eb`.

### C7 — Outdated stack versions written from memory (2026-10-05, M1 planning)
- **AI output:** The `CLAUDE.md` written on 2026-10-02 specified "Node.js 20 LTS" and "NestJS 11" without checking
  current releases.
- **How detected:** Planning M1, the AI checked npm and nodejs.org: Node 20 has been end-of-life since spring 2026,
  NestJS 12 was released on 2026-08-27, and TypeScript 7 (npm `latest`) is outside the peer ranges of Swagger and
  typescript-eslint.
- **Outcome:** Node 24.21.0, NestJS 12 (CommonJS), TypeScript 6.0 pinned; recorded in
  `docs/adr/0001-runtime-versions.md` and `CLAUDE.md`. Lesson: check versions against the registry before
  scaffolding, the same way library capabilities were checked in C1.
- **Commit:** the ADR commit at the start of branch `m1`.

### C8 — Incomplete assumption about Jest with NestJS 12 (2026-10-05, M1 scaffold)
- **AI output:** The M1 plan and ADR 0001 stated that Jest can load NestJS 12's ESM-only packages on Node >= 24.9
  (taken from the NestJS migration guide; the Jest docs say no flag is needed).
- **How detected:** The first DI smoke test failed on Node 24.21 with "Must use import to load ES Module". The AI
  read `jest-runtime`'s source: `require(esm)` is only enabled when `vm.SourceTextModule` exists, which Node exposes
  only with `--experimental-vm-modules`. Verified by running the test with and without the flag.
- **Outcome:** `npm test` / `npm run test:e2e` run Jest through Node with `--experimental-vm-modules`; documented in
  ADR 0001. Lesson: when docs and behaviour disagree, read the source and prove it with a minimal test.
- **Commit:** `chore: scaffold NestJS 12 app ...` on branch `m1`.

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
- **Commit:** `feat(common): global exception filter and error envelope` on branch `m1`.

## 4. Rejected AI suggestions

| Date | Decision | AI suggested | I decided | Reason |
|------|----------|--------------|-----------|--------|
| 2026-10-02 | D5 Unknown exercise names | Auto-create catalog entries on first use | Reject unknown names; closed catalog in config | Keep scope controlled: auto-creating catalog entries could cause unexpected issues or regressions |
| 2026-10-02 | D8 Extras | GitHub Actions CI + catalog read endpoints + Swagger | Swagger only | Keep scope controlled; avoid over-engineering |
| 2026-10-02 | D9 Catalog endpoint | `GET /exercises?search=` so clients can discover valid names | Rejected | Keep scope controlled; avoid over-engineering |
| 2026-10-05 | D3 Epley at reps = 1 | Special-case reps = 1 → e1RM = weight (convention r > 1) | Apply the brief's formula literally for all reps | Respect the brief: the formula is explicitly specified |
| 2026-10-05 | D1 Data access | Drizzle via `@nestjs/drizzle` | Prisma (verified by spike, C1) | Prior experience with Prisma; spike showed it covers the brief |

## 5. AI-generated code explained line by line

_To be chosen after implementation (candidates: keyset pagination query, idempotent bulk-insert transaction)._
