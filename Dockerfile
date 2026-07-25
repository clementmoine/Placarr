# syntax=docker.io/docker/dockerfile:1

FROM node:22.16.0-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
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

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# All-in-one production image: Next + background workers (Plex-style).
FROM base AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# DATABASE_URL is provided at runtime (PostgreSQL) via compose/env.

# Full tree so tsx can run scripts/backgroundWorker.ts beside the standalone server.
COPY --from=builder /app /app

# Standalone Next expects static + public next to server.js.
RUN mkdir -p .next/standalone/.next \
  && cp -R .next/static .next/standalone/.next/static \
  && cp -R public .next/standalone/public

RUN mkdir -p /config /app/public/uploads /app/.cache /app/prisma

COPY init.sh /app/init.sh
RUN chmod +x /app/init.sh

EXPOSE 3000

CMD ["/app/init.sh"]
