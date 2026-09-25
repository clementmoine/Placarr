# Contenu des produits scellés — contrat

Pour le conseil d'achat (« singles vs booster vs display »), **chaque** SKU de
`products-index.json` doit décrire ce qu'il contient. Absent = non vérifié.

## Kinds catalogue (`SealedKind`)

Familles retail first-class (plus seulement booster / display / deck / coffret) :

| Kind | Sens | Exemple |
| --- | --- | --- |
| `booster` | sachet unitaire | booster set |
| `blister` | blister / fenêtre | `boosters-blister` |
| `display` | boîte de N boosters | display 24 / 36 |
| `case` | casier de **displays** | shipping case (curated / officiel) |
| `blister_case` | carton de blisters | titres « Blister Carton » |
| `deck` | starter unitaire | starter S1 |
| `deck_bundle` | **plusieurs decks** dans un SKU | Naruto `pack-decouverte` |
| `multipack` | N boosters ± promo | Naruto `duopack-s28`, OP double-packs |
| `tin` / `etb` / `trove` / `quest` / … | familles boutique | ETB, Trove, Illumineer's Quest |
| `puzzle` | merch + **promo insert** garanti | Glimmers of the Realm |
| `coffret` | filet si inconnu | — |
| `ephemera` | papier sans cartes | sell sheet |

Hiérarchie d'emballage :

```
booster → blister → display → case
              ↘ blister_case
deck → deck_bundle
multipack = N boosters (± promo), pas des decks
```

Pour un `case`, `packsContained` = **nombre de displays** (pas de boosters).
Pour un `display` / `blister_case`, `packsContained` = nombre de sachets /
blisters enfants. Ne pas confondre avec `displaysPerHit` (taux de chase dans
`booster-composition`, pas un SKU).

Voir `src/providers/shared/sealedProducts/kinds.ts`. Les index legacy
`coffret` sont affinés à la lecture (`refineSealedKind`) et peuvent être
réécrits via `rewriteSealedProductsIndex`.

## Champs obligatoires (présents, éventuellement `null`)

| Champ | Sens | Exemple |
| --- | --- | --- |
| `cardsPerPack` | Cartes dans **un** sachet / unité d'ouverture | Lorcana booster nommé « 12 cartes » → `12` |
| `packsContained` | Sachets dans **ce** produit | `display-24-boosters-…` → `24` ; booster → `1` |
| `packsBySet` | Sachets **par** extension (coffret multi-séries) | Coffret Métal → `{ "s1": 1, "s2": 1 }` ; sans ça un SKU à `setId` null n'entre dans aucun conseil d'achat |
| `guaranteeSets` | Extensions où les **garanties** comptent | Coffret Métal → `["s4", "promo"]` — évite qu'un reprint catalogue accroche une autre série |
| `guaranteedPrints` | Cartes **toujours** dans le produit | Liste d'un starter ; promo fixe d'un blister |
| `guaranteedProducts` | SKUs scellés **toujours** inclus | Pack Découverte → 2 starters + 2× `booster-s1` |
| `randomPoolScope` | D'où sort la loterie | `set` / `listed` / `none` / `unknown` |
| `randomPoolPrints` | Pool explicite si `listed` | Judge pack, pool promo |

`declaredCardCount` (fiche boutique) **n'est pas** `cardsPerPack` : chez
lorcards c'est souvent la taille du **set** (420), pas du sachet.

## Comportements × couches

| `behavior` | Garanties | Loterie |
| --- | --- | --- |
| `known_bundle` (starter) | liste exacte → `guaranteedPrints` | `none` |
| `random_pack` (booster set) | souvent vide | `set` (= extension catalogue) **par défaut — à vérifier** |
| `random_pack` (judge / promo) | parfois 1 promo | `listed` + `randomPoolPrints` |
| `pack_container` (display) | — | `none` ici ; la loterie est dans les N sachets (`packsContained`) |
| `mixed_bundle` (trove, blister 3+1) | exclus / promo → `guaranteedPrints` | sachets enfants |

## État mesuré (2026-09-14)

