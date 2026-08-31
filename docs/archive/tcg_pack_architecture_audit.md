# Audit — ajouter un TCG ou un sous-catalogue

> **Archivé le 2026-08-24** — Les problèmes encore ouverts sont versés au backlog, couverts par le programme de réorganisation en cours.

Mesuré le 2026-08-20, sur les cinq packs de cartes existants : Naruto Carddass,
Pokémon TCG Live, Dragon Ball Masters (`dbs/cg`), Dragon Ball Fusion World
(`dbs/fw`), Lorcana.

Objectif de l'audit : savoir ce qu'il en coûte aujourd'hui d'ajouter un jeu d'une
autre licence, ou un sous-catalogue comme Masters / Fusion World.

## Ce qui existe

| Provider         | Fichiers |    Lignes |
| ---------------- | -------: | --------: |
| `narutocarddass`      |      120 |    23 077 |
| `pokemontcglive` |       31 |     8 262 |
| `dbscg`          |       17 |     3 727 |
| `dbsfw`          |       15 |     2 316 |
| `lorcanatcg`     |       10 |     2 086 |
| `tcgdex`         |        7 |     1 815 |
| **`shared`**     |   **23** | **4 423** |

Naruto pèse **56 %** du code TCG à lui seul. C'est le plus ancien et le plus
organique : il a servi de terrain de défrichage, et il en porte les traces.

## Ce qui marche déjà

`src/providers/shared/` n'est pas vide, et ses briques sont bonnes :

- `cardFaces.ts` — le choix de face piloté par les dimensions, réutilisé partout ;
- `curatedCardsInstall.ts` — l'installation de l'arbre curé, versos compris ;
- `sealedProducts/{indexFormat,ingest,kinds}.ts` — le modèle des produits scellés ;
- `dbscards/` — un scraper de catalogue mutualisé entre quatre packs ;
- `catalogCorpus.ts`, `softban.ts`, `attemptOrder.ts`, `foilPaths.ts`.

L'adoption est réelle mais partielle : 4 à 8 fichiers par provider importent
`shared`. `tcgdex` : **zéro**.

**Signe encourageant** : plus un pack est récent, plus il est léger dans
l'aiguillage admin. Dans `lib/admin/cataloguePacks.ts` (329 lignes) — `dbs/fw`
est mentionné **3 fois**, `dbs/cg` 5, Lorcana 14, **Naruto 37**. Le motif s'est
amélioré tout seul ; il n'a simplement jamais été formalisé.

## Problème 1 — des jumeaux copiés-collés

`dbscg` et `dbsfw` partagent **13 noms de fichiers sur 15**. En neutralisant les
noms (`Cg` / `Fw`), voici ce qui diffère vraiment :

| Fichier          |  cg |  fw | lignes qui diffèrent |
| ---------------- | --: | --: | -------------------: |
| `installCurated` |  67 |  68 |                **1** |
| `pipeline`       |  51 |  44 |                    9 |
| `index`          | 151 | 139 |                   30 |
| `factsStore`     |  62 |  66 |                   34 |
| `printIdentity`  |  81 |  78 |                   35 |
| `faceChoice`     |  59 |  51 |                   50 |
| `searchPrints`   | 217 | 175 |                   78 |
| `indexStore`     | 424 | 331 |                  249 |
| `cli`            | 199 | 177 |                  180 |
| `parseCardlist`  | 215 | 204 |                  217 |
| `scrapeCardlist` | 260 | 187 |                  281 |
| `fetchFaces`     | 834 | 347 |                  859 |

Le haut du tableau est du copier-coller pur. `installCurated.ts` ne diffère
**que** par l'id de pack et les noms de fonctions — un `sed s/Cg/Fw/` produirait
le fichier.

Le bas du tableau, en revanche, est **légitimement différent** : `fetchFaces`,
`scrapeCardlist` et `parseCardlist` parlent à des sites et des CDN distincts.
C'est là que vit la vraie spécificité d'un jeu, et il ne faut pas chercher à la
mutualiser.

Sur l'ensemble des cinq packs, dix rôles identiques totalisent **6 377 lignes** :

| Rôle             | naruto | pokemon | dbscg | dbsfw | lorcana | total |
| ---------------- | -----: | ------: | ----: | ----: | ------: | ----: |
| `cli`            |    476 |     681 |   199 |   177 |     183 | 1 716 |
| `indexStore`     |    370 |       — |   424 |   331 |     566 | 1 691 |
| `index`          |    166 |     105 |   151 |   139 |     131 |   692 |
| `searchPrints`   |    279 |       — |   217 |   175 |       — |   671 |
| `facts`          |    228 |       — |   224 |   139 |       — |   591 |
| `faceChoice`     |    228 |       — |    59 |    51 |       — |   338 |
| `pipeline`       |     52 |      66 |    51 |    44 |      43 |   256 |
| `printIdentity`  |      — |       — |    81 |    78 |       — |   159 |
| `installCurated` |      — |       — |    67 |    68 |       — |   135 |
| `factsStore`     |      — |       — |    62 |    66 |       — |   128 |

