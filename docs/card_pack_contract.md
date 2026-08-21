# Contrat des packs cartes — audit et harmonisation

État mesuré le **2026-08-15** sur les cinq packs cartes. À traiter plus tard :
rien ici n'est urgent, l'app fonctionne. C'est de la maintenabilité, et le coût
d'un pack de plus augmente tant que ce n'est pas fait.

## Cause racine — mesurée le 2026-08-15

Deux défauts, et le second explique pourquoi l'alignement n'aboutit jamais.

**1. Le contrat n'est pas un contrat, c'est un inventaire.**
`types/providerModule.ts` fait 721 lignes et **nomme 16 providers dans ses
propres champs** : `fetchFromDeezer`, `fetchFromEbay`, `fetchFromGoogleBooks`,
`fetchFromMusicBrainz`, `fetchFromOpenLibrary`, `fetchFromDiscogs`,
`fetchMetadataFromPriceCharting`, `fetchPricesFromLeDenicheur`… Plus des fuites
de domaine : `romChecksums`, `isPal`, `isClassics`, `includePcSources`,
`imdbId`, `leDenicheurQueries`.

Un type censé rendre le core aveugle aux providers **contient leurs noms**. Il
a grossi par union : chaque besoin nouveau a ajouté un champ au lieu d'entrer
dans une abstraction. Aucun garde ne le vérifie — `privateRuntimeDataGuard` et
`untrackedSourceGuard` regardent ailleurs.

**2. Il manque un niveau entre « provider » et « pack cartes ».**
65 providers partagent `providerModule`. Les 5 packs cartes ne partagent
**rien de formel**, et réimplémentent pourtant les mêmes concepts :

| fichier           | packs qui l'ont |
| ----------------- | --------------- |
| `pipeline.ts`     | 5/5             |
| `cli.ts`          | 5/5             |
| `index.ts`        | 5/5             |
| `indexStore.ts`   | 4/5             |
| `searchPrints.ts` | 3/5             |
| `facts.ts`        | 3/5             |

**Pourquoi ça ne converge jamais.** Le code partagé est extrait _à la seconde
utilisation_, depuis le pack qui en a eu besoin en deuxième. `cardFaces` existe
parce que dbsfw voulait ce que dbscg avait ; `shared/dbscards` pour la même
raison, le même jour. La couche partagée est donc **façonnée par l'ordre
d'arrivée, pas par le domaine** — et comme il n'y a pas de forme cible, chaque
alignement est une réconciliation deux à deux qui ne finit pas.

La correction n'est pas d'extraire plus vite : c'est de **définir le contrat
`CardPack` d'abord**, à partir des besoins réels des cinq packs, puis de les y
faire converger.

## Ce qui est déjà commun

- **Contrat app** — chaque pack rend un `PrintCandidate`, avec le même nommage
  `search<Pack>Prints` / `lookup<Pack>Print` / `lookup<Pack>PrintDetail`.
- **Locales** — dossiers ISO 639-1 partout (`de en es fr it ja ptbr`). `jp`
  serait un code pays ; ne pas l'introduire.
- **`catalogCorpus`** — chemins de pack et statut, consommé par dbscg, dbsfw,
  lorcanatcg, narutoccg, pokemontcglive, icollect.
- **`cardFaces`** (2026-08-15) — sources multiples, `face.json`, classement par
  `explainAttachmentScoreForDisplay`. Consommé par dbscg et dbsfw.
- **`softban`** — dbscg, dbsfw, pokemontcglive. **`attemptOrder`** — dbscg seul.

## Ce qui diverge

### 1. Pokémon n'a pas le contrat de recherche

Les quatre autres packs ont `meta / prints / print_titles / print_assets`.
Pokémon n'a **aucune** de ces tables : `cards-index.json` (93 777 cartes, six
langues) plus un sqlite de `live_cards` / `card_foil`. Il n'expose ni
`searchPrints` ni `lookupPrint`.

