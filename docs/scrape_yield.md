# Scrape yield & call efficiency

> **STATUS 2026-07-24.** Companion to multi-provider latency work.
> Phase 1–2e shipped (incl. Presta/Shopify factory DetailYield); gap-fill / eBay = next.

## Principle

We are not a single-catalog app (Plex/TMDB). Many providers run **in parallel by cost tier**, but **every network response must be fully mined** before another GET:

1. **SearchYield** — list/search/soft-404 pages: titles, thumbs, price snippets, **real** detail paths.
2. **DetailYield** — fiche pages: gallery, facts, full prices, canonical URL.
3. **In-job store** (singleflight) — same URL in one resolve ⇒ one GET.
4. **Durable evidence** — `(provider, url)` + typed yield + TTL shared Next↔worker.

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

## Phase 2a — Job timeout aborts scrapes (done 2026-07-24)

- `jobAbort.ts` ALS — worker price timeout **aborts** in-flight axios/Flare (not just frees the slot)
- `collectRefreshBarcodePriceOffers` stops launching more providers when aborted
- Metadata refresh already aborted via session `AbortController` (unchanged)

## Phase 2b — Scrape-pass gate (done 2026-07-24)

- `scrapeProvidersForMetadataPass` — Tier 0+1 complete ⇒ **only** fiche-pinned scrapes ∩ candidates (no Flare seeker swarm)
- Capability gaps (incl. books lacking a *primary* cover) still wake the full candidate set
- Marketplace stage-2 (Back Market, …) skipped once title+cover exist — price refresh owns listing photos

## Phase 2c — Durable ProviderEvidence (done 2026-07-24)

- Prisma `ProviderEvidence` — `(providerId, url)` + `kind` + `yieldJson` + TTL (`expiresAt`)
- Core helpers: `getFreshProviderEvidence` / `putProviderEvidence` (no provider-id literals)
- PriceCharting: promote DetailYield prices after successful parse; URL-first refresh **reuses** fresh evidence (zero HTTP)
- In-job `PriceChartingFetchStore` unchanged for same-process singleflight

## Phase 2d — Barcode adapters keep DetailYield (done 2026-07-24)

Boardgame retailers no longer slim-and-forget after paying for a fiche GET:

- **Philibert / Okkazeo / Esprit Jeu / Play-In** — barcode hits keep `productUrl`
- Scan offers set `sourceUrl` (write-back → external-link pins)
- Philibert gained URL-first `refreshBarcodePriceOffers`; Esprit/Play-In barcode fallback also keeps `sourceUrl`

## Phase 2e — PrestaShop / Shopify factory DetailYield (done 2026-07-24)

- `scrapeCatalogModuleFactory` — barcode hits keep `productUrl` + `priceCents`; shared `extractScanPriceOffers` + `refreshBarcodePriceOffers`
- `RetailerBarcodeHit.providerId` for scan offer routing
- Shopify: `fetchShopifyProductByUrl` for URL-first refresh; PrestaShop: barcode refresh with `sourceUrl`

## Phase 2+ backlog

| Item | Why |
| ---- | --- |
| Create/refresh = gap-fill | Don’t force full fan-out when evidence fresh |
| eBay: batch search → aggregate | One Browse search ≫ N item details |
| Local full-set / dump sync | Closed platforms at home latency |
| Flare retailers: 1 search → N candidates | Same philosophy as PC |
| SearchYield durability | Soft-404 / search pages beyond PC detail prices |