## Problème 2 — le code partagé connaît ses appelants

C'est l'inversion la plus coûteuse, et la cause directe du problème 3.

`src/providers/shared/dbscards/scrapeProducts.ts` :

```
import { … } from "@/providers/lorcanatcg/setLogos";   // ligne 26
if (opts.packId === "pokemon") { … }                    // ligne 348
if (opts.packId === "lorcana") { … }                    // ligne 357
```

`src/providers/shared/sealedProducts/ingest.ts` : même import lorcana, plus une
table pack → provider écrite en dur (`"dbs/cg"`, `"dbs/fw"`, `lorcana`,
`pokemon`, `"naruto/carddass"`) et un `input.packId === "pokemon"`.

`src/providers/shared/dbscards/sites.ts` : les quatre packs énumérés.

Du code partagé ne devrait rien savoir de qui l'appelle. Ici, **ajouter un pack
oblige à éditer le code partagé** — et importer un provider depuis `shared` crée
en prime un couplage qu'aucun test ne surveille.

### Pourquoi rien ne l'a attrapé

`src/core/catalog/blindnessGuard.test.ts` interdit précisément ça — un id de
provider cité hors de `src/providers/`. Mais il **saute tout `src/providers/`** :

```ts
if (relativePath === "src/providers") continue;
if (relativePath.startsWith("src/providers/")) continue;
```

`providers/shared/` est de l'infrastructure, pas un provider. Il tombe dans
l'angle mort du garde. **Correctif le moins cher de tout cet audit** : étendre le
garde à `src/providers/shared/`, avec les manquements actuels en liste d'attente
pour ne pas rougir d'un coup.

## Problème 3 — vingt points de contact pour un pack

Fichiers hors du provider à toucher pour exister, mesuré sur `dbs/fw` :

| Catégorie                         | Fichiers                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Enregistrement** (irréductible) | `core/catalog/registry.ts`, `effects/index.ts`, `effects/dbsfw/index.ts`                          |
| **Plomberie admin**               | `lib/admin/cataloguePacks.ts`, `catalogueExtractRunner.ts`, `foilCatalogSync.ts`, `foilStatus.ts` |
| **Code partagé à éditer** ⚠️      | `shared/dbscards/sites.ts`, `shared/dbscards/scrapeList.ts`, `shared/sealedProducts/ingest.ts`    |
| **Autre provider** ⚠️             | `dbscg/index.ts`, `dbscg/buildMastersFacts.ts`                                                    |
| **Tests**                         | 6 fichiers                                                                                        |

Les deux lignes marquées ⚠️ sont les anormales. L'enregistrement est normal — un
pack doit se déclarer quelque part. La plomberie admin devrait se réduire à une
ligne par pack. Éditer du code partagé ou un **autre provider** ne devrait jamais
être nécessaire.

## Ce qu'il faudrait

### Une fabrique de pack

Le précédent existe : `shopify/moduleFactory.ts` et `prestashop/moduleFactory.ts`
sont bâtis sur `shared/scrapeCatalogModuleFactory.ts`. Deux boutiques, une
fabrique. Rien d'équivalent n'existe pour les packs de cartes.

Une `createCardPack({ packId, effectPackId, curatedDir, … })` rendrait d'un coup
`installCurated`, `pipeline`, `factsStore`, `index` et le squelette de `cli` —
soit la moitié haute du tableau du problème 1.

### Ce qui reste par jeu, et doit le rester

- `scrapeCardlist` / `parseCardlist` — chaque éditeur a son HTML ;
- `fetchFaces` — chaque CDN a ses règles ;
- `printIdentity` — chaque jeu numérote à sa façon ;
- `indexStore` — les formes de données divergent réellement (Lorcana 566 lignes
  contre Naruto 370, pour de bonnes raisons).

**L'erreur à ne pas commettre serait de mutualiser le bas du tableau.** C'est
précisément là que vit la connaissance du jeu, et l'aplatir coûterait plus qu'il
ne rapporterait.

### L'inversion à faire

Un pack **fournit** son comportement ; le code partagé l'**appelle**. Concrètement :
`sealedProducts/ingest.ts` ne devrait pas savoir que Lorcana a des logos de set —
il devrait appeler un `pack.setLogoForSet?.()` que Lorcana implémente et que les
autres omettent. Même chose pour les branches `packId === "pokemon"`.

## Le cas Naruto

