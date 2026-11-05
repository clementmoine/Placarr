# Catalogue — patterns providers non-TCG (audit)

> **2026-11-05** (rafraîchi). Patterns à **réutiliser** pour tout corpus (TCG et hors TCG).
> Vision : [ARCHITECTURE.md](../ARCHITECTURE.md) § Vision — catalogues universels **en parallèle** du TCG, pas gated derrière.

## Déjà solide hors TCG

| Pattern | Où | À garder pour catalogues |
|---------|-----|---------------------------|
| Provenance de cover | [`coverProvenance.ts`](../src/core/enrich/media/coverProvenance.ts), `ProviderInfo.coverProvenanceRules` | Chaque asset catalogue stampé (catalog / listing_photo / …) |
| Ranking agnostique | [`coverDisplayRank.ts`](../src/core/enrich/media/coverDisplayRank.ts), [`catalogueFaceRank.ts`](../src/core/enrich/media/catalogueFaceRank.ts) | Core = **pixels + provenance + markers fichier** ; pas de listes de noms. Consumers : `createCardFaceChoice`, `resolvePrintFace`, harvests → `face.json`. Index stampé via `coverProvenanceForArtFile` + `enrichCardsIndexArtDimensions`. |
| `remoteImageFallback` | `ProviderInfo` + [`imageDownload.ts`](../src/core/enrich/media/imageDownload.ts) | Cousin de **durableCdn** : qui a le droit de rester distant |
| Evidence durable | `durableEvidence` (BDfuge, Planetebd, PriceCharting…) | Prix / faits refreshables sans re-scrape si frais |
| Découverte barcode | resolver + consensus + items | Cycle **découverte → confirm → ligne corpus** (backlog P2) |
| Cross-locale / devise | prix USD→EUR, covers EN sur fiche FR | Provenance ≠ seulement un host : peut être `cross-locale` / conversion |
| Corpus VG local | LaunchBox / iCollect sous `data/` | Premier catalogue transverse hors TCG — Sync **admin-first** comme les TCG |

## Écart vs TCG aujourd’hui

| Hors TCG | TCG aujourd’hui | Cible |
|----------|-----------------|-------|
| Un item enrichi multi-providers | Admin catalogue ≠ checklist (Pokémon) | **Une base** pour tous les scopes |
| Pas de « second index » JSON | projections JSON encore écrites à côté | Sqlite SSOT ; JSON = appendix legacy |
| Découverte → item | Découverte TCG rare (printKey search) | Promote confirmée shelf → même corpus |
| Jobs Sync dédiés (LaunchBox…) | `catalogProviderSync` + `CATALOGUE_PACKS` | **Un** chemin Sync (traits registry) |

## Prochaine étape (pas un freeze)

- **VG** : Sync LaunchBox admin-first (même cockpit Catalogue).
- **Découverte → confirm → corpus** : design + wire (affinité providers, promote).
- Pas de blocage « attendre autonomie TCG » — densifier TCG **et** ouvrir le transverse.

Voir [backlog.md](backlog.md) § Catalogues universels / Découverte.
