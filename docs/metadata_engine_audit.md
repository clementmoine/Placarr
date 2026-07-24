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
| P0 accept→purge | 0 ouvert (3 faits 2026-07-24) |
| P1 structural | 0 ouvert |
| P2 cleanup | 0 ouvert (word-list → IDF = long terme hors compteur) |
| God files >1.5k LOC | 0 (scindés 2026-07-24) |

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

### P0 — accept→purge _(faits 2026-07-24)_

| Issue | Fix |
| ----- | --- |
| ~~Covers store ≠ present~~ | `attachmentTitleAllowedForItem` |
| ~~`shelfType` omitted~~ | Threaded on games/hardware identity calls |
| ~~Offer link ≠ cover gates~~ | Shared `priceListingSharesItemIdentity` |

### P1 — accept→purge / structure

| Issue | Symptom | Where | Fix |
| ----- | ------- | ----- | --- |
| ~~**Threshold zoo**~~ | — | — | **Fait** — `identityThresholds` 0.58 / 0.42 |
| ~~**Facts purge oscillates**~~ | — | — | **Fait** — purge after fieldEvidence; present défend une fois |
| ~~**Price offers unfiltered at write**~~ | — | — | **Fait** — `filterPriceOfferInputsForPersist` |
| ~~**God files**~~ | — | — | **Fait** — facades + leaves |
| ~~**Parallel TITLE_STOP_WORDS**~~ | — | — | **Fait** — `IDENTITY_*` DRY |
| ~~**List present loads priceOffers + double purge**~~ | — | `present.ts` | **Fait 2026-07-24** — purge unique ; list sans priceOffers ; covers marketplace écrites en Attachment. |
| ~~**Missing present-path integration tests**~~ | — | — | **Fait 2026-07-24** — `present.identityGate.test.ts` + `identityGateParity.test.ts`. |
| ~~**No locked 0.58 vs 0.45 mismatch scenario**~~ | — | — | **Fait 2026-07-24** — floors 0.58 / 0.42 + parity tests. |

### P2 — cleanup

| Issue | Symptom | Where | Fix |
| ----- | ------- | ----- | --- |
| ~~**Dead hardware soft branches in titleMatch**~~ | — | `titleMatch.ts` | **Fait 2026-07-24** — early-return residual only ; soft token path games/media. |
| ~~**FlareSolverr serial vs worker concurrency 6**~~ | — | `workerConcurrency.ts` ; `flareSolverr.ts` | **Fait 2026-07-24** — cap ≤3 avec Flare ; outcome logs ; force override. |
| ~~**Docs / TESTING point at deleted paths**~~ | — | — | **Fait 2026-07-24** (cleanup docs). |

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
| `enrich/fetch.ts` | ~1160 | orchestrator (+ gating / merge / observationRanking / book*) |
| `enrich/storage.ts` | ~412 | persist orchestrator (+ gallery/cover/item sync leaves) |
| `enrich/titleMatching.ts` | ~78 | facade re-exports (`titles/*` leaves) |
| `enrich/titles/metadataTitleAlign.ts` | ~218 | align orchestrator (+ series/score/volume/better-match leaves) |
| `enrich/titles/residualIdentity.ts` | ~137 | residual match facade (+ tokens/volumes/pairEvaluate leaves) |
| `commerce/pricing/resolver.ts` | ~645 | cache/persist/refresh orchestrator (+ pricePipeline / priceTypes) |
| `enrich/media/attachmentDisplayScore.ts` | ~42 | facade (+ types / platformGate / scoring / coverDisplayRank) |
| `identify/evidence/compile.ts` | ~750 | compile + confidence (+ consensusTitle/resolve extracted) |

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
| 5 | Collapse thresholds + delete stopword copies / dead code | DRY / KISS | **Fait 2026-07-24** — floors dans `identityThresholds.ts` (0.58 standard, 0.42 barcode-only); catalog URL aligné sur 0.58; stopwords DRY |
| 6 | Present-path + threshold golden tests; refresh docs | Lock contracts | **Fait 2026-07-24** — `identityGateParity.test.ts` + `present.identityGate.test.ts` |
| 7 | Split god files **only after** SSOT locked | Otherwise chaos moves | **Fait 2026-07-24** — fetch/storage/storeMetadata/title/residual/pricing/attachmentDisplayScore scindés en facades + leaves. |

## Principles verdict

Providers plug-and-play + empty blindness allowlist = healthy. SSOT steps 1–7
locked. Marketplace covers write-time only (no present inject). FlareSolverr
worker concurrency capped when configured. Remaining long-term: word-list → IDF.