23 077 lignes, 120 fichiers, 37 mentions dans l'aiguillage admin. Une part est
justifiée : c'est le seul pack à porter **quatre langues**, **deux jeux**
(Carddass et 疾風伝), une ligne anglaise séparée, et une trentaine de sources
moissonnées une par une — la plupart des 120 fichiers sont des couples
`parseX` / `scrapeX` pour une source donnée, ce qui est le bon découpage.

Ce qui ne l'est pas : ce pack n'a jamais bénéficié du travail de mutualisation
qui a allégé les suivants. Il devrait être le **dernier** servi par la fabrique,
pas le premier — le risque de régression y est le plus élevé et le bénéfice
relatif le plus faible.

## Ordre suggéré

1. **Étendre le garde de cécité à `providers/shared/`** — quelques lignes, et
   ça empêche le problème 2 de s'aggraver pendant qu'on traite le reste.
2. **Inverser les trois fuites** de `shared/` (lorcana importé, branches
   `pokemon` / `lorcana`) en points d'extension fournis par le pack.
3. **Écrire `createCardPack`** et l'adopter sur `dbsfw` d'abord — c'est le pack
   le plus récent, le plus petit, et il a un jumeau pour vérifier.
4. **Créer le sous-catalogue 疾風伝 avec la fabrique** — premier vrai client,
   et la preuve que le coût a baissé.
5. Naruto Carddass en dernier, si le gain le justifie encore.

---

## Fait le 2026-08-20

### 1. Les gardes — livrés

**`core/catalog/blindnessGuard.test.ts`** balaie désormais `providers/shared/`.
Une seule entrée en liste d'attente, et c'est un faux positif assumé :
`PACK_PRINT_GAME` associe un id de pack au slug de jeu de ses `printKey`, et deux
de ces slugs s'écrivent comme l'id du provider correspondant. Cette table vit
dans `providers/` exprès, pour que `core/` n'ait jamais à nommer un TCG.

**`providers/shared/sharedBlindness.test.ts`** — nouveau, et c'est celui qui
mord : il interdit à `shared/` d'importer un provider frère. Le garde de `core/`
ne pouvait pas le faire, car il ne repère qu'un id **exactement** entre
guillemets — `"@/providers/lorcanatcg/setLogos"` lui échappe deux fois.

Il a trouvé du premier coup une fuite que mon `grep` avait ratée : un
`await import("@/providers/prestashop/fetch")` **dynamique** dans
`scrapeCatalogModuleFactory.ts`, invisible à tout balayage d'imports statiques.

### 2. La fuite Naruto — supprimée, et elle était morte

`shared/sealedProducts/ingest.ts` importait `ingestNarutoSealedProducts`. C'était
le pire des trois couplages : du code partagé appelant un jeu précis, et un cycle
d'imports — le provider Naruto importe ce module, qui réimportait le provider.

**Elle était inatteignable.** On n'entre dans `ingestSealedProducts` que par
`scrapeDbscardsProducts`, dont l'unique appelant passe le `packId` d'un site
`dbscards` ; Naruto n'a pas d'entrée dans `sites.ts`. Son ingest est appelé par
son propre CLI, comme il se doit. Supprimée sans contrepartie.

### 3. Les logos de set — pas touché, et pourquoi

Restent `lorcanatcg` et `tcgdex` importés par `shared/dbscards/scrapeProducts.ts`
et `shared/sealedProducts/ingest.ts`, avec leurs branches
`packId === "pokemon"` / `"lorcana"`.

