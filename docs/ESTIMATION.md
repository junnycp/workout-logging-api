# Time Estimate

Estimated before implementation started (2026-10-02). Actuals will be filled in at the end for comparison.

| # | Work item | Estimate (h) | Actual (h) |
|---|-----------|--------------|------------|
| 1 | Project setup: NestJS, Docker Compose, Prisma, config validation, structured logging, global error filter, lint | 3 – 4 | |
| 2 | Schema, migrations, indexes, seed (muscle-group mapping + 50k-entry performance dataset) | 3 – 4 | |
| 3 | Unit conversion module (registry-based) + unit tests | 1 – 1.5 | |
| 4 | `POST` bulk workout logging: validation, transaction, idempotency, concurrent writes | 4 – 5 | |
| 5 | `GET` workout history: partial name match, date range, muscle group, unit conversion, timezone, cursor pagination | 4 – 5 | |
| 6 | Personal records (max weight, max volume, Epley 1RM, dates) + period comparison | 4 – 5 | |
| 7 | Integration and edge-case tests (incl. concurrent bulk writes) | 4 – 5 | |
| 8 | Performance check with `EXPLAIN ANALYZE` on the 50k dataset, index tuning | 1.5 – 2 | |
| 9 | README: architecture diagram, setup, API docs, schema rationale, trade-offs, scaling | 3 | |
| 10 | AI_WORKFLOW.md (logged continuously, finalized at the end) | 1 – 1.5 | |
| 11 | Review, refactoring, buffer | 2 – 3 | |
| 12 | Video walkthrough preparation and recording (15–20 min) | 2 – 3 | |
| | **Total** | **33 – 43 (target ≈ 38 h, ~5 working days)** | |

## Assumptions

- PostgreSQL + NestJS + Prisma, as recorded in `CLAUDE.md`.
- AI-assisted development (Claude Code) throughout; time for reviewing and correcting AI output is included in each item.
- Main risks to the estimate: timezone/DST edge cases in period comparison, and concurrency tests against a real database.

## Revision after design (2026-10-05)

The table above is kept unchanged as the pre-start estimate. After the design was approved
(`docs/DESIGN.md`), these items changed:

| # | Work item | Original (h) | Revised (h) | Reason |
|---|-----------|--------------|-------------|--------|
| 1 | Project setup | 3 – 4 | 3.5 – 4.5 | Prisma 7 needs a driver adapter and `prisma.config.ts`; Swagger confirmed in scope |
| 2 | Schema, migrations, seed | 3 – 4 | 3.5 – 5 | Closed exercise catalog (~50 exercises with aliases) and an idempotent sync script (D5) |
| 4 | `POST` bulk logging | 4 – 5 | 4 – 5 | `UNKNOWN_EXERCISE` suggestions added; exercise auto-create race no longer needed (net zero) |
| 5 | `GET` history | 4 – 5 | 4.5 – 5.5 | Prisma's native cursor is O(depth); keyset page needs a typed raw query |
| 3, 6–12 | All other items | 18.5 – 24 | 18.5 – 24 | Unchanged (CI and a catalog endpoint were dropped, but neither was in the original estimate) |
| | **Total** | **32.5 – 42** (see note) | **34 – 44 (target ≈ 39 h, ~5 working days)** | |

Note: the original table's total row says 33 – 43, but its rows add up to 32.5 – 42 (a summing error in the
pre-start estimate, found while revising; the original table is left as written).

Not in the original estimate: the analysis and planning phase (requirement breakdown, decisions D1–D9, Prisma
spike, environment setup) carried out 2026-10-02 to 2026-10-05.

## Revision for M7 (2026-10-08)

Item 8 (performance check) was re-estimated in the M7 plan from 1.5 – 2 h to **4 – 4.75 h**: M5 and M6 moved the
formal evidence (reproducible seed, cold cache, `docs/PERFORMANCE.md`) and the extended-statistics question into
M7, and the review of the plan added plan capture via `auto_explain`, a separate-process latency run and the
worst-case user. Actual time is filled in at the end with the other items.

| Phase | Estimate (h) | Actual (h) |
|-------|--------------|------------|
| Analysis & planning | — (not estimated) | ≈ 4 |
