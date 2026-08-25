# Naruto CACG FR — journal de recherche promos

> **Archivé le 2026-08-24** — Journal de recherche soldé ; les pistes ouvertes du §3 sont versées dans `naruto_source_sites_backlog.md`.

Journal **2026-08-13**. Objectif : documenter le corpus promo, canal par canal,
en notant aussi bien les trouvailles que les **impasses vérifiées** — pour ne pas
refouiller deux fois le même terrain.

Voir aussi : [naruto_carddass_fr_recovery.md](naruto_carddass_fr_recovery.md),
`src/providers/narutoccg/curated/sources/attested-promos.json`.

---

## 1. La découverte : le canal blister Kana

**Les six cartes « manquantes » de S5 n'ont jamais été des cartes S5.**

Le fil [t1185 « Des cartes inédites dans les mangas Naruto »](https://narutoccgfrance.1fr1.net/t1185-des-cartes-indites-dans-les-mangas-naruto)
(narutoccgfrance, 2008) documente un canal de distribution qu'aucune source
consultée jusqu'ici ne mentionnait :

> « Kana sort en ce moment les mangas Naruto **sous blister avec une carte à
> l'intérieur** […] 15 cartes (dont **7 Inédites** — les autres appartenant à la
> Série 5) sont disponibles dans les **Tomes 1 à 15** […] chez les éditions Kana. »

Et la phrase qui referme le dossier :

> « ces cartes "introuvables" (il y en a 7) sont **interdites en tournoi**, et
> **seront disponibles avec la série 6** »

### La liste des 15 tomes

| Tome | Nom (forum)                    | Numéro  |     |
| ---: | ------------------------------ | ------- | --- |
|    1 | Devenir Chef _(Inédite)_       | `ta221` | ★   |
|    2 | Sasuke _(Inédite)_             | `ni236` | ★   |
|    3 | Sakura et Ino _(Rare)_         | `ni206` |     |
|    4 | Pichenette _(Rare)_            | `te192` |     |
|    5 | Promesse Eternelle _(Rare)_    | `ta214` |     |
|    6 | Tayuya _(Inédite)_             | `ni253` | ★   |
|    7 | Sakon _(Inédite)_              | `ni252` | ★   |
|    8 | Dédoublement _(Rare)_          | `te205` |     |
|    9 | Tentative désespérée           | `ta219` |     |
|   10 | Shikamaru                      | `ni232` | ★   |
|   11 | Chôji Akimichi                 | `ni239` |     |
|   12 | _(non relevé dans le fil)_     | ?       |     |
|   13 | Jeu de hasard                  | `ta227` |     |
|   14 | Pouvoir de la marque maléfique | `ta226` | ★   |
|   15 | Soin typique                   | `te207` |     |

★ = une des six absentes des checklists imprimées.

### Ce que ça explique, d'un coup

- **Absentes des checklists S1–S5** : elles n'appartenaient à aucune de ces séries.
- **`BANDAI 2008 MADE IN JAPAN`** quand le reste de S5 porte `2007 MADE IN BELGIUM` :
  tirage distinct, fabriqué pour les blisters.
- **Coleka les classe en « Série 06 »** : elles étaient annoncées pour la S6.
- **Leurs images étaient dans `carddass.fr/naruto/images/cartes/5/`** : préparées
  pour la S5, puis retirées avant impression.
- **Jamais réellement sorties en booster** : la S6 a été annulée.

Le fil évoque une « erreur d'imprimeur » à l'origine de leur retrait de la S5.

### Erratum de fabrication relevé au passage

Plusieurs membres constatent que **Tayuya (`ni253`)** sort des blisters avec
`3/1` valide et `1/3` blessé au lieu de `3/3` — anomalie confirmée sur la carte
papier, pas seulement sur le visuel du site.

---

## 1 bis. La Série 6 n'a pas été annulée partout : elle est sortie en Italie

**Trouvaille du 2026-08-14.** Coleka pagine ses branches (`?p=N`, 48 par page) ;
mes énumérations précédentes s'arrêtaient donc à 48 items et sous-estimaient tout.
Une fois la pagination suivie, les six branches donnent **877 entrées**, et les
**pages de liste portent déjà `Ref. XX-NNN`, le nom, l'année et la vignette** — 24
requêtes suffisent, au lieu d'ouvrir 877 fiches.

| branche | annoncé | énuméré | avec photo |
| ------- | ------: | ------: | ---------: |
| s1      |     184 |     184 |        184 |
| s2      |     156 |     156 |        155 |
| s3      |     128 |     127 |        127 |
| s4      |     126 |     126 |        126 |
| s5      |     147 |     147 |        147 |
| **s6**  | **136** | **135** |     **72** |

### Ce que le diff dit de notre catalogue