Les injecter depuis l'appelant ne suffit pas : **pour Lorcana, l'appelant est
lui-même partagé** (`shared/dbscards/cli.ts`, un CLI générique piloté par
`sites.ts`). L'inversion propre demande un **registre de capacités de pack** que
chaque provider peuplerait — et rien de tel n'existe aujourd'hui :
`lib/admin/catalogueExtractRunner.ts` reproduit d'ailleurs exactement le même
motif (`if (target === "pokemon")` suivi d'un import dynamique).

C'est de la conception, pas du déplacement de code, et mal faite elle ferait
disparaître des logos **en silence**. À reprendre à froid, avant l'étape 3.

### Reste à faire

- [ ] Concevoir le registre de capacités de pack, puis inverser les logos de set.
- [ ] `createCardPack`, adoptée sur `dbsfw` d'abord.
- [ ] Le sous-catalogue 疾風伝 comme premier vrai client.
- [ ] Naruto Carddass en dernier.

---

## Preuve par l'usage — le sélecteur de catalogue (2026-08-20)

Une seule demande produit — « pouvoir choisir un catalogue et un set dans la
modale d'ajout » — a demandé de toucher **les cinq packs**, un par un :

| Pack          | Lister ses extensions      | Chercher dans une extension    |
| ------------- | -------------------------- | ------------------------------ |
| `narutocarddass`   | SQL `DISTINCT set_code`    | `WHERE set_code = ?`           |
| `dbscg`       | SQL + `set_name`           | `WHERE set_code = ?`           |
| `dbsfw`       | idem, **fichier séparé**   | idem, **fichier séparé**       |
| `lorcanajson` | dérivé des cartes chargées | filtre sur `card.setCode`      |
| `tcgdex`      | index de logos local       | **appel distant** `/sets/{id}` |

C'est exactement le coût que cet audit annonçait : cinq implémentations pour un
comportement, et `dbscg` / `dbsfw` en ont écrit deux quasi identiques.

Deux pièges rencontrés, tous deux dus à une source qui n'était pas celle de la
recherche :

- **Lorcana** listait ses sets depuis le relevé de **logos** (`set1`, `set2`,
  `quest2`) alors que ses cartes portent `1`, `2`. Le sélecteur proposait des
  extensions dont aucune ne rendait la moindre carte.
- **Naruto** n'avait pas d'extension dans `PrintCandidate.reference` (`CL-001`
  tout court), alors que le CCG anglais n'a pas de séparateur du tout — découper
  la référence fabriquait un « set » par carte, soit quarante-huit faux groupes.
  D'où le champ `setLabel`, désormais au contrat.

### Ce que l'état du disque révèle

| Pack        |          `catalog.sqlite` | Cherche dans…                                   |
| ----------- | ------------------------: | ----------------------------------------------- |
| `narutocarddass` |             5 959 tirages | le local                                        |
| `dbscg`     |             8 434 tirages | le local                                        |
| `dbsfw`     |             4 112 tirages | le local                                        |
| `lorcana`   |         **3 241 tirages** | ⚠️ les **JSON** de lorcanajson.org, pas la base |
| `pokemon`   | _(pas de table `prints`)_ | ⚠️ l'**API distante** tcgdex                    |

Lorcana a une base locale que son provider n'interrogeait pas — corrigé.

**Correction sur Pokémon.** J'avais écrit que « la donnée est là, pas dans la
forme partagée ». C'est faux, et la nuance change la taille du chantier :

| Ce que le pack tient |  Volume | Ce que c'est                                                                                                   |
| -------------------- | ------: | -------------------------------------------------------------------------------------------------------------- |
| `cards-index.json`   |  93 777 | des **faces et masques foil** (`art.webp`, `mask-ph.webp`) — **0 nom, 0 rareté**                               |
| `live_cards`         |  25 191 | un vrai fragment de catalogue (`name_en`, `name_fr`, `rarity_code`) mais **limité à ce que TCG Live embarque** |
| `card_foil`          | 148 779 | l'effet foil par carte                                                                                         |

Le pack Pokémon a été bâti pour **extraire le foil du client TCG Live** : son
stockage local dit _comment une carte brille_, pas _comment elle s'appelle_.
L'identité des cartes — noms, sets, raretés — vient de tcgdex, en distant, sans
miroir local. Une recherche par nom **doit** donc sortir sur le réseau.

L'étape Pokémon n'est pas une remise en forme : c'est une **moisson à écrire**,
de tcgdex vers `prints` / `print_titles`. Les 153 sets et ~20 000 cartes sont à
récupérer, pas à convertir.

Mesuré sur un parcours de set : **42 à 56 ms** pour les packs locaux, **325 ms**
pour Pokémon.

### La cible

Un pack de cartes = un `catalog.sqlite` avec `prints` / `print_titles`, alimenté
par une moisson incrémentale, et interrogé localement. Trois packs sur cinq y
sont déjà. Les deux autres ont la donnée mais pas la forme.

Cela rend `listPrintSets` et la recherche par extension **communes** au lieu
d'être écrites cinq fois — et c'est le premier vrai client de la fabrique
proposée plus haut.

### Ordre révisé

1. Le garde de cécité sur `providers/shared/` ✅ _(fait)_
2. La fuite Naruto dans `sealedProducts/ingest` ✅ _(fait)_
3. ✅ **Lorcana cherche dans son `catalog.sqlite`** — 649 ms → 45 ms. A demandé
   d'ajouter `foil_effect_colors_json` au schéma (sans quoi la teinte du vernis
   se perdait en silence) et une migration à l'ouverture, une colonne manquante
   faisant échouer la requête entière.
4. ✅ **Pokémon a son catalogue local** — `data/pokemon/prints.sqlite`,
   **20 569 tirages / 39 836 titres / 180 sets**, moisson incrémentale. 327 ms →
   183 ms sur un parcours de set, 99 ms sur une recherche par nom.
5. ✅ **`shared/cardCatalogue/sets.ts`** — le traitement commun des extensions,
   extrait des cinq packs (voir plus bas).
