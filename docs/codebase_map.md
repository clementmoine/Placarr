# Cartographie codebase — où aller quand…

> Complète [core_architecture.md](core_architecture.md) (principes + piliers).
> Dernière mise à jour : **2026-07-24**.

## Structure

```
src/
  providers/     plugins (1 dossier = 1 source)
  core/
    identify/    barcode → type / plateforme
    enrich/      metadata, covers, titres, facts, liens
    collect/     item UX, present, jobs background
    commerce/    prix, retailer
    catalog/     registry, bootstrap, traits
    locale/      préférences région / langue
  lib/           auth, db, http (Flare), client, dev
  app/ + components/
```

**Entrypoints** : `@/core` (facade) ou `@/core/<pilier>/…`.

---

## Où aller selon le bug

| Symptôme                   | Pilier              | Fichiers clés                                                                                     |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| Mauvais type au scan       | identify            | `evidence/compile.ts`, `resolver.ts`                                                              |
| Mauvaise plateforme        | identify            | `platformPick.ts`, `platforms/platforms.ts`                                                       |
| Metadata / cover           | enrich              | `fetch.ts` (merge inclus), `storage.ts`, `media/attachmentDisplayScore.ts`                        |
| Lien fiche / purge present | enrich              | `providerExternalLinks.ts`, `collect/present.ts`                                                  |
| Identité titre (hardware…) | enrich + commerce   | `titles/residualIdentity.ts`, `retailer/titleMatch.ts`                                            |
| Refresh / jobs bloqués     | collect             | `jobs/workQueue.ts`, `jobs/workRunner.ts` + process `pnpm worker` (`scripts/backgroundWorker.ts`) |
| Prix                       | commerce            | `pricing/resolver.ts`, `pricing/itemDisplay.ts`                                                   |
| Ajouter un provider        | catalog + providers | `catalog/registry.ts`, `providers/<id>/`                                                          |
| Locale covers / titres     | locale + collect    | `locale/preference.ts`, `collect/media.ts`                                                        |

> **Note** : la file in-process `backgroundWorkQueue.ts` reste pour I/O local (covers, pools CPU) — **pas** pour le refresh metadata (DB `BackgroundWorkJob` + worker).

---

## Ajouter un provider

1. `providers/<id>/`
2. Une ligne dans `core/catalog/registry.ts`
3. Checklist : [provider_integration_checklist.md](provider_integration_checklist.md)
4. `pnpm test` + `pnpm providers:audit:mapping`
