# Check-list de collection — « ce qui existe » vs « ce que j'ai »

Demandé le **2026-08-15**. Une vue par collection listant *tout ce qui existe*
— tous les jeux PS1, toutes les cartes Naruto — avec une case cochée quand on
le possède, une vignette, et un export imprimable.

C'est une **fonctionnalité utilisateur**, pas de la maintenance : à mettre dans
la roadmap, pas dans la dette.

**Quand.** Décidé le 2026-08-15 : *après* la consolidation de l'existant et
l'ajout de nouvelles sources de données (nouveaux TCG). Ce document est là pour
que l'idée ne se perde pas d'ici là — elle a déjà produit deux constats qui
valent indépendamment d'elle : l'absence de table de sets, et la confusion
entre set d'origine et produit de distribution.

## La donnée existe déjà, entièrement en local

| corpus | volume | vignettes |
| --- | --- | --- |
| LaunchBox — Sony PlayStation | **4 613** jeux | oui (`game_images`, 1 290 570 au total) |
| LaunchBox — PS2 / PS4 / PS3 | 4 746 / 3 849 / 2 602 | oui |
| LaunchBox — tous supports | 182 172 jeux, colonne `platform` | oui |
| Naruto CCG | 771 tirages | oui |
| DBS Masters | 8 434 tirages | oui |
| DBS Fusion World | 3 946 tirages | après la passe faces |
| Lorcana | 3 241 (en) | oui |
| Pokémon | 93 777 cartes, 6 langues | oui |

Aucun téléchargement n'est nécessaire : la check-list est une **jointure entre
un catalogue local et les items possédés**.

## Ce qui existe déjà et sert de base

`src/providers/narutoccg/buildCoverageChecklist.ts` — *« Cross-source coverage
checklist for Naruto CACG FR »*, lancé par `pnpm naruto:cards -- --only
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

| champ | pourquoi |
| --- | --- |
| code, nom, pack | aujourd'hui une chaîne libre, dupliquée sur chaque tirage |
| date de sortie | dbscards la publie (`Date Sortie: 03/07/2026`) mais **sur la fiche carte**, pas dans la liste — donc absente de notre index |
| territoire | une même série n'existe pas partout |
| statut + **preuve** | `en cours` / `terminé` / `annulé`, avec la source qui l'atteste et sa date |

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
- **DBS** — dbscards publie une taxonomie complète de produits scellés :
  `/products/{boosters,displays,collector-boxes,decks,special-packs,binders-pages,card-sleeves,deck-boxes,deck-separator,playmats,accessories}`.
- **Jeux vidéo** — l'équivalent n'est pas le produit scellé mais l'**édition**
  (collector, limitée, bundle). LaunchBox ne les modélise pas ; à vérifier avant
  de promettre la parité.

### Un produit **contient** des tirages, et ça traverse les sets

C'est la relation qui manquait au modèle : un produit scellé n'est pas un type
d'entrée à côté des tirages, il en **contient**. Et son contenu ne respecte pas
les frontières de sets. Mesuré sur DBS Masters :

| produit | tirages | sets d'origine distincts |
| --- | --- | --- |
| DECK DE DÉMARRAGE -Final Radiance- | 19 | **11** (bt18, bt16, bt13, bt12, bt11, bt7, bt6, bt5, sd23, ex15, ex06) |
| Premium Anniversary Box 2024 | 52 | **9** |
| Premium Anniversary Box 2023 | 59 | **7** |

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

C'est le cas d'usage qui justifie la fonctionnalité : *« j'ai acheté des cartes
à l'unité, il m'en manque 99 % — qu'est-ce que j'achète ? »*

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

| set | cartes cotées | coût à l'unité | prix médian | prix max |
| --- | --- | --- | --- | --- |
| BT31 | 164 | **2 404 €** | 0,10 € | 399 € |
| BT25 | 167 | **5 801 €** | 0,02 € | 1 999 € |
| BT1 | 146 | 365 € | 0,02 € | 140 € |

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

#### On n'a pas besoin des taux de tirage

Les éditeurs les publient rarement. Mais on peut s'en passer, parce qu'ils se
reconstituent à partir de deux choses :

1. **La composition d'un booster** — combien d'emplacements par rareté. Publiée
   par les éditeurs, c'est une poignée de constantes par jeu.
2. **La distribution des raretés du set** — que nous avons **déjà, en entier** :
   la rareté est renseignée sur 12 318/12 318 tirages Lorcana, 15 662/15 662
   DBS, 746/755 Naruto. Exemple mesuré, *Archazia's Island* : 72 communes,
   54 peu communes, 48 rares, 20 super rares, 12 légendaires, 18 enchantées,
   14 spéciales.

Pour une display de `D` boosters offrant `s_r` emplacements de rareté `r`, et
`N_r` cartes distinctes de cette rareté dans le set :

```
P(une carte donnée de rareté r apparaît) ≈ 1 − (1 − 1/N_r) ^ (D × s_r)
```

#### Le seuil

En notant `M` l'ensemble de ce qui vous manque :

```
valeur attendue de la display = Σ  P(apparaît | rareté de c) × prix_unitaire(c)
                              c ∈ M