6. Fusionner les jumeaux `dbscg` / `dbsfw`.
7. Naruto en dernier.

---

## Moisson Pokémon — ce qu'elle a appris (2026-08-20)

**Un fichier à part**, `prints.sqlite`, et non `catalog.sqlite` comme les autres
packs : ce nom est déjà pris par le magasin TCG Live, dont l'écrivain **réécrit
le fichier entier** à chaque synchro. Des tables de tirages posées là auraient
disparu à la moisson suivante, sans un bruit.

**Une requête par set, pas par carte.** `/sets/{id}` rend la liste complète avec
les noms : ~200 sets par langue au lieu de 20 000 fiches. C'est ce qui rend la
moisson tenable et courte pour l'hôte.

**Le rattrapage tient au compte annoncé.** Un set dont on a déjà toutes les
cartes n'est pas redemandé — seconde passe : 9 sets écrits, 330 sautés.

### Trois classes d'absence, distinguées plutôt qu'empilées

Le premier rapport listait « 54 échecs » sans les qualifier, ce qui ne dit rien.
Trois causes bien différentes s'y cachaient :

| Cause              | Volume | Nature                                                                                                                   |
| ------------------ | -----: | ------------------------------------------------------------------------------------------------------------------------ |
| Vides à la source  |      7 | l'API annonce un compte et rend zéro carte (`wp`, `jumbo`, `rc`, `B1`)                                                   |
| Sans clé possible  |     42 | l'id du set contient un tiret (`tk-ex-latia`, `P-A`, `2018sm-fr`) — or le tiret sépare set et numéro dans une `printKey` |
| Numériques écartés |     30 | Pokémon TCG Pocket, hors catalogue par principe                                                                          |

Les 42 « sans clé » sont une **limite du modèle d'identité**, pas de la moisson :
ces cartes n'étaient pas davantage adressables par le chemin distant.

### Un manquement rattrapé en route

La première passe a laissé entrer **Pokémon TCG Pocket** : chercher « pikachu »
rendait des cartes 100 % numériques, alors que la règle du projet est explicite
— une étagère tient du carton. La recherche distante avait ce filtre
(`digitalOnlySetIds`), la lecture locale l'avait perdu.

Le filtre vit désormais **à la moisson**, doublé d'un élagage rejouable de ce
qu'une passe antérieure aurait laissé passer : un catalogue qui garde ce qu'il
refuse de servir finit toujours par le servir, au premier chemin de lecture qui
oublie le filtre.

### État final — cinq catalogues, cinq bases locales

| Catalogue                | Extensions | Parcours d'un set |
| ------------------------ | ---------: | ----------------: |
| Naruto Carddass          |         53 |             43 ms |
| Lorcana                  |         15 |             47 ms |
| Dragon Ball Masters      |         90 |             56 ms |
| Dragon Ball Fusion World |         30 |            119 ms |
| Pokémon                  |        180 |            183 ms |

Plus aucune recherche de tirage ne sort sur le réseau.

---

## Première mutualisation — `shared/cardCatalogue` (2026-08-20)

Plutôt que la fabrique complète annoncée, j'ai commencé par ce que le sélecteur
de catalogue venait de faire écrire **cinq fois** : c'était la duplication la
plus fraîche, la mieux comprise, et donc la moins risquée à extraire.

| Ce qui est parti dans `shared` | Écrit avant | Pourquoi c'est commun                                                             |
| ------------------------------ | ----------: | --------------------------------------------------------------------------------- |
| `finalizeSetOptions`           |  **7 fois** | nettoyer, départager les homonymes, trier — la donnée diffère, son traitement non |
| `setScopedWhere`               |  **5 fois** | borner par extension, affiner par texte, et lier les paramètres **dans l'ordre**  |
| `isAnsweredQuery`              |      5 fois | une requête vide sans extension n'est pas une question                            |

Les cinq implémentations avaient déjà divergé sur trois points, tous mesurés :

- l'une laissait passer un set nommé `-` (Dragon Ball en porte un) ;
- une autre rendait deux entrées **rigoureusement identiques** dans la liste,
  deux codes partageant un nom de booster ;
- le tri variait, si bien que « Série 10 » précédait « Série 2 » chez certains.

Ce qui **reste** par pack, et doit y rester : d'où viennent les sets (une table
`sets`, un `set_name` porté par le titre, un relevé curé) et la clause textuelle
elle-même — chaque catalogue a ses colonnes et ses formes de référence.

Neuf tests couvrent le comportement partagé, dont ceux des trois divergences.
Aucune régression : les cinq catalogues rendent les mêmes résultats qu'avant.

### Deuxième passe — les assets curés et les crochets de catalogue

