# Hardcoding audit — core must be agnostic, data-driven, provider-neutral

> **STATUS 2026-06-29 — provider-literal migration COMPLETE.** The blindness guard
> (`src/services/provider/blindnessGuard.test.ts`) now ships an **empty** allowlist:
> **zero** provider-id literals remain outside `src/services/providers/`. The
> "current violations" tables, per-file allowlist notes and the `P2*` progress log
> below are **historical** — kept for rationale, no longer the live surface. The one
> remaining provider bias is per-provider `weight` in the metadata **enrichment**
> merge (`src/services/metadata/merge.ts` `resultsByWeight`); the barcode resolution
> path is fully unbiased (tier → consensus → quality).

> **Enforcement already exists:** `src/services/providerBlindnessGuard.test.ts`
> inventories every quoted provider literal in `src/`+`scripts/` (excluding
> provider modules + tests) against a **shrinking allowlist**. Removing a provider
> literal from core = shrink its allowlist entry. This is the regression guard for
> the whole P2 effort — the allowlist below IS the remaining provider-bias surface.
>
> **Progress (this session):**
>
> - ✅ P1a — per-product title `if`s deleted (titleUtils); crossbow live-verified via canonical.
> - ✅ P1b — board-game `PUBLISHERS` list removed; replaced by registry-driven
>   `detectBoardGameSpecialistSignal` (a `types:["boardgames"]` provider anchoring
>   the result); Okkazeo live-verified.
> - ✅ P2a — `formatFactSource` is now a **client-safe label map** in playerFacts,
>   kept in sync with the registry by `providerSourceLabels.test.ts`. ⚠️ LESSON:
>   the first attempt imported `providerRegistry` directly, which broke `pnpm build`
>   — the item page is `"use client"` and the registry eagerly pulls every
>   provider's server-only adapter (`sharp` → `child_process`) into the browser
>   bundle. **Client display code can never import the registry**; mirror + sync-test
>   instead, or format labels server-side. Providers still declare `info.factLabel`.
> - ✅ P2 (priceCachePolicy) — `offer.source === "PriceCharting"` → registry flag
>   `info.referencePriceSource` + `isReferencePriceSource()`. Provider-blind now.
> - ✅ Build fixed (was red): `titleUtils` `Set<string>` cast, `mappingProbeUtils`
>   dead duplicate key removed, `node:sqlite` ambient shim (`@types/node@20`
>   predates it; runtime is Node 26). tsc now 0 errors.
> - ✅ P3 (partial) — the repeated `0.5 + n*0.15` consensus-confidence literal →
>   one `agreementConfidence()` helper in metadataConsensus.
> - ✅ Cover ranking — `cachePayload` `url.includes("screenscraper"/"rawg.io")` →
>   registry `coverUrlQualityRank()` (providers declare `info.coverUrlHost`; ranks
>   by their existing `isRealBoxCover`). Behaviour-preserving, server-side.
> - All 694 tests green, tsc clean; guard allowlist shrank 4× (playerFacts back as a
>   client-safe map, priceCachePolicy, cachePayload, + the build-fix).
>
> **P2b ✅ COMPLETE — `sourceAssembly` is fully provider-blind (0 provider literals,
> guard allowlist entry removed).** All 15 providers self-declare their evidence
> contribution via `ProviderModule.buildBarcodeSources`; core just iterates the
> registry. Marketplace/aggregator scoping lives in `src/lib/barcode/sourceContribution.ts`
> (`marketplaceContributions` / `gatedContributions` / `scopedContribution`). The
> `payload.retailers[]` loop stays (already provider-blind). Plug-and-play achieved:
> adding a provider no longer touches the assembler. Behaviour-preserving (694 tests,
> build green, live Ghost Recon/de Blob byte-identical). Also fixed a self-inflicted
> `git checkout` regression (restored looksLikeImageBuffer + P2a + P1b) and converted
> all the top-level-await import rewrites back to static.
>
> **P2b history (incremental, green at each step):** added
> `ProviderModule.buildBarcodeSources(payload, ctx)` — the plug-and-play inversion
> of `sourceAssembly`. `compileAllBarcodeTypeResults` now iterates `PROVIDER_MODULES`
> and collects each provider's contribution, with un-migrated providers still in the
> explicit assembler blocks (hybrid is fine transitionally — green throughout).
> **Migrated (10 — ALL canonical/simple providers, every type):** ScreenScraper,
> PriceCharting, ScanDex (games; ScanDex→boardgames too), MusicBrainz, Discogs,
> Deezer (music), TMDB (movies, w/ aliases), OpenLibrary (books), Philibert,
> Okkazeo (boardgames). Each emits its EXACT former label; behaviour-identical (694
> tests incl. SS-fixture confidenceLock); production build verified at each step.
> Trivial single-key modules need NO new imports (contextual typing supplies
> `payload`). `sourceAssembly` allowlist now holds ONLY the 5 marketplace providers.
>
> **Remaining (the harder marketplace providers):** AchatMoinsCher, PicClick,
> Freakxy, LeDenicheur, ChasseAuxLivres + the `payload.retailers[]` loop. Harder
> because: (a) MULTI-TYPE scoping — each contributes to several media types gated on
> `ctx.type`/`ctx.isBook` (`type===X || !isBook`); (b) LABEL MISMATCHES — assembler
> uses "PicClick"/"LeDenicheur"/"ChasseAuxLivres" but `info.label` is "PicClick
> (eBay)"/"LeDénicheur"/"Chasse aux Livres", so the module must emit the exact
> assembler string; (c) they carry `NamedListing[]` (not `SourceProduct[]`) — the
> contribution type or a conversion must accommodate it. A focused final push.
> Pattern for the rest: move the provider's extraction + its exact label string into
> its module's `buildBarcodeSources`, delete its assembler block, shrink the
> allowlist. **Remaining to migrate:** OpenLibrary, MusicBrainz, Discogs, Deezer,
> TMDB, Philibert, Okkazeo (simple, label==info.label), then the harder marketplace
> ones with type/isBook scoping (AchatMoinsCher, PicClick, Freakxy, LeDenicheur,
> ChasseAuxLivres + the retailers loop — these have label≠info.label, e.g.
> "ChasseAuxLivres" vs "Chasse aux Livres", so the module must emit the exact
> assembler string). NOTE: live-checking via tsx now hits a top-level-await/cjs
> limit (sourceAssembly pulls the registry → providerBootstrap); Next build is fine
> — verify with `pnpm build`, not a tsx scratch.
>
> **Findings that reshape the remaining plan:**
> - **P2c platform tables** — `videoGamePlatforms.ts` (the consumer, client-safe,
>   13-file blast radius) can't be routed through the heavy registry/provider
>   modules without re-triggering the client-bundle break. Moving the tables to
>   provider dirs only *relocates* the coupling (core still imports them by name).
>   Low value / high constraint — deprioritise.
> - **P4 ISO codes / stopwords** — replacing the CURATED region/stopword lists with
>   COMPLETE libraries would OVER-MATCH and over-strip real title words (`no`=Norway,
>   `in`=India, aggressive stopwords). The curation is a correctness feature, not a
>   bug. Recommend: keep these as DATA (the user's "complete lib" rule doesn't apply
>   to false-positive-sensitive title cleaning). Numerals (roman/number-word maps)
>   ARE finite, so a lib swap there is cosmetic.
> - **Real remaining win = P2b** (sourceAssembly + price adapters): server-side,
>   large, resolution-critical — a dedicated pass with live §5 + confidenceLock.
>
> **Remaining surface (from the guard allowlist) — larger pieces:**
> - **P2b `sourceAssembly.ts`** (biggest): a 265-line provider adapter mapping each
>   payload slice → per-type sources. Inverting it = redesign the provider-keyed
>   payload shape + move extraction into ~15 modules. Resolution-critical; needs a
>   dedicated pass with live §5 + confidenceLock verification. Guarded, so safe to
>   stage. NOT a rush job.
> - **P2c** platform tables (~3.5k lines) → provider modules (mechanical, large).
> - **P2** remaining literals: `barcodeResolver.ts`, `metadataFetch.ts`,
>   `priceResolver.ts`, `providerMappingAudit.ts`, `cachePayload.ts`, UI pages —
>   each a small registry-flag/lookup swap like priceCachePolicy.
> - **P4** ISO region/language codes (the genuine never-complete list) + numerals +
>   stopwords via libs. **P3** metadata confidence magic numbers → config.

