# One Piece Card Game — verso sleeve

| Fichier curated | URL `/assets/onepiece/cards/…` | Source |
| --------------- | ------------------------------ | ------ |
| `back.webp` | `back.webp` | opecards `back-character.webp` — défaut pack (Character / Event / Stage) |
| `back.leader.webp` | `back.leader.webp` | opecards `back-leader.webp` (rouge) |
| `back.don.webp` | `back.don.webp` | opecards `back-don!!.webp` (crème) |

Taille cible : 400×560 WebP. **Event / Stage** sont byte-identiques à Character sur opecards — pas de fichiers séparés ; le stamp laisse le défaut pack.

## Règle

N’installer / n’estampiller un `back.<slug>` que si le motif est **distinct** du défaut.

Découverte (famille TCG Cards, pas une liste magique) :

1. HTML `/cards` (+ listes FR/EN/JA) → URLs lazyload `cards/common/back-*.webp` ou `cards/original/back.webp`
2. Labels du filtre Types → probe CDN (`DON!!` → `back-don!!.webp`)
3. `discoverDistinctBacks` / `harvestTcgCardsDistinctBacks` — même helper pour lorcards, dbscards, pkmcards, …

- Rejouer : Catalogue Sync One Piece (ou `harvestTcgCardsDistinctBacks("opecards")`).