| Fichier          | Avant (cg / fw) |       Après | Ce qui est parti dans `shared`            |
| ---------------- | --------------: | ----------: | ----------------------------------------- |
| `installCurated` |         67 / 68 | **40 / 42** | poser le verso, générer la plaque de foil |
| `pipeline`       |         51 / 44 | **32 / 29** | état, lancement, écriture de la trace     |

Ce que les packs gardent : où vit leur dossier curé, quel pipeline lancer, et ce
qu'une passe **automatique** s'autorise à sauter — le graphe produit se moissonne
sur un hôte qui ralentit les rafales, ce qui est acceptable à la demande et pas
toutes les heures.

Une garantie qui n'était couverte nulle part est maintenant testée : **la trace
de dernier passage n'est écrite que si la moisson a abouti**. Une date qui ment
est pire que pas de date — on croirait le catalogue frais.

Le garde de cécité a mordu deux fois pendant ce travail, sur mes propres
commentaires : un id de provider entre accents graves compte comme une citation.
C'est un faux positif un peu littéral, mais il coûte une reformulation et il
attrape le vrai cas.

### Troisième passe — les magasins de faits

| Fichier      | Avant (cg / fw) |       Après | Ce qui est parti dans `shared`                        |
| ------------ | --------------: | ----------: | ----------------------------------------------------- |
| `factsStore` |         62 / 66 | **33 / 36** | cache de module, lecture tolérante, recherche par clé |

Ce que les packs gardent : **comment une paire (set, numéro) devient une clé**.
`FB01-045_p1` est une autre illustration de `FB01-045` — même fiche, donc le
suffixe tombe ; les Masters ont leur propre normalisation. C'est là que vit la
connaissance du jeu.

### `index` : à ne **pas** extraire

Trente-deux lignes séparent encore les deux modules, et ce sont des **faits
propres à chaque jeu** : libellé, carte de sonde, URL du site, langue par
défaut, texte d'aide — plus un bloc d'alias bilingues que seuls les Masters ont,
leur cardlist existant en FR et en EN.

Il n'y reste rien de structurel. Ces fichiers _déclarent_ un pack ; leur
ressemblance est celle de deux déclarations du même genre d'objet, pas d'une
logique recopiée. Les factoriser reviendrait à cacher l'identité des packs
derrière une fabrique qui ne fabriquerait que des constantes.

## Bilan de la mutualisation

|                            | Avant |  Après |
| -------------------------- | ----: | -----: |
| `installCurated` (cg + fw) |   135 | **82** |
| `pipeline` (cg + fw)       |    95 | **61** |
| `factsStore` (cg + fw)     |   128 | **69** |
| `shared/cardCatalogue/`    |     0 |    377 |

Le total brut ne baisse pas — c'est normal et ce n'était pas le but. Ce qui
change, c'est **où** vit chaque chose : le comportement commun a **un** endroit,
testé (34 tests neufs), et les packs ne gardent que ce qui les distingue.

La vraie mesure est ailleurs : les trois divergences trouvées dans les copies de
`finalizeSetOptions` — un set nommé `-` accepté ici et pas là, deux entrées
identiques dans une liste, un tri qui plaçait « Série 10 » avant « Série 2 » —
ne peuvent plus se reproduire.

### Conclusion sur `createCardPack`

La fabrique annoncée n'a plus grand-chose à fabriquer. À mesure que les morceaux
communs sont partis dans `shared/cardCatalogue`, ce qui reste dans chaque pack
est devenu précisément ce qui **doit** y rester : ses sources, ses formes de
référence, son identité. Mieux vaut continuer à extraire par comportement, au
fil des besoins, que bâtir un moule pour ce qui n'est plus commun.

---

## Problème 2 — fermé (2026-08-20)

La fuite des logos de set était différée faute de mécanisme : « le pack fournit,
le cœur appelle » demandait un registre de capacités qui n'existait pas. Le
sélecteur de catalogue en a construit un — `listPrintSets` — et le même motif
règle celle-ci.

**Avant**, dans `shared/sealedProducts/ingest.ts` : deux branches nommant les
jeux, deux imports de providers, et une table de relevés passée en paramètre.
Ajouter un catalogue obligeait à éditer du code commun pour lui faire une place.

**Après** : le contrat porte `resolveSetLogo`, chaque pack l'implémente, et
l'ingest demande au module qui **possède** ce pack — trouvé par
`catalog.dataPack`, sans nommer personne. Le registre étant chargé d'un bloc,
tous les résolveurs sont là dès qu'un seul l'est : pas d'échec silencieux.

Couverture inchangée après réingestion : **133/141** produits Lorcana et
**372/420** Pokémon portent leur logo, exactement comme avant.

La liste d'attente du garde est passée de trois entrées à deux, puis à **zéro**
le 2026-08-21. `providers/shared/` ne nomme plus aucun pack.

### Les deux dernières, fermées le 2026-08-21