Goal: remove every hardcoded value / magic number / per-entity list / provider-
specific branch from the **core** (resolution, scoring, cleaning, type detection).
"We will never have a complete exhaustive list" — so any hand-maintained list of
entities (titles, publishers, platforms, brands) is a bug, not data. Provider
specifics belong **inside each provider module**, never in core. External libs are
welcome where they replace a hand-maintained list with a maintained dataset.

Legend: 🔴 P1 remove first (per-entity hardcode + correctness bias) · 🟠 P2
provider bias in core · 🟡 P3 magic numbers · 🟢 P4 linguistic vocab (externalize)
· ⚪ keep (real-world standard, not arbitrary).

---

## 🔴 P1 — Per-product hardcoded "matches" (worst offenders)

**`src/lib/barcode/titleUtils.ts` ~415-438** — functions returning a hand-fixed
title for ONE specific game:

- `"Link's Crossbow Training"`
- `"Super Monkey Ball: Banana Blitz"` (adds a colon)
- `"Mario & Sonic aux Jeux Olympiques"` (ampersand + accents/casing)

One `if` per product = the anti-pattern. **Options:**

1. **Delete them** — the consensus-title engine + canonical clean spelling already
   produce the correct title for most (proven for romhack/edition/sequel). Where
   the fix is punctuation/casing the engine can't infer (a colon, an ampersand),
   that knowledge must come from a **canonical source's own spelling**, never be
   invented in core. Remove test-driven (live-verify each barcode after).
