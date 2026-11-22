# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Placarr is a personal, mobile-first collection manager (books, comics/manga, video games, films, music, TCG, board games, toys): Next.js 16 (App Router) + TypeScript 7 + Prisma 7 / PostgreSQL, ~70 metadata/price providers, and a foil rendering engine for trading cards. Browsing is public, writes need the admin. Docs, comments, ADRs and commit bodies are mostly in **French** — keep new docs in French.

## Commands

Package manager is **pnpm** (pinned in `packageManager`).

```bash
docker compose up -d db          # Postgres on 127.0.0.1:5432 (+ db-backup service)
pnpm prisma migrate deploy       # apply migrations
pnpm prisma db seed              # owner account (first run only)
pnpm dev                         # Next (turbopack) + interactive worker + catalog worker
pnpm dev:app                     # Next only
pnpm build                       # prisma generate + next build --webpack (16 GB heap)

pnpm lint                        # eslint . (flat config; no `next lint` in Next 16)
pnpm format:check                # prettier (pnpm format to write)
pnpm exec tsc --noEmit           # typecheck (no script for it)

pnpm test                                        # vitest run (all)
pnpm vitest run path/to/file.test.ts             # one file
pnpm vitest run path/to/file.test.ts -t "name"   # one test
```

- Tests sit next to sources (`src/**/*.test.ts`) plus `tests/` and `scripts/`. `@` aliases `src/`, `server-only` is stubbed. `maxWorkers: 4` is deliberate (Postgres pool limits).
- Prisma client is generated into `src/generated/prisma` (never edit; `postinstall` regenerates).
- `eslint-ts6-alias.cjs` must stay the first import of `eslint.config.mjs` (typescript-eslint needs the TS 6 API; `tsc`/`next build` use TS 7).
- Preview server: `.claude/launch.json` → `placarr-dev` (`pnpm dev`, port 3000). `next.config.js` sets `agentRules: false` so Next does not write its own AGENTS.md/CLAUDE.md.
- `.env` (copy of `.env.example`): only `DATABASE_URL` and `NEXTAUTH_SECRET` are mandatory; a missing provider key just marks that provider `blocked`.

## Skills (`.claude/skills/`)

| Skill | Use for |
| ----- | ------- |
| `add-provider` | New or under-exploited metadata / price / retailer source |
| `add-tcg-line` | New card game line, growing a pack's sets / cards / faces / sealed |
| `foil-finish` | Foil CSS/WebGL, effect packs, new upstream finish |
| `barcode-regression` | Wrong scan result, golden-master tests, recording fixtures |
| `catalogue-sync` | Admin Sync / Extract, job queue, workers, stale `data/` |
| `source-research` | Probing a site, archive or app before writing code |
| `db-ops` | Prisma migrations, backups, restores, Docker volumes |
| `write-adr` | Recording or checking an architecture decision |

Folder-scoped rules load automatically from `src/core/CLAUDE.md`, `src/providers/CLAUDE.md`, `src/effects/CLAUDE.md`.

## Architecture

Reading path (`ARCHITECTURE.md`): `src/core/schemas/content-types.ts` (item contract, persisted in `prisma/schema.prisma`) → `src/types/providerRegistry.ts` + `src/types/providerModule.ts` (provider contract) → `src/providers/shared/defineProvider.ts` (factory) → `src/core/catalog/registry.ts` (every provider registered here) → a minimal provider (`src/providers/bedetheque/`, or `src/providers/naruto/narutoranks/` for a local TCG line).