C'est le seul manque **fonctionnel** de la liste. Les données existent déjà ; il
s'agit de les projeter dans les quatre tables et d'écrire la recherche. Aucun
fichier déplacé, aucun téléchargement.

### 2. `print_assets` a quatre formes

| pack            | colonnes                                                   |
| --------------- | ---------------------------------------------------------- |
| dbs/cg          | `image_url, back_url`                                      |
| dbs/fw          | `image_url`                                                |
| lorcana         | `art, thumb, foil_mask, varnish_mask, second_varnish_mask` |
| naruto/carddass | `art, thumb, back, source_url, wayback_timestamp`          |

Cible : un noyau `print_key, lang, art_url, back_url` plus une colonne
d'extension JSON pour ce qui est propre à un jeu.

**Ne pas aplatir** les vernis de Lorcana, le `wayback_timestamp` de Naruto ni le
`card_foil` de Pokémon : ces colonnes existent parce que ces sources sont
réellement différentes. Les fondre perdrait de l'information pour gagner de la
symétrie.

### 3. Nommage des fichiers

Cible : **`<role>.<source>.<ext>`** partout, l'extension étant celle que la
source a servie (voir §4).

| pack            | fichiers | dont faces              | sources / carte |
| --------------- | -------- | ----------------------- | --------------- |
| pokemon         | 214 355  | ~94 000 `art.webp`      | 1 (dump Live)   |
| lorcana         | 37 898   | ~19 000 `art/thumb.jpg` | 1 (dump Unity)  |
| naruto/carddass | 844      | ~830                    | 1, sauf 16      |
| dbs/cg          | 40 849   | 24 754                  | **3**           |

Nuance mesurée : le gros des fichiers Pokémon et Lorcana n'est **pas** des
faces, ce sont des couches de rendu (`mask.webp`, `etch.webp`,
`varnish_mask.jpg`). Elles n'ont qu'une origine possible et n'ont pas besoin
d'un segment de source.

Et ces deux packs n'ont **qu'une source par carte** : renommer 113 000 fichiers
n'achèterait aucune capacité aujourd'hui, seulement la préparation d'une seconde
source. À faire quand elle arrive, pas avant.

### 4. Format des faces — **fait 2026-08-15**

`<role>.<source>.webp` figeait la politique d'un pack dans le contrat partagé :
DBS réencodait le PNG de Bandai en `webp({ quality: 92 })` — **lossy, et
définitif** — uniquement pour satisfaire un nom de fichier. Un catalogue qui
classe les faces sur leur qualité n'a pas à les dégrader à l'entrée.

L'extension fait désormais partie du nom, et les octets sont écrits tels
qu'ils arrivent (`webp`, `png`, `jpg` ; tout autre format est refusé, c'est une
page d'erreur déguisée). `face.json` enregistre le fichier réel, jamais un nom
reconstruit.

**Reste à faire** : les 7 637 `art.bandai.webp` déjà sur disque sont issus de
l'ancien réencodage lossy. Un `--only faces --force` limité à Bandai les
récupérerait en PNG d'origine — ~7 600 requêtes. Peu prioritaire : Bandai
perd systématiquement le classement face à dbscards (260×363 contre 400×560),
donc ces fichiers sont un repli rarement affiché.

### 5. Workflow

Seuls dbscg et dbsfw déclarent des `STEPS` (`--only`, `--skip`, `--offline`).
Pokémon expose **treize** scripts pnpm séparés là où une CLI à étapes ferait le
même travail de façon inspectable. Naruto et Lorcana n'en ont pas non plus.

## Ordre suggéré

1. **Pokémon rejoint le contrat de recherche** — seul manque fonctionnel, aucun
   octet déplacé, aucune requête.
