# Scrape yield & call efficiency

> **STATUS 2026-07-24.** Companion to multi-provider latency work.
> Phase 1–2am shipped; Phase 3a–3k No-Intro dump path; Phase P4a LaunchBox FTS.

## Principle

We are not a single-catalog app (Plex/TMDB). Many providers run **in parallel by cost tier**, but **every network response must be fully mined** before another GET:

1. **SearchYield** — list/search/soft-404 pages: titles, thumbs, price snippets, **real** detail paths.
2. **DetailYield** — fiche pages: gallery, facts, full prices, canonical URL.
3. **In-job store** (singleflight) — same URL in one resolve ⇒ one GET.
4. **Durable evidence** — `(provider, url)` + typed yield + TTL shared Next↔worker.

Soft-404 to a search page is **not** a miss: mine the rows, pick a winner, fetch **one** detail. Do not invent more slugs.

## Cost tiers

| Tier | Examples                                   | When                         |
| ---- | ------------------------------------------ | ---------------------------- |
| 0    | LaunchBox / iCollect local, BarcodeCache   | Always first                 |
| 1    | APIs (eBay Browse, ScreenScraper, IGDB, …) | Parallel after / with Tier 0 |
| 2    | Flare / Bipart scrapes                     | Only for **capability gaps** |

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
- Capability gaps (incl. books lacking a _primary_ cover) still wake the full candidate set
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

## Phase 2x — Philibert SearchYield durable (done 2026-07-24)

- `normalizeProviderEvidenceUrl` keeps `search_query` + `s` (Presta-ready)
- Philibert: `/fr/recherche?search_query=` → typed `{url,title?,barcode?}` promote/reuse

## Phase 2y — PrestaShop factory SearchYield durable (done 2026-07-24)

- Shared `fetchPrestashopSearchProducts` promote/reuse typed AJAX products per `config.id`
- Native `products[]` and IQIT `rendered_products` both covered
- Evidence keys use `search_query` / `s` (controller/ajax stripped by normalize)

## Phase 2z — Okkazeo SearchYield durable (done 2026-07-24)

- `normalizeProviderEvidenceUrl` keeps `ean` + `titre_jeu` (drops empty + `action`)
- `/jeux/resultats` → typed `{url,gameId?}` promote/reuse

## Phase 2aa — HDJV SearchYield durable (done 2026-07-24)

- `normalizeProviderEvidenceUrl` keeps `q` + `support` (platform collisions)
- `ajax_recherche_jeu.php` → typed `{label,title,support,ficheUrl,gameCode}` promote/reuse

## Phase 2ab — Canal BD + Furet SearchYield durable (done 2026-07-24)

- Canal BD: `/recherche/?q=` → typed `{id,title,url,coverUrl?}` promote/reuse
- Furet: `/rechercher/result?q=` → typed `{title,productUrl,barcode?}` promote/reuse
- Evidence keys already keep `q`

## Phase 2ac — Gibert + Decitre SearchYield durable (done 2026-07-24)

- Gibert: `/catalogsearch/result/?q=` → typed `{title,productUrl,barcode?}` promote/reuse
- Decitre: `/search?search=` → typed `{title,productUrl,barcode?}` promote/reuse
- Evidence keys already keep `q` / `search`

## Phase 2ad — BD Fugue + Planète BD SearchYield durable (done 2026-07-24)

- `normalizeProviderEvidenceUrl` keeps `mot-clef` (Planète BD)
- BD Fugue: `/catalogsearch/result/?q=` → typed `{title,productUrl,barcode?}` promote/reuse
- Planète BD: `/recherche?mot-clef=` → typed `{id,title,url,ratingStars?}` promote/reuse

## Phase 2ae — Vivlio + Freakxy SearchYield durable (done 2026-07-24)

- Vivlio: `/search?search=` → typed `{title,productUrl,barcode?}` promote/reuse
- Freakxy: Magento `/catalogsearch/result/?q=` barcode → typed `{name,coverUrl?}` promote/reuse

