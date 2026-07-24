# Scrape yield & call efficiency

> **STATUS 2026-07-24.** Companion to multi-provider latency work.
> Phase 1 (PriceCharting) shipped; durable evidence + cost tiers = next.

## Principle

We are not a single-catalog app (Plex/TMDB). Many providers run **in parallel by cost tier**, but **every network response must be fully mined** before another GET:

1. **SearchYield** — list/search/soft-404 pages: titles, thumbs, price snippets, **real** detail paths.
2. **DetailYield** — fiche pages: gallery, facts, full prices, canonical URL.
3. **In-job store** (singleflight) — same URL in one resolve ⇒ one GET.
4. **Durable evidence** (Phase 2) — `(provider, url)` + typed yield + TTL shared Next↔worker.

Soft-404 to a search page is **not** a miss: mine the rows, pick a winner, fetch **one** detail. Do not invent more slugs.

## Cost tiers

| Tier | Examples | When |
| ---- | -------- | ---- |
| 0 | LaunchBox / iCollect local, BarcodeCache | Always first |
| 1 | APIs (eBay Browse, ScreenScraper, IGDB, …) | Parallel after / with Tier 0 |
| 2 | Flare / Bipart scrapes | Only for **capability gaps** |

## Phase 1 — PriceCharting (done)

- `fetchStore.ts` — ALS in-job singleflight
- Name seek **search-first** (`type=prices`)
- Soft-404 `/game/…` → search HTML mined once; slug spray capped / stopped
- Abort on 429 / quota (no retry spam)
- Same HTML → metadata + prices parse; sibling title-search skipped when primary already rich

## Phase 2+ backlog

| Item | Why |
| ---- | --- |
| Durable ProviderEvidence | Bridge Next scan ↔ worker refresh |
| Harden scrape-pass gate | Never wake Flare swarm if Tier 0+1 complete |
| Abort in-flight on job timeout | Stop burning Flare after “timeout” log |
| Barcode adapters keep DetailYield | Kill slim-and-forget (title-only) |
| Create/refresh = gap-fill | Don’t force full fan-out when evidence fresh |
| eBay: batch search → aggregate | One Browse search ≫ N item details |
| Local full-set / dump sync | Closed platforms at home latency |
| Flare retailers: 1 search → N candidates | Same philosophy as PC |
