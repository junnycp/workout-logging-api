# ADR 0001 — Runtime and toolchain versions

- Status: accepted (2026-10-05)
- Context: `CLAUDE.md` (written 2026-10-02) specified Node.js 20 LTS and NestJS 11. Checked against npm,
  nodejs.org and the NestJS v12 migration guide before scaffolding:
  - Node.js 20 is end-of-life (last release 20.20.2 on 2026-03-24). Active LTS is 24 ("Krypton", 24.21.0).
  - NestJS 12 (12.0.0 on 2026-08-27, now 12.1.2) is current. Its packages are ESM-only, but CommonJS applications
    keep working via `require(esm)`. Its CLI needs Node >= 24.15; Jest can load the ESM-only packages on Node >= 24.9.
  - TypeScript `latest` is 7.0.2, but `@nestjs/swagger` 12 peers `typescript ^5.5 || ^6.0` and `typescript-eslint`
    peers `<6.1.0`.
  - Every library we need has a Nest 12 compatible release (`nestjs-pino` 5.3, `@nestjs/terminus` 12,
    `@nestjs/config` 12, `@nestjs/swagger` 12).

## Decision

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | 24.21.0 | `.nvmrc`, `engines`, `node:24-alpine` image |
| NestJS | 12.x, CommonJS app | Keeps Jest and the conventions in `CLAUDE.md`; ESM + Vitest (Nest 12's new default) rejected to avoid ESM import-path and decorator-metadata pitfalls for no functional gain here |
| TypeScript | 6.0.x (exact minor pinned) | Upgrade to 7 once Swagger and typescript-eslint support it |
| Lint | ESLint + typescript-eslint (type-aware) | Oxlint (Nest 12 default) rejected: fewer type-aware rules such as `no-floating-promises` |
| Prisma | 7.10.0 (unchanged) | npm `latest` points to an 8.0 RC |
| PostgreSQL | 16 (unchanged) | |

## Consequences

- Contributors need Node 24 (`nvm use`). Node 22 would also run the app but not the Nest CLI or Jest with v12.
- If a Nest 12 incompatibility appears, fall back to Nest 11 with a new ADR.
