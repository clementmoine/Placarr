# Cartographie codebase — où aller quand…

> Complète [audit_fonctionnement.md](audit_fonctionnement.md).
> Dernière mise à jour : **2026-07-05** (big-bang `src/core/` + `src/providers/`).

## Taille réelle (hors UI)

| Zone | Rôle |
|------|------|
| `src/providers/` | **Plugins** — un dossier = un provider (plug-and-play) |
| `src/core/` | **Cœur métier** — barcode, metadata, pricing, catalog, item, media… |
| `src/lib/` | **Infra transverse** — auth, db, http, client, dev, routing, shared |
| `src/components/` + `src/app/` | UI + routes API |

**Principe** : un domaine = un dossier sous `core/`. Plus de split artificiel `lib/` vs `services/` pour le métier.

---

## Arborescence `src/core/`

```
core/
  barcode/     ← scan, evidence, compile, resolveBarcode
  metadata/    ← fetch, merge, storage, gating, helpers (ex-lib)
  pricing/     ← résolution prix + policy cache
  catalog/     ← registry (manifeste), catalog (découverte), bootstrap
  item/        ← modèle collection, enrichment polling
  media/       ← images, proxy, placeholder, cover scoring
  title/       ← séries, variantes recherche
  locale/      ← préférences langue/région UI
  jobs/        ← file background (refresh, enrich)
  games/       ← plateformes, slugs
  retailer/    ← URL produit, alignement titre catalogue
  search/      ← requêtes recherche normalisées
```

## `src/providers/` (inchangé conceptuellement)

```
providers/
  <id>/        ← module complet (index.ts + fetch/resolver…)
  shared/      ← factories scrape catalog
  prestashop/  ← configs multi-boutiques
  shopify/
```

**Ajouter un provider** : implémenter `providers/<id>/` + **une ligne** dans `core/catalog/registry.ts`.

## `src/lib/` (infra seulement)

```
lib/
  auth/        db/        http/       client/
  dev/         routing/   text/       url/
  async/       guards/    api/        shared/   ← cn(), isUrl()
```

---

## Où aller selon le bug / la feature

### Scan & type produit

| Symptôme | Aller voir |
|----------|------------|
| Mauvais type (jeu vs musique vs livre) | `core/barcode/evidence/compile.ts`, `scoring.ts`, `core/barcode/resolver.ts` |
| Mauvaise plateforme (PS2 vs PS3…) | `core/barcode/platformPick.ts`, `core/games/platforms.ts` |
| Faux positif confiant / vide honnête | `compile.confidenceLock.test.ts`, `compile.honestEmpty.test.ts` |
| Titre barcode incorrect | `core/barcode/evidence/consensusTitle.ts`, `core/barcode/titleUtils.ts` |
| Cache barcode stale | `core/barcode/lookup/cachePayload.ts` |

### Metadata & couvertures

| Symptôme | Aller voir |
|----------|------------|
| Refresh metadata ne part pas / bloqué | `core/jobs/backgroundWorkQueue.ts`, `core/item/enrichment.ts` |
| Provider pas appelé au enrich | `core/metadata/metadataFetchGating.ts`, `fetch.ts` |
| Mauvaise cover affichée | `core/metadata/merge.ts`, `mergeObservationRanking.ts`, `core/item/media.ts` |
| Merge titre / région | `core/metadata/displayScore.ts`, `core/locale/preference.ts` |
| Facts dupliqués | `core/metadata/facts/*` |
| Observations manquantes | `core/catalog/bootstrap.ts` |

### Prix

| Symptôme | Aller voir |
|----------|------------|
| Prix absents / cache | `core/pricing/resolver.ts`, `core/pricing/cachePolicy.ts` |
| Refresh prix URL-first | `core/metadata/persistProviderExternalLinks.ts` |

### Providers (plugin)

| Symptôme | Aller voir |
|----------|------------|
| Ajouter / retirer un provider | **`core/catalog/registry.ts`** |
| Comportement d'un provider | `providers/<id>/` |
| Découverte types/capabilities | `core/catalog/catalog.ts` |
| Audit mapping | `pnpm providers:audit:mapping`, `core/catalog/mappingAudit.ts` |
| Provider-blind guard | `core/catalog/blindnessGuard.test.ts` |

---

## Checklist « j'ajoute un provider »

1. `providers/<id>/` — module complet
2. **Une ligne** dans `core/catalog/registry.ts`
3. `pnpm test` + `pnpm providers:audit:mapping`
4. Rien d'autre (pas de liste d'ids hardcodée — utiliser `PROVIDER_MODULES`)

---

## Migration (2026-07-05)

| Ancien | Nouveau |
|--------|---------|
| `lib/barcode/` + `services/barcode/` | `core/barcode/` |
| `lib/metadata/` + `services/metadata/` | `core/metadata/` |
| `lib/pricing/` + `services/pricing/` | `core/pricing/` |
| `services/provider/` + `lib/provider/` | `core/catalog/` |
| `services/providers/` | `providers/` |
| `lib/core/` (utils UI) | `lib/shared/` |

Scripts : `scripts/migrate-core-structure.sh`, `scripts/rewrite-core-imports.mjs` (historique one-shot).
