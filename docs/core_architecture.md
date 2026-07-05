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

### 1. Couplage d'usage > nombre de fichiers

Si deux modules ne sont importés **que ensemble**, les fusionner. Exemples fusionnés (2026-07-05) :

| Avant | Après |
|-------|-------|
| `fetch.ts` + `metadataFetchGating` + `merge` + `mergeObservationRanking` + `bookSearch*` | **`enrich/fetch.ts`** (~2300 L) |
| `storage.ts` + `imageDownload` + `imageAssets` | **`enrich/storage.ts`** |
| `compile.ts` + `consensusTitle` + `resolve.ts` | **`identify/evidence/compile.ts`** |
| `resolver.ts` + `cachePolicy` + `outlierTrim` | **`commerce/pricing/resolver.ts`** |
| `itemDisplay.ts` + `metadataPriceFallback` | **`commerce/pricing/itemDisplay.ts`** |
| `catalog.ts` + `materializeProviderInfo` | **`catalog/catalog.ts`** |

Imports publics : `@/core/enrich/fetch` (ex-merge), `@/core/commerce/pricing/resolver` (ex-cachePolicy).

### 2. DRY ≠ moins de fichiers

- **DRY** = une seule source de vérité par règle métier.
- Un fichier de **3500 lignes de data** (`platformSources.ts`) ou **1400 lignes de matching** (`titleMatching.ts`) est OK si c’est **une cohésion**.
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

## Taille actuelle (~156 fichiers prod)

| Pilier | Fichiers prod | Gros morceaux |
|--------|---------------|---------------|
| enrich | ~70 | storage, fetch, titleMatching, attachmentDisplayScore |
| identify | ~37 | compile, resolve, titleUtils, platformSources |
| collect | ~17 | queryCache, media |
| catalog | ~18 | mappingAudit, sourceTraits |
| commerce | ~13 | pricing/resolver |
| locale | ~6 | preference |

**Prochaines réductions utiles** (par valeur, pas par dogme) :

1. Découper `enrich/storage.ts` en persist / images / format (3 fichiers, même pilier).
2. Extraire `enrich/titles/matching.ts` ← fusion logique titre barcode + metadata (DRY réel).
3. `platformSources.ts` → JSON/data file + loader (séparer data et code).

## Checklist PR core

1. Un pilier, une responsabilité — pas de import `providers/*` hors `catalog/` + modules provider.
2. Entrypoint consommé via `@/core/enrich` ou chemin pilier, pas 4 hops.
3. Test qui encode le comportement, pas la structure de dossiers.
4. `pnpm test` vert.