- **Coleka ∖ nous = 92 IDs**, _tous_ dans la plage Série 6 (+ `cl032`, `cl033`).
- **nous ∖ Coleka = 1**, `te030-cdf` — un suffixe de variante, attendu.
- Les écarts de branche S2/S3 n'étaient **pas des trous** : Coleka classe une même
  carte dans plusieurs séries (`ni029` en s1+s2+s5). **Branche Coleka ≠ set.**
  Nos S1–S5 sont intégralement couverts. Aucune orpheline.

### Les cartes « Série 06 » de Coleka sont italiennes

Deux indices structurels, puis la preuve :

1. La branche `cartes-naruto-serie-06_r41388` est rangée **hors** de
   `naruto-carddass-series-francaises`, où vivent s1–s5. Coleka ne la classe pas
   comme française.
2. Les noms sont italiens : _Potere del segno maledetto_, _Analisi di Shikamaru_,
   _Tecnica dell'ubriaco_, _Aspetto deforme_, _Clan Kaguya_, _Versatilità_.
3. **La photo tranche.** `TA-226` affiche `STRATEGIA` (= TACTIQUE), `ACQUA`,
   `Bersaglio`, `Effetto` — même numéro et même illustration que notre carte
   française, texte italien.

Et le produit existe toujours dans le commerce italien :
**Naruto Card Game — Serie 6 « Rivalità Eterna »**, Bandai, édition italienne,
avec un deck préconstruit _« Il Fascino del Male »_. Vendue encore aujourd'hui par
[GameXFood](https://gamexfood.it/carte-naruto/naruto-card-game-rivalita-eterna-booster-ed-ita),
[Martina's Fumetti](https://martinasfumetti.it/Libri-vari/159103-Naruto-Card-Game-rivalit---eterna-serie-6-NUOVO-ed--Bandai-Gd09.html)
et Neverland Games sur eBay.

**Conclusion :** la Série 6 a été _préparée en français_ — les faces FR sont sur
carddass.fr, on en a 21 sur disque — puis **annulée en France**, mais **imprimée et
distribuée en Italie**. « Personne ne parle de la S6 sauf carddass » parce qu'on
la cherchait en français.

### Nuance : numéros de carte partagés, découpage en séries **différent**

Les noms de séries italiens (relevés chez CardGameClub) ne s'alignent pas sur les
nôtres :

|     | France             | Italie                      |
| --- | ------------------ | --------------------------- |
| S1  | Le Pays du Vent    | La Forza della Foglia       |
| S2  | Détruire Konoha    | Le Spire del Serpente       |
| S3  | Puissances Cachées | La Maledizione della Sabbia |
| S4  | L'Esprit du Sable  | —                           |
| S6  | _(annulée)_        | Rivalità Eterna             |

Le sable est en **S4 chez nous, S3 en Italie** : le découpage en séries et leur
nommage **diffèrent d'un pays à l'autre**. Ce qui reste solide, parce que je l'ai
vérifié sur l'image et non déduit, c'est que **les numéros de carte, eux, sont
partagés** — `TA-226` et `NI-253` portent le même numéro et la **même illustration**
en français et en italien.

Donc : même pool de cartes, mêmes numéros, distribution découpée différemment selon
le pays.

#### Vérifié sur l'imprimé (2026-08-14)

En récupérant l'image Coleka en pleine définition (1008×1500, l'URL sans suffixe
`_250x250`), le bas de carte de `TA-226` se lit sans ambiguïté :

- **le numéro imprimé est `ST-226`**, précédé du kanji **六** (« six ») ;
- la mention légale est **`BANDAI 2008 MADE IN CHINA`**.

Trois enseignements :

1. **Le numéro est bien partagé** — `226` des deux côtés. Seul le **préfixe est
   traduit** : `TA` (Tactique) → `ST` (Strategia). Coleka normalise vers le préfixe
   français, d'où la confusion possible. Ne pas prendre le ref Coleka pour l'imprimé.
2. **La série est imprimée sur la carte** (六 = 6). L'appartenance à la Série 6
   n'est donc pas une déduction de catalogue, elle est sur l'objet.
3. **Troisième tirage identifié** : `2008 MADE IN CHINA`, distinct du S5 français
   (`2007 MADE IN BELGIUM`) et des blisters Kana (`2008 MADE IN JAPAN`).

Le tout est cohérent de bout en bout : le contenu de la Série 6 existait, la France
l'a annulé — sept cartes ayant fuité par les blisters Kana — et l'Italie l'a imprimé
en entier. La ligne anglaise a d'ailleurs un set **« Eternal Rivalry »**, soit la
traduction exacte de « Rivalità Eterna » : les trois éditions décrivent le même
contenu.

**Précaution qui demeure** : la correspondance se vérifie numéro par numéro. Un ref
Coleka n'est pas une lecture de carte, et le préfixe local (`ST`/`TA`) doit être
mappé, jamais recopié tel quel.

### Corroboration inattendue de l'erratum Tayuya

L'italienne `NI-253` imprime **3/3 valide / 1/3 blessé**. Le fil t1185 signalait que
l'exemplaire blister français sort en `3/1 / 1/3`. Le tirage italien confirme donc,
indépendamment du forum, que la version française est bien fautive.

### Ce que ça rapporte, concrètement

- **9 de nos S6 sans nom** reçoivent un nom italien — dont 5 noms de personnage
  (`ni264` Shikamaru & Temari, `ni266` Kimimaro, `ni298` Hanzaki, `ni316` Kakashi),
  directement exploitables car ce sont des noms propres.
- **`ni309`** gagne une image (on n'en avait pas).
- **92 cartes S6 inconnues**, dont **43 avec photo italienne**.

⚠️ **À ne pas faire** : verser les noms italiens d'effets (_Belva rinata_,
_Unire le forze_, _Grande funerale del deserto_…) dans le champ français. Ils
relèvent d'une locale `it`. Seuls les noms propres sont neutres.

Données brutes : `data/naruto/carddass/staging/coleka/catalogue.json`.

**Question ouverte pour le catalogue** : ces 92 cartes sont des cartes physiques
réelles, mais italiennes. Les intégrer demanderait un set distinct (`cacg.it.s6`),
pas une fusion dans les sets français.

### Mur de vérification

Coleka déclenche une page « Vérification — cliquez pour valider que vous êtes un
être humain » après ~45 requêtes rapides. Le crawl par pages de liste (24 requêtes,
250 ms d'écart) passe sous le seuil. Je ne franchis pas ce mur ; s'il apparaît,
c'est à toi de cliquer.

---

## 1 ter. La presse manga française date et nomme la Série 6

Canal jamais exploré jusqu'ici : la **presse d'actualité manga d'époque**. J'avais
ratissé les sites de collectionneurs et les places de marché en négligeant les
sites d'actu.

[manga-sanctuary, news 7397](https://www.manga-sanctuary.com/news/7397/naruto-jcc.html),
**28 janvier 2008** :

- la Série 6 était annoncée pour **avril 2008** — et non 2009 ; la date de 2009
  souvent citée est donc un **report**, pas l'annonce d'origine. Ça réconcilie
  enfin le calendrier avec le `BANDAI 2008` imprimé sur les blisters Kana **et**
  sur les cartes italiennes ;
- elle avait **deux starters nommés** : **« Le Duel »** (Naruto contre Sasuke) et
  **« Quartet »** (le quatuor de ninjas d'Orochimaru) ;
- format inchangé : starter 40 cartes dont 2 holos à 18 €, booster 8 cartes dont
  1 holo à 4 € ;
- la S5 y est décrite comme **142 nouvelles cartes**, là où nous en avons 151 en
  `s5`. Écart à expliquer — probablement du classement croisé, à vérifier.

### Pourquoi « Quartet » verrouille le dossier

Le quatuor d'Orochimaru, c'est **Kidomaru, Jirôbô, Sakon et Tayuya**. Or ce sont
exactement les cartes relevées dans la S6 italienne (`ni250`, `ni251`, `ni252`,
`ni253`, plus leurs doublons `ni280`–`ni283`), et **Sakon et Tayuya sont deux des
six cartes du blister Kana**.

Trois sources qui s'ignorent — un forum de joueurs de 2008, un catalogue italien
de 2024, un article de presse de janvier 2008 — décrivent donc le **même contenu**.
La correspondance « contenu S6 française = contenu S6 italienne » n'est plus une
hypothèse de travail.

### Confirmation en creux

La base produit de **manga-news** (collection « TCG Naruto ») liste _Deck Nouvelle
Série_ et _Deck Série 1 à 5_ — **aucun produit Série 6**. Côté commerce français
ça s'arrête bien à la S5, alors que le contenu, lui, existait et a été imprimé
ailleurs.

---

## 1 quater. La tin box : canal confirmé, produit identifié

Le mot « tin » dans `attested-promos.json` a été mis en doute — à raison, parce que
les notes du fichier le faisaient reposer en apparence sur **un seul vendeur
leboncoin** (`jipiyami`, deux annonces du même jour : « Carte promo **tinbox**,
pr 11 Orochimaru… »), et parce que les gloses « (tin PR) » accolées aux sources
Coleka sont des **annotations d'analyse**, pas des données de Coleka. Il fallait
vérifier.

### La source primaire dit la même chose, en 2008

Le fil [t1003 « Info sur les cartes promo PR-?? »](https://narutoccgfrance.1fr1.net/t1003-info-sur-les-cartes-promo-pr)
— cité dans le fichier mais **jamais sauvegardé ni lu** jusqu'ici :

> « J'ai remarqué que les références sur les **promo tinbox** étaient PR-011 et
> PR-016. Je me demandais si on verrait un jour les autres cartes promos
> (PR-001…) ? »

> « d'un côté on a **2 promos par tinbox** »

> « tout dépend du type de tin box, dans celle pour les **grands distributeurs** il
> n'y en a qu'une »

Le canal est donc attesté par la communauté d'époque, indépendamment du vendeur.

### Le produit

**Bandai — Naruto Cards — réf. 5130 — « Tin Box Hobby Naruto »**, décrit sur
Amazon.fr :

> « Enfin le **premier coffret** pour cartes à jouer Naruto ! […] Le coffret
> contient **5 boosters de 8 cartes** : un pour chaque série sortie à ce jour,
> jusqu'à la toute récente **série 5**. En prime, le coffret contient également
> **2 cartes holographiques exclusives** ! »

« 2 cartes exclusives » = `pr011` + `pr016`. « Le premier coffret » et la mention
de la S5 le datent de **2008**.

### ✅ Question tranchée : la ligne `PR-` française se limite à deux cartes

Recherche dédiée du 2026-08-14, sur les fils archivés, le forum vivant, le web
ouvert et les places de marché. **Cinq faits concordants :**

1. **`t544` — le fil dédié aux « cartes promotionnelles » — ne contient aucun
   `PR-`.** Ses 21 identifiants sont tous des numéros de série. La communauté qui
   recensait ses propres promos n'en connaissait pas d'autres.
2. **`t1003` demande explicitement le contraire d'une collection existante** :
   « Je me demandais si on verrait **un jour** les autres cartes promos
   (PR-001…) ? » En 2008, les joueurs français ne les avaient pas.
3. **Le sondage `t1132` (26 fév. 2008) est la preuve la plus nette.** Il propose de
   voter pour `PR-NI-5, 6, 8, 9, 10, 13, 14, 17, 18, 19` — et **omet précisément 11
   et 16**, les deux seuls numéros que la France possédait déjà. On votait pour
   celles qu'on **n'avait pas**.
4. **Le produit borne le compte** : la Tin Box réf. 5130 contient « 2 cartes
   holographiques exclusives », pas davantage.
5. **Les places de marché ne rendent rien d'autre.** Vinted, eBay et leboncoin :
   les résultats « PR » sont du **Kayou** (numérotation propre, ex. « PR 71/72 »),
   du Mythos 2026, du Miracle Battle et du Data Carddass japonais. Aucun Carddass
   FR au-delà de 11 et 16.

**Conclusion :** le pool `PR-` est **étranger** (japonais — cf. le « Bandai (JP)
Naruto Card Game Promo PR-10 » sur eBay). La France n'en a localisé que **deux**,
via la tin box. Il n'y a **pas de ligne `PR-` française à retrouver** : ce n'est
pas un trou du catalogue, c'est sa forme réelle. Ça explique aussi pourquoi 21 de
nos 23 promos réutilisent un numéro de série — c'était le seul mécanisme promo
français.

**Ne pas rouvrir cette chasse** sans un fait nouveau de niveau « carte en main ».

### Ce qui reste ouvert

**Une seconde tin box existe-t-elle ?** Amazon dit « le **premier** coffret », et le
forum évoque une variante **grands distributeurs** à une seule carte. C'est le seul
angle qui pourrait encore ajouter une ou deux promos françaises — mais il ajouterait
des cartes du même pool étranger, pas une numérotation nouvelle.

### Divergence relevée, non résolue

Le posteur de t1003 écrit **PR-011 = Naruto** et **PR-016 = Orochimaru** — l'inverse
de notre catalogue. Nos attributions viennent de l'**art des cartes** (disque +
photos Vinted + descriptions leboncoin + Coleka), et le fichier note déjà un
« ledger previously swapped ». Application de la règle : **la carte prime sur le
document**, donc `pr011` = Orochimaru. Mais la divergence est réelle et un posteur
de 2008 qui avait l'objet en main n'est pas rien — à reconfirmer si une photo nette
d'une tin scellée apparaît.

---

## 1 quinquies. Les trois dernières cartes de la semaine — visuels perdus

`NI-309` _Ino Yamanaka_, `TE-263` _Mélodie du guerrier illusoire_ et `TA-240`
_L'homme-ivre_ sont les trois entrées `s6` sans image. Recherche épuisée le
2026-08-14 — **les visuels n'existent nulle part en ligne.**

### Ce qu'on sait exactement

La page `naruto__archiveN_carte_semaine_26.html` les référence par leur nom de
fichier :

```
images/cartes/cartes_med/NINJA-309-med.jpg
images/cartes/cartes_med/TE-263-med.jpg
images/cartes/cartes_med/TA-240-med.jpg
```

Et l'autoindex Apache capturé le **2012-06-04** prouve que les dossiers étaient
toujours en place, `6/` daté du **22-Dec-2008 09:52** et `cartes_med/` du
**29-Dec-2008**. Les fichiers ont donc vécu sur le serveur au moins jusqu'en
2012 — Wayback a archivé le HTML sans jamais aller chercher ces images-là.

### Canaux épuisés pour ces trois

| Piste                                                          | Résultat                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CDX Wayback, domaine entier (2 936 URLs)                       | **0 occurrence** de `309` et `263`. Les 4 hits sur `240` sont `NINJA-240` et `TE-240`, deux autres cartes                                                                                                                                                                                                                                                                                                       |
| `cartes/6/` archivé                                            | exactement **21 images**, identiques à nos 21 sur disque                                                                                                                                                                                                                                                                                                                                                        |
| `cartes_med/` archivé                                          | 82 fichiers, **aucun des trois**                                                                                                                                                                                                                                                                                                                                                                                |
| Autoindex de `6/` et `cartes_med/`                             | **jamais archivés** (seul le parent `cartes/` l'a été, en 2007 et 2012)                                                                                                                                                                                                                                                                                                                                         |
| `naruto/images/archives/`                                      | chrome d'interface daté d'avril 2007, aucune carte                                                                                                                                                                                                                                                                                                                                                              |
| **carddass.fr en direct**                                      | le domaine est **vivant mais revendu** : il sert `carteonepiece.fr`, boutique Shopify, **zéro mention de Naruto**. Les fichiers sont partis avec la revente                                                                                                                                                                                                                                                     |
| Common Crawl (6 crawls 2017)                                   | **1 URL** par crawl — le domaine n'y est quasiment pas, et CC ne moissonne pas les images                                                                                                                                                                                                                                                                                                                       |
| archive.today                                                  | aucun snapshot (page générique / bloqué)                                                                                                                                                                                                                                                                                                                                                                        |
| `tournoi-de-cartes.forumpro.fr`                                | **forum inédit** relayant les révélations hebdo : seulement 3 sujets (4ᵉ `NI-264`, 5ᵉ `TA-254`, 6ᵉ `NI-294`), **tous déjà chez nous**. Le relais s'arrête avec la série                                                                                                                                                                                                                                         |
| `2img.net` (Forumotion)                                        | **ce n'est pas un cache, c'est un relais à la volée** — prouvé : il sert une image Wikimedia vivante (200) mais renvoie **403 sur un chemin bidon d'un hôte vivant**, exactement comme sur carddass.fr. Le `403` signifie « l'origine ne m'a rien donné », pas « supprimé de mon cache ». Il n'a donc **jamais rien stocké**, et cette voie est morte pour **toute** image carddass.fr, pas seulement ces trois |
| `i.servimg.com` (hébergement Forumotion)                       | vrai stockage, survit à la mort du site source — mais les 3 sujets de révélation **hotlinkaient** tous carddass.fr au lieu de téléverser, et les fils narutoccgfrance sauvegardés ne contiennent que le logo et la bannière du forum. **Aucun scan de carte téléversé**                                                                                                                                         |
| Recherche par nom de fichier (`TA-240-med`…)                   | rien                                                                                                                                                                                                                                                                                                                                                                                                            |
| Recherche par nom de carte (« Mélodie du guerrier illusoire ») | rien — seule la technique de Tayuya ressort                                                                                                                                                                                                                                                                                                                                                                     |
| Ultrajeux                                                      | Ino Yamanaka en `NI-70` et `NI-88`, **jamais `NI-309`** — n'a jamais atteint la vente                                                                                                                                                                                                                                                                                                                           |
| Coleka                                                         | photo pour `ni309` (italienne), **rien** pour `ta240` ni `te263`                                                                                                                                                                                                                                                                                                                                                |

### Ce qui a été récupéré à la place

Le texte éditorial complet des trois, publié par Bandai France :

- **TA-240 « L'homme-ivre »** (08/12/2008) — puissance tactique 3. Révèle les 3
  premières cartes du deck adverse : les Techniques retournent en main de leur
  propriétaire, tout le reste part à la Poubelle.
- **TE-263 « Mélodie du guerrier illusoire »** (15/12/2008) — Technique symbole
  Eau, spécifique à Tayuya sans passage au Stade 2, coût 1 Eau + 1 Neutre.
  Interdit les Tests de connaissances à toutes les équipes pour le tour.
- **NI-309 « Ino Yamanaka »** (22/12/2008) — tour d'appel 0, 0/1, connaissance 1,
  évolution. Les Ninjas _Konoha + Homme + Aspirant ninja_ de son équipe gagnent
  +1/+1.

Le **22/12/2008 est la dernière carte de la semaine jamais publiée** : c'est la
date exacte où la ligne française s'arrête.

**Piste morte, ne pas refouiller.** Seul un scan de collectionneur pourrait
encore produire un visuel — mais ces cartes n'ayant jamais été imprimées en
français, il n'existe aucun exemplaire à scanner.

---

## 2. Canaux explorés

### narutoccgfrance.1fr1.net — vivant, productif

Forum d'époque, **toujours en ligne** (le domaine `forumnarutoccg.com` est
l'ancienne adresse du même board : 76 URLs Wayback, rien de plus).

Wayback n'en a **qu'une seule URL** : il faut crawler le site vivant.

Énumération via les sections (`/forum` liste `f1` à `f10`) : **332 sujets**,
dont 40 pertinents. Fils dépouillés :

| Fil                                                                                                                       | Verdict                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [t1185](https://narutoccgfrance.1fr1.net/t1185-des-cartes-indites-dans-les-mangas-naruto) cartes inédites dans les mangas | **la découverte** (§1)                                                                                                                                      |
| [t544](https://narutoccgfrance.1fr1.net/t544-les-cartes-promotionnelles) les cartes promotionnelles                       | 21 IDs, **18 déjà attestés** — valide le travail existant                                                                                                   |
| [t1003](https://narutoccgfrance.1fr1.net/t1003-info-sur-les-cartes-promo-pr) info cartes promo PR                         | déjà exploité                                                                                                                                               |
| t1192 liste des 15 cartes des mangas                                                                                      | doublon de t1185, corps tronqué pour les invités                                                                                                            |
| t1180 cartes-promo                                                                                                        | aucun ID                                                                                                                                                    |
| **t1132** quelle carte promo souhaiteriez-vous voir                                                                       | ⚠️ **piège** : sondage de souhaits sur des promos **étrangères** (`PR-NI-5`…`PR-NI-19`). « On peut espérer **les voir chez nous** ? » — **ne pas injecter** |
| **t1021** quelle carte voudriez-vous voir en promo                                                                        | ⚠️ idem, fil de souhaits                                                                                                                                    |
| t1034 cote des cartes                                                                                                     | rien d'exploitable                                                                                                                                          |

**Faux positif récurrent** : la barre latérale « Sujets similaires » cite le fil
_« Cartes TA-110 et TA-01 »_, ce qui fait apparaître `ta001` et `ta110` dans
n'importe quelle page. Toujours filtrer.

**Erreur de posteur** : « Shuriken TE-03 » (t544) — la numérotation officielle est
`te001` Kunai, `te002` Shuriken, `te003` Sexy-meta. L'attestation `te002` est bonne.

### Ultrajeux — catalogue complet, source non indépendante

Le CDX d'`ultrajeux.com` rend **2 984 URLs Naruto**, dont **734 fiches produit**
individuelles (`carte-naruto-9-<n>-<slug>.html`), numérotées 1 à 734 sans trou.

- **Aucune carte nouvelle** : 715 des 734 se rapprochent de notre catalogue, et
  les 19 restantes sont des variantes orthographiques (`sakuke-uchiwa`,
  `zabuka-momochi`, `troisieme-il`, `anku-mitarashi`…).
- **Pas une source indépendante pour les noms** : sa fiche
  `kaiten-le-tournillon-divin` reproduit la coquille exacte de la liste
  carddass.fr. Il a copié la même source.
- **Mais un témoignage de classement utile** : la numérotation suit l'ordre des
  séries, et `#718 cérémonie-d-attachement` (TA-220) → **`#719 devenir-chef`**
  (TA-221) → `#720 une-règle-qu-on-s-impose` (TA-222) place `ta221` exactement
  dans sa case S5. Idem `#724` entre TA-225 et TA-227.
- Les fiches elles-mêmes affichent **« Série 5 »** pour `devenir-chef` et
  `pouvoir-de-la-marque-maléfique`, et « Série 2 » pour `monnaie-d-échange`.

**Nuance à garder** : un revendeur vendait donc ces cartes à l'unité comme des
S5 en 2008. Cohérent avec le récit du blister — imprimées pour la S5, retirées,
écoulées par Kana — mais le commerce les a bien traitées comme des S5, pas comme
des promos. C'est une troisième source qui corrobore notre `cacg.s5`.

### Coleka « Carte Naruto US Promotionnelles » — 101 promos, mais pas les nôtres

En énumérant le parent Coleka (`_r4102`, 7 114 cartes) j'ai trouvé une branche
**promo dédiée : 101 cartes, toutes avec photo** (`_r38199`). Énumérée en entier,
sauvegardée dans `data/naruto/carddass/staging/coleka/us-promos.json`.

L'hypothèse à tester était séduisante : puisque la numérotation NI/TA/TE est
**partagée entre éditions** (TA-226 est TA-226 en français comme en italien), les
`PR-` pouvaient l'être aussi — auquel cas ces 101 fiches auraient attesté des
promos françaises.

**Réfutée, sur deux points de comparaison :**

|         | nous (FR)            | Coleka (US)              |
| ------- | -------------------- | ------------------------ |
| `pr011` | Orochimaru (tin)     | _Successors_             |
| `pr016` | Naruto Uzumaki (tin) | _Proof of the Existence_ |

C'est une **ligne indépendante** : `Pr-001` → `Pr-100` (manquent 94, 97, 98, 99),
noms anglais (_Hokage Rocks_, _Multi Shadow Clone Jutsu_, _Shattered Bond_), et des
variantes `R` (`005R`, `006R`…). Elle appartient au CCG anglais — celui des séries
**12 à 28** que Coleka héberge aussi (_A New Chronicles_, _Fateful Reunion_,
_Sage's Legacy_…), donc au périmètre du mapping Pojo `NI→N-`, `TE→J-`, `TA→M-`.
À garder pour cet import-là, **jamais à fusionner avec les promos FR**.

Au passage, ça éclaire la structure de notre corpus promo : **21 de nos 23 promos
réutilisent un numéro de série** (`ni023`, `te030`…) avec un tampon shuriken. La
France n'a pas de ligne `PR-` numérotée en propre — sauf `pr011`/`pr016`, qui
viennent d'un **tin** (boîte métal). C'est le seul fil `PR-` français connu.

### Le forum italien — exploré, décevant

`narutocardgame.forumfree.it` est l'équivalent italien de narutoccgfrance, et
**toujours en ligne**. Espoir légitime : l'Italie a eu la Série 6, sa communauté a
donc vécu plus longtemps.

Résultat : **c'est un forum social, pas une base de cartes.** Sections énumérées
(`Welcome`, `Forum`, `Naruto`, `Altri TCG`, `Scambi Altri TCG`, `Informazioni`) —
l'essentiel est de la présentation de membres, du spam d'affiliation et du hors-sujet.
La section **`Scambi` (7042616) renvoie une erreur** : c'est là que seraient les
listes de cartes.

Le seul filon, `NARUTO CHE HO` en trois parties (août 2009, membre _orochi?_), est
un inventaire de collection **uniquement en photos** — 7 images ImageShack
(`foto571` → `foto577`), **toutes en 404 et aucune archivée**. ImageShack a purgé
son hébergement gratuit ; rien à récupérer.

### Impasses vérifiées

| Piste                                              | Résultat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dl.free.fr/nyO0ZE5tt/Promo.pdf` (cité dans t1132) | **HTTP 500**, absent de Wayback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Fiches tomes `mangakana.com` 2008 (tomes 1-3)      | **0 mention** de carte ou blister                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `kana.fr` / `mangakana.com`                        | 52 et 679 URLs Naruto archivées ; annonce des cartes non localisée                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Wayback CDX `narutoccgfrance.1fr1.net`             | **1 URL** — forum quasi non archivé                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `forumnarutoccg.com`                               | même board, ancien domaine, rien de neuf                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| eBay annonces actives                              | saturé par Miracle Battle / Data Carddass (JP) et Naruto Mythos (2026) ; **aucune promo Carddass FR**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| eBay ventes terminées (connecté)                   | **8 requêtes ciblées, ~1 300 résultats, 0 promo Carddass FR**. Le bruit vient d'autres lignes : Carddass JP (Jump Festa, Miracle Battle, Data), Kayou, Panini Naruto 2002, CCG « Prism » US, Mythos 2026. Seuls objets de la ligne FR : un booster et un deck Série 3                                                                                                                                                                                                                                                                                                                                                                                                   |
| eBay ventes terminées, **par nom de carte**        | 10 requêtes sur les libellés FR (« devenir chef », « pouvoir de la marque maléfique », « pichenette », « soin typique »…). Les requêtes discriminantes ne rendent que 8 résultats, aucun pertinent ; les « 248 » sont le pool générique renvoyé faute de correspondance                                                                                                                                                                                                                                                                                                                                                                                                 |
| Vinted — boutique du vendeur                       | `bance.d` (membre 112961425) : **5 articles, tous déjà attestés** (PR-11, NI-92, TA-51, NI-63, TE-34). 12 évaluations, mais Vinted n'expose pas les articles vendus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Vinted — recherche globale                         | 40 articles, **un seul pertinent** (le NI-92 du même vendeur). Le reste est Mythos, Kayou, Miracle Battle, Data Carddass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Fils tournois du forum (22 fils)                   | 7 IDs, 6 déjà attestés ; le 7ᵉ (`cl026`) est une discussion de règles, pas une promo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `mangakana.com` pages News Naruto (264 archivées)  | galeries de fans, **aucune actu produit** — l'annonce Kana reste introuvable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| manga-news.com (direct)                            | 403 ; via navigateur la page goodies n'est pas filtrable par série                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `animecollection.fr`                               | base FR de cartes anime, mais sa section Naruto ne couvre que les lignes **japonaises** (Miracle Battle Carddass, Shikishi, Wafer, Ninja Ranks, Ultra card). Rien sur le CCG européen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Coleka, branche promo US (`_r38199`)               | 101 promos énumérées — **numérotation indépendante**, voir ci-dessus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `narutocardgame.forumfree.it`                      | forum social, section `Scambi` en erreur, photos ImageShack mortes — voir ci-dessus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| PicClick (coffret métal Carddass)                  | page rendue en JS, contenu inaccessible sans navigateur ; à réessayer via le navigateur si le tin redevient une priorité                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Archives leboncoin**                             | **il n'en existe pas.** Pas d'archive native (annonces effacées à ~60 j) ; Castorus, le seul service qui historisait, est bloqué depuis 2017 ; les outils actuels (Lobstr, Scrapster…) scrapent le **live**, pas le passé, et celui d'Apify est HS depuis déc. 2024. Wayback a ~30 000 URLs `/ad/collection/` mais son index ne porte **que sur les URLs**, pas le contenu — impossible d'isoler les Naruto, et l'annonce 2310814926 n'y est pas. Pages mot-clé `/ck/collection/carte-naruto` : **0 snapshot**. Conséquence : ce canal se **surveille en avant**, il ne se fouille pas en arrière. Scraper est par ailleurs interdit par les CGU et bloqué par DataDome |
| Delcampe                                           | testé : `naruto` rend des cartes postales de **Naruto la ville japonaise** (鳴門) et des Blu-ray ; `carddass` rend du Dragon Ball / One Piece **japonais**. Aucun CCG Naruto européen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| CardMarket                                         | ne référence pas ce jeu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ccgtrader.net`                                    | base Naruto CCG **anglaise** structurée (tous les sets listés, dont `eternal-rivalry`), mais les pages de set rendent vide côté HTML. À rouvrir au navigateur **pour l'import anglais**, pas pour les promos FR                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Skyrock / Skyblog                                  | c'était le meilleur pari sur le papier (2008, ados français, cartes Naruto = le public exact), mais la plateforme a supprimé l'essentiel de ses blogs en 2023 et l'indexation a disparu avec. **Rien d'exploitable**                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Inserts de magazines FR (Animeland, Coyote…)       | cherché sur la base du précédent Kana — « carte offerte avec de l'imprimé » est un canal **prouvé** pour ce produit. **Aucune trace** côté ligne française ; la seule carte encartée trouvée concerne le _Shonen Jump_ **américain**                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Abysse Corp                                        | distributeur toujours actif, mais catalogue **moderne** uniquement ; aucune donnée 2007-2008 côté public                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ~~Le tin — piste affaiblie~~                       | **Erreur de ma part, corrigée le 2026-08-14.** J'avais cherché « coffret métal » sur eBay et conclu de son silence ; le terme du produit est **« tin box »**. Canal confirmé et produit identifié — voir §1 quater                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 3. Pistes ouvertes

1. **Tome 12** — seul trou de la liste blister. Un membre a peut-être répondu
   plus loin dans t1185, ou dans t1192 dont le corps est tronqué pour les invités.
2. **La 7ᵉ inédite** — le fil parle de **7** cartes inédites, on en a identifié 6.
   La liste des `(Inédite)` est tronquée dans les extraits récupérés.
3. ~~eBay ventes terminées~~ — **fait, négatif** (voir §2). À noter : un membre du
   forum annonçait en 2008 vouloir y revendre ces cartes ; 18 ans plus tard il n'en
   reste aucune trace côté vendu.
4. **L'annonce Kana d'origine** — « Eux-même l'avaient annoncé sur leur site ici »,
   lien mort dans le fil. Chercher dans les actus archivées de `mangakana.com`.
5. **Le présentoir de vente Kana** — un membre décrit « la liste des cartes à
   collectionner affichée sur le présentoir ». Une photo de ce présentoir donnerait
   la liste officielle des 15.
6. **La tin box** — canal **confirmé** (forum t1003 + produit Bandai réf. 5130),
   voir §1 quater. La question « existe-t-il d'autres `PR-` françaises » est
   **tranchée : non** — le pool est japonais, la France n'en a eu que deux. Seul
   reliquat : une **seconde tin box** est-elle sortie (Amazon dit « le premier
   coffret », le forum évoque une variante grands distributeurs à 1 carte) ?

---

### Ce que le marché en ligne dit du corpus

Les promos Carddass FR sont **quasi absentes du marché** : un seul vendeur
identifié (Vinted, 5 cartes, toutes déjà attestées), rien côté eBay vendu. Ce
n'est pas un défaut de recherche mais une caractéristique du corpus — tirage de
tournoi 2006-2008, jamais entré dans les circuits de revente structurés. Les
sources d'attestation resteront donc les **forums d'époque**, pas les places de
marché.

---

## 4. Méthode

Deux règles que cette session a validées, à ses dépens :

- **Distinguer attestation et souhait.** Deux fils entiers (`t1132`, `t1021`)
  ressemblent à des listes de promos et n'en sont pas. Un ID cité n'est une preuve
  que si le contexte l'affirme existant.
- **Vérifier l'outil avant de conclure de son silence.** Un `grep` censé lister les
  canaux jamais explorés a renvoyé « jamais exploré » pour **tout**, y compris pour
  Coleka qui est cité partout : le shell avait perdu son répertoire de travail et
  grep ne lisait rien. Détecté en passant un **terme témoin** dont je savais qu'il
  devait ressortir. Un résultat négatif n'est une information que si l'outil est
  prouvé capable de produire un positif.
- **La carte prime sur le document.** Le dépliant imprimé se trompe (`ni150`
  « Temari » là où la carte lit `SAKON`, `te212` « Fûton » sur une carte de symbole
  Feu). Hiérarchie : photo de la carte > sources concordantes > checklist imprimée.
