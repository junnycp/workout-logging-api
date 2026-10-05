import { defineConfig } from 'prisma/config';

// DATABASE_URL comes from the environment (shell or docker compose). It is optional here because
// `prisma generate` (e.g. during the Docker build) does not need a database; migrate commands do.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
