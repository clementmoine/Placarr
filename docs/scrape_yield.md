# Scrape yield & call efficiency

> **STATUS 2026-07-24.** Companion to multi-provider latency work.
> Phase 1–2w shipped (Esprit Jeu + Play-In SearchYield durable); Philibert / No-Intro = later.

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

## Phase 2f — Price refresh gap-fill (done 2026-07-24)

- `retailPriceEvidence` — single-condition DetailYield promote/reuse (shared by factory + Philibert/Okkazeo/Esprit/Play-In)
- Scan promotes evidence; pinned refresh **reuses** fresh rows (zero HTTP) before Flare/product GET
- PriceCharting already had the multi-condition path; retailers now match that contract

## Phase 2g — Metadata seed gap-fill (done 2026-07-24)

- `apiProvidersForMetadataPass` — seed/prior fiche complete ⇒ skip Tier 0+1 swarm (pinned non-scrape only)
- `fetchAndStoreMetadata` loads DB snapshot into `seededActiveResults` even when `forceRefresh`
- Stage-2 non-scrape secondaries + identify fallbacks skip when capabilities already satisfied
- Pinned scrapes still refresh; incomplete seed still wakes the full API set

## Phase 2h — eBay Browse SearchYield reuse (done 2026-07-24)

Prices already aggregate from Browse `itemSummaries` (no getItem fan-out). Waste was **repeated Browse searches**:

- Shared process-local `browseSummaryCache` keyed `gtin:…` / `q:…` — metadata GTIN + price GTIN mine the same summaries (0 extra HTTP)
- `aggregateEbayPricesFromSummaries` — single mine path for medians
- `ebayPriceSearchQueries` aligned with `matchPriceSeekQueries` (barcode first, ≤1 title when barcode present, ascii variants, cap 4)

## Phase 2i — PrestaShop SearchYield-first EAN enrich (done 2026-07-24)

Barcode search no longer `Promise.all` fiche Flare GETs for every miniature missing `ean13`:

- Mine URL slug / reference / `ean13` via `resolvePrestashopSearchProductBarcode` first — hit ⇒ **0** detail GET (NetGamesRetro, Tokyo Game Story, …)
- Else title-rank shortlist (≤3), sequential enrich, **stop** on barcode match (IQIT / ChipWeld)
- Shared by all `PRESTASHOP_RETAILER_CONFIGS` shops

## Phase 2j — Smartoys search → rank → 1 detail (done 2026-07-24)

Name path no longer walks every search URL until a fiche title matches:

- `parseSmartoysSearchHits` — SearchYield (url + anchor/slug title)
- `pickBestSmartoysSearchHit` — local title rank ≥ retailer floor
- **One** `fetchSmartoysProductPage` for the winner
- Barcode path unchanged (`product_info.php?products_id=` → 1 GET)

## Phase 2k — AchatMoinsCher SearchYield + fiche reuse (done 2026-07-24)

Metadata name search and price name search no longer each pay for `recherche.php` + fiche:

- Process-local `searchHitsCache` / `productHtmlCache` — meta then prix mines the same HTML (0 extra HTTP)
- `pickBestAchatMoinsCherSearchHit` — title-rank among SearchYield matches → **one** detail
- Barcode scanner path also reuses fiche HTML for the subsequent price parse

## Phase 2l — Chasse aux Livres SearchYield → 1 fiche (done 2026-07-24)

Search REST listings already expose title + `/prix/` URL; resolve no longer walks every candidate:

- `parseChasseSearchHitsFromPayload` / `orderChasseSearchHits` — soft-filter by listing title validator; prefer URL-embedded EAN
- First accepted fiche **returns immediately** (fixes unanchored “remember but keep walking”)
- Barcode path still page-walks when SearchYield lacks EAN (Black Stories)

## Phase 2m — Booknode SearchYield → 1 fiche (done 2026-07-24)

Name search no longer walks up to 8 aligned candidates × URL alts:

- `pickBestBooknodeSearchCandidate` — filter with `isCandidateAligned`, rank by `metadataTitleSimilarity`
- **One** winner → `booknodePageUrlAlternates` (slug `_n1_` ↔ `_n_1_`) then `/covers`
- Direct book URL path unchanged

