# Pack card back — provenance

| Fichier curated | `src/providers/dbscg/curated/back.webp` |
|-----------------|----------------------------------------|
| Fichier data | `cards/back.webp` (copie) |
| URL | `/assets/dbs/cg/cards/back.webp` |
| Taille | 400×560 WebP |
| Source | [dbscards.fr](https://www.dbscards.fr/) `static.dbscards.fr/cards/original/back.webp` (2026-08-14) |

## Pourquoi pas Bandai

Les cardlists officielles (US / EU-FR / EU-EN / Asia / Fusion World) ne publient
**pas** de dos de sleeve. Elles servent faces + verso **Leader** (`_b.png`).
Sondage 2026-08-14 : [dragon_ball_super_card_game.md](../../../../docs/dragon_ball_super_card_game.md) §3.2.

Le fichier dbscards est le dos **Masters** (7 Dragon Balls, fond noir, liseré
orange), sans SAMPLE. Fusion World réutilise le même octet sur son CDN — le dos
physique FW est probablement différent ; ne pas le servir comme `cardBackUrl` FW
sans vérif.

## Règle

- Rejouer : `pnpm dbs:cards` copie curated → `data/dbs/cg/cards/back.webp`.
- Si Bandai publie un dos isolé, remplacer curated et noter l’URL ici.
- Ne pas confondre avec `{id}_b.png` / `{id}-back.webp` **par carte** (éveil Leader).
