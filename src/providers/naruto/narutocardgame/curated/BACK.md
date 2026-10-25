# Naruto Card Game (Bandai 2027) — versos « logo side »

| Fichier curated | Rôle |
| --------------- | ---- |
| `cards/back.webp` | Character / EX Character (blanc) — dos pack défaut |
| `cards/back.leader.webp` | Leader (rouge) |
| `cards/back.chakra.webp` | Chakra / CP (orange) |
| `cards/back.summon.webp` | Summon (noir) |

## Source

Composites officiels Card Types sur [naruto-cardgame.com/en/welcome/](https://www.naruto-cardgame.com/en/welcome/) :

- `type_img01_en.webp` → Leader + dos rouge
- `type_img02_en.webp` → Character + dos blanc
- `type_img03_en.webp` → EX Character + dos blanc (identique au Character)
- `type_img04_en.webp` → Chakra + dos orange
- `type_img05_en.webp` → Summon + dos noir

Bandai ne publie pas de sleeve plat isolé : les « logo sides » sont extraits
(perspective + nivellement) depuis ces composites SAMPLE. Le logo NARUTO est
volontairement penché (italique) ; les bords de carte sont redressés. Remplacer
quand un asset plat officiel sortira.

## Règle Sync

`ensureCuratedPackAssets` copie → `data/naruto/cardgame/cards/back*.webp`.
URLs effet : `/assets/naruto/cardgame/backs/en` (+ `/tiers/{leader,chakra,summon}`).
`resolveCardBack` choisit le tier d’après le `printKey` (préfixe `c`/`cp` /
`s` / leaders `n001`·`n012`).
