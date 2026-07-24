# Metadata engine audit

> **STATUS 2026-07-24 — vivant.** Port du canvas Cursor
> `metadata-engine-audit` (enrich / collect / commerce / workers).
> File active : [backlog § Ouverts](backlog.md#ouverts--base-clean-2026-07-24).
> Principes : [core_architecture.md](core_architecture.md).

## Root cause

Acceptance and rejection are **not the same rule end-to-end**. Providers and
price refresh often accept under soft similarity or missing `shelfType`;
storage is looser on covers; present re-applies stricter residual / URL gates
and purges. Not random bugs — **multiple contracts for one decision**.

| Compteur | Valeur |
| -------- | ------ |
| P0 accept→purge | 3 |
| P1 structural | 8 |
| P2 cleanup | 3 |
| God files >1.5k LOC | 5 |

## Pipeline: where truth changes

Ideal: one identity decision at write; present only displays. Today truth
mutates at stages 3–5.

| Stage | Accept posture | Purge / filter |
| ----- | -------------- | -------------- |
| 1. Provider resolve | Often soft / `shelfType` omitted | — |
| 2. Enrich merge | `isMetadataTitleAligned` 0.58 + `shelfType` | Drop misaligned mergeInputs |
| 3. Storage | Weaker cover title filter | Partial; facts purge once |
| 4. Price merge | Write offers with no identity gate | — |
| 5. Present / list | Inject offer covers | Stricter covers + link purge ×2 |

## Findings

### P0 — accept→purge

| Issue | Symptom | Where | Fix |
| ----- | ------- | ----- | --- |
| **Covers: store looser than present** | Attachment accepted at persist, filtered on shelf/detail — gallery flickers / marketplace rows vanish. | `storage.ts` vs `media.ts` (retail + catalogCover + listing identity) | One `attachmentTitleAllowedForItem()` for store AND present. |
| **`shelfType` omitted on hardware/games gates** | Soft accept at provider/seek; residual hard-reject later (PS5↔PS One, DS↔Nintendogs). | chasse / AMC / smartoys; storage barcode; fetch edition / preferTitle; coverUrlMatch; metadataLookup 0.42 | Mandatory `{ shelfType }` on every games/hardware identity call. |
| **Price-offer link ≠ cover gates** | Fiche BM/eBay kept while cover purged (or reverse). | `coverAttachmentsFromPriceOffers` vs purge / contradict / trusted bypass | Same residual SSOT for offer cover + offer URL; marketplace ≠ PC trusted bypass. |

### P1 — accept→purge / structure

| Issue | Symptom | Where | Fix |
| ----- | ------- | ----- | --- |
| **Threshold zoo 0.42 / 0.45 / 0.58** | Same pair passes merge and fails catalog URL align (or reverse). | `isMetadataTitleAligned` · `catalogTitleAlignedWithItem` · metadataLookup · name-only retailer | One floor 0.58 + residual on hardware; 0.42 only barcode-confirmed. |
| **Facts: purge → fieldEvidence re-add → present purge** | DB holds links UI strips; repair oscillates. | `persistProviderExternalLinks`; `syncMetadataDisplayFactsFromFieldEvidence`; present ×2 | Purge after every fact mutation; present = defense only. |
| **Price offers stored unfiltered** | Wrong listings persist; filter only hides on read. | `mergePriceOffers` vs `filterItemPriceOffers` | Filter or mark rejected at write from refresh. |
| **God files violate own split guidance** | Identity tweak touches fetch/storage/titleMatching → regressions. | fetch ~2759; storage ~2063; titleMatching ~1943; pricing/resolver ~1718 | Split by change reason **after** SSOT locked ([core_architecture.md](core_architecture.md)). |
| **Parallel TITLE_STOP_WORDS / retailer tokens** | Edit one copy, miss another → silent accept/purge drift. | `identityNoise` vs fetch / titleMatch / bundleTitle; `GENERIC_RETAILER_TOKENS` | Delete copies; import `IDENTITY_*` / `listingTerms` only. |
| **List present loads priceOffers + double purge** | Shelf grids pay residual/URL × N; collect↔enrich blurred at read. | `itemListMetadataInclude.priceOffers`; `present.ts` purge ×2 | Persist covers/links at sync; drop rawValue from list; purge on write. |
| **Missing present-path integration tests** | Unit purge green while list present still wrong. | `providerExternalLinks.test` vs `presentItemFromStorage` | Golden: enrich accept → present keeps; residual reject → present purges. |
| **No locked 0.58 vs 0.45 mismatch scenario** | Threshold drift returns as “random” bugs. | `isMetadataTitleAligned` vs `catalogTitleAlignedWithItem` | Shared `it.each` fixture table across both gates. |

### P2 — cleanup

| Issue | Symptom | Where | Fix |
| ----- | ------- | ----- | --- |
| **Dead hardware soft branches in titleMatch** | Unreachable after `hardwareProductTitlesAlign` early-return. | `commerce/retailer/titleMatch.ts` | Delete dead branches; one hardware contract. |
| **FlareSolverr serial vs worker concurrency 6** | Jobs wait on Flare; 90s/60s caps → partial progressive stores. | `flareSolverr.ts`; `backgroundWorker.ts` | URL-first pinned scrapes; monitor abandon rate. |
| **Docs / TESTING point at deleted paths** | New tests land wrong; onboarding reinforces debt. | `TESTING.md`, `codebase_map.md` → `src/lib/barcode`, `src/services/barcode` | Rewrite maps to `src/core/*` + `workRunner`. **Fait 2026-07-24** (cleanup docs). |

Paths utiles : `storage` / `media` / `titleMatch` / `providerExternalLinks` / `fetch` — voir [codebase_map.md](codebase_map.md).

## Single sources of truth (target)

| Concern | SSOT | Thin wrappers | Contract |
| ------- | ---- | ------------- | -------- |
| Identity | `residualIdentityMatch` (+ `hardwareProductTitlesAlign`) | `isMetadataTitleAligned` · `priceListingSharesItemIdentity` · `catalogTitleAlignedWithItem` | `shelfType` mandatory games/hw; residual accept on hardware |
| Covers | `attachmentTitleAllowedForItem` (new) | `storage` · `media` · `coverAttachmentsFromPriceOffers` | Same traits; apply at write; present defends |
| External links | `purgeContradicted` + `reconcileFromPriceOffers` | persist · fieldEvidence · present | Purge after every mutation; marketplace ≠ PC bypass |
| Prices | `filterItemPriceOffers` | provider refresh · `mergePriceOffers` · `itemDisplay` | Filter/mark at write; display stays |

## What is healthy

| Strength | Note |
| -------- | ---- |
| 5 pillars under `src/core/` | Layout matches principles |
| Blindness allowlist empty | No provider literals outside `providers/` |
| Trait-driven covers (`sourceTraits`) | Client scorer stays provider-blind |
| Workers out of Next | `BackgroundWorkJob` + SKIP LOCKED |
| `MatchContext` shared | Enrich ↔ price seek |
| `residualIdentity` hardware SSOT | Direction right — finish locking call sites |
| Gallery preservation tests | Progressive store covered |

## God files (blast radius)

| File | LOC (approx.) | Mix |
| ---- | ------------- | --- |
| `enrich/fetch.ts` | ~2759 | fetch + gating + merge + book stopwords |
| `enrich/storage.ts` | ~2063 | persist + localize + gallery |
| `enrich/titleMatching.ts` | ~1943 | similarity + align + attachments |
| `commerce/pricing/resolver.ts` | ~1718 | resolve + cache + shelf summarize |
| `identify/evidence/compile.ts` | ~1520 | compile + confidence |

## Recommended sequence

> **Stop fixing symptoms in present only.** Every present-only purge without
> aligning write-time gates creates the next regression. Lock contracts first,
> then delete duplicates.

| # | Move | Why | État |
| - | ---- | --- | ---- |
| 1 | Unify store ↔ present cover filter | Stops gallery accept→hide | **Fait 2026-07-24** — `attachmentTitleAllowedForItem` |
| 2 | Thread `shelfType` everywhere (games/hardware) | Kills soft-accept → residual-reject | **Fait 2026-07-24** — fetch/storage/AMC/chasse/smartoys/metadataLookup (+ remaining providers as found) |
| 3 | Align offer link + offer cover on residual SSOT | One marketplace product decision | **Fait 2026-07-24** — listing title + cover share `priceListingSharesItemIdentity` |
| 4 | Purge after fieldEvidence sync; filter prices at write | DB matches UI | **Fait 2026-07-24** — purge after fieldEvidence; `filterPriceOfferInputsForPersist` on write |
| 5 | Collapse thresholds + delete stopword copies / dead code | DRY / KISS | **Partiel** — `TITLE_STOP_WORDS` → `IDENTITY_FUNCTION_WORDS` (fetch/bundle/titleMatch); seuils 0.42/0.45/0.58 encore ouverts |
| 6 | Present-path + threshold golden tests; refresh docs | Lock contracts | Ouvert (unit gate tests added) |
| 7 | Split god files **only after** SSOT locked | Otherwise chaos moves | Reporté |

## Principles verdict

Providers plug-and-play + empty blindness allowlist = healthy. Violations
concentrate in identity/cover/link contracts (multiple rules for one decision)
and read-time re-validation — not in registry design. `residualIdentity` is the
right SSOT direction; call-site discipline and store=present parity are the
missing glue.
