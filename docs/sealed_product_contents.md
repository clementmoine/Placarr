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

## État mesuré (2026-08-26)

| Pack | Boosters avec `cardsPerPack` | Displays avec `packsContained` | Decks `contentsKnown` (liste exacte) |
| --- | --- | --- | --- |
| Lorcana | **70 / 70** (`byKind` 12) | **15 / 15** (`byKind` 24) | **23 / 23** (ledger curated) |
| Pokémon | ~0 / 193 (pas de taille sachet inventée ; faux 99+ corrigés) | **20 / 20** (`byKind` 36) | — (peu de decks) |
| DBS CG | ~76 / 120 (texte boutique) | **34 / 34** (`byKind` 24) | **19 / 28** (ledger curated) |
| DBS FW | ~49 / 61 | **9 / 9** (`byKind` 24) | **10 / 10** (ledger curated) |
| Naruto Carddass | **FR/IT 8** (`byKind`) ; JP 6 (SKU) | partiel | **8 / 8** starters FR S1–S4 (`products-contents.json`, poster+catalogue qty) ; S5 partial / `contentsKnown: false` |


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

`data/<pack>/curated/sealed-contents.json`

Fusion via `mergeCuratedSealedContents` (ingest + lecture check-list).

### Lorcana — fait 2026-08-26

| Périmètre | Statut | Source |
| --- | --- | --- |
| Tous boosters (`byKind`) | `cardsPerPack=12`, pool `set` | [Ravensburger boosters](https://www.ravensburger.us/en-US/products/disney-lorcana/boosters) |
| Tous displays (`byKind`) | `packsContained=24` | idem |
| Illumineer's Trove / Trésor | `packsContained=8` | Ravensburger trove product pages |
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
| `dbs/cg` / `dbs/fw` | `data/dbs/*/curated/sealed-contents.json` | Decks connus persistés ; displays=24 |

