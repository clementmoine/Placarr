# Couverture langue : cartes vs SKUs scellés

Mesuré localement après rewrite kinds/langs. **Pas de miroir FR** — les trous
restent des trous jusqu’à un harvest attesté.

## État (post kinds first-class)

| Pack | Langues cartes (index) | Langues SKU | Trous typiques |
| --- | --- | --- | --- |
| Lorcana | de / en / fr / it | surtout `fr` (+ peu d’`en`) | de, it, en (volume) |
| Pokémon | fr / en / de / it / es / ptbr | presque seulement `fr` (pkmcards) | en, de, it, es, ptbr |
| DBS CG | fr / en | `fr` (+ displays sans lang) | en |
| DBS FW | en / ja | `en` | ja |
| One Piece | en / fr (+ jp faces) | en / fr / ja (meilleur graph TCG Cards) | audit fin |
| Naruto Carddass | multi | multi (modèle cible) | — |

Kinds désormais first-class à l’index (`etb`, `trove`, `multipack`,
`blister_case`, `deck_bundle`, …) via `rewriteSealedProductsIndex`.

## Prochaines sources réelles (pas de clone)

### Lorcana
- Site officiel `disneylorcana.com` — crawl `en-US` / `de-DE` / `it-IT` déjà
  câblé (`OFFICIAL_SITE_LOCALES`). Relancer une sync catalogue pour peupler
  les packshots non-FR (slugs `…-en` / `…-de` / `…-it`).

### One Piece
- `opecards.fr` déjà multi-lang (`en-` / `japanese-` / …).
- Audit : croiser `sealedLangCoverageForPack("onepiece")` après chaque ingest ;
  kinds `multipack` / `tin` déjà promu depuis les catégories host.

### DBS CG / Fusion World
- Hosts TCG Cards : `dbscards.fr` (FR), `fw.dbscards.fr` (EN index).
- Site Bandai officiel :
  - Masters / CG : `https://www.dbs-cardgame.com/` (locales régionales)
  - Fusion World : `https://www.dbs-cardgame.com/fw/en/products/…` et
    `…/fw/jp/products/…` (boosters JA attestés)
- Prochain chantier : harvest produit Bandai **par locale** (slug×lang), sans
  inventer un SKU EN à partir d’une fiche FR.

### Pokémon
- `pkmcards.fr` = graph FR only — ne fermera jamais les langues Live.
- Sources régionales à câbler (curated ledger + packshots attestés) :
  - [Product gallery Pokémon.com US](https://www.pokemon.com/us/pokemon-tcg/product-gallery)
  - Sites éditeur / distributeur par territoire (ETB DE, ES, …) — une fiche
    produit = une preuve ; pas de miroir du squelette FR.
- Ne pas importer les compendia Live digitaux comme scellés papier.

## Outil

```ts
import { sealedLangCoverageForPack } from "@/providers/shared/sealedProducts/langCoverage";
sealedLangCoverageForPack("pokemon");
// → { cardLangs, skuLangs, missingSkuLangs }
```
