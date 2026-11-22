---
name: catalogue-sync
description: Run, debug or extend Placarr background work — admin Catalogue Sync / Extract, metadata and price refresh, local indexes (LaunchBox, iCollect, No-Intro), and the Postgres job queue and workers. Use when jobs sit pending, a Sync fails or does not densify, a new job step or kind is needed, or data under data/<pack>/ looks stale.
---

# Catalogue Sync and background jobs

References: `docs/admin_surface.md` (admin vs CLI), `docs/data-layout.md`, `docs/catalogue_contract.md` (lifecycle, staging, autonomy), `docs/provider_supply_modes.md`. ADR-003 (SKIP LOCKED queue), ADR-017 (extract checkpoints), ADR-018 (refresh granularity).

## Model

- Product surface is **admin web + worker only** (Plex-like). `scripts/*.ts` and `tsx src/providers/<id>/…` CLIs are dev-only debug tools; never add an npm alias for a business ingest without an admin surface, and never tell the user to run a CLI to densify a corpus.
- Queue: Postgres table `BackgroundWorkJob`, claimed with `SKIP LOCKED` — kinds and pools in `src/core/collect/jobs/workQueue.ts`, execution in `workRunner.ts`, process `scripts/backgroundWorker.ts`.
  - Interactive pool (`pnpm worker`): `metadataRefresh`, `priceRefresh`, `catalogueExtract`, `apkStoreFetch`, `catalogProviderSync`.
  - Catalog pool (`pnpm worker:catalog`, `WORKER_KINDS=catalog`): `icollectCatalogSync`, `launchboxIndexSync`, `nointroIndexSync`, `catalogProviderSync`.
  - In dev, `pnpm dev` starts both through `scripts/superviseDevWorker.ts`, which restarts the child on crash or source change.
- Catalogue Sync = one job `catalogProviderSync` → `ProviderModule.catalog.refresh` (harvest + faces + embeddings), granular via `only` / `langs` / `limit`. Long extracts checkpoint into `payload.completedSteps`. Legacy `CATALOGUE_PACKS` / `catalogueExtract` still exist; the target is a single Sync path.
- Pack data under `data/<pack>/` (gitignored, re-derivable), served at `/assets/<pack>/…`; paths only through `src/lib/packPaths.ts`. Fetch only when the remote hash differs from the ledger; staging is transit and gets purged after promotion.
- `next.config.js` excludes `data/` from the webpack watcher so dumps do not thrash `next dev`. `data/` must never sit in a cloud-synced folder: Syncs rewrite hundreds of thousands of files.

## Debugging checklist

1. Jobs stuck `pending` → is a worker for that pool running? (`pnpm dev` output, `worker`/`catalog` prefixes). Byparr configured caps `WORKER_CONCURRENCY` to 3.
2. Read the job row (status, `lockedAt`/`lockedBy`, error, `payload.completedSteps`) and the admin Catalogue logs (`/api/admin/catalogue-logs`). Local logs also land under `logs/`.
3. Network failures → `src/lib/http/` (retry, per-host limiter, persisted circuit breaker in `data/http/circuits/`). A tripped circuit is intentional politeness; fix the cause, do not bypass the layer.
4. Re-run narrowly (`only` a step, one `lang`, small `limit`) from the admin rather than a full Sync.

## Rules for changes

- New step → inside the pack's `catalog.refresh` / `selectCatalogueSteps` (`--only` / `--skip` / `--offline` contract), not a new script.
- New job kind → add to `BACKGROUND_WORK_KIND` and the right pool list in `workQueue.ts`, with a `workQueue.test.ts` case.
- Growth of a living catalogue must not need code edits per set/card (`catalogLifecycle: living` auto-syncs when stale; `finished` packs never auto-sync).
