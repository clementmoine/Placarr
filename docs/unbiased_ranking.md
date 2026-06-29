# Unbiased, Data-First Ranking Engine

How Placarr decides which datum wins for every field of a record (title,
description, cover, facts, …) across multiple providers — **without ever
privileging a provider by name**.

This document refines [provider_agnostic_architecture.md](provider_agnostic_architecture.md):
that doc made the _fetching/merging_ engine capability-driven but still ranked
fields by a per-provider `weight`. The principle below supersedes weight-based
selection.

---

## 1. The principle

> **The value is in the data, not in who provides it.**

- We **never** hardcode "for video games, use ScreenScraper first" (or any
  provider, for any field). No provider is our designated source.
- A provider may _objectively_ be the best source for a field — that does **not**
  make it a privileged source. We take its data on the same factual footing as
  everyone else's.
- The app is **plug-and-play and agnostic**: a provider is a module that
  _declares_, per type, what it can supply and emits typed observations (object
  title, listing title, cover image, listing photo, fact, alias, offer, ...). If a
  provider breaks or is removed, ranking degrades gracefully to the next best
  _datum_ — never to "our backup provider".
- Therefore ranking must rest only on **factual properties of the datum** and on
  **agreement between independent sources**, both of which are provider-neutral.
  We must always have a reliable way to determine the best datum offered to us.

What this bans: per-provider weights, per-provider flags used as privilege,
`providerId === "x"` branches in the core engine.

What this allows: per-field, per-type **capabilities** that a provider _declares_
about what it can fetch, plus per-observation roles that describe where the value
came from (reference page, catalog product, marketplace listing, user input, ...).
That is factual provenance, not privilege — any other provider emitting the same
kind of observation is treated identically.

### Canonical is an output, not an input flag

The engine must not accept `canonical: true` as a magical provider promise. A
provider can tell us that a title came from a **reference record**, a **catalog
product**, an **offer/listing**, a **provider-grouped alias**, or **user input**.
The canonical/display title is the **projection chosen by Placarr** from those
observations.

Same rule for images and facts:

- a product cover / box-front is an image candidate for display,
- a marketplace photo is a weak display candidate but still an observation,
- a structured fact is stronger than text scraped from a listing,
- an offer title is evidence, but it is not an objective name for the item.

### Never throw observations away

Placarr should almost never discard a useful, lawful observation. Marketplace
titles, listing photos, user imports, weak aliases, raw offers and source URLs may
rank low, be excluded from public search, or only count as weak evidence — but
they must remain available for audit, debug, future ranking engines, and offline
reprojection.

The durable shape is:

```
raw observations -> normalized candidates -> ranked projection(engineVersion)
```

Changing the ranking engine tomorrow should let us recompute display titles,
covers, facts and aliases from stored observations without re-querying every
provider.

---

## 2. The bias to remove (current state, with locations)

> **STATUS 2026-06-29.** The literal name hardcodes and the "real box cover"
> provider set are **gone** (blindness guard allowlist is empty). Per-provider
> flags/weights no longer drive the **barcode** path. The **only** row still live is
> per-provider `weight` in the metadata **enrichment** merge
> (`src/services/metadata/merge.ts` `resultsByWeight`, now a soft pre-sort behind the
> observation-title pick) — the last bias to retire here.

| Bias                                                               | Where                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Per-provider merge weights (`screenscraper: 0.9`, `igdb: 0.85`, …) | `src/services/providerRegistry.ts` (`PROVIDER_METADATA_EXTENSIONS`) |
| Per-provider flags as privilege (`isRealBoxCover`, `isSecondary`)  | same                                                                |
| Literal name hardcode (`providerId === "screenscraper" ? 6 : 12`)  | `src/services/metadataFetch.ts`                                     |
| Hardcoded "real box cover" provider set                            | `attachmentDisplayScore.ts` (`REAL_BOX_COVER_SOURCES`)              |

These must be replaced by data-property + consensus scoring (below).

---

## 3. What is already unbiased (do not reinvent — extend it)

- **Type + capability addressing**: `providersForType(type)` and
  `capabilityCoverage(type, capability)` in `providerRegistry.ts` already let the
  engine ask _"every provider serving `boardgames` that declares `cover`"_ —
  by type and capability, never by name.
- **Consensus for images and facts**:
  - `crossSourceConsensusBonus(distinctSourceCount)` in `attachmentDisplayScore.ts`.
  - `applyConsensus` in `metadataConsensus.ts` (fact consensus).
- **Locale ranking** (provider-neutral, factual): `LOCALE_REGION_ORDER`,
  `pickBestRegionalTitle`, `regionRank`, `localeBonusForAttachmentRole` in
  `localePreference.ts`.