| Pack | Boosters loterie | Displays / containers | Decks / known lists | Notes harmonisation |
| --- | --- | --- | --- | --- |
| Lorcana | **69/69** pool `set` · 12 | display **26/26** · 24 ; trove **45** · 8 ; **blister_case 30/30** · 24 | **23/23** starters ; Deep Trouble = exclusives only (`contentsKnown` false) ; quests structure attestée : Palace Heist **170** (50+2×60), Hunny Rescue **190** (50+10+120+6+4) | `byKind` blister_case / quest / prerelease / collector_box |
| Pokémon | **193** pool `set` (pas de `cardsPerPack` inventé) | display **20/20** · 36 ; multipack **20/20** · 3 ; **ETB 58/58 `packsContained`** (SV/ME 9 · SM/SWSH 8 · spéciaux 10, Poképédia) | — | graine git `tcgdex/curated/products-contents.json` |
| DBS CG | boutique + `byKind` | **34/34** · 24 ; BT24 blister carton **3** ; blisters Unison = **1** booster (unitaire) | **27/28** decks ; **TS01/TS02 = 15 fixes known** ; coffrets anniversaire 2020/2021/5th/2023/2024 déclarés 96/96/97/104/104 ; gift GC-01 **4** / GC-02 **5** / GE01 **7** packs | `byKind.blister_case` |
| DBS FW | idem | **9/9** | **10/10** ; Premium Coll. 01 = 6 fixes ; 1st Anniv Set = 16 fixes | collector_box scope none |
| One Piece | pool `set` | **25/25** · 24 ; multipack · 2 | **32** decks known qty (ST-14 + **ST-13/19/20/22–28 Tier One** + mirrors JA st21/29/30 + pré-release ST-04) ; stubs preview demoted | blister_case / tin / multipack |
| DBS JCC | **8**/sachet | display pc **null** (honnête) | taille 32, **0** listes | inchangé |
| Naruto Carddass | **49** · 8 | IT/EN displays **24** (SKU) | FR starters known | `byKind.display` + EN `packsContained: 24` |
| Bleach SCB | **8** | — | **2/2** | — |

## État mesuré (2026-09-13) — historique

| Pack | Boosters `cardsPerPack` / loterie | Displays `packsContained` | Decks `contentsKnown` (liste) |
| --- | --- | --- | --- |
| Lorcana | **70 / 70** (`byKind` 12) | **15 / 15** (`byKind` 24) | **23 / 23** (ledger curated) |
| Pokémon | ~0 / 193 (pas de taille inventée) | **20 / 20** (`byKind` 36) | — (peu de decks) |
| DBS CG | boutique + `byKind` pool=`set` | **34 / 34** (`byKind` 24) | **27 / 28** decks known (SD01+BE20 qty Bandai Asia ; **SD08** taille 51, Pieces absentes) |
| DBS FW | idem | **9 / 9** | **10 / 10** decks ; **53** SKUs known |
| One Piece | `byKind` pool=`set` | `byKind` 24 | **38 / 58** decks known — ST-01–07/10/21 + ST-29–35 Tier One 収録枚数 ; **ST-36** membership only ; ST-14 sans table |
| DBS JCC | **`byKind` 8** + pool=`set` | partiel | **0 / 17** — taille 32 attestée ; **pas de checklist starter** (dbzcollection / Wayback) |
| Naruto Carddass | **FR/IT 8** (`byKind`) | partiel | **7 / 8** starters FR S1–S4 known (+ Détruire Konoha sum 41/`contentsKnown` false) ; S5 partial |
| **Bleach SCB** | **`byKind` 8** (S1) | — | **2 / 2** starters Compagnons + Rivaux (S1) ; **S2+ FR/JP qty absentes** |
| DBH | **`byKind` 3**/sachet (Extra/Selection) | BOX **20** packs | Namek : 6× UGMPS + avatar soft (`contentsKnown` false) ; Extra/Selection = pools |

Rebuild CG/FW/OP : `pnpm exec tsx src/providers/shared/sealedProducts/rebuildFromStaging.ts`.
Bleach sealed : Sync `bleach-scb` / `ingestBleachScbSealedProducts()`.

## État mesuré (2026-08-26) — historique

| Pack | Boosters avec `cardsPerPack` | Displays avec `packsContained` | Decks `contentsKnown` (liste exacte) |
| --- | --- | --- | --- |
| Lorcana | **70 / 70** (`byKind` 12) | **15 / 15** (`byKind` 24) | **23 / 23** (ledger curated) ; troves `byKind` 8 sachets ; gift EN/DE/IT aliasés FR |
| Pokémon | ~0 / 193 (pas de taille sachet inventée ; faux 99+ corrigés) | **20 / 20** (`byKind` 36) | — (peu de decks) |
| DBS CG | ~76 / 120 (texte boutique) | **34 / 34** (`byKind` 24) | **19 / 28** (ledger curated) |
| DBS FW | ~49 / 61 | **9 / 9** (`byKind` 24) | **10 / 10** (ledger curated) |
| Naruto Carddass | **FR/IT 8** (`byKind`) ; JP 6 (SKU) | partiel | **8 / 8** starters FR S1–S4 + **`pack-decouverte`** + **Coffret Métal / Tin Hobby** (deck/promos + sachets) ; S5 partial ; IT/JP starters vides |


Les tuiles « aperçu » lorcards / pkmcards (**15** cartes) ne sont **ni** une
liste de starter **ni** le pool : `containsPrintsIsPreview: true`.

## Composition booster + taux de tirage (`packsPerHit`)

Pour le conseil d'achat **fin de set / chase**, le modèle uniforme
(`packSize × manquantes / pool`) surestime les Enchanted (≈ 1/96 packs, pas
1/18). Les taux vivent dans un ledger curated **par pack**, pas sur chaque
print :

