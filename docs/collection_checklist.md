# Check-list de collection — « ce qui existe » vs « ce que j'ai »

Demandé le **2026-08-15**. Une vue par collection listant _tout ce qui existe_
— tous les jeux PS1, toutes les cartes Naruto — avec une case cochée quand on
le possède, une vignette, et un export imprimable.

C'est une **fonctionnalité utilisateur**, pas de la maintenance : à mettre dans
la roadmap, pas dans la dette.

**Quand.** Décidé le 2026-08-15 : _après_ la consolidation de l'existant et
l'ajout de nouvelles sources de données (nouveaux TCG). Ce document est là pour
que l'idée ne se perde pas d'ici là — elle a déjà produit deux constats qui
valent indépendamment d'elle : l'absence de table de sets, et la confusion
entre set d'origine et produit de distribution.

**Poussé le 2026-08-16** : compositions, types d'entrée TCG, visuels. **Archivé
dans `data/`** au Sync admin (pas un grab manuel) : graphe dbscards
produit→cartes + photos de decks Naruto. Les quatre TCG (Naruto, DBS,
Lorcana, Pokémon) suffisent comme échantillon des objets hors cartes —
voir plus bas. L'objet utile aujourd'hui, c'est le tirage.

## La donnée existe déjà, entièrement en local

| corpus                       | volume                           | vignettes                               |
| ---------------------------- | -------------------------------- | --------------------------------------- |
| LaunchBox — Sony PlayStation | **4 613** jeux                   | oui (`game_images`, 1 290 570 au total) |
| LaunchBox — PS2 / PS4 / PS3  | 4 746 / 3 849 / 2 602            | oui                                     |
| LaunchBox — tous supports    | 182 172 jeux, colonne `platform` | oui                                     |
| Naruto CCG                   | 771 tirages                      | oui                                     |
| DBS Masters                  | 8 434 tirages                    | oui                                     |
| DBS Fusion World             | 3 962 tirages                    | après la passe faces                    |
| Lorcana                      | 3 241 (en)                       | oui                                     |
| Pokémon                      | 93 777 cartes, 6 langues         | oui                                     |

Aucun téléchargement n'est nécessaire : la check-list est une **jointure entre
un catalogue local et les items possédés**.

## Ce qui existe déjà et sert de base

`src/providers/narutoccg/buildCoverageChecklist.ts` — _« Cross-source coverage
checklist for Naruto CACG FR »_, lancé par `pnpm naruto:cards -- --only
checklist`. Il croise déjà les sources et produit un état de couverture.

Mais c'est un outil de développement : il écrit un fichier, il est propre à un
pack, et il s'appuie sur des ancres externes (les check-lists Manga-News). La
fonctionnalité demandée est la **généralisation** de cette idée en vue
utilisateur, alimentée par le catalogue local plutôt que par des ancres.

## Le vrai prérequis : modéliser le set

Une check-list n'a de sens que si l'on peut répondre à « **cette série est-elle
terminée ?** ». Aujourd'hui, on ne le peut pas : il n'existe **aucune table de
sets**. Le set est une chaîne dénormalisée sur `print_titles` (`set_name`), et
Naruto ne la porte même pas. Ni date de sortie, ni statut, ni territoire.

### Le statut est par territoire, pas global

Cas déjà documenté chez nous : la **série 6 de Naruto CCG est annulée en
France, mais elle est sortie en Italie** sous le titre « Rivalità Eterna » — les
136 cartes S6 du catalogue Coleka sont italiennes. Un booléen « terminé » global
serait donc faux dans les deux sens : faux pour un collectionneur français qui
a fini, faux pour un italien à qui il manque une série entière.

Le statut appartient au couple **(set, territoire)**, pas au set.

### Ce qu'il faudrait porter

| champ               | pourquoi                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| code, nom, pack     | aujourd'hui une chaîne libre, dupliquée sur chaque tirage                                                                   |
| date de sortie      | dbscards la publie (`Date Sortie: 03/07/2026`) mais **sur la fiche carte**, pas dans la liste — donc absente de notre index |
| territoire          | une même série n'existe pas partout                                                                                         |
| statut + **preuve** | `en cours` / `terminé` / `annulé`, avec la source qui l'atteste et sa date                                                  |

Le champ « preuve » n'est pas décoratif : c'est ce qui distingue « la série est
finie » de « on n'a rien vu passer depuis six mois ». Sans lui, une check-list
annoncerait une complétion à 100 % sur une série encore vivante.

### Ce que ça débloque au-delà de la check-list

Une base locale de tout ce qui existe rend l'app plus rapide — elle l'est déjà
pour la recherche — mais surtout elle ouvre une facette **complétion** :
interroger un catalogue depuis l'application, pas seulement consulter ses
étagères.

## Un catalogue ne contient pas que des cartes

Une collection ne se compte pas qu'en cartes : decks de démarrage, coffrets,
displays, blisters. Il faut pouvoir les cocher aussi, et leur associer un
visuel.

### On les confond déjà, et ça se voit

`set_name` mélange aujourd'hui deux notions distinctes. Chez DBS Masters on y
trouve `BT31` (un set de boosters) **et** « DECK DE DÉMARRAGE -Final Radiance- »
ou « Premium Anniversary Box 2024 » (des produits scellés). Bandai les publie
comme des « séries » de sa cardlist, et nous avons repris sa forme.

Ce n'est pas anodin pour une check-list : « BT31 complet à 80 % » et « je
possède ce deck » ne sont pas la même affirmation. La première se compte en
tirages, la seconde est un objet unique.

### La matière existe déjà

- **Naruto** — les pages de decks sont sur disque :
  `staging/manga-news/Naruto-Deck-Serie-{1..5}.html` et `-Nouvelle-Serie.html`.
- **DBS / Lorcana / Pokémon papier / One Piece** — même logiciel
  (dbscards, fw.dbscards, lorcards, pkmcards, opecards, …). Un registre
  `src/providers/shared/dbscards/sites.ts`, un crawl. Accessoires exclus.
  Sync admin pour les packs déjà ouverts ; One Piece via
  `pnpm tcgcards:products -- --site opecards` en attendant un provider.
