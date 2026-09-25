# Dragon Ball Carddass / JCC — verso & langues

## Langues

| Lang | Source | Statut |
|------|--------|--------|
| `ja` | nikita `/cardlist/dbc` (titres partiels + `art.nikita.*`) + Chitoroshop (`art.chitoroshop.*`) + Hatatoy (`art.hatatoy.*`) | seedé ; D- JA-only mintés si Part/DB hint |
| `fr` | dbzcollection.fr (`art.dbzcollection.*`) + carddass.fr/dbz Wayback (`art.carddass.*`) + DeckCardMania samples (`art.deckcardmania.*`, rares/holos attestés) | seedé |
| `en` | Chitoroshop titres produit (attestés) | seedé quand ledger présent |

printKey **sans** langue : `dbsjcc:partN-d0001`. Faces : `cards/{set}/{lang}/{number}/`.

### carddass.fr (FR faces)

Ledger : `sources/carddass-fr-dbz-faces.json` (Wayback CDX `carddass.fr/dbz/images/cartes/{1–10}/`).
Install : `art.carddass.jpg` sous `lang=fr`, à côté de dbzcollection — **pas** d’écrasement.
Matching : série N → `partN` ; plain `D-###` uniquement ; skip PA/PB/vc (pouvoirs ambigus).

### carddass.com (JP DBC faces) — indisponible

Live `carddass.com` → Club Carddass moderne (`sec.carddass.com`) ; `/dbc/`, `/dbz/`, `/cardgame/` = **404**.
`carddass.com/dbh` = **Dragon Ball Heroes** (autre jeu → pack `dbh`), pas le Card Game D-.
CDX Wayback prefix sur `carddass.com` / `carddas.com` pour chemins DBC / dragonball / `D-###` : **aucun dump de faces Card Game** utilisable (2026-09-24).
JA faces = nikita + Chitoroshop + Hatatoy — pas d’`art.carddass.com` inventé.

### DeckCardMania (FR set fiches) — pas un dump faces

Ledger : `sources/deckcardmania.json` (albums idf=3, hub grandes séries).
Contenu typique : packshot `files/3/{idm}b.jpg`, listes **Cartes Rares** / **Holographiques** (D-###), galerie (liste / dos / exemples / samples nommés).
- Packshots → `art.deckcardmania.jpg` à côté des sealed `partN` / `sp` / `promo` déjà présents ; Super Séries / DBS CG / Zenzu restent en `data/…/staging/deckcardmania/`.
- Samples faces **uniquement** si title/alt nomme clairement une carte (`Carte SP01`, `D-86`) → `art.deckcardmania.jpg` lang=fr.
- Variantes ambiguës (`D 933-1`, `Carte 189-1` Super Série) : ledger only, pas d’install.
- **Ce n’est pas** un dump face-par-face type Chitoroshop / Hatatoy.

## Dos

| Lang | Fichier | Source |
|------|---------|--------|
| `fr` | `cards/back.webp` | Shenron JCC (curated `back.jpg`) |
| `ja` / `en` | `cards/back.ja.webp` / `back.en.webp` | [nikita DBC sleeve](https://tcg-db.nikita.jp/img/card/dbc/back.jpg) |

DeckCardMania « Dos de cards » (série 1 FR) = même Shenron JCC — **documenté** dans le ledger / staging ; on **n’écrase pas** `back.webp` ni les dos nikita JA/EN.

Runtime : `backFilenameCandidates(lang)` préfère `back.<lang>.*`, sinon `back.webp`.