The work is to **generalize these to every field** and **drop the per-provider
weights** — not to build a new ranking system.

---

## 4. The unified field-ranking model

One ranking shape, identical for title / image / fact / description. No provider
name appears anywhere in it.

```
rank(field) =
  1. TIER       — factual properties of the observation
                  (source document role, field role, region/language, image role)
  2. CONSENSUS  — agreement across DISTINCT, INDEPENDENT sources,
                  measured by the field's similarity metric
  3. QUALITY    — intrinsic, objective, cheap quality of the datum
```

Tier _leads_; consensus _breaks ties within a tier_; quality is the _final_
tie-break. There is no single infallible metric — **the layering is what makes it
robust**.

### Why consensus must not be the primary signal

Consensus alone is **not** infallible, and this is deliberate:

1. **Majority noise** — many marketplace listings can all agree on a junk title
   (`"Mille Sabords ! Gigamic"` ×5). Pure consensus would elect the junk.
2. **Non-independent sources** — N mirror sites scraping the same wrong value is
   "consensus" without truth.

Mitigations baked into the model:

- Consensus is **second** to the factual tier (object-level/locale data leads).
- Count **distinct, independent** sources, and weight agreement among
  object-level observations higher than agreement among raw listings.
- A **quality penalty** (noise/length for titles, etc.) is the final tie-break.

---

## 5. Per-field instantiation

The model is the same; only the similarity metric and the quality measure differ.

### Titles

- **Tier**: title observations carry a role and source-document context. Examples:
  `object_title` from a reference page, `catalog_title` from a product fiche,
  `alias` grouped by the provider, `edition_title`, `listing_title`,
  `user_input_title`. Priority:
  **object/catalog+locale → object/catalog → provider-grouped alias/edition →
  locale evidence → listing/user input evidence.**
- **Consensus**: the **medoid** — the candidate with the highest average
  text-proximity to all others. (`{Mille Sabords ×4 anchors, Mille Sabords !
Gigamic ×1}` → medoid = `Mille Sabords`.)
- **Quality**: shorter / cleaner (fewer non-consensus / junk tokens) wins ties.

The selected `canonicalTitle` / display title is a **result** of this ranking, not
a field the provider gets to assert globally.

> Open question answered: "is a title that is much closer to everything else in
> the list the best?" — Yes, as a **tie-breaker within a tier**, never as the
> sole criterion (majority-noise risk). It is the medoid idea, and it is already
> how images/facts work.

### Images

- **Tier**: image role and source context (`cover-front`, `product_packshot`,
  `listing_photo`, `user_photo`) → region/language
  (`localeBonusForAttachmentRole`).
- **Consensus**: **perceptual-hash agreement** — the same image reached by the
  most distinct, independent sources (dHash clustering already exists in the
  dedup path). This is the image analogue of title medoid.
- **Quality**: _objective and cheap_ — resolution, aspect-ratio appropriate to
  the role (a cover is portrait-ish), not padded / not watermarked. **Avoid**
  aesthetic/ML "visual quality" scoring (expensive, fuzzy) unless proven needed.

### Facts (players, duration, year, …)

- **Tier**: typed value; structured object/catalog facts before listing-derived
  facts.
- **Consensus**: the **mode** (most-agreed value across distinct sources) —
  already `applyConsensus`.
- **Quality**: completeness / specificity of the value.

### Descriptions

- Already locale-ranked via `pickBestLocalizedDescription` + per-provider
  `defaultLanguage`. Keep locale tier; add consensus only if needed (longest is a
  weak proxy — prefer locale + a light quality measure).

---

## 6. The generic engine: query by type, never by name

Providers self-declare, per type, their capabilities (`identify`, title
observations, `cover`, `facts`, `price`, ...). The engine:

1. asks the registry for **all providers serving `type` that declare
   `capability`** (`providersForType` / `capabilityCoverage` — already present),
2. fetches their data concurrently,
3. ranks the **data** with the model in §4.

It must **never** branch on `providerId === …`. Removing the name hardcodes from
the fetch/rank path (§2) is the concrete task.

---

## 7. Language: display preference vs. identity/search

The locale tier of §4 is **not** a global "French first" rule — it is a per-user
**display preference**. Underneath, the engine keeps the best datum _per language_
so it can serve any display language and search across all of them. Two concerns
that are conflated today (FR-biased everywhere) must be separated:

- **Identity / search = language-agnostic.** A user may reach an item by the name
  that speaks to them: `Shingeki no Kyojin`, `Attack on Titan`, or `L'Attaque des
Titans` all resolve to the same record. Matching is done against the **union of
  all language variants + aliases**, never against the French title alone. (Same
  invariant as barcode→item: maximize recall, never confidently wrong.)
