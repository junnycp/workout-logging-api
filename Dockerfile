# syntax=docker/dockerfile:1

FROM node:24.21.0-alpine AS base
WORKDIR /app

# All dependencies (dev included: Nest CLI, TypeScript, Prisma CLI).
# npm 11 blocks install scripts by default; the Prisma client is generated explicitly below.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# One-shot job run by docker compose before the API starts.
FROM deps AS migrate
COPY prisma ./prisma
COPY prisma.config.ts ./
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runtime
ENV NODE_ENV=production
# --omit=optional: @prisma/client lists the Prisma CLI and TypeScript as optional peers, which npm
# marks devOptional and would otherwise ship (~120 MB incl. PGlite) in the runtime image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health > /dev/null || exit 1
CMD ["node", "dist/main.js"]