## Phase 2af — Shopify factory SearchYield durable (done 2026-07-24)

- Shared `fetchShopifySearchHandles` promote/reuse typed product handles per `config.id`
- `/search?q=&type=product` HTML (Flare) skipped on evidence hit; product JSON detail GETs unchanged
- Evidence keys already keep `q` + `type`

## Phase 2ag — Bedetheque + Bdovore series SearchYield durable (done 2026-07-24)

- `normalizeProviderEvidenceUrl` keeps `term` + `data` + `mode` (Serie vs Album collisions)
- Bedetheque: `/ajax/tout?term=` → typed `{id,label}` promote/reuse
- Bdovore: `/getjson?data=Serie&mode=2&term=` → typed `{id,label}` promote/reuse
- Album/detail multi-hop unchanged after series SearchYield

## Phase 2ah — MyLudo + ChocoBonPlan SearchYield durable (done 2026-07-24)

- `normalizeProviderEvidenceUrl` keeps `words` + `code` (MyLudo)
- MyLudo: synthetic `datas.php?type=search|barcode` → typed `{url,gameId,title?}` promote/reuse
- ChocoBonPlan: synthetic `/search?q=` → typed Algolia `{title,url,image,objectID}` promote/reuse

## Phase 2ai — Babelio + SensCritique SearchYield durable (done 2026-07-24)

- `normalizeProviderEvidenceUrl` keeps `universe` (SensCritique)
- Babelio: synthetic `/recherche.php?term=` → typed merged AJAX+HTML hits promote/reuse
- SensCritique: synthetic `/search?keywords=&universe=` → typed GraphQL hits promote/reuse
- LeDénicheur skipped this cut (search immediately resolves to prices/detail)

## Phase 2aj — LeDénicheur SearchYield durable (done 2026-07-24)

- LeDénicheur: synthetic `/search?q=` → typed BFF Product/Offer nodes promote/reuse
- Price resolve (detail POST / GTIN HTML) still runs from cached nodes when needed

## Phase 2ak — Full Set SearchYield durable (done 2026-07-24)

- Full Set: `/recherche.php?q=` → typed `{url,title,category?,platformLabel?,year?,consoleSlug?}` promote/reuse
- Rate-limited scrape: refresh reuses SearchYield without repeating the search GET

## Phase 2al — HowLongToBeat + Izneo SearchYield durable (done 2026-07-24)

- `normalizeProviderEvidenceUrl` keeps `platform` (HowLongToBeat)
- HowLongToBeat: synthetic `/search?q=&platform=` → typed bleed games promote/reuse (skips init+POST)
- Izneo: synthetic `/search?q=` → typed series hits promote/reuse

## Phase 2am — eBay Browse SearchYield durable (done 2026-07-24)

- `normalizeProviderEvidenceUrl` keeps `gtin` + `epid`
- Browse: RAM L1 → ProviderEvidence L2 → live; promote typed `itemSummaries`
- Keys: `/item_summary/search?gtin=` / `?q=` / `?epid=` — worker refresh skips repeating Browse

## Phase 3a — No-Intro DAT parser first cut (done 2026-07-24)

- `providers/nointro/parseDat.ts` — Logiqx XML → typed `{header, games[{name,cloneOf?,roms[]}]}`
- Fixture covers parent/clone, multi-rom, XML entities, `<machine>` alias
- **Out of this cut:** SQLite index, registry module, scan Tier0, Redump sync, download pipeline

## Phase 3b — No-Intro SQLite index + checksum/title lookup (done 2026-07-24)

- `providers/nointro/indexStore.ts` — local DAT → `nointro.sqlite` (crc/md5/sha1 indexes + FTS5)
- `pnpm nointro:build-index` with `NOINTRO_DAT_PATH` (never downloads; scan only opens existing index)
- Lookups: `lookupNoIntroGamesByChecksum` / `searchNoIntroGamesByTitle`
- **Out of this cut:** registry ProviderModule, multi-DAT merge, Redump, scan Tier0 wiring