- **Display = one language, the user's preference.** Pick the best title _in that
  language_, with a fallback chain. French today; switchable to English (or any
  language) per user tomorrow — zero engine change.

### Per-language projections

Per item, per field, keep the best projected datum **per language**, each ranked
by the same `tier → consensus → quality` engine _scoped to that language bucket_
("for EN, the consensus of EN sources picks the best EN title"). Plus retain the
full alias and observation set for matching/debug/reprojection.

```
display(field, userLang) = best[userLang] || best[fallback…] || best[neutral]
search(query)            = match query against every best[*] and every alias
```

### Nuances

- **A neutral / universal bucket is required.** Many titles are language-neutral
  (`Catan`, `FIFA 23`). Buckets are `{fr, en, ja, …, neutral}`; neutral is the
  fallback for any display language.
- **Cross-language identity must come from providers, not be inferred.** You cannot
  string-match `Attack on Titan` ≈ `Shingeki no Kyojin` — translations are not
  similar text. The link exists because a provider (BGG, TMDB) groups them as
  aliases of one entry, or via a shared external id / barcode. Trust
  provider-grouped aliases; never merge two different-language titles by similarity.
- **Language tagging feeds the buckets**: provider `defaultLanguage` →
  `regionalTitles[].region` → a version's declared language (BGG) →
  `inferTextLanguage()` as a weak fallback; `unknown` → neutral bucket.

### Already present vs. missing

- Present: `inferTextLanguage`, `languageRank`, per-language _description_ tagging
  (`metadataMerge.ts`), `aliases` storage, `regionalTitles`.
- Missing: per-language _title_ bucketing (today: one FR-biased title); name→item
  search across aliases/variants (today: FR title only); user-driven display order
  (today: `LOCALE_REGION_ORDER` hardcoded fr-first → make it a user preference).

### Provider-internal hardcode is allowed

A connector may hardcode what is specific to **its own** workings (its API field
names, its XML/JSON schema — e.g. `LAUNCHBOX_XML_BLOCKS`, BGG's XML structure). That
is encapsulated, plug-and-play, and is _not_ app-global logic. The boundary:
**provider-internal = fine; cross-cutting app logic (language, shelf type) = must be
generic.** (See the 🟢 row in [word_list_audit.md](word_list_audit.md).)

## 8. Proof-of-concept already shipped (board games)

The board-game work validated the direction end-to-end:

- Board-game anchors wired into the typeless (generic) scan path _in parity with_
  the video-game stack — so classification is decided by evidence, not by which
  type happened to have providers wired (`lookups.ts`).
- A type signal derived from the **data** (category phrase / publisher tokens in
  listings), not from a provider, biases classification (`boardGameSignal.ts`).
- Okkazeo added as a plug-and-play board-game provider that can emit both a clean
  fiche/product title (JSON-LD, gtin13-verified) and noisier marketplace evidence.
  Its FR-tagged cover (`role: "fr"`) and region-tagged titles feed the generic
  locale ranking, adding **zero** new ranking logic (`providers/okkazeo/`).
- Display name fixed _structurally_, not by hardcoding: an object-level clean
  title now wins over a noisier marketplace superset, and the
  database fallback no longer fabricates a fake-canonical from an echoed listing
  (`compile.ts`, `matchUtils.ts`). No "strip Gigamic" hardcode.

These are the first instances of "describe the datum factually, let it win on its
merits."

---

## 9. Migration path

1. **Observation model first**: introduce typed observations/candidates with
   source-document role, field role, language/region, evidence signals, and usage
   flags. `canonicalTitle` becomes a ranked projection, not a provider flag.
2. **Titles first** (live pain, sets the reusable pattern): rank title
   observations by object/catalog role + locale, then medoid-consensus, then
   cleanliness in `pickBestRegionalTitle`.
3. **De-bias**: replace `PROVIDER_METADATA_EXTENSIONS` weights and
   `isRealBoxCover`/`isSecondary` with datum properties + consensus; delete the
   `providerId === …` hardcodes; derive `REAL_BOX_COVER` from a declared
   capability, not a name set.
4. **Generalize** the title pattern to images (perceptual-hash consensus +
   objective quality) and facts (already `applyConsensus`).
5. **TDD throughout** — lock current good outcomes first, refactor green (see the
   workflow in [provider_agnostic_architecture.md](provider_agnostic_architecture.md)).

Invariant to preserve at every step: \*\*no provider name in the ranking, and the
barcode→item identification is never confidently wrong. Never discard observations
just because the current ranking engine gives them a low score.