2. Keep only a _general_ normalization (e.g. "&"/"and" casing) if it generalizes —
   never a per-title literal.

## 🔴 P1 — Board-game publisher list

**`src/lib/barcode/boardGameSignal.ts` `PUBLISHERS`** — 23 hand-picked publishers,
comment admits it is deliberately partial. Biases type detection by guessing
"board game" from a name harvested off generic marketplace listings. **Options:**

1. **Provider-as-signal (preferred, fully agnostic):** a board-game-specialist
   provider (Philibert / Okkazeo / BGG) _returning the product at all_ is the
   signal — drop the publisher-name guessing entirely. Type comes from which
   provider answered, which is already known.
2. External dataset (BGG publishers) if a name signal is still wanted — but (1) is
   cleaner and needs no list.

Same shape: `CATEGORY_PATTERNS`, `VIDEO_FORMAT_PATTERNS`, `MEDIA_FORMAT_LABELS` —
hand-built phrase lists used to guess type/format from listing text.

## 🟠 P2 — Provider-specific processing in core

- **`src/lib/barcode/sourceAssembly.ts`** — a large per-provider switch: each
  payload key (`ss`, `pc`, `amc`, `philibert`…) is mapped to a labelled source
  with bespoke extraction. The per-provider knowledge lives in core.
  **Option:** invert to plug-and-play — each provider module declares
  `toEvidenceSources(payload)` (it already declares its `evidence` profile in
  `providerEvidence.ts`); core just iterates `PROVIDER_MODULES`. Adding a provider
  then never touches core.
- **`src/lib/playerFacts.ts` `formatFactSource`** — 20-case `switch` mapping a
  provider id → display label ("ss" → "SS", "bgg" → "BoardGameGeek"…).
  **Option:** each provider declares its `displayLabel` in the registry; core
  reads it. Delete the switch.
- **`src/lib/playerFacts.ts`** — provider-name ordering/priority literals
  (AchatMoinsCher / Steam / IGDB / RAWG / TMDB / PriceCharting / Philibert /
  LaunchBox). **Option:** drive from each provider's declared weight/role.
- **`src/lib/priceCachePolicy.ts`** — "PriceCharting"-specific cache rule.
  **Option:** provider declares its own price-cache policy.
