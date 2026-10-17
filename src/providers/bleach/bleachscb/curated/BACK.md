# Bleach Soul Card Battle — verso & sealed

Dos pack : `curated/cards/back.jpg` (nikita `/img/card/blc/back.jpg`) →
`data/bleach/scb/cards/back.webp` au Sync.
Facettes : `cards/{set}/{lang}/{number}/`.

## Langues

| Lang | Source | Statut |
|------|--------|--------|
| `ja` | nikita `/cardlist/blc` (S-/B-/E-/Z-/A-/J-/PZ-) | **130** uniques (site « 133 » = 3 doublons). Faces reprint `*_2.jpg` quand le stem de base 404. Corpus Bandai réel ≫ nikita. |
| `fr` | carddass.fr Wayback (A/C/E/Z/P, S1 EU) + Coleka `_r37171` fallback | **80** carddass (identité + faces `art.carddass`). Coleka : **71** faces disque (`art.coleka`) si carddass absent — jamais devant. Promo GIFs (`Promo-1`…`16` + exclusif `Promo-15.gif`, dual `15-16`) → `sources/wayback/promos/` + ledger `carddass-fr-bleach-promos.json` ; face P### préfère le GIF exclusif (pas le collage). |
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

## Scellé (2026-10-15)

Source listes : Wayback `carddass.fr/bleach/catalogue_S1_Bleach.html` (`curated/sources/wayback/bleach-s1.html`).
Provenance arts : `curated/sources/press-packshots.json`.

| SKU | Contenu | Face |
| --- | --- | --- |
| `starter-compagnons` | 33 cartes (qty Bandai) — `contentsKnown` | **adilsons** (+ dumps carddass / Ultrajeux 1139) |
| `starter-rivaux` | 33 cartes — `contentsKnown` · Ref 05210 | **ultrajeux** (+ dump carddass) |
| `booster-s1-shinigami-and-ichigo` | 8 cartes · pool **listed** FR a/c/e/z (pas JA `s`) · EAN 3296580052110 | **tempslibre** (+ dump carddass 100×187) |
| `display-s1-shinigami-and-ichigo` | display · **24** sachets (collectthemall) · loterie = enfants | **ultrajeux** (fiche « booster » + même EAN — ne pas fusionner) |

Packshots curated : `compagnons_adilsons.jpg`, `rivaux_ultrajeux.jpg`, `booster_s1_tempslibre.jpg`, `display_s1_ultrajeux.jpg`.
Graine : `curated/products-contents.json` (régénérée au Sync via `ingestBleachScbSealedProducts`).