**`scrapeCatalogModuleFactory.ts` → prestashop.** Le code partagé attrapait une
erreur, puis allait chercher par `await import()` la classe qui dit si c'était
un refus d'accès. Inversé en un crochet facultatif `isAccessDenied` que la
plateforme fournit : elle reconnaît son propre refus, la fabrique n'a pas à le
savoir. Un `import` dynamique en moins, donc une dépendance de moins qu'aucun
balayage statique ne voyait.

**`dbscards/scrapeProducts.ts` → lorcanatcg, tcgdex.** Je l'avais notée
« cosmétique, n'affiche qu'un compte ». **C'était faux** : la branche
_rafraîchit_ le relevé de logos — elle télécharge — avant l'ingest scellé, et
le compte n'en était que la trace. Le contrat porte maintenant
`refreshSetLogos`, une étape à effet de bord que le pack déclare et que le code
partagé déclenche sans savoir pour qui.

Les deux appels passent par `shared/packOwner.ts`, qui rend le module possédant
un `dataPack` — la recherche que `sealedProducts/ingest.ts` faisait déjà à la
main, désormais écrite une fois.

### La leçon, pour la prochaine fuite

J'ai classé une fuite « cosmétique » sur la foi de la ligne visible — un
`onProgress`. Le travail réel était deux lignes plus haut. **Une fuite ne se
qualifie pas depuis la ligne qui la contient**, mais depuis ce que fait le bloc.

### Un piège à connaître

Les gardes de cécité comptent un id **entre guillemets ou accents graves**, y
compris dans un commentaire. Ils ont mordu trois fois pendant cette session sur
mes propres explications. C'est littéral, un peu agaçant, et ça coûte une
reformulation — mais c'est ce qui leur permet d'attraper le vrai cas.

---

## Le pack 疾風伝 sait se reconstruire (2026-08-21)

Le jeu 「NARUTO-ナルト- 疾風伝 カードゲーム」 avait reçu son pack la veille, mais
tout ce qui le nourrit était resté chez le Carddass : il ne pouvait pas se
rafraîchir seul, et deux choses le montraient.

**Le verso était posé à la main.** `data/naruto/shippuden/cards/back.ja.webp`
n'était produit par aucune passe — il aurait disparu au premier `data/`
reconstruit. Le fichier curé vit maintenant dans le pack, sous
`curated/cards/back.ja.png`, et la passe l'installe. Le suffixe `.ja` n'est pas
décoratif : le pack d'effets va chercher `back.ja.webp`, et un `back.png`
produirait `back.webp`, que rien ne lit. Vérifié en effaçant la destination et
en relançant : réinstallé, **identique au bit près**.

**Les deux listes officielles étaient lues par le mauvais pack.**
`carddas-jp-maku.json` (第一幕…第四幕) et `carddas-jp-gaku.json` (忍伝-学) sont
à 100 % du 疾風伝 — 309 titres, exactement l'inventaire du jeu. Le pack Carddass
les fusionnait dans son index, puis refiltrait ces familles à la sortie : du
travail fait pour être jeté. Elles sont parties avec leur jeu, la fusion est
coupée, et un montage propre les lit à destination.

### Ce que le montage a corrigé au passage

Les deux « odeurs » notées à la migration n'étaient pas des données douteuses,
mais l'absence de la source qui les nomme :

| Avant (migration seule)     | Après (registres) |
| --------------------------- | ----------------- |
| `unknown` × 13              | `unknown` × 4     |
| `mju` comme code de set × 3 | disparu           |

Les 4 restants sont les tirages connus par leur **seule face** (`shi-0152`,
`0154`, `0155`, `0156`) : aucun registre ne les nomme, et leur inventer un acte
serait pire que de l'admettre. Zéro conflit de titre, zéro clé nouvelle — les
registres ne contredisent la migration nulle part, ils la complètent.

### Ce qui reste chez le Carddass

Les **faces** : elles viennent du staging `nikita-nrt` / `nikita-backs` /
`carddas-jp`, qui vit sous `data/naruto/carddass/staging/`. C'est pour cela que
la passe garde la migration en tête. Déplacer ce staging est le dernier fil, et
il ne tient qu'à lui.

---

## Les 641 cartes que la grammaire des clés interdisait (2026-08-21)

Question laissée ouverte la veille : « que faire des sets Pokémon dont l'id
contient un tiret ? » Mesurée, elle avait une réponse.

**Le coût.** Le tiret sépare le set du numéro dans une `printKey`, donc
`tk-xy-latia`, `p-a` et `2018sm-fr` n'en produisaient aucune. La moisson les
comptait « sans clé possible » et passait : **23 sets, 641 cartes** — les Kits
du dresseur, des produits papier parfaitement réels.

