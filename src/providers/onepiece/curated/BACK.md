# One Piece Card Game — verso sleeve

| Fichier curated | `src/providers/onepiece/curated/cards/back.webp` |
| --------------- | ------------------------------------------------ |
| Fichier data    | `cards/back.webp` (copie)                        |
| URL             | `/assets/onepiece/cards/back.webp`               |
| Taille          | 400×560 WebP                                     |
| Source          | [opecards.fr](https://www.opecards.fr/) `static.opecards.fr/cards/common/back-character.webp` (2026-08-28) |

## Pourquoi pas Bandai

Les cardlists officielles OPTCG (EN / FR / …) ne publient **pas** de dos sleeve générique
(`card_back.png` / `back.webp` → 404). Même convention que Dragon Ball Super — voir
[dragon_ball_super_card_game.md](../../../../docs/dragon_ball_super_card_game.md) §3.2.

opecards.fr sert des versos par type (`back-character`, `back-event`, `back-stage`,
`back-leader`). On prend **`back-character`** comme verso pack par défaut : c'est le dos
physique des cartes Personnage (majorité d'un booster). Event / Stage / Leader ont des
motifs distincts — ne pas les confondre avec le verso « pack » catalogue.

## Règle

- Rejouer : Catalogue Sync copie curated → `data/onepiece/cards/back.webp`.
- Si Bandai publie un dos isolé, remplacer curated et noter l'URL ici.
