# syntax=docker.io/docker/dockerfile:1

# Node 26 like the development host. Not cosmetic: `next.config.js` imports a
# `.ts` module, which only loads on a runtime that strips types — on 22.16 the
# build died with `Unknown file extension ".ts"`.
FROM node:26-alpine AS base
# node 25 dropped corepack from the official images, so pnpm is installed
# explicitly, pinned to the version `packageManager` declares.
RUN npm i -g pnpm@9.14.2

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager.
# The schema and its config come along: `postinstall` runs `prisma generate`,
# which fails with "Could not find Prisma Schema" without them. A host install
# never noticed — the files are simply there.
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Config load only, no connection — the real URL arrives at runtime.
ENV DATABASE_URL="postgresql://placarr:placarr@localhost:5432/placarr"
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the prisma models (URL only needed for config load; no DB call)
ENV DATABASE_URL="postgresql://placarr:placarr@localhost:5432/placarr"
RUN npx prisma generate

ENV NODE_ENV=production
ENV NEXT_PRIVATE_STANDALONE=true
# Webpack worker OOMs at the Node 26 default ~4 GB heap on this app.
ENV NODE_OPTIONS=--max-old-space-size=16384

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

# `next build` collects page data, which imports `auth/config.ts`, which throws
# without a secret. Passed inline rather than as an `ENV`: it never lands in
# the image metadata (and does not trip `SecretsUsedInArgOrEnv`). The real
# secret arrives from the environment at start-up, where the throw stays the
# boot guard it is meant to be.
RUN \
  export NEXTAUTH_SECRET="build-only-placeholder-not-a-secret"; \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# All-in-one production image: Next + background workers (Plex-style).
FROM base AS runner
# `su-exec` lets the entrypoint fix volume ownership as root, then drop
# privileges before running anything that touches the network.
RUN apk add --no-cache libc6-compat su-exec
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# DATABASE_URL is provided at runtime (PostgreSQL) via compose/env.

# Full tree so tsx can run scripts/backgroundWorker.ts beside the standalone server.
# Ownership is set by the COPY itself: a separate `chown -R /app` walks
# node_modules (~900 packages) and rewrites the whole layer — a minute of build
# time and a duplicated layer for a result the copy gives away for free.
COPY --from=builder --chown=node:node /app /app

# Standalone Next expects static + public next to server.js.
RUN mkdir -p .next/standalone/.next \
  && cp -R .next/static .next/standalone/.next/static \
  && cp -R public .next/standalone/public

# Mount points only — they are empty here, so this is not recursive in practice.
# Runtime bytes live under /app/data (uploads, foil, indexes); never public/.
RUN mkdir -p /app/data /app/prisma \
  && chown node:node /app/data /app/prisma

COPY --chown=node:node init.sh /app/init.sh
RUN chmod +x /app/init.sh

EXPOSE 3000

CMD ["/app/init.sh"]