`src/providers/<id>/curated/booster-composition.json`
→ exposé via `ProviderModule.loadBoosterComposition`
→ optionnellement miroir `data/<pack>/curated/booster-composition.json`

| Champ | Sens |
| --- | --- |
| `slots` | Emplacements du sachet (`dedicated` / `shared` + raretés possibles) |
| `rarityHits[R].packsPerHit` | Sachets moyens pour voir **une** carte de rareté R |
| `rarityHits[R].displaysPerHit` | Raccourci (ex. Enchanted = 4 displays = casier courant) |
| `rarityHits[R].aliases` | Libellés localisés (`Enchantée`, `Verzaubert`, …) |
| `confidence` | `official` / `community` / `estimate` |
| `bySet` | Surcharges (ex. set 1 sans Epic/Iconic) |

Un print précis : `packsPerHit(rareté) × N_r` dans le set
(`specificPacksPerHitByPrint`). Absent = retombe sur l'uniforme.


### Seeds 2026-08-27

| Pack | Fichier | Chase clés |
| --- | --- | --- |
| Lorcana | `lorcanajson/curated/…` | Enchanted **96** / **4** displays |
| Naruto Carddass | `narutocarddass/curated/…` | holo **1**/pack (slot FR) |
| DBS Masters | `dbscg/curated/…` | SCR ~144, GDR ~864 (casier 12×24) |
| DBS Fusion World | `dbsfw/curated/…` | SCR/SR lettres (`facts.json`) |
| Pokémon SV+ | `tcgdex/curated/…` | IR ~11, SIR ~60, Hyper ~100 ; display **36** |

Commons / Uncommons : **pas** de `packsPerHit` inventé quand le slot est
dédié (sauf Naruto holo = officiel). Source slots : éditeur ou community.


## Recherche SKU par SKU

Ledger durable (survit au re-ingest) :

- graine git : `src/providers/<id>/curated/products-contents.json`
- runtime : `data/<pack>/curated/products-contents.json` (+ legacy `sealed-contents.json`)

**Porte unique** : `persistSealedProductsIndex` / `loadSealedProductsIndex`
(`src/providers/shared/sealedProducts/persistProductsIndex.ts`) — merge curated
à l'écriture **et** à la lecture (Catalogue, filet si un writer a oublié).
Le conseil d'achat utilise déjà `mergeCuratedSealedContents` via
`sealedProductsLoad`.

### Lorcana — fait 2026-08-26

| Périmètre | Statut | Source |
| --- | --- | --- |
| Tous boosters (`byKind`) | `cardsPerPack=12`, pool `set` | [Ravensburger boosters](https://www.ravensburger.us/en-US/products/disney-lorcana/boosters) |
| Tous displays (`byKind`) | `packsContained=24` | idem |
| Tous troves (`byKind`) | `packsContained=8` | [Ravensburger trove](https://www.ravensburger.us/en-US/products/disney-lorcana/trove-packs/) |
| Illumineer's Trove / Trésor (SKU FR) | `packsContained=8` (redondant `byKind`) | Ravensburger trove product pages |
| Gift Scrooge / Elsa (EN/DE/IT aliases) | même promo que FR | disneylorcana / Bleeding Cool |
| Starters sets 1–10 | listes 60 printKeys + 1 booster | TheGamer / lorcanaplayer / SCG |
| Gift sets (`coffret-cadeau`) | packs + promos vérifiés SKU | disneylorcana / Ravensburger / ScreenRant |
| Collection starters / Stitch portfolio | 4 boosters + 1 promo | Ravensburger product pages |
| D23 / Disney 100 | printKeys promo | catalogue `-p1` / `-d23` |
| Quête Deep Trouble | 5 exclusives + `declaredCardCount=120` (listes decks à compléter) | lorcanaplayer / disneylorcana |
| Quêtes Palace Heist / Hunny | structure seule | — |
| Avant-première / prelude | `randomPoolScope=unknown` (pas un booster set) | — |
| Judge / special packs | **ne pas** laisser en `set` sans vérif | — |

### Autres packs — 2026-08-26

| Pack | Ledger | Statut |
| --- | --- | --- |
| `naruto/carddass` | `data/naruto/carddass/curated/sealed-contents.json` | Boosters FR/IT=8, JP=6 ; CCG US s24/s28 = 10×24 ; FR `duopack-s28` = 8×2 + PR-096 (EU) ; **S1–S4 starters known** ; S5 * /** + UltraJeux ; IT/JP structure 40 sans listes |
| `pokemon` | `data/pokemon/curated/sealed-contents.json` | Displays=36 ; pas de `cardsPerPack` booster inventé |
| `dragonball/cg` / `dragonball/fw` | `data/dragonball/*/curated/sealed-contents.json` | Decks connus persistés ; displays=24 |

