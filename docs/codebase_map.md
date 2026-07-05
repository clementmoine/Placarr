# Cartographie codebase — où aller quand…

> Complète [core_architecture.md](core_architecture.md) (principes + piliers).
> Dernière mise à jour : **2026-07-05**.

## Structure

```
src/
  providers/     plugins (1 dossier = 1 source)
  core/
    identify/    barcode → type produit
    enrich/      metadata, covers, titres
    collect/     item, jobs background
    commerce/    prix, retailer
    catalog/     registry, bootstrap
    locale/      préférences région/langue
  lib/           auth, db, http, client, dev
  app/ + components/
```

**Entrypoints** : `@/core` (facade) ou `@/core/<pilier>/…`.

---

## Où aller selon le bug

| Symptôme | Pilier | Fichiers clés |
|----------|--------|---------------|
| Mauvais type au scan | identify | `evidence/compile.ts`, `resolver.ts` |
| Mauvaise plateforme | identify | `platformPick.ts`, `platforms/platforms.ts` |
| Metadata / cover | enrich | `fetch.ts` (incl. merge), `storage.ts`, `media/attachmentDisplayScore.ts` |
| Refresh bloqué | collect | `jobs/backgroundWorkQueue.ts`, `enrichment.ts` |
| Prix | commerce | `pricing/resolver.ts` (incl. cache policy), `pricing/itemDisplay.ts` |
| Ajouter un provider | catalog + providers | `catalog/registry.ts`, `providers/<id>/` |

---

## Ajouter un provider

1. `providers/<id>/`
2. Une ligne dans `core/catalog/registry.ts`
3. `pnpm test` + `pnpm providers:audit:mapping`