2. **`print_assets` sur un noyau commun** + extension JSON — migration de schéma.
3. **`STEPS` déclarées partout** — opérabilité.
4. **`<role>.<source>.<ext>` chez Lorcana et Pokémon** — seulement le jour où
   l'un d'eux gagne une seconde source d'images. ✅ **fait côté Lorcana** le
   2026-08-21 : Lorcast bouche 28 trous de LorcanaJSON, et ses faces se posent
   en `art.lorcast.avif` / `thumb.lorcast.avif`. Les fichiers LorcanaJSON gardent
   `art.jpg` — aucun octet déplacé, la provenance ne se lit que là où il y a
   effectivement deux sources. Pokémon reste à faire, faute d'une seconde source.

Ne pas empiler ces chantiers sur un pack dont les données ne sont pas encore
vérifiées : Fusion World est prêt mais vide au 2026-08-15.

## Ce que les sources donnent et qu'on ne prend pas (audit 2026-08-19)

Le constat est venu de Goat : on y prenait le nom et le scan, alors que chaque
produit annonce aussi sa **rareté**, son **édition** (1st / Unlimited) et son
**finish** (Diamond Foil / Wavy Foil). Le même écart existe ailleurs. Recensement
de ce que chaque pack **stocke réellement** :

| Pack        | Cartes | Nom          | Rareté       | Données de jeu                                                       |
| ----------- | -----: | ------------ | ------------ | -------------------------------------------------------------------- |
| **naruto**  |  5 959 | 5 751 (96 %) | 2 110 (35 %) | `facts-ja.json` — 393 fiches, JA seulement                           |
| **dbscg**   |  8 434 | 100 %        | 100 %        | sqlite : color, character, power, awakened_name                      |
| **dbsfw**   |  3 962 | 100 %        | **0**        | `set_name` seul                                                      |
| **lorcana** |  3 241 | (hors index) | —            | sqlite riche : version, rarity, card_type, color, story, flavor_text |
| **pokemon** | 93 777 | (hors index) | —            | variants / mask / etch (foil), aucune donnée de jeu                  |

> Relevé **avant** repassage, et une ligne était trompeuse : Lorcana **stocke**
> sa rareté et ses noms, dans `print_titles` et non dans `prints` — c'est
> `cards-index.json` qui ne les porte pas, pas le pack. Pokémon, lui, n'a ni
> `prints` ni `print_titles` : son sqlite est celui de TCG Live (`live_cards`,
> `card_foil`), 25 191 lignes avec nom EN/FR, `rarity_code` et l'effet de foil.
> C'est un pack d'une autre nature — le contrat commun ne s'y applique pas.

L'état d'après repassage est en fin de document.

Les schémas eux-mêmes sont asymétriques : `print_titles` a **2 colonnes** chez
Naruto, **7** chez DBS CG, **12+** chez Lorcana, et chez FW il n'y a **pas de
colonne rarity du tout**.

**Fusion World est le trou le plus net.** La liste de cartes ne donne qu'un
numéro, un nom et une image — c'est ce qu'on prend. Mais la fiche
`detail.php?card_no=ST01-001` donne : **rareté** (`L`, `C`, `UC`…), type de
carte, couleur, coût, coût spécifié, **puissance** (deux valeurs pour un leader,
recto/verso), puissance de combo, **traits** et le **texte complet des
compétences**, face avant et face arrière. `parseDbsFwCardDetail` lit tout ça,
7 tests le couvrent — la récolte des 3 962 fiches reste à lancer (≈ 30 min de
crawl à cadence polie).

Deux pièges rencontrés en écrivant le parseur, tous deux sous test : le
`<title>` de la page **commence par le numéro de carte**, donc s'ancrer dessus
vole l'ancre et vide la rareté et le nom ; et la section « Skills » coule dans
« Where to get it » puis le Q&A si on ne pose pas de terminateurs.

