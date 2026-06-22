# Audit: Hardcoded Word Lists — Can We Stop Naming Them?

Companion to [unbiased_ranking.md](unbiased_ranking.md). Premise: any literal list
of words ("jeu vidéo", "livret", "ravageur", "blister", platform names…) **will
never be exhaustive**, and most are video-game-biased. This audit classifies every
such list and studies how to drop it or **de-literalize** it (derive it from data
instead of naming it).

---

## The principle

> Because we are **multi-source**, noise can be *defined relative to the data*
> instead of enumerated. A token is noise not because it's on a list, but because
> the data tells us so.

Three generic, exhaustiveness-free mechanisms replace most lists:

1. **Cross-source consensus (≥2 sources).** The signal is the tokens independent
   sources *agree on*; the noise is the per-listing extras. `Mille Sabords`
   appears in every source → signal; `Gigamic` / `blister` / `FR` appear in one →
   noise. **No word list needed.** (Already half-built: the anchor-de-noise in
   `matchUtils.ts`.)
2. **Corpus frequency / IDF (single-source fallback + global).** A token appearing
   across many *unrelated* catalog items is generic (noise); a rare token is
   distinctive (signal). Learn it from `RawName.value` / `Item` titles —
   self-updating, exhaustive by construction, zero literals. `blister` occurs in
   thousands of rows → noise; `sabords` in three → signal.
3. **Provider-declared structured fields.** Platform, edition, condition, language
   should come from the provider's *structured* data (Okkazeo JSON-LD, ScreenScraper
   platform field, a listing's condition field), **not be parsed out of the title
   string**. If the provider says the platform, we never guess `ps4` from the title.

The hierarchy: prefer (3) when the provider gives structure; else (1) when
multi-source; else (2) as the self-calibrating floor. Literal lists become a last
resort, ideally empty.

---

## Inventory & verdicts

### 🔴 Generic content heuristics — TARGET (remove / de-literalize)

These try to enumerate "all noise in the universe". Replaceable by the mechanisms above.

| List | File | Verdict |
| --- | --- | --- |
| `SUFFIX_PATTERNS` (305), `PREFIX_PATTERNS` | `titleUtils.ts` | Consensus + IDF for display; keep a *minimal* residual only for single-source edge cases |
| `PLATFORMS`, `PLATFORM_SUFFIX_PATTERNS` | `titleUtils.ts` | Prefer provider-declared platform (3); closed taxonomy only as fallback (platforms are a finite real-world set, acceptable to name *if* sourced structurally first) |
| `CLASSICS_KEYWORDS` (**duplicated ×3**) | `gameLookup.ts`, `priceResolver.ts`, `pricecharting/fetch.ts` | DRY first (one source), then provider-declared edition where possible |
| `GENERIC_TITLE_TOKENS`, `RESOLVER_GENERIC_TOKENS`, `RESOLVER_PLATFORM_TOKENS`, `NON_CANONICAL_CONTEXT_TOKENS`, `TITLE_STOP_WORDS` | `evidence/*`, `pricecharting/fetch.ts` | Replace stoplists with IDF (corpus-frequent = generic) |
| `BROAD_SCREENSCRAPER_FALLBACK_WORDS`, `NON_DISTINCTIVE_SCREENSCRAPER_TOKENS` | `screenscraper/resolver.ts` | IDF (distinctiveness = rarity), not a named set |
| word-boost `criquet\|ravageur\|…`, accent `+1500`, CJK `-200`, magic noise penalties | `displayTitleScore.ts` | **DELETE.** Pure over-fit to test titles + locale bias. Replaced by tier→consensus→quality. Nothing to generalize. |
| `EDITION_PATTERNS` | `evidence/edition.ts` | De-literalize to structural ("(…)" / "édition X" / ordinal), or provider-declared |

### 🟠 Provider-name privilege — BIAS (replace with declared capability)

| List | File | Verdict |
| --- | --- | --- |
| `REAL_BOX_COVER_SOURCES` (`bgg`, `screenscraper`, …) | `attachmentDisplayScore.ts` | Replace with the provider's declared `isRealBoxCover` *capability*, not a name set |

### 🟢 Provider-adapter schema — LEGITIMATE (keep, encapsulated)

A connector must parse **its own source's format**; that is plug-and-play, not generic guessing.

| List | File | Why it stays |
| --- | --- | --- |
| `LAUNCHBOX_XML_BLOCKS`, `COVER/BACKGROUND/LOGO/SCREENSHOT/BACK_TYPE_PRIORITY` (`"Box - Front"`, `"Fanart - Background"`…) | `launchbox/*` | These are LaunchBox's *own* image-type names — its API schema |
| `SCREEN_SCRAPER_ENV_NAMES`, `PRESTASHOP_RETAILER_CONFIGS`, `SUGGESTION_GAME_CATEGORIES` (IGDB codes) | provider modules | Source-specific config owned by the module |

### ⚪ Factual taxonomy / small enum — KEEP

| List | File |
| --- | --- |
| `VALID_PEGI_AGES` (3/7/12/16/18), `GAME_USED_CONDITIONS`, `IMAGE_TRANSFORM_QUERY_PARAMS`, `CONSOLIDATABLE_KINDS`, `CAPABILITIES` | various |

Closed, real-world, factual sets — naming them is description, not a noise guess.

### ⚪ Test / probe data — KEEP

`FALLBACK_BARCODES` / `FALLBACK_QUERIES` / `METADATA_PROBE_SAMPLES` / `RAW_KEY_IGNORE` — health-check & mapping-probe fixtures, not runtime logic.

---

## Residual hard cases (study before deleting)

- **Reverse-meaning discards** (`DISCARD_PATTERNS`: "boîtier seul", "no game",
  "case only") — these change *what is being sold*, so consensus/IDF won't catch
  them. Likely a small **structural** rule (`X seul|only|vide|sans`) + a
  price-outlier signal, rather than enumerating every item. Keep minimal.
- **Platforms** — a closed taxonomy is acceptable, but only as a *fallback* after
  trying provider-declared platform. Don't grow the title-parsing list.
- **Single-source, brand-new product** — no consensus and not yet in the corpus.
  IDF degrades gracefully (unknown token = treated as signal, i.e. kept) which is
  the safe default (we'd rather keep a real word than strip it).

---

## Net direction

| Today | Target |
| --- | --- |
| Enumerate noise words (never exhaustive, VG-biased) | Derive noise from consensus + corpus frequency |
| Parse platform/edition/condition from the title string | Read them from the provider's structured fields |
| Provider-name privilege sets | Declared capabilities |
| Over-fit scoring (`ravageur`, `+1500`, CJK penalty) | Delete; tier→consensus→quality |

Most lists shrink to empty or to a small structural rule. The few that remain are
either a real closed taxonomy or a provider's own schema — both legitimate.

Sequencing: this rides on the [unbiased_ranking.md](unbiased_ranking.md) work —
**titles first** (consensus replaces the title noise lists and deletes the
`displayTitleScore` over-fit), then the IDF corpus mechanism, then platform/edition
from structured fields. Tracked in [backlog.md](backlog.md).
