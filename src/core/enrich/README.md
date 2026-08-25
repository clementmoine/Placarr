# `core/enrich` — enrichment metadata

Flux principal (barcode / type connu → item riche) :

1. **Entrée** — `fetch.ts` / `fetchByType.ts` sélectionnent et appellent les providers.
2. **Merge / consensus** — observations + ranking → metadata consolidée (`merge`, `consensus`, `evidence`, …).
3. **Storage** — `storage.ts` persiste metadata, liens externes, sync post-store.
4. **Media** — covers, galleries, localisation d’images (`media/`).

Les orchestrateurs restent à la **racine** du dossier ; le détail métier vit dans des sous-dossiers.

## Sous-dossiers

| Dossier | Rôle |
|---------|------|
| `titles/` | Scoring / normalisation / matching de titres |
| `media/` | Covers, galleries, download, trim, proxy, display image |
| `facts/` | Projection / merge de faits metadata typés |
| `search/` | Requêtes livre, alias de search, helpers providers (`query`, `searchUtils`) |

## Racine (intentionnel)

Restent à la racine les **orchestrateurs et le glue** trop transverses pour un sous-dossier unique :

- `fetch`, `fetchByType`, `lightRefresh`, `selection`, `providerQueue`
- `merge`, `consensus`, `observations`, `evidence`, `storage`
- gating / projection (`metadataFetchGating`, `metadataFacts*`, …)

On ne déplace pas encore ce cluster (churn élevé) ; densité progressive via `media/` et `search/` d’abord.

## Imports

Préférer le chemin ciblé (`@/core/enrich/media/galleries`, `@/core/enrich/search/bookSearch`, …) plutôt que des shims à l’ancien path racine.

Voir aussi [`docs/core_architecture.md`](../../../docs/core_architecture.md).