**Ordre suggéré pour repasser les packs** : (1) FW, où zéro rareté est stockée
alors que la source la donne ; (2) Naruto EN, dont Goat comble la rareté (3 062
tirages sans) ; (3) Naruto JA, où `facts-ja.json` existe mais n'est joint à
aucune fiche ; (4) Lorcana et Pokémon, dont les données vivent hors de l'index
et demandent d'abord de décider où elles doivent vivre.

## Repassage des packs — état au 2026-08-19

### Où vont les données hors index

Deux adresses, choisies selon la source et non selon l'humeur :

- **Colonnes sqlite** quand le schéma du pack est déjà propre à ce jeu.
  Lorcana avait `cost`, `artists_json`, `varnish_type` : les chiffres du jeu y
  rejoignent leurs voisins.
- **`facts.json` à côté du pack** quand `prints` est la forme commune
  (`print_key, set_code, number, grouping, …`). Un bloc de règles Dragon Ball
  n'a rien à faire dans le schéma que Naruto partage.

### Fusion World — récolté

`pnpm dbs:fw -- --only details` (nouvelle étape, incrémentale) a lu **1 919
fiches** sur les 1 927 numéros distincts. Rareté sur 1 749, type et texte sur
les 1 919, couleur 1 742, coût 1 660, puissance 1 525, traits réels 1 743.

Les **huit** manquants — `E-91`, `E-92`, `FP-022`, `FP-023`, `FP-082` à
`FP-085` — répondent `200` avec un gabarit vide (`<h1 class="cardName">-`).
L'éditeur n'a rien publié dessus ; le parseur refuse la coquille au lieu
d'inventer une carte. Ce n'est pas une récolte à relancer.

Piège relevé à l'écriture : `card_back_skill` et les traits valent `-` quand la
carte n'en a pas. Le tiret est une absence, pas une valeur — 178 fiches
portaient un trait nommé « - » avant correction.

### Dragon Ball Super CG — la donnée était déjà sur le disque

`staging/dragon-ball-masters-arena/masters_superset.json` : **8 600 lignes,
34 champs**, dont on ne lisait que les visuels. Le pack ignorait le **texte de
la carte**, les traits, l'ère, les mots-clés, les coûts, le verso des Leaders,
le **statut tournoi** et les errata.