- **Jeux vidéo** — l'équivalent n'est pas le produit scellé mais l'**édition**
  (collector, limitée, bundle). LaunchBox ne les modélise pas ; à vérifier avant
  de promettre la parité.

### Visuels des produits scellés — mesuré 2026-08-16

On peut les trouver. Ils ne sont **nulle part** dans `print_assets` : le
pipeline cartes les ignore exprès (Naruto classe `/packshots/` en chrome).
Une face de carte ne doit pas servir de vignette de booster.

| jeu                  | déjà local                                                                                                                                                                                  | source trouvée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | taille typique                   | trou                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Naruto FR**        | **Oui.** `staging/carddass-fr/images/packshots/` + copie Catalogue `products/`. Boosters S1–S5, 8 starters S1–S4, 2 decks S5 `PEM05124_*`, tin box, logos S1–S5.                            | Manga-News decks encore en ligne (`…/goodies/tcg-naruto-deck-serie-1.jpg`, 150×251).                                                                                                                                                                                                                                                                                                                                                                                                                       | Petit, époque 2006–08.           | **Pas de display.** Pas de S6 FR — le produit n'existe pas (déjà dans `knownCards.ts`).                                                                                |
| **Naruto JP**        | **Oui.** `staging/carddas-jp/…/image/product/{1st,2nd,3rd,4th}/` : `pack.jpg` / `box.jpg` / starters, ~120×250.                                                                             | Site officiel d'époque, mirroir local.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Petit.                           | Corpus JP, pas FR. Utile comme preuve de forme, pas comme visuel de collection FR.                                                                                     |
| **DBS Masters**      | HTML + URL d'image au Sync admin. **Pas** le fichier CDN (on n'en a pas besoin pour la carte).                                                                                              | **dbscards est debout** aujourd'hui. Motif stable : `https://static.dbscards.fr/products/{slug}.webp` — 400×400, ~150–190 Ko. Listing paginé en chemin (`/products/boosters/2`, pas `?page=`) : **120** boosters, **34** displays, **28** decks, **16** coffrets, **26** special packs. **Officiel Bandai** : `https://www.dbs-cardgame.com/images/product/dbs-b31/img_item.png` (pack 431×458) + `img_promobox.png` (display 960×602). `dbs-b25/img_item.png` répond encore → l'archive officielle tient. | 400² communauté / ~960 officiel. | Même ToS que les faces dbscards. Préférer Bandai quand le fichier existe.                                                                                              |
| **DBS Fusion World** | Idem, Sync admin.                                                                                                                                                                           | Même famille : `https://static.fw.dbscards.fr/products/en/{catégorie}/image-….webp` (400×400). Officiel : pages `/fw/en/products/01_*.html` — FB11 = `…/FB11_en.png` 400×400 (visuel pack, pas display).                                                                                                                                                                                                                                                                                                   | 400².                            | Rareté toujours absente de l'index ; le visuel, lui, est là.                                                                                                           |
| **Lorcana**          | HTML + URL d'image au Sync admin (`staging/lorcards-products/`). **Pas** le fichier CDN.                                                                                                    | **lorcards.fr** — même logiciel que dbscards (routing identique). Motif : `https://static.lorcards.fr/products/fr/{catégorie}/image-…-{slug}.webp`. Wrappers distincts (Woody ≠ Merida ≠ Gadget). Boutique Ravensburger (Cloudflare) en secours.                                                                                                                                                                                                                                                           | 400².                            | Faces déjà au dump officiel. Produits = Sync, pas l'heure.                                                                                                             |
| **Pokémon papier**   | HTML + URL d'image au Sync admin (`staging/pkmcards-products/`). **Pas** le fichier CDN. Logos d'extension : `staging/tcgdex-set-logos.json` (API TCGdex), overlay Catalogue via `setCode`. | **pkmcards.fr** — même logiciel que dbscards. Boosters, ETB, tins, Pokébox, tripacks, coffrets. Displays en index. Boutique officielle Pokémon en secours.                                                                                                                                                                                                                                                                                                                                                 | 400².                            | Faces = dump Live / TCGdex. Produits = Sync, pas l'heure. Live `booster-compendium` = digital, pas papier. Display souvent **sans** `setCode` → pas de logo (honnête). |

Conséquence pour la check-list : le visuel du scellé est un **asset du produit**,
pas un `print_asset`. Catalogue → **Scellés** lit `data/<pack>/products-index.json`
(projeté depuis le graphe TCG Cards au Sync). Un SKU existe ; posséder le
scellé ≠ posséder les cartes. P3 check-list / buy-advice n'est pas dans ce slice.
Naruto decks : photos au Sync (étape checklist). DBS / Lorcana / Pokémon papier :
graphe produits au Sync admin, pas à l'heure.

### Archivé 2026-08-16 — ce qui sert la carte, pas le booster

L'objet qui compte aujourd'hui, c'est le **tirage**. Pas de packshots.
Le graphe produit→cartes est une **étape de pipeline**, pas un grab
manuel :

- Masters / Fusion World : bouton **Sync** de la ligne
- Naruto decks : même Sync (HTML + photo du deck)

Inclus au **Sync admin**. Hors de la boucle horaire (l'hôte tarpitte ;
fiches decks / coffrets / special-packs **et** boosters). HTML déjà là
= reprise sans GET.

