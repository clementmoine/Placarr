# Naruto Card Game (Bandai 2027) — versos « logo side »

| Fichier curated | Rôle |
| --------------- | ---- |
| `cards/back.webp` | Character / EX Character (blanc) — dos pack défaut |
| `cards/back.leader.webp` | Leader (rouge) |
| `cards/back.chakra.webp` | Chakra / CP (orange) |
| `cards/back.summon.webp` | Summon (noir) |

## Source

Scans plats sleeve (2026-10-27) — Character / Leader / Chakra / Summon.
Remplacent les crops perspective des composites Card Types welcome
(`type_img0{1–5}_en.webp` sur [naruto-cardgame.com/en/welcome/](https://www.naruto-cardgame.com/en/welcome/)).

Le logo NARUTO reste volontairement penché (italique) ; les bords de carte
sont droits.

## Règle Sync

`ensureCuratedPackAssets` copie → `data/naruto/cardgame/cards/back*.webp`.
URLs effet : `/assets/naruto/cardgame/backs/en` (+ `/tiers/{leader,chakra,summon}`).
`resolveCardBack` choisit le tier d’après le `printKey` (préfixe `c`/`cp` /
`s` / leaders `n001`·`n012`).
