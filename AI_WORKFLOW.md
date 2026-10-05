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

## 4. Rejected AI suggestions

| Date | Decision | AI suggested | I decided | Reason |
|------|----------|--------------|-----------|--------|
| 2026-10-02 | D5 Unknown exercise names | Auto-create catalog entries on first use | Reject unknown names; closed catalog in config | _to be filled in by me_ |
| 2026-10-02 | D8 Extras | GitHub Actions CI + catalog read endpoints + Swagger | Swagger only | _to be filled in by me_ |
| 2026-10-02 | D9 Catalog endpoint | `GET /exercises?search=` so clients can discover valid names | Rejected | _to be filled in by me_ |
| 2026-10-05 | D3 Epley at reps = 1 | Special-case reps = 1 → e1RM = weight (convention r > 1) | Apply the brief's formula literally for all reps | _to be filled in by me_ |
| 2026-10-05 | D1 Data access | Drizzle via `@nestjs/drizzle` | Prisma (verified by spike, C1) | Prior experience with Prisma; spike showed it covers the brief |

## 5. AI-generated code explained line by line

_To be chosen after implementation (candidates: keyset pagination query, idempotent bulk-insert transaction)._
