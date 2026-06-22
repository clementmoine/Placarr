# Unbiased, Data-First Ranking Engine

How Placarr decides which datum wins for every field of a record (title,
description, cover, facts, …) across multiple providers — **without ever
privileging a provider by name**.

This document refines [provider_agnostic_architecture.md](provider_agnostic_architecture.md):
that doc made the *fetching/merging* engine capability-driven but still ranked
fields by a per-provider `weight`. The principle below supersedes weight-based
selection.

---

## 1. The principle

> **The value is in the data, not in who provides it.**

- We **never** hardcode "for video games, use ScreenScraper first" (or any
  provider, for any field). No provider is our designated source.
- A provider may *objectively* be the best source for a field — that does **not**
  make it a privileged source. We take its data on the same factual footing as
  everyone else's.
- The app is **plug-and-play and agnostic**: a provider is a module that
  *declares*, per type, what it can supply (canonical names? covers? facts?). If
  a provider breaks or is removed, ranking degrades gracefully to the next best
  *datum* — never to "our backup provider".
- Therefore ranking must rest only on **factual properties of the datum** and on
  **agreement between independent sources**, both of which are provider-neutral.
  We must always have a reliable way to determine the best datum offered to us.

What this bans: per-provider weights, per-provider flags used as privilege,
`providerId === "x"` branches in the core engine.

What this allows: per-field, per-type **capabilities** that a provider *declares*
about its data (e.g. "I provide canonical board-game titles"). That is a factual
description of the datum's provenance, not a privilege — any other provider
declaring the same capability is treated identically.

---

## 2. The bias to remove (current state, with locations)

| Bias | Where |
| --- | --- |
| Per-provider merge weights (`screenscraper: 0.9`, `igdb: 0.85`, …) | `src/services/providerRegistry.ts` (`PROVIDER_METADATA_EXTENSIONS`) |
| Per-provider flags as privilege (`isRealBoxCover`, `isSecondary`) | same |
| Literal name hardcode (`providerId === "screenscraper" ? 6 : 12`) | `src/services/metadataFetch.ts` |
| Hardcoded "real box cover" provider set | `attachmentDisplayScore.ts` (`REAL_BOX_COVER_SOURCES`) |

These must be replaced by data-property + consensus scoring (below).

---

## 3. What is already unbiased (do not reinvent — extend it)

- **Type + capability addressing**: `providersForType(type)` and
  `capabilityCoverage(type, capability)` in `providerRegistry.ts` already let the
  engine ask *"every provider serving `boardgames` that declares `cover`"* —
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
  1. TIER       — factual declared properties of the datum
                  (isCanonical, region/language, role e.g. cover-front)
  2. CONSENSUS  — agreement across DISTINCT, INDEPENDENT sources,
                  measured by the field's similarity metric
  3. QUALITY    — intrinsic, objective, cheap quality of the datum