- **`src/core/`** — source-blind business logic in five pillars: `identify` (barcode / `printKey` → what is it; cards use `printKey`, ADR-001), `enrich` (multi-provider consensus, covers, titles, persistence), `collect` (item lifecycle, background jobs), `commerce` (prices, retailer URLs), `catalog` (registry, `MatchContext`) — plus `locale`, `render` (foil), `schemas`.
- **`src/providers/<id>/`** — declarative `ProviderModule`: `info` (capabilities, supplyMode, auth) + optional hooks (metadata, price, print catalogue, local corpus). The provider declares, the core decides. Shared factories in `providers/shared/`.
- **`MatchContext`** — one shared bag (barcodes, titles, aliases, external ids…) that every provider reads and writes; what one provider finds, all others reuse.
- **`src/effects/`** foil packs per game; **`src/lib/`** infra (`http/` with retry + persisted circuit breaker + Byparr, `db/prisma.ts`, `admin/`, `client/` hooks and scan, `unity/`).
- **Background jobs** — separate worker process (`scripts/backgroundWorker.ts`), Postgres queue `BackgroundWorkJob` with `SKIP LOCKED` (ADR-003), kinds in `core/collect/jobs/workQueue.ts`.
- **Catalogue** — admin Sync → job `catalogProviderSync` → `ProviderModule.catalog.refresh`. Admin web + worker is the only product surface; `scripts/` are dev-only.
- **Data** — `data/<pack>/` is gitignored and re-derivable, served at `/assets/<pack>/…` via `src/lib/packPaths.ts`; hand-assembled data lives in committed `src/providers/<id>/curated/` (ADR-006).
- **App** — routes in `src/app/` (admin under `app/admin/`, APIs in `app/api/`); `src/proxy.ts` is the middleware (next-auth, admin gating, `/_next/image` host allowlist). i18n: `src/messages/{en,fr}.json` through `useLocale()` (`TRANSLATIONS.md`) — add every key to both files.

## Working rules

- **No hardcoding, data first.** Providers are plug-and-play; the core never names a source, game or host (guard tests in `src/effects/blindnessGuard.test.ts`, `src/lib/guards/`). No per-provider weights, no app-global word lists, no `providerId === …` branches — extend the declarative contract instead. Keep it simple: the smallest change that fits the existing contract.
- **TDD, zero regression.** Write or extend the failing test first, run the targeted file, then `pnpm test` before calling work done. Never weaken, skip or allowlist a guard or contract test to get green; if one fails, the change is wrong or the contract needs an ADR.
- **Barcode golden rule**: an honest empty result is fine, a confident false positive is not. Changing matching/resolution ⇒ bump `BARCODE_CACHE_VERSION` (`src/core/identify/titleUtils.ts`).
- **Provenance everywhere**: each fact carries provider + date + confidence + an openable deep link (or its Wayback copy, never a homepage). Unattested values stay `null` — never fill numbers from guesses or another AI's suggestions.
- **One way to do a thing**: HTTP via `src/lib/http/` (bare `fetch`/`axios` are lint errors in providers), data paths via `src/lib/packPaths.ts`, jobs via `workQueue.ts`.
- `@typescript-eslint/no-explicit-any` and `no-unused-vars` are errors (`_` prefix for intentionally unused).
- Read `docs/ADR.md` before structural refactors; add an ADR after deciding (`write-adr` skill).
- Commits: Conventional Commits with a scope — `fix(dbsfw): …`, `feat(identify): …`, `docs: …`.

## Environment traps

- The working copy lives in `~/Documents/Projets/Placarr`, **outside** any cloud-synced folder. In Nov 2026 a Synology Drive sync of the whole project (including the constantly rewritten `data/`) crawled for days, then wiped most tracked files and `.git`. Never move the repo, `data/` or the Postgres volume back into a synced folder; GitHub is the code backup, dumps are the DB backup. `.env` is local-only (keep a copy in a password manager).
- If tracked files suddenly vanish or `git` reports no commits, stop writing and tell the user — recover from GitHub, never by "fixing" files one by one.
- Live Postgres is the Docker volume `placarr-db`; dumps go to `./backups/postgres/`. Never run `docker compose down -v`, volume removal/prunes or a forced restore without a fresh `pnpm db:backup` and the user's OK (`db-ops` skill, `docs/database.md`).
- `data/` holds ~120 GB of runtime data: never `rm -rf` it or a pack folder; prefer narrow re-Syncs.

## Docs

`docs/README.md` indexes the living docs; `docs/archive/` is history, not a runbook. `docs/backlog.md` + `docs/backlog/` hold open work (dated). When a session learns something durable about a source or a contract, update the matching doc in `docs/` rather than leaving it in chat.