## Phase 3c — No-Intro Tier0 metadata module (done 2026-07-24)

- `nointroModule` registered next to LaunchBox — title FTS + platform via DAT name, `requiresTitleAlignment`
- Facts: DAT set, clone-of, CRC ; no attachments / covers
- Health = local index open; checksum resolve exported for future file ingest
- **Out of this cut:** multi-DAT / Redump, ROM-hash scan wiring, LaunchBox FTS measure

## Phase 3d — No-Intro multi-DAT directory index (done 2026-07-24)

- `NOINTRO_DAT_PATH` accepts a file **or** directory of `.dat`/`.xml` (Logiqx / Redump-compatible)
- `resolveNoIntroDatFiles` + merge into one SQLite (distinct `datName` per set)
- Still never downloads; Redump DATs load the same path when placed in the folder

## Phase P4a — LaunchBox local FTS perf measure (done 2026-07-24)

- `pnpm launchbox:bench-fts` — p50/p95 over sample titles against prebuilt index (no download)
- Soft keep signal: p95 ≤ 100ms on the measuring machine
- Unit budget: `LAUNCHBOX_FTS_MATCH_PLAN_BUDGET` (20) + `LAUNCHBOX_FTS_MATCH_LIMIT` (200)

## Phase 3e — No-Intro checksum-first resolve (done 2026-07-24)

- `MetadataAdapterContext.romChecksums` + `externalIds` (`sha1`/`md5`/`crc`/`crc32`)
- `resolveNoIntroMetadata` prefers exact dump hash, then title FTS
- Hits emit `crc`/`md5`/`sha1` on `externalIds` for later enrich passes

## Phase 3f — No-Intro DAT pack sync (done 2026-07-24)

- `pnpm nointro:sync` — extract local zip (`NOINTRO_DAT_PACK`) or opt-in URL (`NOINTRO_DAT_PACK_URL` + `NOINTRO_ALLOW_DOWNLOAD=1`)
- Flat `.dat`/`.xml` into `NOINTRO_DAT_PATH` (or `.cache/nointro/dats`), then rebuild index
- No default mirror URL — bring your own pack (DAT-o-MATIC export, etc.); scan still never downloads

## Phase 3g — ROM checksums into enrich context (done 2026-07-24)

- `FetchMetadataOptions.romChecksums` → Pass1 `MetadataAdapterContext` (No-Intro checksum-first)
- `GET /api/metadata?crc=&md5=&sha1=` for scriptable preview (no ROM upload)
- Refresh rehydrates CRC/MD5/SHA1 from stored identifier facts; No-Intro emits those facts

## Phase 3h — Client dump hash → preview (done 2026-07-24)

- `hashRomFile` (SHA-1 + MD5 + CRC32) — local only, never uploads
- Games ItemModal “Identify from dump” → `getMetadataPreview(…, romChecksums)`
- Filename stem used as lookup name when the form name is empty

## Phase 3i — Soft size warn for large dumps (done 2026-07-24)

- Warn (do not block) when dump ≥ 256 MiB before hashing
- Toast copy includes rounded MiB size; hashing still local

## Phase 3j — Chunked / streaming client hash (done 2026-07-24)

- `hashRomFile` streams File/Blob in 1 MiB slices (override via `chunkBytes`)
- Incremental CRC32 + MD5 + SHA-1 — multi-GB ISOs are not loaded fully into RAM

## Phase 3k — Hash progress UI (done 2026-07-24)

- `onProgress` on `hashRomFile` → ItemModal button shows “Hashing dump… N%”
- Pure `romHashProgressPercent` for stable whole-percent copy

## Phase 2+/3+ backlog

| Item                                  | Why                                                                                                                                                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Worker / server-side dump hashing~~ | **Différé 2026-07-24** — le chemin client (`hashRomFile` → preview / enrich) suffit ; les dumps ne vivent pas sur le serveur. Réouvrir seulement si un produit impose upload / worker hashing (stockage serveur, batch folder ingest, etc.). |
