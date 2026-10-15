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
- Packshot album Série 1–10 (`{idm}b.jpg`) → **staging only** (collage multi-SKU). Super Série / Tin box (`ssN` / `tinbox`) → primary sealed slug (une fiche ≈ un SKU).
- **Trois coffrets métal distincts** : (1) `part6-box-1510` Ref **05033** / 2007 (deck S6) ; (2) `tinbox-2008` Ref **05056** / 2008 ; (3) `tinbox-2010` « Tin Box Boosters » Kid Goku Ref **05058** / EAN **…0581** / Bandai **2009** (dos Aguttes : 3× SS Vegeta + 2× S9 + 2 promos). DCM « 2010 » / Ultrajeux 7791 = même tin. Orphans dbzc → `quarantine/orphan-dbzc-sealed/`.
- **Super Série / Tin box** = SKUs scellés seulement (`setCode` ss1–ss6 / tinbox). Pas de printKeys dédiés — check-list cartes = `partN` / `sp` / `promo` (sinon « Sans catalogue » fantôme).
- **dbcardshop** : photos retail (boosters vides) — `art.dbcardshop.*` OK, `face:false` dans press-packshots (ne pas prendre la face catalogue).
- **Dual decks S1–5** : les ids packaging dbzc (`1191`/`1194`/…) portaient souvent l’art de l’**autre** deck du duo — ré-homés sur les slugs thématiques (`…-ennemis`, `…-ruban-rouge`, …). Voir `staging/misfiled/dual-deck-dbzc-swap/`.
- Galerie **légendée** (`title=` sur le lien) : « Deck Planète », « Deck Résistance », « Booster de 8 cartes », « Pochette », « Deck de 32 cartes » → `art.deckcardmania.jpg` sur **un** slug (`deckcardmaniaSealedSlugs.ts`). Les `_iNs` thumbs sont ignorés ; on prend `_iNb`.
- Samples faces **uniquement** si title/alt nomme clairement une carte (`Carte SP01`, `D-86`) → `art.deckcardmania.jpg` lang=fr.
- Variantes ambiguës (`D 933-1`, `Carte 189-1`) : ledger only, pas d’install.
- **Ce n’est pas** un dump face-par-face type Chitoroshop / Hatatoy.

## Dos

| Lang | Fichier | Source |
|------|---------|--------|
| `fr` | `cards/back.webp` | Shenron JCC (curated `back.jpg`) |
| `ja` / `en` | `cards/back.ja.webp` / `back.en.webp` | [nikita DBC sleeve](https://tcg-db.nikita.jp/img/card/dbc/back.jpg) |

DeckCardMania « Dos de cards » (série 1 FR) = même Shenron JCC — **documenté** dans le ledger / staging ; on **n’écrase pas** `back.webp` ni les dos nikita JA/EN.

Runtime : `backFilenameCandidates(lang)` préfère `back.<lang>.*`, sinon `back.webp`.