| où                                                | quoi                                                                                                                                | pour plus tard                                                                                                                                                                                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/dbs/cg/staging/dbscards-products/`          | **224** SKU ; **190** fiches (120 boosters + 70 decks / coffrets / special-packs)                                                   | date, prix, `declaredCardCount`, URL d'image. **2451** liens carte. Decks / coffrets exclusifs complétés depuis `catalog.sqlite`. Un booster reste sur l'aperçu 15 tuiles (Union Force 15/127) — le site le dit ; on ne dump pas le set. |
| `data/lorcana/staging/lorcards-products/`         | **122** SKU ; **110** fiches (boosters / blisters / decks / coffrets / troves). Displays en index.                                  | date, prix, URL d'image, aperçu 15 tuiles. **1491** liens carte. Un booster Set 12 Woody = 15/446 — le pool du chapitre, pas le contenu du pack. Puzzles au prochain Sync (catégorie ajoutée).                                           |
| `data/pokemon/staging/pkmcards-products/`         | **420** SKU ; **400** fiches (193 boosters + ETB / tins / Pokébox / tripacks / coffrets / special-packs). **20** displays en index. | date, prix, URL d'image, aperçu 15 tuiles. **5910** liens carte. Catalogue Live **non joint** (122 du set ≠ le pack).                                                                                                                    |
| `data/onepiece/staging/opecards-products/`        | `pnpm tcgcards:products -- --site opecards`                                                                                         | Pas de pack Catalogue ni de provider. Graphe scellé en staging pour plus tard.                                                                                                                                                           |
| `data/yugioh/staging/ygocards-products/`          | `pnpm tcgcards:products -- --site ygocards`                                                                                         | Boosters + displays (28 / 24 au nav, 2026-08-16). Pas de provider.                                                                                                                                                                       |
| `data/mtg/staging/mtgcards-products/`             | `pnpm tcgcards:products -- --site mtgcards`                                                                                         | Rayon scellé **mince** : 0 booster, 0 display, 1 Commander, 5 prerelease. Binders / playmats exclus. Pas de provider.                                                                                                                    |
| `data/naruto/carddass/staging/manga-news/images/` | 6 photos de **decks** (150–319 px)                                                                                                  | les HTML checklists étaient déjà là ; les visuels étaient encore distants. Packshots booster : déjà dans `carddass-fr/images/packshots/`, unused.                                                                                        |

Accessoires exclus. Displays = nom + slug + URL d'image, pas de fiche.
Boosters = fiche + aperçu 15 tuiles (le site le dit), pas le pool du set.

Restes **honnêtes** (pas un trou de parseur) :

- **Decks anciens** (SD01 14/18, SD08 19/24) — Bandai n'a listé que les
  uniques ; les reprints absents de la fiche et du catalogue restent
  vides. On n'invente pas les 4–5 cartes manquantes.
- **Mega Box vol.1/2** — 0 carte : boîtes de rangement, pas une liste.
- **Gift Collection GC-02** (15/167) et premium packs de set (15/155) —
  pool loterie, pas une série Bandai. On ne dump pas BT19.
- **Anniversary 2021** — 36 exclusifs joints ; le déclaré 76/112 inclut
  le pool booster. Pareil GE01 30/55, 5th Anniversary 45/78.
- **Naruto** — l'étagère a déjà la série : fact `Extension` =
  `narutoSetLabel(set_code)` (`Série 5 — La quête / Un nouveau départ`).
  Ce qui n'est pas dans `print_titles.set_name`, c'est l'axe DBS
  « ce tirage a été distribué dans le produit X » (un deck qui traverse
  les sets). Chez Naruto la série **est** le `set_code` ; l'appartenance
  deck est dans les checklists Manga-News (`setHint`), pas un oubli
  d'étagère.

### Un produit **contient** des tirages, et ça traverse les sets

C'est la relation qui manquait au modèle : un produit scellé n'est pas un type
d'entrée à côté des tirages, il en **contient**. Et son contenu ne respecte pas
les frontières de sets. Mesuré sur DBS Masters :

| produit                            | tirages | sets d'origine distincts                                               |
| ---------------------------------- | ------- | ---------------------------------------------------------------------- |
| DECK DE DÉMARRAGE -Final Radiance- | 19      | **11** (bt18, bt16, bt13, bt12, bt11, bt7, bt6, bt5, sd23, ex15, ex06) |
| Premium Anniversary Box 2024       | 52      | **9**                                                                  |
| Premium Anniversary Box 2023       | 59      | **7**                                                                  |

31 autres produits sont mono-set. La relation est donc bien **plusieurs à
plusieurs**, et elle est déjà dans nos données — simplement pas nommée comme
telle.

### Deux faits distincts, aujourd'hui confondus

Chaque tirage porte en réalité **deux** appartenances :

- son **set d'origine** — `set_code` (`bt5`, `bt18`) : d'où vient son numéro de
  collection ;
- le **produit de distribution** — `set_name` : dans quelle boîte il a été
  vendu.

Nous les stockons tous les deux, mais sous des noms qui laissent croire à une
seule notion. C'est exactement la même donnée que le segment `evp17` repéré
dans les URLs dbscards le 2026-08-15 : « Event Pack 17 », le produit de
distribution, distinct du set d'origine.

### Ce que ça débloque

C'est le cas d'usage qui justifie la fonctionnalité : _« j'ai acheté des cartes
à l'unité, il m'en manque 99 % — qu'est-ce que j'achète ? »_

Avec la relation de contenu, la check-list ne dit plus seulement « il te manque
47 cartes », elle dit **« ces 47 cartes sont dans le deck Final Radiance »**, ou
« aucun produit ne les regroupe, il faudra les acheter à l'unité ». La question
d'un collectionneur n'est pas « que me manque-t-il » mais « que dois-je
acheter » — et ce sont deux réponses différentes.

## Conseil d'achat — le problème et sa forme

L'objectif final : ne pas seulement lister le manque, mais dire **quoi acheter**
pour maximiser les acquisitions, en limitant les doublons et le coût. Et
comparer « acheter les cartes à l'unité » à « acheter un deck / une display ».

### Deux familles de produits, deux mathématiques

C'est la distinction qui décide de ce qu'on peut promettre :

- **Contenu déterministe** — deck de démarrage, coffret, boîte anniversaire. On
  sait exactement ce qu'il y a dedans. Le problème est un **recouvrement
  d'ensembles pondéré** : quel sous-ensemble de produits couvre le plus de
  manques au moindre coût. NP-difficile en théorie, mais à notre échelle
  (quelques centaines de produits, quelques milliers de manques) un algorithme
  glouton — meilleur ratio « nouvelles cartes / prix » à chaque tour — donne un
  résultat proche de l'optimal et instantané. C'est ici que l'exemple de
  l'utilisateur tombe juste : un deck qui apporte 99 cartes neuves contre
  3 doublons est évidemment le bon achat, et le calcul le dit tout seul.
- **Contenu aléatoire** — booster, display. Le contenu n'est pas connu : il
  dépend des taux de tirage par rareté, que nous n'avons pas. On ne peut donner
  qu'une **espérance**, et elle décroît à mesure que la collection se remplit
  (les premières boîtes apportent beaucoup, les dernières presque rien).

Conséquence à assumer dans l'interface : pour un deck on affiche un chiffre,
pour une display une estimation, et on le dit.

### Le coût est dominé par une poignée de cartes

Mesuré sur les prix dbscards collectés le 2026-08-15 :

| set  | cartes cotées | coût à l'unité | prix médian | prix max |
| ---- | ------------- | -------------- | ----------- | -------- |
| BT31 | 164           | **2 404 €**    | 0,10 €      | 399 €    |
| BT25 | 167           | **5 801 €**    | 0,02 €      | 1 999 €  |
| BT1  | 146           | 365 €          | 0,02 €      | 140 €    |

7 092 cartes françaises cotées, 99 212 € cumulés.

La médiane est à deux centimes et le maximum à deux mille euros : **compléter
95 % d'un set ne coûte presque rien, les 5 % restants coûtent tout.** Un conseil
d'achat qui viserait « le set complet » serait donc inutile. Ce qu'il faut
montrer, c'est la falaise : « 158 cartes pour 12 €, puis 6 cartes pour 2 390 € ».

### Le prix de bascule display / cartes à l'unité

La formulation utile n'est pas « achète une display » ou « achète à l'unité »,
c'est : **« achète à l'unité, sauf si tu trouves une display sous X € »**. Un
seuil, pas un verdict — et il se calcule.

Le seuil dépend de l'avancement, ce qui produit exactement la bascule
pressentie : à 50 % de complétion une display apporte beaucoup, à 80 % elle
apporte surtout des doublons.

#### Emplacements dédiés vs emplacements partagés

Les éditeurs publient rarement des taux. On peut s'en passer **seulement**
quand un emplacement est dédié à une rareté : 6 communes Lorcana, 4 communes
Pokémon SV. Alors deux choses suffisent :

1. **La composition du booster** — combien d'emplacements, de quelle nature.
2. **La distribution des raretés du set** — déjà dans nos catalogues là où
   la colonne existe.

Pour une display de `D` boosters offrant `s_r` emplacements **dédiés** à la
rareté `r`, et `N_r` cartes distinctes de cette rareté dans le set :

```
P(une carte donnée de rareté r apparaît) ≈ 1 − (1 − 1/N_r) ^ (D × s_r)
```

Dès qu'un emplacement est **partagé** — « Rare ou mieux », « foil de n'importe
quelle rareté », « holo SV qui peut être Rare / Double Rare / Ultra / Hyper »
— cette formule ment. Reconstituer les poids _dans_ l'emplacement, c'est
exactement un taux de tirage. Les chase (Enchanted, God Rare, Illustration
Rare) vivent presque toutes dans un emplacement partagé. Or ce sont elles qui
dominent le seuil.

Donc : pour les communes, un chiffre. Pour la carte à 400 €, une **fourchette**
(poids min / max dans le slot) jusqu'à ce que les ouvertures enregistrées
resserrent la mesure. Le « aucun taux requis » du paragraphe précédent ne
tient que pour le plancher du set, pas pour la falaise.

#### Compositions publiées — mesuré 2026-08-16

Ce n'est pas « une constante par jeu ». C'est **(jeu, ère / type de produit)**.
Un booster SV n'a pas la même ossature qu'un booster Sword & Shield ; un
_Story Booster_ Fusion World n'est pas un `FB**`.

| jeu                    | booster (slots)                                                                                                                                                                      | display                                               | dans notre index                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lorcana** (sets 1→)  | 12 : 6 C, 3 UC, 2 Rare+, 1 foil (toute rareté, y compris Enchanted / Epic / Iconic). + 1 carte marketing.                                                                            | **24** packs (casier courant = 4 displays = 96 packs) | Rareté **complète** (3 241 prints, 4 langues). _Archazia's Island_ (set 7) : 72 C, 54 UC, 48 R, 20 SR, 12 L, 18 Enchanted, 14 Special. Sets 9+ ajoutent Epic / Iconic dans le slot foil. `Q1`/`Q2` = Illumineer's Quest (contenu déterministe), pas des boosters. |
| **Pokémon papier SV+** | 10 + 1 Energy + 1 code Live : 4 C, 3 UC, 2 reverse holo, 1 holo. IR / SIR remplacent le 2ᵉ reverse ; le holo peut être Rare / Double Rare / Ultra / Hyper.                           | **36** packs                                          | **Pas dans `catalog.sqlite`** — ce fichier est Live (`card_foil` / `live_cards`, rareté d'app, surtout `de`). Le papier passe par TCGdex (API), sans table locale de produits scellés. Pré-SV : une autre ossature (1 reverse, pas de holo garanti).              |
| **DBS Masters**        | 12 cartes / pack. Bandai publie le _compte de types_ du set — **pas** le remplissage d'un pack. Chez nous, `bt31` FR : 50 C, 40 UC, 34 R, 18 SR, 15 SPR, 10 SLR, 6 CR, 3 SCR, 1 GDR. | **24** packs                                          | Rareté **complète** FR (7 241 titres ; 8 434 prints). 28 graphies (`Common[C]`, `UnCommon[UC]`, `Promotion[PR]` vs `PR］`…). Starter Rare = decks, pas boosters.                                                                                                  |
| **DBS Fusion World**   | 12 cartes + code digital / pack. Même display 24 (sauf _Story Booster_ : 20).                                                                                                        | **24** (SB : 20)                                      | **Aucune colonne `rarity`.** 3 962 prints, 3 946 titres `en` (+ 3 003 `ja`), `grouping` = variantes (`p1`…`p7`). Le slot model est bloqué tant que Bandai n'est pas indexé.                                                                                       |
| **Naruto CCG FR**      | 8 cartes dont **1 holo** (annonce Kana 2008, inchangé S1–S6). Starter : 40 dont 2 holos.                                                                                             | **inconnu**                                           | Rareté binaire `commune` (611) / `holo` (112) / `promo` (23). Pas de `set_name`. S1–S5 = 184/135/127/127/151 ; S6 = 24 restes IT, pas une série FR.                                                                                                               |

Lorcana est le seul jeu où l'éditeur **écrit les slots sur la fiche produit**.
DBS publie le checklist du set, pas le pack. Pokémon Support décrit SV+ et
prévient que les visuels d'emballage **ne sont pas le contenu**.

#### Le seuil

En notant `M` l'ensemble de ce qui vous manque :

```
valeur attendue de la display = Σ  P(apparaît | rareté de c) × prix_unitaire(c)
                              c ∈ M
