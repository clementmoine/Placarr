# Architecture core — 5 piliers

> Providers = plugins (`src/providers/`). Core = produit. **Le nombre de fichiers n’est pas le problème — l’absence de frontière claire l’est.**

## Piliers (2026-07-05)

| Pilier | Question | Import racine | Contenu |
|--------|----------|---------------|---------|
| **identify** | « Ce barcode = quoi ? » | `@/core/identify/` | evidence, lookup, resolver, platforms |
| **enrich** | « Quelles metadata + covers ? » | `@/core/enrich/` | fetch, merge, storage, media/, titles/, search/ |
| **collect** | « Comment vit l’item en collection ? » | `@/core/collect/` | item, jobs/ |
| **commerce** | « Quel prix / quelle annonce ? » | `@/core/commerce/` | pricing/, retailer/ |
| **catalog** | « Quels providers, comment les brancher ? » | `@/core/catalog/` | registry, bootstrap, guard |

Transverse : `core/locale/` (préférences UI/région).

**API publique** : `@/core` ré-exporte les entrypoints (`resolveBarcode`, `getMetadata`, `fetchAndStoreMetadata`, …). Le reste = imports ciblés dans le pilier.

## Principes pro (core)

### 0. MatchContext — tous écrivent, tous lisent

Un seul sac de match partagé (`MatchContext` dans `types/providerModule.ts`,
builder `core/catalog/matchContext.ts`) :

| Champ | Exemples |
|-------|----------|
| `barcodes` | EAN / UPC / ISBN contribués par n'importe quel provider |
| `titles` | Titre + aliases + titres régionaux (soft match / search) |
| `acceptanceTitles` | Titres fiables pour validation marketplace |
| `releaseDate` / `platformKey` / `externalIds` | Discriminants soft |

- **Enrich** : chaque passe rebuild le contexte depuis les résultats déjà connus
  (`ctx.match` sur `MetadataAdapterContext`).
- **Prix** : `BarcodePriceRefreshContext` *est* un `MatchContext` (+ alias legacy
  `cleanedBarcode` / `primaryName` / `fallbackNames`). Seek multi-barcode via
  `matchPriceSeekQueries` — un EAN découvert par un provider est essayé par tous.
- **Catalog links** : `isVerifiedCatalogProductUrl` sur le module provider (pas de
  literal id hors `providers/`).
- Règle : si un provider a les aliases ou l'EAN, **tous** les providers suivants
  en profitent — pas de silos par module.

### 1. Couplage d'usage > nombre de fichiers

Si deux modules ne sont importés **que ensemble**, les fusionner. Exemples fusionnés (2026-07-05) :

| Avant | Après |
|-------|-------|
| `fetch.ts` orchestrator | **`enrich/fetch.ts`** (+ `metadataFetchGating` / `merge` / `mergeObservationRanking` / book* re-extraits) |
| `storage.ts` persist | **`enrich/storage.ts`** (+ `media/image*` / crop / localize / coverBootstrap / gallery+cover+item sync) |
| `compile.ts` consensus override | **`identify/evidence/compile.ts`** (+ `consensusTitle` / `resolve` re-extraits) |
| `resolver.ts` prix | **`commerce/pricing/resolver.ts`** (+ `priceTypes` / `pricePipeline` / `cachePolicy` / `outlierTrim`) |
| `itemDisplay.ts` + `metadataPriceFallback` | **`commerce/pricing/itemDisplay.ts`** |
| `catalog.ts` + `materializeProviderInfo` | **`catalog/catalog.ts`** |

Imports publics stables : `@/core/enrich/fetch`, `@/core/commerce/pricing/resolver` (re-exporte cachePolicy), `@/core/identify/evidence/compile` (re-exporte consensusTitle/resolve).

### 2. DRY ≠ moins de fichiers

- **DRY** = une seule source de vérité par règle métier.
- Un fichier de **data** (`platforms/data/*.json`) ou **1400 lignes de matching** (`titleMatching.ts`) est OK si c’est **une cohésion**.
- **Anti-pattern** : fusionner identify + enrich « pour réduire les dossiers » → god modules, tests fragiles.

### 2. Où mettre du code neuf

```
Scan / type / plateforme     → identify/
Fetch / merge / persist      → enrich/
Polling / refresh / item UX  → collect/
Prix / URLs retailer         → commerce/
Registry / bootstrap         → catalog/ (+ providers/<id>/)
Auth / DB / HTTP             → lib/
```

### 3. Quand fusionner vs scinder

| Fusionner | Scinder |
|-----------|---------|
| 3 helpers < 50 lignes, même feature | Fichier > ~800 lignes avec 2+ raisons de changer |
| Barrel `index.ts` mort | Pipeline stage testé isolément (evidence/compile) |
| Doublon prouvé par test | Data générée / snapshots |

### 4. Ce qu’on ne fige plus

- ~~Ne pas fusionner les pipelines barcode~~ → **identify/** est un pipeline, **enrich/** un autre ; on peut les **regrouper sous un pilier**, pas les mélanger en un seul fichier.
- Les providers restent **hors core** — seule contrainte non négociable.

## Taille actuelle (~186 fichiers prod sous `src/core/`)

| Pilier | Gros morceaux |
|--------|---------------|
| enrich | storage, fetch, titleMatching (facades), attachmentDisplayScore leaves |
| identify | compile, resolver, titleUtils, platforms |
| collect | present, media, jobs/workRunner |
| catalog | registry, sourceTraits, mappingAudit |
| commerce | pricing/resolver, retailer/titleMatch |
| locale | preference |

**Prochaines réductions utiles** (voir [metadata_engine_audit.md](metadata_engine_audit.md)) :

1. ~~Découper `enrich/storage.ts` images / crop / localize / cover bootstrap / store stages~~ **fait 2026-07-24** — `media/image*` + `croppedCoverSync` + `attachmentLocalization` + `metadataCoverBootstrap` + `prepareMetadataGallery` / `resolveMetadataCoverHero` / `syncItemAfterMetadataStore` ; `storage.ts` = orchestrateur.
2. ~~`fetch` gating/merge/book~~ **partiel 2026-07-24** — `metadataFetchGating` / `merge` / `mergeObservationRanking` / `bookSearch*`.
3. ~~`platformSources.ts` → JSON/data file + loader~~ **fait 2026-07-19** (`platforms/data/*.json`).
4. ~~`titleMatching` god file~~ **fait 2026-07-24** — facade `@/core/enrich/titleMatching` + leaves `titles/*` (align, similarity, search, variant, attachments…).
5. ~~`metadataTitleAlign` / `residualIdentity`~~ **fait 2026-07-24** — align orchestrateur + series/score/volume/better-match ; residual facade + tokens/volumes/pairEvaluate.
6. DRY titres identify↔enrich — **partiel 2026-07-19** (`normalizeForTokens` leaf) ; ne pas fusionner les matchers.

## Checklist PR core

1. Un pilier, une responsabilité — pas de import `providers/*` hors `catalog/` + modules provider.
2. Entrypoint consommé via `@/core/enrich` ou chemin pilier, pas 4 hops.
3. Test qui encode le comportement, pas la structure de dossiers.
4. `pnpm test` vert.