**Le correctif.** Le point était déjà légal dans un segment (`sv03.5`), et il
traduit le tiret. La propriété qui rend l'affaire sûre : **un id sans tiret
ressort inchangé**, donc aucune clé déjà écrite ne bouge — le changement est
purement additif.

**La vérification.** La lecture inverse est nécessaire (`fetchTcgdexCardByPrintKey`
reconstruit l'id distant), et un segment à point est ambigu en théorie. Sur les
221 ids publiés par les six langues moissonnées — 20 à point, 23 à tiret —
**zéro collision dans les deux sens**. Les deux familles sont disjointes ; la
lecture rend les deux candidats, le littéral d'abord, et la seconde tentative
rattraperait un futur démenti au lieu d'échouer.

Après remoisson : **0 set sans clé possible** (contre 23), 51 sets écrits, 1889
titres, 21 056 tirages en base contre 20 569.

### Le deuxième mur, derrière le premier

Les clés existaient, les cartes restaient invisibles : le sélecteur écartait
tout tirage sans face, « plutôt que des tuiles vides ». Or les Kits du dresseur
n'ont **aucune** image chez TCGdex — 406 tirages sur 406 — et 1507 tirages du
catalogue sont dans ce cas.

Les cacher les rendait impossibles à ajouter : la carte existe, le
collectionneur l'a en main, et le catalogue prétendait le contraire. C'est le
défaut signalé pour `CL04` côté Naruto, au même endroit. Elles **descendent**
désormais en fin de liste au lieu de disparaître — reléguer plutôt que cacher,
la règle déjà appliquée aux visuels de la mauvaise console.

### Un ordre de tri qui ne se lit pas dans le libellé

Trouvé en vérifiant le pack 疾風伝 : ses actes 第一幕…第四幕 sortaient dans
l'ordre 一, 三, 二, 四 — celui des codes Unicode. Le tri commun supposait que le
rang se lit dans le texte, ce qui n'est vrai qu'en chiffres latins.
`finalizeSetOptions` accepte maintenant un `sortKey` facultatif que le pack
fournit ; sans rang, on trie comme avant, et ce qui n'a pas de rang se range à
la fin — une sous-série n'est pas un cinquième acte.

Dans la foulée : la référence **imprimée** est cherchable (`忍伝-43` → `shi0043`),
ce qui manquait alors que c'est le seul numéro qu'un joueur ait sous les yeux.
`忍-43`, la forme Carddass, ne rend toujours rien ici — les deux jeux ont une
carte 43 et ce ne sont pas les mêmes.

---

## Le scellé aussi était resté (2026-08-21)

Question de l'utilisateur : « les produits scellés dans carddass, c'est que du
Carddass, ou tu as oublié d'en migrer ? » **J'en avais oublié dix-neuf.**

L'index scellé du pack Carddass portait 105 SKU dont 19 du 疾風伝 — boosters,
distributeurs, starters, un Coin+. Trois choses les produisaient, toutes logées
chez le mauvais jeu : un module de relevé, deux registres curés, et dix-neuf
visuels de staging.

| Ce qui a bougé      | Avant                                      | Après                                    |
| ------------------- | ------------------------------------------ | ---------------------------------------- |
| Module de specs     | `narutocarddass/shippudenSealedReleases.ts`     | `narutoshippuden/sealedReleases.ts`      |
| Base produit Bandai | 28 fiches mêlées                           | 11 chez Carddass, 17 chez 疾風伝         |
| Packshots du 第一幕 | clé `shippudenAct1` d'un registre Carddass | son propre registre                      |
| Visuels de staging  | `carddass/staging/`                        | `shippuden/staging/`                     |
| Index scellé        | 105 chez Carddass                          | **86** chez Carddass, **19** chez 疾風伝 |

Vérifié au diff : exactement 19 partis, **aucun** qui ne soit du 疾風伝, aucun
perdu en route.

Au passage, le téléchargement des visuels depuis le CDN Bandai est monté dans
`shared/bandaiPackshots.ts` : lire une fiche par JAN et écrire un fichier n'a
rien de propre à Naruto, et le second jeu Bandai l'aurait fait copier.

### Ce que le scellé a révélé sur les cartes

Les produits attestent **huit actes** — 第一幕 à 第八幕. Le catalogue de cartes
n'en tient que **quatre**.

Mon « 309 titres = l'inventaire du jeu » était donc faux : c'est l'inventaire
des quatre premiers actes. Les listes officielles moissonnées s'arrêtent là, et
personne ne l'avait remarqué parce qu'aucune autre source ne contredisait le
catalogue. C'est le **scellé** qui l'a dit, en réclamant des sets qui n'existent
pas côté cartes.

Corrigé dans les deux docblocs qui l'affirmaient, et versé au backlog.