- **`src/lib/videoGamePlatformSources.ts`** — `SCREEN_SCRAPER_PLATFORM_REFERENCES`
  - `LAUNCHBOX_PLATFORM_REFERENCES` (~3.5k lines of provider platform-id tables).
    These are _that provider's_ mapping data. **Option:** move each table into its
    provider module; core keeps only the canonical platform vocabulary.

## 🟡 P3 — Magic numbers beyond the barcode scorer

Barcode scoring is now centralised (`evidence/scoring.ts`). Still scattered:

- **`src/lib/metadataConsensus.ts`** — `confidence = 0.5 + n * 0.15` formulas (×3).
- **`src/services/metadataMerge.ts`** — `weight ?? 0.5` defaults; tier orders.
- **`src/services/metadataProviderSelection.ts`**, `priceResolver.ts` — thresholds.
  **Option:** one documented `metadataScoring` config (mirror `scoring.ts`), or
  derive confidence from agreement count rather than a tuned constant.

## 🟢 P4 — Linguistic vocabulary → replace with maintained libraries

These are real lists but hand-maintained and language-incomplete:

- **Region / language codes** — `LISTING_REGION_TERMS`, `LOCALE_REGION_ORDER`,
  `USER_VISIBLE_REGIONS` (the "fr/de/es/nl…" we keep extending). **Option:**
  `iso-639-1` (languages) + `i18n-iso-countries` (regions). Membership test against
  a complete dataset instead of a growing literal list.
- **Roman numerals / number words** — `ROMAN_MAP`, `NUMBER_WORD_MAP`
  (titleUtils.ts). **Option:** a numerals lib (`roman-numerals`,
  `words-to-numbers`) — covers more notations than the hand map.
- **Stopwords / generic title tokens** — `GENERIC_TITLE_TOKENS`,
  `RESOLVER_GENERIC_TOKENS`, `NON_CANONICAL_CONTEXT_TOKENS`, `SUFFIX_EXCLUDED_NOISE`.
  **Option:** a multilingual stopword package (`stopword`) for the generic words;
  keep only genuinely domain-specific tokens, as data.
- **Seller jargon** — `LISTING_CONDITION_TERMS`, `LISTING_FORMAT_TERMS`,
  `LISTING_NOISE_TERMS`, `LISTING_EXTRA_SUFFIX_TERMS`, `GAME_EDITION_DEFINITIONS`,
  `GAME_CLASSICS_KEYWORDS`. No clean external source exists. **Option:** keep as
  _data files_ (JSON/config), clearly separated from code, and prefer the
  corroboration engine (which already drops uncorroborated tokens) over growing
  these lists. The `cleanTitleForDisplay` inline `.replace()` chains
  (titleUtils.ts ~334-385) embed the same jargon as regex — fold into the data.

## ⚪ Keep — real-world standards (cite, don't apologise)

- `VALID_PEGI_AGES = {3,7,12,16,18}` — the actual PEGI rating set.
- ISBN `978/979` + audio EAN prefixes (`scoring.ts`) — GS1 allocation.
- `LOCALE_LANGUAGE_ORDER = ["fr","en"]` — a business/locale preference; fine, but
  belongs in config/env, not a code constant.

---

## Recommended order (small → safe → high-value first)

1. **P1 per-product title `if`s** (titleUtils) — delete test-driven; smallest diff,
   biggest principle win, directly what was flagged.
2. **P1 board-game publishers → provider-as-signal** — removes a never-exhaustive
   list, improves type detection.
3. **P2 provider-in-core** — `formatFactSource` → registry label (quick), then the
   `sourceAssembly` inversion (larger), then platform tables → provider modules.
4. **P4 externalize numerals + ISO codes** (clear lib wins), then stopwords.
5. **P3 centralise remaining magic numbers** (`metadataScoring` config).

Each step stays test-gated (unit + live §5) and behaviour is re-verified live where
it touches resolution. No cache-version bump needed unless displayed titles change
(then bump `BARCODE_CACHE_VERSION`).