## Phase 2n — Back Market SearchYield + fiche HTML reuse (done 2026-07-24)

Metadata search and price search no longer each pay for the same Cloudflare HTML:

- Process-local HTML cache keyed `search:q` / `p:canonicalUrl`
- `fetchFromBackMarket` then `fetchPricesFromBackMarket` → **0** extra search HTTP
- Gallery enrich then pinned product URL → **0** extra fiche GET

## Phase 2o — Geedie search-first (done 2026-07-24)

Barcode path no longer invents `{platform}-{slug}-{ean}` product URLs before marketplace:

- Dropped slug spray (often 1–2 Flare 404s, or early-return that skipped multi-region search)
- Marketplace SearchYield first; `preferGeedieHitsWithBarcode` ranks EAN-in-slug rows ahead
- Multi-region gallery still detail-fetches aligned hits (by design)

## Phase 2p — SearchYield durability (done 2026-07-24)

- `normalizeProviderEvidenceUrl` keeps search identity params (`q` / `search` / `type` / `keywords`), strips UTM; fiche URLs still strip query
- `PROVIDER_EVIDENCE_SEARCH_KIND` + 30m TTL
- PriceCharting: promote/reuse typed search rows Next↔worker; name + sibling seeks use `loadPriceChartingSearchRows`

## Phase 2q — AMC + Back Market SearchYield durable (done 2026-07-24)

- AchatMoinsCher: RAM search hits → ProviderEvidence → Flare; promote typed `{productId,title}` after live search
- Back Market: `loadBackMarketSearchHits` reuses typed cards Next↔worker; process HTML cache still covers same-job meta/price
- Typed yield only (no raw HTML in evidence)

## Phase 2r — Booknode + Smartoys SearchYield durable (done 2026-07-24)

- Booknode: `loadBooknodeSearchCandidates` promote/reuse `{title,url}` for `/search?q=`
- Smartoys: `loadSmartoysSearchHits` promote/reuse `{url,title}` for `keywords=`
- Detail GET still only for the locally ranked winner

## Phase 2s — Chasse SearchYield durable (done 2026-07-24)

- `normalizeProviderEvidenceUrl` keeps `query` + `catalog` (fr vs toys do not collide)
- Promote typed `{name,productUrl,coverUrl?}` after REST SearchYield; reuse skips search HTML + REST pages → fiche only
- Soft-filter / barcode order still applied on reused hits

## Phase 2t — iCollect sitemap Tier0 (done 2026-07-24)

- Lookup hot path: sitemap title(+cover) is enough — **no Flare** (`shouldFetchICollectItemPageOnLookup`)
- Background `catalogSync` still uses `shouldRefreshICollectItemPage` to upgrade sitemap → page
- Aligns module notes with behavior (Flare only when barcode absent from local index)

## Phase 2u — LaunchBox prebuild / no zip at scan (done 2026-07-24)

- `ensureLaunchBoxIndex` opens existing SQLite only; rebuild needs local XML/zip or opt-in download
- `pnpm launchbox:build-index` → `buildLaunchBoxIndex({ allowDownload: true })`
- Env override: `LAUNCHBOX_ALLOW_DOWNLOAD=1`

## Phase 2v — Geedie SearchYield durable (done 2026-07-24)

- `searchGeedieProducts` promote/reuse typed `{title,productUrl,thumbnailUrl}` for `/marketplace/…?search=`
- Category path + `search=` keep playstation vs nintendo queries distinct
- Gallery still detail-fetches aligned hits after SearchYield (by design)

## Phase 2w — Esprit Jeu + Play-In SearchYield durable (done 2026-07-24)

- Esprit Jeu: `keywords=` → typed `{url,title?}` promote/reuse
- Play-In: catalogue `?search=` → typed `{url,productId?}` promote/reuse
- Detail GETs still verify barcode on winners

## Phase 2+ backlog

| Item | Why |
| ---- | --- |
| Philibert SearchYield (`search_query` identity) | Needs core identity param first |
| No-Intro / Redump / closed-platform dumps | True full-set corpora beyond ICE+LB |
| LaunchBox local FTS perf measure | P4 backlog |
