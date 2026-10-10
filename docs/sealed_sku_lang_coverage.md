# Couverture langue : cartes vs SKUs scellés

Contrat catalogue (partout) : **original + FR (s’il existe) + EN**.
Pas DE / IT / ES / ptbr sauf quand c’est **l’original** (Ninja Ranks IT,
Lamincards IT, …). Voir `isCatalogueLang` /
`isCatalogueProductLang`.

Mesuré localement. **Pas de miroir FR** — les trous restent des trous jusqu’à
un harvest attesté.

## État

| Pack | Langues cartes (catalogue) | Langues SKU catalogue | Notes |
| --- | --- | --- | --- |
| Lorcana | en / fr | en / fr (DE/IT masqués + plus moissonnés) | site officiel `fr-FR`+`en-US` only |
| Pokémon | fr / en (Live) | fr (pkmcards) | Live DE/IT/ES/ptbr hors tuiles admin |
| DBS CG | fr / en | fr | |
| DBS FW | en / ja | en | |
| One Piece | ja / fr / en | en / fr / ja | |
| Naruto Carddass | ja / fr / en | JA / FR / EN | IT/DE/ES hors products-index |
| Ninja Ranks | en / fr / **it** | EN / fr | IT = original Imadoki |
| MTG | en / fr | fr | exclusives other-lang sur disque, masquées admin |

Kinds first-class à l’index (`etb`, `trove`, `multipack`, …) via
`rewriteSealedProductsIndex`.

## Prochaines sources réelles (pas de clone)

### Lorcana
- Site officiel : locales **fr-FR** + **en-US** seulement (`OFFICIAL_SITE_LOCALES`).

### One Piece
- `opecards.fr` déjà multi-lang (`en-` / `japanese-` / …).
- Audit : `sealedLangCoverageForPack("onepiece")` après chaque ingest.

### DBS CG / Fusion World
- Hosts TCG Cards + Bandai par locale — une fiche = une preuve.

### Pokémon
- `pkmcards.fr` = graph FR only.
- Sources régionales EN (pokemon.com US gallery) quand on voudra fermer le trou
  scellé EN — pas DE/IT/ES sauf original attesté (n/a papier Live).

## Outil

```ts
import { sealedLangCoverageForPack } from "@/providers/shared/sealedProducts/langCoverage";
sealedLangCoverageForPack("pokemon");
// → { cardLangs, skuLangs, missingSkuLangs }
```
