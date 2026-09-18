# Bleach Soul Card Battle — verso & sealed

Dos pack : `curated/cards/back.jpg` (nikita `/img/card/blc/back.jpg`) →
`data/bleach/scb/cards/back.webp` au Sync.
Facettes : `cards/{set}/{lang}/{number}/`.

## Langues

| Lang | Source | Statut |
|------|--------|--------|
| `ja` | nikita `/cardlist/blc` (S-/B-/E-/Z-/A-/J-/PZ-) | **130** uniques (site « 133 » = 3 doublons). Faces reprint `*_2.jpg` quand le stem de base 404. Corpus Bandai réel ≫ nikita. |
| `fr` | carddass.fr Wayback (A/C/E/Z/P, S1 EU) + Coleka `_r37171` fallback | **80** carddass (identité + faces `art.carddass`). Coleka : **71** faces disque (`art.coleka`) si carddass absent — jamais devant. |
| `en` | — | **Pas d’EN SCB officiel.** Score Bleach TCG (US) = autre jeu, hors pack. |

`A###` FR (âme) ≠ `A-###` JP (アビリティ → set `ability`).
`J-###` = promos Jump (set `j`).
Scans nikita **Ability** + Blast Soul attestés (S-026/031/032/099/128/129/181) :
paysage posé en portrait → rotation CCW 90° (`bleachScbJaFaceRotateDeg`).
S-500 / S-687 (Blast plus tardifs) restent portrait.

Coleka (fallback faces) : https://www.coleka.com/fr/cartes-de-collection/cartes-anime-manga/bleach-serie-1_r37171

## Hors scope (pour l’instant)

- carddass.com/bleach JA cardlists (CDX staging vide) — à rescanner
- Sets Bandai 14–21+ absents de nikita
- Autres rubriques Coleka Bleach (S2+ si elles apparaissent)

## Scellé (2026-09-13)

Source : Wayback `carddass.fr/bleach/catalogue_S1_Bleach.html` (`data/staging/…/bleach-s1.html`).

| SKU | Contenu |
| --- | --- |
| `starter-compagnons` | 33 cartes (qty Bandai) — `contentsKnown` |
| `starter-rivaux` | 33 cartes — `contentsKnown` |
| `booster-s1-shinigami-and-ichigo` | 8 cartes, pool 58 cartes booster S1 |

Packshots : `curated/products/compagnons_catalogue.gif`, `rivaux_catalogue.jpg`, `booster_s1_05211.jpg`.
Graine : `curated/products-contents.json` (régénérée au Sync via `ingestBleachScbSealedProducts`).
