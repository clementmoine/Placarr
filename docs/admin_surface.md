# Surface admin vs CLI — inventaire

> **2026-11-05**. Placarr est **Plex-like** : Sync / refresh / indexes via
> **admin web + worker**. Aucun utilisateur final ne lance de commande.
> Vision : [ARCHITECTURE.md](../ARCHITECTURE.md) § Vision.

## Surface produit (admin + worker)

| Action | Où |
|--------|-----|
| Catalogue Sync (TCG + LaunchBox…) | `/admin` Catalogue → **Sync** (pack) / **Sync tout** ; job unique `catalogProviderSync` → `catalog.refresh` (harvest + faces + CLIP). Ancien `foilExtract` / Local indexes = remap ou legacy worker only. |
| Affinités providers | Admin Refresh → `ProviderAffinitiesPanel` ; `GET /api/admin/provider-affinities` |
| Promote shelf → corpus | Admin Refresh → `CorpusPromotePanel` ; accept écrit via `catalog.applyCorpusPromote` (LocalPrintsIndex ou TCGdex identity pour `pokemon`) |
| Refresh metadata items | Admin Refresh (file `metadataRefresh`) — **libellé distinct** du Sync corpus |
| Worker | `pnpm worker` / compose — process ops, pas une CLI métier |

## `package.json` — déjà ops / dev

| Script | Rôle | Classe |
|--------|------|--------|
| `dev` / `build` / `start` / `lint` / `format*` | App | ops / dev |
| `worker` / `worker:*` | File de jobs | **ops** (prod) |
| `test*` / `providers:audit:mapping` | Qualité | **dev** |
| `prisma:generate` / `models:ort` | Build | ops / CI |
| `flare:*` / `dev:docker*` | Infra locale | **dev** |

Aucun alias npm n’expose un ingest catalogue « produit » hors worker/admin.

## `scripts/` — **dev-only** (pas surface utilisateur)

One-shots migration / audit / harvest manuel. Exemples :

- `refreshSealedPrices.ts`, `refreshSealedPackCompositions.ts`
- `rebuildNarutoIndex.ts`, `migrate*.ts`, `backfill*.ts`
- `harvest-coleka-*.ts`, `auditNaruto*.ts`
- `buildTitleIdfIndex.ts` (pas d’alias npm — volontaire)
- `pullApkFromDevice.ts`, `verifyApkSignature.ts`

Lancer via `tsx scripts/…` uniquement en debug. Toute densification produit doit
passer par **Catalogue Sync** (ou Refresh items).

## Providers — CLIs embarqués

`tsx src/providers/<id>/…` (audits Live, harvests) = **dev-only**. Même règle :
les steps Sync honorent `ProviderModule.catalog.refresh` ; ne pas documenter ces
CLIs comme chemin utilisateur.

## Cible

1. Un cockpit admin : **Sync** (+ Affinités / Provenance) — rien hors Sync pour densifier un corpus.
2. `catalogue-extract` et indexes locaux remappent vers `catalogProviderSync`.
3. Ne **jamais** ajouter d’alias npm pour un ingest métier sans surface admin.