`facts.json` en tient maintenant **8 963 fiches** : 7 667 tirages tombent sur
leur propre ligne, 363 héritent de celle de leur numéro de base (une
réimpression promo rejoue le texte d'origine — marqué `inheritedFrom`), 403
restent sans faits parce que le dépôt s'arrête avant BT30. Les lignes que le
catalogue ne réclame pas sont gardées : le dépôt connaît des tirages qu'on n'a
pas encore.

Quatre champs du dépôt sont écartés, et pour une raison chacun :

| Champ                 | Pourquoi il ne rentre pas                                         |
| --------------------- | ----------------------------------------------------------------- |
| `variants`            | Ment : BT1-005 renvoie vers BT24-086_PR2, BT24-089_PR et BT11-024 |
| `finishes`            | `null` sur les 8 585 lignes qui le portent                        |
| `is_horizontal`       | Faux sur les 8 600 : le porter affirmerait ce que la source tait  |
| `sort` / `view_count` | Compteurs d'affichage du site, sur 15 lignes                      |

Deux pièges d'écriture, tous deux sous test : la rareté est écrite de trois
façons (`Uncommon[UC]`, `Uncommon [UC]`, `Common`), donc elle est éclatée en
libellé + code ; et les errata sont **encodés deux fois** (`card&amp;apos;s`),
donc une seule passe de décodage laissait `&apos;` en clair sur 201 cartes.

### Lorcana — cinq chiffres lus puis jetés

Le provider lisait déjà `lore`, `strength`, `willpower`, `inkwell`,
`setCardCount` et `subtypes` ; l'écriture n'avait pas de colonne pour eux. Cinq
colonnes ajoutées à `prints`, une à `print_titles` — les sous-types sont
traduits, ils vont avec la langue. Après reconstruction : lore sur 2 584
tirages, force 2 469, volonté 2 584, encrier **3 241/3 241**, taille de set
3 057, sous-types sur 10 052 titres.

Correction d'un relevé plus haut dans ce document : la rareté Lorcana **était**
stockée, dans `print_titles` et non dans `prints`. La lecture de
`cards-index.json` seule donnait une fausse alerte.

## Découverte : dynamique pour les cartes, déclarée pour les produits (2026-08-19)

Question posée : est-ce qu'on récupère tout dynamiquement, ou est-ce une liste ?
Les deux, et la frontière compte.

**Les cartes se découvrent seules.** Bandai publie ses séries dans un `<select>`
que le crawl lit à chaque passage — FW annonce 27 séries en `en`, 26 en
`asia-en`, et le pack tient les 30 codes correspondants (`st01`, `fb01`→`fb10`,
`sb01`-`sb02`, `fs01`→`fs12`, plus `e*` et `fp`). Lorcana prend `allCards.json`
en entier, quatre langues. Rien à déclarer, une nouvelle extension entre toute
seule au prochain tour.

**Les produits scellés, non.** Chaque hôte range ses rayons sous
`/products/{slug}` et la liste des rayons vit dans `sites.ts`. Un slug oublié ne
lève aucune erreur : ses produits sont simplement invisibles. C'est le seul
endroit où une liste écrite à la main décide de ce qu'on voit — et elle avait un
trou : **`prerelease-packs` chez lorcards**, qui cachait le Pack Avant-Première
Set 13 (Invasion Épineuse) et Set 14 (Hyperia City). Déclaré, re-scrapé :
l'index Lorcana passe de 139 à **141 SKU**.

`auditCategories.ts` confronte désormais le déclaré au publié sur les treize
hôtes. Verdict après correction : **aucun rayon manquant**. Les slugs inconnus
restent listés à part — ce sont des accessoires (tapis, pochettes, classeurs) ou
des rouages du site (`loader`, `suggest`, `fr`, `en`), et `skip` par défaut
empêche un nouveau rayon d'accessoires de démarrer un crawl par accident.

`illumineers-quest` est signalé « hors nav » : la page répond toujours `200`,
elle a seulement quitté le menu. Constaté, pas supprimé.

### Ce qui manque vraiment, et pourquoi

| Manque                        | Cause                                                           |
| ----------------------------- | --------------------------------------------------------------- |
| DBS CG : faits de 403 tirages | Le dump Masters est un **clone figé**, arrêté avant BT30        |
| DBS CG : scellés BT30 et BT31 | **La source elle-même s'arrête** — dbscards publie jusqu'à BT29 |
| FW : 8 fiches détaillées      | Pages `200` au gabarit vide, rien de publié dessus              |
| Naruto : scellé japonais      | Liste écrite à la main, 2 SKU JA pour une trentaine de sorties  |

Les deux premières lignes sont des **fraîcheurs de source**, pas des défauts de
crawl : les cartes BT30/BT31 sont bien au catalogue (179 et 177 tirages).

Une coquille de source à ne pas corriger en silence : lorcards écrit « Pack
Avant-Première **Set 13** - Hyperia City » alors que son propre slug dit
`set-14`. Le nom est recopié tel quel.

## Le dos des scellés — `imageBack` (2026-08-19)

Le modèle produit n'avait qu'un visuel (`image`). Le rôle `back` existait
pourtant déjà dans le vocabulaire partagé des faces
(`CARD_FACE_ROLES = ["art", "back", "logo"]`) : il n'était simplement jamais
utilisé côté scellé, et l'index n'avait pas de champ pour l'accueillir.

Ce n'est pas un doublon du recto. Le verso d'un sachet porte l'éditeur et son
adresse, la centrale service client, la mention de distribution, le code de
recyclage, souvent le code-barres et le texte de contenu. Sur le bonus PS1 de
Naruto, c'est le dos qui dit 発売元 株式会社バンダイ (東京都台東区駒形2-5-4),
`NOT FOR SALE`, l'interdiction d'export hors Japon, l'adresse
`carddas.com/naruto/`, et l'avertissement qu'on ne peut pas jouer avec ce seul
pack. Rien de tout cela n'est lisible au recto.

Livré : `imageBack` sur `SealedProductEntry`, rôle `back` promu comme `art` et
`logo`, `stagingBackFile` sur le spec Naruto, `mercari` déclaré comme source
produit. Un seul SKU en porte un aujourd'hui — **les boutiques ne
photographient que la face avant**, et c'est là le vrai frein, pas le modèle.

Deux constats à côté, qui corrigent le ledger `ps-yoyaku-tokuten.json` :

- « il n'y a pas d'emballage photographié » était **faux** : sept annonces
  Mercari montrent le sachet 未開封, 22 photos.
- le sachet imprime **BOOSTER PACK ブースターパック（追加拡張）**, et pourtant
  `kind` reste `coffret`. Ce champ décrit un **comportement**, pas la
  typographie : `booster` entraînerait `random_pack` et `contentsKnown: false`,
  quand « 全4種 » dans un sachet de 4 cartes veut dire qu'on les a toutes.

Trois autres liens proposés le même jour ont été écartés sans rien en prendre :
`render.yzjjzrof.shop`, `hobbypick.cotterek.click`, `jttrq.zhxggoga.shop` —
sous-domaine aléatoire, TLD `.shop`/`.click`, gabarit Zen Cart recopié. Ce sont
des vitrines d'arnaque qui rehébergent des photos d'ailleurs.

## Le scellé japonais était bloqué par le visuel, pas par la connaissance (2026-08-19)

Le catalogue portait **2 SKU japonais** pour une ligne de dix-sept volumes, et
la cause n'était pas l'ignorance : `curated/sources/cardcheckbox-jp.json`
recense **trente sorties** depuis longtemps, avec leur date, leur volumétrie et
les plages de numéros qu'elles ouvrent. C'est l'ingest qui les jetait —
`if (!artDumps.length) { skipped++ }`. Autrement dit le scellé Naruto comptait
41 SKU parce qu'on tenait 41 packshots, pas parce qu'il existait 41 produits.

Un spec porte maintenant `attested: true` : la sortie est attestée par un relevé
curé, elle entre au catalogue **sans visuel** plutôt que de disparaître. Le jour
où un packshot arrive, il se pose dessus sans rien changer d'autre. Les lignes
FR gardent l'ancien comportement : là, un packshot manquant veut dire que notre
staging est incomplet, et sauter reste juste.

**41 → 70 SKU**, dont JA **2 → 31**. 29 sans visuel, tous avec leur date de
sortie et, pour 27 d'entre eux, le nombre de cartes différentes du set.

Deux pièges relevés en chemin, tous deux sous test :

- **Taille du set ≠ cartes par sachet.** Le relevé écrit `70+P` pour 巻ノ一 :
  soixante-dix cartes _différentes_, pas soixante-dix par paquet. Les verser
  dans `declaredCardCount` aurait fait dire au catalogue qu'un booster en
  contient 70. Elles vont dans `setCardCount` — même sens que le
  `set_card_count` de Lorcana.
- `unconfirmed` et `18+` ne sont pas des comptes : ils rendent `null`. Trois
  sorties sont dans ce cas.

Le `kind` se déduit du vocabulaire de la sortie, jamais de son rang : 巻ノ N et
`BOOSTER` → `booster`, スターターボックス → `deck`, le reste → `coffret`. Ce
dernier reste un fourre-tout assumé pour les feuilles jumbo, les boîtes de
collection, les coins et les cartes-bonbon — le vocabulaire a quatre cases et
aucune ne dit « feuille d'extension ». Le libellé japonais est conservé tel
quel, il porte la vérité.

Un bug attrapé au passage : `dumpIfPresent(root, "")` rendait la racine du pack,
qui existe — et l'ingest copiait un **dossier** comme s'il s'agissait d'un
visuel. La garde vérifie désormais que la source est bien un fichier.

## `staging/` se reconstruit, `curated/` se garde (2026-08-20)

Règle rappelée en cours de session, après que j'ai posé plusieurs visuels faits
à la main dans `staging/` :

> **`staging/` doit venir d'un script rejouable.** Tout ce qui est fait à la
> main va dans `curated/`, dans le provider.

La raison est concrète : `staging/` se remoissonne depuis un relevé. Un fichier
posé là à la main disparaît au prochain passage, **sans une erreur**. Le cas le
plus traître était la série 7 allemande, que j'avais recadrée à la main dans
`staging/` : la prochaine moisson aurait resservi l'original mal cadré.

`curated/products/` a donc rejoint l'arbre, à côté de `cards/` et `sources/` :

| Dossier                 | Contenu                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `series-badges/{lang}/` | Badges de série découpés — **par langue** : `SÉRIE 4` accentué en français, `SERIE 4` en allemand |
| `ccg-logo/`             | Le wordmark du CCG Shippuden, commun aux seize séries anglaises                                   |
| `wrappers/`             | Emballages photographiés, recto et verso                                                          |
| `comicplanet-de/`       | Retouches d'un visuel qu'une source sert mal cadré                                                |
| `jp-boosters/`          | Sachets japonais détourés à la main                                                               |

Le staging garde ce qu'un script retélécharge depuis un relevé :
`carddass-official/` (26 fiches Bandai), `comicplanet-de/` (9 packshots
allemands), `suruga-kaitori/` (3 photos de rachat).

Deux tables de sources distinctes plutôt qu'une, exprès :
`STAGING_FOLDER_SOURCE` et `CURATED_FOLDER_SOURCE`. Les mêler laisserait croire
qu'un visuel curé se re-télécharge.

### Le badge français se posait sur les produits allemands

Trouvé en câblant les badges : la recherche de logo se faisait sur le **seul
code de série**, sans regarder la langue. Le badge `SÉRIE 1` français était donc
posé sur `booster-s1-de` — fichier identique, vérifié par empreinte. C'est la
même faute que le logo qui recopiait son produit, sous une autre forme.

La recherche est désormais par langue. Les séries allemandes 1 à 5 se retrouvent
sans logo, et c'est juste : on n'a que les badges allemands 6 à 9.

### Audit du staging Naruto (2026-08-20)

Question posée : « tout ce que tu as dans staging, c'est bien généré par des
scripts ? » Réponse mesurée : **non**, et pas seulement pour mes ajouts.

**Mes quatre dossiers du jour n'avaient aucun générateur au dépôt.** Ils étaient
arrivés par des scripts jetables, hors du projet : un `rm -rf staging/` les
perdait, et personne ne pouvait vérifier d'où ils venaient.
`harvestProductPackshots.ts` comble ça — trois lots, chacun piloté par son
relevé curé, jamais par une liste écrite dans le code.

Vérifié en effaçant `suruga-kaitori/` : les trois fichiers reviennent. Et le
même passage a re-téléchargé le S7 allemand **rembourré** en staging — la
retouche curée continue de gagner, 415×747 à l'affichage contre 1600×1200 en
staging. C'est exactement le comportement voulu : le staging tient l'original,
`curated/` tient la correction.

**Dix dossiers préexistants n'ont aucune mention dans le code** : `amazon-fr`,
`bgg`, `carddas-jp-ps`, `gamexfood`, `leboncoin`, `liveinternet`,
`narutoccgfrance`, `retrotcg`, `tradecardsonline`, `tvtokyo-ps`. Ils sont
antérieurs à cette session ; je les signale sans y toucher — certains portent
peut-être des collages qu'il faudrait déplacer vers `curated/`, mais c'est un
tri à faire en connaissance de cause, pas au passage.
