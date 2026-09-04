# One Piece Card Game — verso sleeve

| Fichier curated | URL `/assets/onepiece/cards/…` | Source opecards.fr (2026-08-28 / 2026-09-04) |
| --------------- | ------------------------------ | --------------------------------------------- |
| `back.webp` | `back.webp` | `back-character.webp` — défaut pack |
| `back.leader.webp` | `back.leader.webp` | `back-leader.webp` |
| `back.event.webp` | `back.event.webp` | `back-event.webp` |
| `back.stage.webp` | `back.stage.webp` | `back-stage.webp` |

Taille : 400×560 WebP. Leader a un motif distinct ; Event / Stage sont
aujourd’hui **byte-identiques** à Character sur opecards (relevé 2026-09-04) —
on les curate quand même pour le contrat catégorie → fichier.

## Pourquoi pas Bandai

Les cardlists officielles OPTCG (EN / FR / …) ne publient **pas** de dos sleeve générique
(`card_back.png` / `back.webp` → 404). Même convention que Dragon Ball Super — voir
[dragon_ball_super_card_game.md](../../../../docs/dragon_ball_super_card_game.md) §3.2.

opecards.fr sert des versos par type (`back-character`, `back-event`, `back-stage`,
`back-leader`). **`back-character`** reste le verso pack par défaut (majorité d’un
booster). Leader / Event / Stage sont stampés sur le `PrintCandidate.cardBackUrl`
selon la catégorie punk-records.

## Règle

- Rejouer : Catalogue Sync copie curated → `data/onepiece/cards/back*.webp`.
- Si Bandai publie un dos isolé, remplacer curated et noter l'URL ici.
