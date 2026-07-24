# Audit: Hardcoded Word Lists — Can We Stop Naming Them?

> **STATUS 2026-07-24.** Companion to [unbiased_ranking.md](unbiased_ranking.md).
> Plusieurs lignes « FIXED » ci-dessous sont **faites**. Ce qui reste ouvert est
> surtout **IDF / consensus pour remplacer les stoplists génériques** (long terme) —
> suivi dans [backlog § Ouverts](backlog.md#ouverts--base-clean-2026-07-24).
> Chemins historiques `src/lib/…` → aujourd’hui `src/core/identify/`, `src/core/enrich/titles/`, etc.

Companion to [unbiased_ranking.md](unbiased_ranking.md). Premise: any literal list
of words ("jeu vidéo", "livret", "ravageur", "blister", platform names…) **will
never be exhaustive**, and most are video-game-biased. This audit classifies every
such list and studies how to drop it or **de-literalize** it (derive it from data
instead of naming it).

---

## The principle

> Because we are **multi-source**, noise can be _defined relative to the data_
> instead of enumerated. A token is noise not because it's on a list, but because
> the data tells us so.

Three generic, exhaustiveness-free mechanisms replace most lists:

1. **Cross-source consensus (≥2 sources).** The signal is the tokens independent
   sources _agree on_; the noise is the per-listing extras. `Mille Sabords`
   appears in every source → signal; `Gigamic` / `blister` / `FR` appear in one →
   noise. **No word list needed.** (Already half-built: the anchor-de-noise in
   `matchUtils.ts`.)
2. **Corpus frequency / IDF (single-source fallback + global).** A token appearing
   across many _unrelated_ catalog items is generic (noise); a rare token is
   distinctive (signal). Learn it from `RawName.value` / `Item` titles —
   self-updating, exhaustive by construction, zero literals. `blister` occurs in
   thousands of rows → noise; `sabords` in three → signal.
3. **Provider-declared structured fields.** Platform, edition, condition, language
   should come from the provider's _structured_ data (Okkazeo JSON-LD, ScreenScraper
   platform field, a listing's condition field), **not be parsed out of the title
   string**. If the provider says the platform, we never guess `ps4` from the title.

The hierarchy: prefer (3) when the provider gives structure; else (1) when
multi-source; else (2) as the self-calibrating floor. Literal lists become a last
resort, ideally empty.

---

## Inventory & verdicts

### 🔴 Generic content heuristics — TARGET (remove / de-literalize)

These try to enumerate "all noise in the universe". Replaceable by the mechanisms above.

| List                                                                                                                              | File                                      | Verdict                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUFFIX_PATTERNS` (305), `PREFIX_PATTERNS`                                                                                        | `titleUtils.ts`                           | Consensus + IDF for display; keep a _minimal_ residual only for single-source edge cases                                                                                                                                                                                                                                                                                                                              |
| `PLATFORMS`, `PLATFORM_SUFFIX_PATTERNS`                                                                                           | `titleUtils.ts`                           | DRY source now: `videoGamePlatforms.ts` owns the closed taxonomy and provider snapshots; title parsing only consumes the shared fallback terms                                                                                                                                                                                                                                                                        |
| `BLOCK_PATTERNS`                                                                                                                  | `app/api/admin/product-teardown/route.ts` | DRY now: consumes `videoGamePlatforms.ts` + `listingTerms.ts`; long-term target remains provider-declared structured fields / consensus, not title parsing                                                                                                                                                                                                                                                            |
| `CLASSICS_KEYWORDS` (**was duplicated ×3**)                                                                                       | `listingTerms.ts`                         | DRY now: one source; next step is provider-declared edition where possible                                                                                                                                                                                                                                                                                                                                            |
| `GENERIC_TITLE_TOKENS`, `RESOLVER_GENERIC_TOKENS`, `RESOLVER_PLATFORM_TOKENS`, `NON_CANONICAL_CONTEXT_TOKENS` | `evidence/*`, `identityNoise.ts` | **DRY 2026-07-24**: PriceCharting uses `IDENTITY_FUNCTION_WORDS`; retailer `titleMatch` uses `IDENTITY_EDITION_PACKAGING_TOKENS` + `IDENTITY_PLATFORM_NOISE_TOKENS` (hardware keep-platform). **IDF MVP**: `tokenCorpusIdf.ts` + optional `CorpusTokenStats` on `evidence/matchUtils.titleSpecificityTokens`. **Offline RawName DF 2026-07-24**: `tokenCorpusIndex.ts` + `pnpm title-idf:build-index` → `.cache/title-idf/token-df.json`; resolve prefers durable global DF over thin batch stats. Reste : cron + shrink literal `GENERIC_TITLE_TOKENS`. |
| ~~`TITLE_STOP_WORDS`~~ **FIXED 2026-07-24** | `pricecharting/fetch.ts` | Deleted local set → `IDENTITY_FUNCTION_WORDS` |
| `BROAD_SCREENSCRAPER_FALLBACK_WORDS`, `NON_DISTINCTIVE_SCREENSCRAPER_TOKENS` | `screenscraper/resolver.ts` | Composed from `GENERIC_TITLE_TOKENS` / listingTerms + thin SS-local extras (`club`/`star`/`super`). Long-term: IDF. |
| word-boost `criquet\|ravageur\|…`, accent `+1500`, CJK `-200`, magic noise penalties                                              | `displayTitleScore.ts`                    | **DELETE.** Pure over-fit to test titles + locale bias. Replaced by tier→consensus→quality. Nothing to generalize.                                                                                                                                                                                                                                                                                                    |
| ~~**RESIDUAL 2026-07-02**: accent `+50` / French `+30` / `+1500`~~ **FIXED 2026-07-02**                                           | `title/displayScore.ts`                   | **Done**: `titleLanguagePreference()` (locale module) drives all language boosts from the preferred-first `languageOrder`; zero language literals left in `title/displayScore.ts` (incl. `localeCompare` + CJK gate + `orderFallbackNamesForLocale`). Read-time callers pass the request locale; deterministic paths use the configured default.                                                                      |
| `TITLE_PHRASE_EQUIVALENT_GROUPS`, `TITLE_TOKEN_EQUIVALENT_GROUPS` **FIXED 2026-07-05**                                    | `title/tokenEquivalents.ts`               | `TITLE_TOKEN_EQUIVALENT_GROUPS` = dictionnaire (couleurs, `legende/legend`, …). `TITLE_PHRASE_EQUIVALENT_GROUPS` = **category only** (`movie video game`) ; sous-titres produit AC III / Star Wars retirés. Cross-langue = `regionalTitles` providers (ScreenScraper `noms`, IGDB, …) via `metadataTitleMatchScore` — tests `titleMatching.test.ts` + fragments structurels `searchVariants.test.ts`. |
| `EDITION_PATTERNS`                                                                                                                | `evidence/edition.ts`                     | De-literalize to structural ("(…)" / "édition X" / ordinal), or provider-declared                                                                                                                                                                                                                                                                                                                                     |

### 🟠 Provider-name privilege — BIAS (replace with declared capability)

| List                                                 | File                        | Verdict                                                                            |
| ---------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| ~~`REAL_BOX_COVER_SOURCES`~~ **FIXED** | `attachmentDisplayScore.ts` | Replaced by provider trait `isRealBoxCover` (no provider-name privilege set). |

### 🟢 Provider-adapter schema — LEGITIMATE (keep, encapsulated)

A connector must parse **its own source's format**; that is plug-and-play, not generic guessing.

| List                                                                                                                      | File             | Why it stays                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------- |
| `LAUNCHBOX_XML_BLOCKS`, `COVER/BACKGROUND/LOGO/SCREENSHOT/BACK_TYPE_PRIORITY` (`"Box - Front"`, `"Fanart - Background"`…) | `launchbox/*`    | These are LaunchBox's _own_ image-type names — its API schema |
| `SCREEN_SCRAPER_ENV_NAMES`, `PRESTASHOP_RETAILER_CONFIGS`, `SUGGESTION_GAME_CATEGORIES` (IGDB codes)                      | provider modules | Source-specific config owned by the module                    |

### ⚪ Factual taxonomy / small enum — KEEP

| List                                                                                                                             | File    |
| -------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `VALID_PEGI_AGES` (3/7/12/16/18), `GAME_USED_CONDITIONS`, `IMAGE_TRANSFORM_QUERY_PARAMS`, `CONSOLIDATABLE_KINDS`, `CAPABILITIES` | various |

Closed, real-world, factual sets — naming them is description, not a noise guess.

### ⚪ Test / probe data — KEEP

`FALLBACK_BARCODES` / `FALLBACK_QUERIES` / `METADATA_PROBE_SAMPLES` / `RAW_KEY_IGNORE` — health-check & mapping-probe fixtures, not runtime logic.

---

## Residual hard cases (study before deleting)

- **Reverse-meaning discards** (`DISCARD_PATTERNS`: "boîtier seul", "no game",
  "case only") — these change _what is being sold_, so consensus/IDF won't catch
  them. Likely a small **structural** rule (`X seul|only|vide|sans`) + a
  price-outlier signal, rather than enumerating every item. Keep minimal.
- **Platforms** — a closed taxonomy is acceptable, but only as a _fallback_ after
  trying provider-declared platform. Grow it through `videoGamePlatforms.ts` /
  source snapshots, not by adding local title-parsing lists.
- **Single-source, brand-new product** — no consensus and not yet in the corpus.
  IDF degrades gracefully (unknown token = treated as signal, i.e. kept) which is
  the safe default (we'd rather keep a real word than strip it).

---

## Net direction

| Today                                                  | Target                                          |
| ------------------------------------------------------ | ----------------------------------------------- |
| Enumerate noise words (never exhaustive, VG-biased)    | Derive noise from consensus + corpus frequency  |
| Parse platform/edition/condition from the title string | Read them from the provider's structured fields |
| Provider-name privilege sets                           | Declared capabilities                           |
| Over-fit scoring (`ravageur`, `+1500`, CJK penalty)    | Delete; tier→consensus→quality                  |

Most lists shrink to empty or to a small structural rule. The few that remain are
either a real closed taxonomy or a provider's own schema — both legitimate.

Sequencing: this rides on the [unbiased_ranking.md](unbiased_ranking.md) work —
**titles first** (consensus replaces the title noise lists and deletes the
`displayTitleScore` over-fit), then the IDF corpus mechanism, then platform/edition
from structured fields. Tracked in [backlog.md](backlog.md).