```

C'est le prix de bascule : **au-dessus, mieux vaut acheter à l'unité ; en
dessous, la display est rentable.** Aucun taux de tirage propriétaire n'est
requis — seulement la composition d'un booster et notre propre catalogue.

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

- Le **prix des produits scellés** — nous avons le prix à l'unité de chaque
  carte, pas celui d'un deck ou d'une display. dbscards publie des pages
  `/products/…` ; à évaluer comme source.
- La **relation de contenu par pack** — riche chez DBS parce que Bandai publie
  ses decks comme des séries de sa cardlist ; à mesurer pour Lorcana, Pokémon et
  Naruto avant de promettre la fonctionnalité partout.
- La **composition d'un booster** par jeu (emplacements par rareté) — quelques
  constantes publiées. C'est le seul vrai manque : la distribution des raretés,
  elle, est déjà complète dans nos catalogues.

### Comment gérer ça sans tout aplatir

La tentation serait une taxonomie universelle du collectionnable. C'est le
piège déjà rencontré sur `print_assets` : quatre formes réduites à une auraient
perdu les vernis de Lorcana et le `wayback_timestamp` de Naruto.

La forme qui tient : **chaque catalogue déclare ses propres types d'entrée**,
sur un minimum commun — un identifiant, un nom, une portée d'appartenance, une
image, et « est-ce que ça se possède à l'unité ou en exemplaire ». Un pack
cartes déclarera `print` et `sealed`; un catalogue de jeux `game` et `edition`;
un futur pack de figurines ce qu'il voudra.

Le noyau ne connaît que le minimum commun, et la check-list se construit dessus
sans savoir ce qu'elle compte. C'est la même règle que pour les colonnes de
`print_assets` : un tronc commun, des extensions déclarées, rien d'aplati.

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

| objet | scellé | ouvert |
| --- | --- | --- |
| **booster / display** | un item, contenu **inconnu** — c'est une loterie non tirée | n'existe plus : on saisit les cartes obtenues |
| **deck de démarrage** | un item, contenu **connu** | soit un item « deck ouvert », soit ses N cartes — au choix du collectionneur |
| **carte** | — | l'unité de base |

La différence entre booster et deck tient à la nature du contenu, pas à
l'emballage : l'un est aléatoire, l'autre déterministe. C'est la même
distinction que pour le conseil d'achat, ce qui est plutôt rassurant — le modèle
et le calcul reposent sur le même axe.

### Ouvrir n'est pas un état, c'est une transformation

La hiérarchie est en réalité uniforme :

```
display  →  N boosters  →  M cartes
starter deck            →  K cartes
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

Conséquence inattendue et précieuse. Le conseil d'achat bute sur un seul manque :
les **taux de tirage**, que les éditeurs ne publient pas.

Or si l'application enregistre les ouvertures — « ce booster a donné ces
cartes » — elle accumule des tirages réels. Au bout d'un certain volume, elle
mesure ses propres taux, par set et par rareté, au lieu de les estimer depuis la
composition annoncée d'un booster.

Ça vaut la peine d'enregistrer l'événement d'ouverture dès le départ, même si
rien ne l'exploite au début : c'est de la donnée qu'on ne peut pas reconstituer
après coup.

### Trois questions ouvertes sur les contenants

**1. Le contenu d'un booster s'identifie carte par carte.** « M cartes » est un
raccourci d'écriture : ce sont des cartes nommées et numérotées, à saisir
individuellement. C'est précisément pourquoi le booster est le seul niveau qui
demande une saisie manuelle — display et deck se déplient tout seuls.

**2. Sait-on quels boosters contient une display avant de l'ouvrir ?** Chez
Lorcana les boosters portent des illustrations différentes. Question à trancher
**par jeu**, et je n'ai pas la réponse : si l'assortiment est connu, ouvrir une
display peut créer les bons boosters ; sinon elle crée N boosters génériques que
l'utilisateur précise ensuite. À vérifier avant de promettre l'un ou l'autre.

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

- **Deck scellé** → un seul item. Ne *pas* créer les cartes : elles ne sont pas
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
pas *en main*.

Il y a donc deux complétions défendables, et il faut choisir laquelle on affiche
(ou afficher les deux) : **« cartes que je détiens »** et **« cartes que je
possède, scellé compris »**. Ne pas trancher en silence : le collectionneur qui
garde un deck sous blister et celui qui l'a ouvert n'ont pas la même collection,
et aucune des deux lectures n'est fausse.

## Étagères et catalogues : la question à trancher

`Shelf` ne porte **aucun lien vers un catalogue** — seulement `type` et
`cardFormat`. Le rattachement passe par les items : `Item.printKey` encode le
pack (`dbscg:bt1-001`). Le catalogue d'une étagère est donc *dérivable de son
contenu*, et une étagère peut légitimement en mélanger plusieurs.

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
   variantes ; « tous les jeux PS1 » veut probablement dire *une entrée par
   jeu*, pas une par édition régionale. À définir avec l'utilisateur — le même
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
