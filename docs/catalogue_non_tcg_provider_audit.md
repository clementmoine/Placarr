# Catalogue — patterns providers non-TCG (audit)

> **2026-09-21**. Ce qu’il faut **réutiliser** pour le contrat catalogue TCG, sans forcer les jeux/livres dans un silo TCG demain.

## Déjà solide hors TCG

| Pattern | Où | À garder pour catalogues |
|---------|-----|---------------------------|
| Provenance de cover | [`coverProvenance.ts`](../src/core/enrich/media/coverProvenance.ts), `ProviderInfo.coverProvenanceRules` | Chaque asset catalogue stampé (catalog / listing_photo / …) |
| Ranking agnostique | [`coverDisplayRank.ts`](../src/core/enrich/media/coverDisplayRank.ts) | Core inchangé ; priorités source TCG restent **provider-local** (`faceChoice`) |
| `remoteImageFallback` | `ProviderInfo` + [`imageDownload.ts`](../src/core/enrich/media/imageDownload.ts) | Cousin de **durableCdn** : qui a le droit de rester distant |
| Evidence durable | `durableEvidence` (BDfuge, Planetebd, PriceCharting…) | Prix / faits refreshables sans re-scrape si frais |
| Découverte barcode | resolver + consensus + items | Cycle futur **découverte → confirm → ligne corpus** (backlog) |
| Cross-locale / devise | prix USD→EUR, covers EN sur fiche FR | Provenance ≠ seulement un host : peut être `cross-locale` / conversion |

## Écart vs TCG aujourd’hui

| Hors TCG | TCG aujourd’hui | Cible |
|----------|-----------------|-------|
| Un item enrichi multi-providers | Admin catalogue ≠ checklist (Pokémon) | **Une base** pour tous les scopes |
| Pas de « second index » JSON | `cards-index.json` lu à part de sqlite | Sqlite SSOT ; JSON projection optionnelle |
| Découverte → item | Découverte TCG rare (printKey search) | Plus tard : promote catalogue |

## Ce qu’on ne fait pas maintenant

- Pas de catalogues PS4 / musique / livres.
- Pas de pipeline découverte→corpus.
- On **documente** le backlog pour que le contrat TCG reste compatible le jour où on bascule.

Voir [backlog.md](backlog.md) § « Catalogues universels & découverte ».
