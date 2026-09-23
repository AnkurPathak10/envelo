# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/socket-server

FROM base AS install

COPY socket-server/package.json socket-server/package-lock.json ./
RUN npm ci

FROM install AS build

WORKDIR /app

# The socket-specific Prisma client is generated from the authoritative backend
# schema, so this Dockerfile must be built with the repository root as context.
COPY backend/prisma/schema.prisma backend/prisma/schema.prisma
COPY socket-server/tsconfig.json socket-server/tsconfig.json
COPY socket-server/src socket-server/src
COPY socket-server/scripts/copy-generated-client.cjs socket-server/scripts/copy-generated-client.cjs

WORKDIR /app/socket-server
# Client generation only needs syntactically valid datasource URLs; real Render
# credentials remain runtime-only and are never copied or exposed to this build.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    DATABASE_URL_UNPOOLED=postgresql://build:build@localhost:5432/build \
    npm run build
RUN npm prune --omit=dev

FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app/socket-server

COPY --from=build --chown=node:node /app/socket-server/node_modules ./node_modules
COPY --from=build --chown=node:node /app/socket-server/dist ./dist

USER node

EXPOSE ${PORT}

CMD ["node", "dist/index.js"]