```

Tier *leads*; consensus *breaks ties within a tier*; quality is the *final*
tie-break. There is no single infallible metric — **the layering is what makes it
robust**.

### Why consensus must not be the primary signal

Consensus alone is **not** infallible, and this is deliberate:

1. **Majority noise** — many marketplace listings can all agree on a junk title
   (`"Mille Sabords ! Gigamic"` ×5). Pure consensus would elect the junk.
2. **Non-independent sources** — N mirror sites scraping the same wrong value is
   "consensus" without truth.

Mitigations baked into the model:
- Consensus is **second** to the factual tier (canonical/locale leads).
- Count **distinct, independent** sources, and weight agreement among
  *canonical-declared* data higher than agreement among raw listings.
- A **quality penalty** (noise/length for titles, etc.) is the final tie-break.

---

## 5. Per-field instantiation

The model is the same; only the similarity metric and the quality measure differ.

### Titles
- **Tier**: titles carry, in addition to `region`, an `isCanonical` property —
  the title analogue of the image "cover-front" role. A provider declares (per
  type) whether its title is canonical/official. Priority:
  **canonical+locale → canonical → locale → rest.**
- **Consensus**: the **medoid** — the candidate with the highest average
  text-proximity to all others. (`{Mille Sabords ×4 anchors, Mille Sabords !
  Gigamic ×1}` → medoid = `Mille Sabords`.)
- **Quality**: shorter / cleaner (fewer non-consensus / junk tokens) wins ties.

> Open question answered: "is a title that is much closer to everything else in
> the list the best?" — Yes, as a **tie-breaker within a tier**, never as the
> sole criterion (majority-noise risk). It is the medoid idea, and it is already
> how images/facts work.

### Images
- **Tier**: role (cover-front) → region/language (`localeBonusForAttachmentRole`).
- **Consensus**: **perceptual-hash agreement** — the same image reached by the
  most distinct, independent sources (dHash clustering already exists in the
  dedup path). This is the image analogue of title medoid.
- **Quality**: *objective and cheap* — resolution, aspect-ratio appropriate to
  the role (a cover is portrait-ish), not padded / not watermarked. **Avoid**
  aesthetic/ML "visual quality" scoring (expensive, fuzzy) unless proven needed.

### Facts (players, duration, year, …)
- **Tier**: typed value; canonical-declared sources first.
- **Consensus**: the **mode** (most-agreed value across distinct sources) —
  already `applyConsensus`.
- **Quality**: completeness / specificity of the value.

### Descriptions
- Already locale-ranked via `pickBestLocalizedDescription` + per-provider
  `defaultLanguage`. Keep locale tier; add consensus only if needed (longest is a
  weak proxy — prefer locale + a light quality measure).

---

## 6. The generic engine: query by type, never by name

Providers self-declare, per type, their capabilities (`canonical` titles?
`cover`? `facts`? `price`?). The engine:

1. asks the registry for **all providers serving `type` that declare
   `capability`** (`providersForType` / `capabilityCoverage` — already present),
2. fetches their data concurrently,
3. ranks the **data** with the model in §4.

It must **never** branch on `providerId === …`. Removing the name hardcodes from
the fetch/rank path (§2) is the concrete task.

---

## 7. Language: display preference vs. identity/search

The locale tier of §4 is **not** a global "French first" rule — it is a per-user
**display preference**. Underneath, the engine keeps the best datum *per language*
so it can serve any display language and search across all of them. Two concerns
that are conflated today (FR-biased everywhere) must be separated:

- **Identity / search = language-agnostic.** A user may reach an item by the name
  that speaks to them: `Shingeki no Kyojin`, `Attack on Titan`, or `L'Attaque des
  Titans` all resolve to the same record. Matching is done against the **union of
  all language variants + aliases**, never against the French title alone. (Same
  invariant as barcode→item: maximize recall, never confidently wrong.)
- **Display = one language, the user's preference.** Pick the best title *in that
  language*, with a fallback chain. French today; switchable to English (or any
  language) per user tomorrow — zero engine change.

### Per-language canonical data
Per item, per field, keep the best canonical datum **per language**, each ranked by
the same `tier → consensus → quality` engine *scoped to that language bucket*
("for EN, the consensus of EN sources picks the best EN title"). Plus retain the
full alias set for matching.

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
- Present: `inferTextLanguage`, `languageRank`, per-language *description* tagging
  (`metadataMerge.ts`), `aliases` storage, `regionalTitles`.
- Missing: per-language *title* bucketing (today: one FR-biased title); name→item
  search across aliases/variants (today: FR title only); user-driven display order
  (today: `LOCALE_REGION_ORDER` hardcoded fr-first → make it a user preference).

### Provider-internal hardcode is allowed
A connector may hardcode what is specific to **its own** workings (its API field
names, its XML/JSON schema — e.g. `LAUNCHBOX_XML_BLOCKS`, BGG's XML structure). That
is encapsulated, plug-and-play, and is *not* app-global logic. The boundary:
**provider-internal = fine; cross-cutting app logic (language, shelf type) = must be
generic.** (See the 🟢 row in [word_list_audit.md](word_list_audit.md).)

## 8. Proof-of-concept already shipped (board games)

The board-game work validated the direction end-to-end:
- Board-game anchors wired into the typeless (generic) scan path *in parity with*
  the video-game stack — so classification is decided by evidence, not by which
  type happened to have providers wired (`lookups.ts`).
- A type signal derived from the **data** (category phrase / publisher tokens in
  listings), not from a provider, biases classification (`boardGameSignal.ts`).
- Okkazeo added as a plug-and-play board-game provider that *declares* a canonical
  name (JSON-LD, gtin13-verified), an FR-tagged cover (`role: "fr"`) and
  region-tagged titles — feeding the generic locale ranking, adding **zero** new
  ranking logic (`providers/okkazeo/`).
- Display name fixed *structurally*, not by hardcoding: a trusted/canonical
  anchor's clean title now wins over a noisier marketplace superset, and the
  database fallback no longer fabricates a fake-canonical from an echoed listing
  (`compile.ts`, `matchUtils.ts`). No "strip Gigamic" hardcode.

These are the first instances of "describe the datum factually, let it win on its
merits."

---

## 9. Migration path

1. **Titles first** (live pain, sets the reusable pattern): add `isCanonical` to
   title candidates (declared per type), implement tier → medoid-consensus →
   quality in `pickBestRegionalTitle`.
2. **De-bias**: replace `PROVIDER_METADATA_EXTENSIONS` weights and
   `isRealBoxCover`/`isSecondary` with datum properties + consensus; delete the
   `providerId === …` hardcodes; derive `REAL_BOX_COVER` from a declared
   capability, not a name set.
3. **Generalize** the title pattern to images (perceptual-hash consensus +
   objective quality) and facts (already `applyConsensus`).
4. **TDD throughout** — lock current good outcomes first, refactor green (see the
   workflow in [provider_agnostic_architecture.md](provider_agnostic_architecture.md)).

Invariant to preserve at every step: **no provider name in the ranking, and the
barcode→item identification is never confidently wrong.**