```

C'est le prix de bascule : **au-dessus, mieux vaut acheter à l'unité ; en
dessous, la display est rentable.** Pour les emplacements dédiés, `P` est
exact sans taux. Pour les emplacements partagés, `P` est une fourchette —
donc le seuil aussi. Aucun taux propriétaire n'est requis pour le plancher
du set ; la falaise attend des poids (éditeur ou ouvertures).

Et la bascule que décrit l'utilisateur en découle sans être postulée : à mesure
que `M` se réduit, la somme diminue, donc le seuil baisse. Une collection
avancée rend mécaniquement la display moins intéressante.

#### La réserve qui compte

Les cartes chères dominent la somme. Une Enchanted à 400 € pèse plus que
150 communes à deux centimes — donc le seuil sera souvent décidé par **une
seule carte manquante**. C'est la même falaise que plus haut, et il faut
l'afficher : « display rentable sous 210 €, mais 190 € de ce seuil tiennent à
une seule Enchanted que vous avez 4 % de chance d'y trouver ». Sans cette
transparence, le conseil serait mathématiquement juste et pratiquement
trompeur.

### Ce qu'il manque pour le construire

Mesuré 2026-08-16 sur les `catalog.sqlite` locaux — plus seulement « à
évaluer » :

- Le **prix des produits scellés** — decks / coffrets / special-packs /
  boosters : dans `products.json` (étape `products`). Displays : index
  seul, pas de fiche, donc **pas leur prix**. Le visuel reste une URL CDN,
  pas un fichier local. Voir plus haut.
- La **relation de contenu** n'est riche **que chez DBS Masters**. Cinq
  `set_name` y traversent ≥ 3 `set_code` (Anniversary Box 2023 : 7 sets ;
  2024 : 9 ; Final Radiance : 11). Chez Lorcana, un `set_name` = un chapitre
  (plus deux Quêtes). Chez Naruto, l'étagère a déjà la série (`Extension` ←
  `set_code` + `sets.json`) ; ce qui manque est l'axe produit (decks =
  HTML Manga-News, pas une relation catalogue). Chez Pokémon, le sqlite
  local ne connaît pas le papier. Chez Fusion World, pas de rareté.
- La **composition d'un booster** n'est plus « le seul vrai manque » : elle
  est **connue et publiée** pour Lorcana, Pokémon SV+ et Naruto FR ; connue
  en taille (12 / 24) mais **pas en slots** pour DBS Masters / FW. Le vrai
  manque pour le seuil, ce sont les **poids des emplacements partagés** —
  et la rareté Fusion World.

### Comment gérer ça sans tout aplatir

La tentation serait une taxonomie universelle du collectionnable. C'est le
piège déjà rencontré sur `print_assets` : quatre formes réduites à une auraient
perdu les vernis de Lorcana et le `wayback_timestamp` de Naruto.

`print` + `sealed` est trop plat — un deck et une display ne s'ouvrent pas
pareil, un tapis n'entre pas dans la complétion. L'inverse (20 SKU dans le
noyau : ETB, Trove, Quest, blister, judge pack…) recopie les catalogues
éditeurs et casse au prochain jeu.

La forme qui tient : **chaque catalogue nomme ses types**, le noyau ne voit
que des **comportements** — identifiant, nom, image, portée, et les traits
ci-dessous. Un pack cartes déclarera `print`, `booster`, `display`, `starter`…
un catalogue de jeux `game` et `edition`. Voir « Types d'entrée TCG ».

Le noyau ne connaît que le minimum commun, et la check-list se construit dessus
sans savoir ce qu'elle compte. C'est la même règle que pour les colonnes de
`print_assets` : un tronc commun, des extensions déclarées, rien d'aplati.

## Types d'entrée TCG — ce qu'on oublie (2026-08-16)

Carte, booster, display : les trois qu'on nomme. Le reste n'est pas une
liste de SKU à graver dans le core. C'est **deux axes**, et le second est
celui qu'on oublie.

### Ce qui change le modèle (pas le nom en rayon)

| comportement       | scellé                                   | à l'ouverture                        | exemples                                                                                                              |
| ------------------ | ---------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **print**          | —                                        | l'unité                              | carte, parallèle, promo, jumbo (le jumbo est un _attribut_ du tirage, pas un autre type)                              |
| **random_pack**    | loterie                                  | saisir les cartes                    | booster de set, booster sous blister plastique, pack tournoi / judge / championship, certains _special packs_         |
| **pack_container** | loterie emboîtée                         | → N packs                            | display (24 / 36), casier (4 displays Lorcana), _booster bundle_ Pokémon (6)                                          |
| **known_bundle**   | contenu exact                            | → les K cartes (ou garder le bundle) | starter / theme / structure deck, Illumineer's Quest, certains decks « Ultimate » DBS                                 |
| **mixed_bundle**   | exclus **connus** + packs **aléatoires** | → exclus + N packs                   | Trove (8 boosters + boîte + dés), gift set, ETB / UPC, tin + boosters, anniversary / mega box, blister 3-pack + promo |
| **accessory**      | pas de cartes (ou ce n'est pas le sujet) | reste un accessoire                  | sleeves, playmat, deck box, classeur, séparateur, poster, _energy marker pack_ FW                                     |
| **shell**          | —                                        | déjà vide                            | wrapper, boîte de display vide — autre objet, déjà noté                                                               |

Un _mixed_bundle_ n'est ni un deck ni une display. L'ouvrir donne les
exclus (chiffre) **et** des boosters (loterie). C'est le cas le plus
fréquent dès qu'on sort de « booster / display / starter », et c'est
celui que `print` + `sealed` écrase.

La hiérarchie s'allonge, la règle d'ouverture ne change pas :

```
casier        →  4 displays
display       →  N boosters
blister 3+1   →  3 boosters + 1 promo
trove / ETB   →  exclus connus + N boosters
booster       →  M cartes (saisie)
starter/quest →  K cartes
```

### Ce que chaque jeu vend vraiment (au-delà des trois)

Mesuré sur les listings dbscards / FW (2026-08-16) et les gammes éditeur :

| jeu                | en plus de carte / booster / display                                                                                                                                                                                                                                                                | hors complétion cartes                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Naruto FR**      | **2 starters par série** (pas un), tin box, decks S5 nommés, promos. **Pas de display.**                                                                                                                                                                                                            | —                                                                                                     |
| **DBS Masters**    | starter / ultimate / theme deck ; _special / premium / event pack_ ; pack tournoi / championship / judge ; anniversary / gift / mega box ; blister carton 3-pack (`booster-blister-carton-bt24`). Listing : **120** boosters, **34** displays, **28** decks, **16** coffrets, **26** special packs. | sleeves (~31), playmats (~27), deck boxes (~24), classeurs UG, séparateurs, **posters** d'annonce (6) |
| **Fusion World**   | starter `FS01`–`FS10` ; _Story / Manga booster_ (display **20**, pas 24) ; judge / tournament / limited pack ; _energy marker pack_ ; 2 coffrets.                                                                                                                                                   | energy markers, storage box                                                                           |
| **Lorcana**        | booster **sous sleeve** (même loterie, autre SKU) ; casier 4×24 ; starter / 2-player / single-player deck ; **Trove** (8 packs + rangement) ; **Illumineer's Quest** ; gift set ; _collection starter set_.                                                                                         | playmat, portfolio, pins, lore counters — Ravensburger les range à part                               |
| **Pokémon papier** | sleeved booster ; **bundle** (6, ≠ display 36) ; ETB ; Ultra-Premium Collection ; tin ; collection / poster box ; blister 3+promo ; Build & Battle. **Carte code** Live = objet digital, pas une carte papier.                                                                                      | sleeves, playmat, classeur, dés ETB                                                                   |

Les packs « tournoi / judge / championship » sont des `random_pack` avec
leur propre pool — les traiter comme le booster du set serait un faux
positif. Le _Story Booster_ FW n'est pas un `FB**`. Un booster sous
plastique n'est pas un autre contenu : c'est le même pack, autre
emballage (SKU distinct si on collectionne les wrappers).

### Échantillon représentatif — les quatre jeux suffisent

Après avoir fouillé Naruto, DBS (Masters + FW), Lorcana et Pokémon, le
noyau n'a **pas** vingt types à apprendre. Il a **six comportements**
(+ le `print`). Le prochain TCG n'en inventera presque jamais un
septième : il collera un nouveau nom sur l'un des six.

Objets qu'on gère vraiment (décidé 2026-08-16) — le nom + le visuel
font le reste :

| objet       | c'est quoi                                                         | notes                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Carte**   | le tirage                                                          | —                                                                                                                                                      |
| **Booster** | loterie, on saisit les cartes                                      | Un seul type. Judge / _Story_ / sous sleeve = d'autres **noms** et visuels, pas d'autres types. Ne pas fusionner un Judge Pack dans le booster du set. |
| **Display** | la boîte de boosters du set                                        | 24 (Lorcana / DBS), 20 (_Story_ FW), 36 (Pokémon). **Pas chez Naruto FR.**                                                                             |
| **Deck**    | contenu connu                                                      | Starter / theme / ultimate. Naruto : **2 par série**. Chez Lorcana, la _Quête_ est le même objet (nom de rayon).                                       |
| **Coffret** | plusieurs boosters, **pas** une display — parfois + cartes connues | Bundle 6 packs, tin, ETB, Trove, anniversary, blister 3+1. Nom + visuel + contenu. Les dés / sleeves = accessoires.                                    |

Hors sujet, on ne gère pas :

- **Casier** (4 displays Lorcana) — carton revendeur, pas un produit rayon.
- **Accessoire** — tapis, sleeves, posters, energy markers.
- **Boîte vide** — on ne collectionne pas le carton une fois ouvert.
- **Digital** — carte code / textures Live : ne pas les coller sur du papier.

Et les pièges que cet échantillon a déjà payés :

1. **Un produit qui se fait passer pour un set** — starter Naruto = nom de
   série Coleka ; deck DBS dans `set_name` ; Quête Lorcana = `set_code` Q1.
2. **Le même mot, pas la même taille** — display 24 / 20 / 36 ; un
   coffret de 6 n'est pas une petite display.
3. **Le même contenu, pas le même SKU** — booster nu vs sous plastique
   (le nom + le visuel suffisent).
4. **Un produit annulé** — starters/boosters Naruto S6 FR : jamais fabriqués
   (imprimés en Italie, autre objet).
5. **Un visuel d'app n'est pas le produit** — Unity Lorcana = foil ; Live
   `*-compendium` / wrappers CDN = set **digital**.

Mesuré dans les dumps, pas dans une boutique :

- **Lorcana** — `api.lorcana.ravensburger.com/v3/catalog` est public et
  **sans clé `products`**. `deck_building_id` = limite de copies du
  deckbuilder, pas le contenu d'un starter. _Gateway_ (`gateway1`) est
  dans l'API, absent de LorcanaJSON / sqlite.
- **Pokémon Live** — `config-cache` contient déjà `booster-compendium`
  (125), `battle-box-compendium` (45), decks Battle Academy (listes
  déterministes en IDs Live). **Aucun n'est parsé.** Ce n'est pas du
  papier. TCGdex `/sets` : toujours **pas** de champ `boosters`.

Donc : le modèle à gérer, c'est cette table. Les noms (Trove, ETB, Quest,
_Story Booster_, tin 5130) restent dans le catalogue qui les vend. Un
cinquième TCG ajoutera des libellés, pas une septième colonne.

### Ce qui n'est pas un type d'entrée

- **Parallèle / foil / promo / paysage / jumbo** — propriétés du `print`.
- **Set** — portée, pas un objet qu'on possède (déjà le prérequis).
- **Accessoire** — collectionnable, oui ; case de la check-list _cartes_,
  non. Une deuxième portée « matériel » si le besoin apparaît, pas un
  mélange dans le graphe de complétion.

Donc : monter les types dans le TCG, oui — **par comportement**, chaque
catalogue collant ses noms par-dessus. Pas une enum universelle
`etb | trove | quest | tin | …` dans le noyau.

## Posséder un produit scellé : une nature, pas une condition

On peut posséder un display, un booster ou un deck **non ouverts**. Il faut donc
pouvoir les ajouter à une collection TCG. Mais l'observation décisive est
celle-ci :

> Un booster possédé est scellé **par définition**. Ouvert, ce ne sont plus des
> boosters — ce sont des cartes.

Le scellé n'est donc pas un état parmi d'autres du même objet : c'est ce qui
fait exister l'objet en tant que tel. `Item.condition` (`new | used | loose |
damaged`) ne peut pas porter ça — un booster `used` n'existe pas, il a cessé
d'être un booster.

### Trois cas, et ils ne se comportent pas pareil

Le tableau court tenait pour carte / booster / deck. Les coffrets mixtes
(Trove, ETB, tin, anniversary) cassent la troisième ligne — voir
« Types d'entrée TCG ». L'axe, lui, ne change pas : **connu vs aléatoire**,
éventuellement les deux dans le même carton.

| objet                               | scellé                         | ouvert                                       |
| ----------------------------------- | ------------------------------ | -------------------------------------------- |
| **random_pack / pack_container**    | contenu **inconnu**            | n'existe plus : packs ou cartes obtenus      |
| **known_bundle** (starter, quest)   | contenu **connu**              | le bundle ouvert, ou ses K cartes — au choix |
| **mixed_bundle** (Trove, ETB, tin…) | exclus connus + packs inconnus | exclus + N boosters                          |
| **carte**                           | —                              | l'unité de base                              |
| **accessory / shell**               | pas une loterie de cartes      | reste cet objet                              |

La différence tient à la nature du contenu, pas à l'emballage. C'est la
même distinction que pour le conseil d'achat — le modèle et le calcul
reposent sur le même axe.

### Ouvrir n'est pas un état, c'est une transformation

La hiérarchie est en réalité uniforme (les coffrets mixtes s'y glissent
sans nouveau verbe — voir « Types d'entrée TCG ») :

```
display / casier / bundle  →  N boosters  →  M cartes
trove / ETB / tin          →  exclus + N boosters
starter / quest            →  K cartes
```

Une display ouverte ne donne pas des cartes : elle donne des **boosters**. D'où
une règle unique, valable aux trois niveaux : **ouvrir un contenant, c'est le
remplacer par son contenu.**

Formulé ainsi, « ouvert » cesse d'être un booléen à porter sur l'item. Un
booster déballé ne devient pas un « booster ouvert » qu'il faudrait conserver
dans l'étagère : il **cesse d'exister** et laisse ses cartes. Rien à modéliser.

Et l'inverse est un raccourci de saisie utile : ouvrir une display dans
l'application, c'est ajouter ses N boosters d'un geste. Ouvrir un deck, ses K
cartes. Ouvrir un booster, saisir ses M cartes — les seules qu'il faille entrer
à la main, puisqu'elles sont aléatoires.

Une réserve : certains collectionneurs gardent l'emballage vide (boîte de
display, wrapper). Ce n'est pas « une display ouverte », c'est un **autre
objet** — une boîte vide. À traiter comme tel si le besoin apparaît, pas comme
un état du premier.

### Les ouvertures produisent la donnée qui nous manque

Conséquence inattendue et précieuse. Le conseil d'achat bute sur les **poids
dans les emplacements partagés**, que les éditeurs ne publient presque jamais.

Or si l'application enregistre les ouvertures — « ce booster a donné ces
cartes » — elle accumule des tirages réels. Au bout d'un certain volume, elle
mesure ses propres poids, par set et par slot, au lieu de les encadrer depuis
la composition annoncée d'un booster.

Ça vaut la peine d'enregistrer l'événement d'ouverture dès le départ, même si
rien ne l'exploite au début : c'est de la donnée qu'on ne peut pas reconstituer
après coup.

### Trois questions ouvertes sur les contenants

**1. Le contenu d'un booster s'identifie carte par carte.** « M cartes » est un
raccourci d'écriture : ce sont des cartes nommées et numérotées, à saisir
individuellement. C'est précisément pourquoi le booster est le seul niveau qui
demande une saisie manuelle — display et deck se déplient tout seuls.

**2. Sait-on quels boosters contient une display avant de l'ouvrir ?** Non,
pas au sens du contenu — tranché 2026-08-16. Lorcana et Pokémon le disent
noir sur blanc : les arts d'emballage montrent des personnages du set, **pas**
ce qu'il y a dans _ce_ pack. Une display de 24 (Lorcana / DBS) ou 36 (Pokémon)
crée N boosters **génériques du set**. L'utilisateur peut ensuite coller un
art de wrapper s'il collectionne les blisters ; ça ne change pas la loterie.
Exception : produits déterministes (starter, Trove, Quête, ETB) — ce ne sont
pas des displays de boosters.

**3. Les cartes hors format ne sont pas gérées.** Mesuré le 2026-08-15 :

- **Rotation** — le contrat porte déjà `faceQuarterTurns` (0-3), renseigné par
  Pokémon (cartes BREAK) et Lorcana (Lieux). **DBS ne le renseigne jamais**,
  alors qu'il a de vraies cartes en paysage : `BT24-061` « You Fool! », une
  Z-EXTRA imprimée à l'horizontale, dont le fichier fait 1254×893. Sur
  27 739 faces DBS analysées, 20 sortent du ratio standard. Le mécanisme existe,
  la donnée ne circule pas.
- **Surdimensionné** — les cartes géantes (jumbo, « la taille de quatre cartes
  côte à côte ») ne sont **modélisées nulle part** : aucune notion de dimension
  dans aucun pack. Elles sont soit absentes des catalogues éditeurs, soit
  présentes et indistinguables d'une carte normale.
- `is_horizontal` existe dans le dump Arena mais vaut **toujours faux**
  (0/8600) — déclaré, jamais rempli, comme `finishes`.

Une carte jumbo n'est pas un détail cosmétique pour une check-list : elle se
possède, elle a un prix, et elle n'entre pas dans un classeur. C'est un attribut
physique du tirage, au même titre que la rotation.

### Ajouter un deck ajoute-t-il ses cartes ?

Question posée, et la bonne réponse est probablement « ça dépend, et il faut le
demander » :

- **Deck scellé** → un seul item. Ne _pas_ créer les cartes : elles ne sont pas
  disponibles, et un collectionneur qui garde son deck sous blister ne considère
  pas qu'il possède ces cartes au sens de la collection.
- **Deck ouvert** → proposer d'ajouter ses N cartes d'un coup. C'est le geste
  utile, et le contenu étant déterministe, il est exact.

Corollaire intéressant : « posséder un deck **complet** » peut vouloir dire deux
choses — détenir la boîte, ou détenir toutes ses cartes à l'unité. Les deux sont
des états de collection légitimes et **différents**. Une check-list devrait
pouvoir montrer les deux plutôt que d'en choisir un.

### Ce que ça implique pour la complétion

Un display scellé ne doit pas compter comme « j'ai ces cartes » : on ne sait pas
lesquelles. Un deck scellé le pourrait, puisqu'on les connaît — mais on ne les a
pas _en main_.

Il y a donc deux complétions défendables, et il faut choisir laquelle on affiche
(ou afficher les deux) : **« cartes que je détiens »** et **« cartes que je
possède, scellé compris »**. Ne pas trancher en silence : le collectionneur qui
garde un deck sous blister et celui qui l'a ouvert n'ont pas la même collection,
et aucune des deux lectures n'est fausse.

## Vue étagère : vrac et groupé (2026-08-16)

Le vrac reste : cartes, displays neuves, boosters pas ouverts, coffrets —
chaque item une vignette. Un **mode groupé** (comme une autre lecture, pas
une autre étagère) range par **set** et, en dessous, par **produit** (deck,
coffret encore scellé).

La complétion d'un set (« 80 / 204 ») joint le **catalogue** (ce qui existe)
aux items de l'étagère (ce que tu as). L'étagère ne porte pas le catalogue ;
elle en dérive les portées via les `printKey`.

En-tête de groupe : **nom + image**, pas un code seul. Ce qu'on a déjà
(ou à portée du Sync) :

- **Pokémon** — TCGdex : nom + logo (`/sets/{id}`, URL `…/logo.png`). Nom
  de série déjà affiché ; wordmark joint aux scellés (`setCode` pkmcards
  → abbr officielle / id TCGdex) via `staging/tcgdex-set-logos.json`.
- **Lorcana** — nom du chapitre / de la Quête (sqlite). Visuel de set :
  `api.lorcana.ravensburger.com/v3/catalog/fr` → `card_sets[].thumbnail_image_url`
  (bannière 512×288, chapitres + Quêtes + Gateway). Dump
  `data/lorcana/products/sets/{id}/logo.png` + overlay Catalogue via slug
  `set-12` / nom. LorcanaJSON / Lorcast n'ont pas ce champ.
- **DBS** — code `BT31` + visuel booster/display (URL dbscards déjà en
  archive). Attention : `set_name` sur une carte est souvent le _deck_,
  pas l'extension.
- **Naruto** — « Série 3 » + les deux starters (pas de titre officiel).
  Packshots booster déjà locaux, unused.

Ouvrir un starter : la boîte disparaît, les cartes apparaissent. Chaque
carte a **un** tirage (son set d'origine, ex. `bt13-135`) **et** une
provenance (« sortie du deck Final Radiance »). La complétion BT13 compte
la carte ; la fiche du deck permet encore de voir que c'était _ce_ starter.
Ce n'est pas deux sets — c'est un print + un contenant.

Les piles : déjà tranché (`tcg_support.md`) — **N items**, regroupés à
l'affichage (`Elsa foil ×3`). Même identité + même finition + même langue

- même état. Le détail du groupe liste les exemplaires (prix, prêt).

## Étagères et catalogues : la question à trancher

`Shelf` ne porte **aucun lien vers un catalogue** — seulement `type` et
`cardFormat`. Le rattachement passe par les items : `Item.printKey` encode le
pack (`dbscg:bt1-001`). Le catalogue d'une étagère est donc _dérivable de son
contenu_, et une étagère peut légitimement en mélanger plusieurs.

Conséquence pour la fonctionnalité : **une check-list s'ancre sur un catalogue
et une portée** (un set, une plateforme), jamais sur une étagère. Éditer une
check-list depuis une étagère revient donc à choisir laquelle de ses portées on
vise — et à le proposer explicitement quand l'étagère en couvre plusieurs.

## Questions ouvertes, à trancher avant de coder

1. **La clé de jointure côté jeux.** Une carte possédée porte `Item.printKey`
   (`dbscg:bt1-001`), indexé — la jointure est immédiate. Pour un jeu, il faut
   vérifier si `printKey` pointe sur un identifiant LaunchBox ou si le lien
   passe par les métadonnées. C'est la seule inconnue technique réelle.
2. **Où vit la vue.** Une check-list de 4 613 jeux ou 8 434 cartes n'est pas une
   page d'étagère : pagination, filtre par set/plateforme, et un compteur de
   complétion (« 312 / 4 613 »).
3. **Que veut dire « exhaustif ».** LaunchBox liste toutes les régions et
   variantes ; « tous les jeux PS1 » veut probablement dire _une entrée par
   jeu_, pas une par édition régionale. À définir avec l'utilisateur — le même
   piège que les tirages parallèles côté cartes.
4. **La case à cocher est-elle une écriture ?** Cocher = créer un item dans la
   collection, ou seulement marquer un souhait ? Les deux sont défendables ; ce
   n'est pas la même fonctionnalité.

## L'export imprimable

Le besoin exprimé est « éditer un PDF ». Deux voies :

- **Feuille de style d'impression + impression navigateur.** Aucune dépendance,
  fonctionne hors ligne, et le rendu est celui de la vue. Suffit si l'usage est
  « imprimer ma liste pour l'emmener en bourse aux cartes ».
- **Génération serveur.** Nécessaire seulement si le PDF doit être produit sans
  navigateur (envoi par mail, archivage automatique). Ajoute une dépendance de
  rendu dans une image qui n'en a pas aujourd'hui.

Commencer par la première : elle couvre le cas d'usage décrit, et la seconde
reste possible ensuite.

## Pourquoi c'est un bon candidat

Toute la donnée est locale et déjà rafraîchie par les passes existantes. La
fonctionnalité ne dépend d'aucun réseau, ne touche à aucun contrat de provider,
et ne pèse pas sur l'autonomie du conteneur. Elle est donc indépendante des
trois chantiers d'architecture ouverts.
