# Support TCG — conception

> Statut : **phase 1 en cours** (2026-07-26). Décisions produit prises (§8).
> Livré : ancre `printKey`, provider LorcanaJSON, colonne `Item.printKey`.
> Reste : flux d'ajout par recherche, regroupement des doublons, plein écran.
>
> Les APIs ont été sondées en direct — réponses réelles, pas de la doc lue en
> diagonale ; tout ce qui est marqué « vérifié » a été appelé.

## 1. Le vrai problème : il n'y a pas de code-barres

Toute la chaîne d'identification part d'un EAN/UPC : `BarcodeCache`, les
`buildBarcodeTasks` des providers, le moteur de consensus, le corpus de
régression. **Une carte à l'unité n'a jamais de code-barres** (seuls les
produits scellés en ont un).

Mais une carte a une identité tout aussi stable, c'est juste une clé composite.
La forme exacte a été **corrigée par les données** — la version naïve
(`jeu / set / numéro / langue`) est fausse :

```
jeu : set - numéro[variante] [- groupe promo]     → « print identity »
```

Trois choses vérifiées sur les 6386 tirages FR + EN de Lorcana :

- **`set + numéro` n'est pas unique.** Le set 3 imprime cinq Chiots dalmatiens
  différents, tous numérotés 4, distingués par une lettre : `4a` … `4e`.
- **Il faut aussi le groupe promo.** `20/204` (Simba) et `20/P1` (Génie) sont
  deux cartes du set 1 portant le numéro 20.
- **La langue ne fait pas partie de la clé.** Le même tirage porte le même
  numéro en FR et en EN (zéro divergence sur 3154 cartes communes). La langue
  décrit l'exemplaire possédé, pas la carte — cohérent avec le §4.

Contre-exemple assumé : Moana et Vaiana, deux cartes physiquement distinctes,
sont toutes deux imprimées `26/P2 • 7`. L'ambiguïté est dans le monde réel, pas
dans le modèle ; on la lève par le nom et on garde l'id provider dans
`externalIds`.

C'est l'ancre qui remplace le code-barres.

**Conséquence structurante** : le flux « scanner » ne s'applique pas. Les TCG
ont besoin d'un flux **recherche-d'abord** (nom → liste → set + numéro), ou
d'une saisie directe `set + numéro` (ce que font les collectionneurs), ou d'un
import de liste. Il ne faut **pas** forcer `BarcodeCache` là-dessus : on
réutilise tout le reste (providers, `MetadataResult`, evidence, stockage,
galerie, prix) et on change uniquement l'ancre.

Côté schéma, ça veut dire un `Item.printKey` (nullable, indexé comme
`barcode` l'est) plutôt que de détourner la colonne `barcode` — une colonne qui
ment coûte toujours plus cher que la colonne en trop.

## 2. Providers — sondés le 2026-07-26

| Jeu                     | Provider                                        | Données FR      | Images FR      | Variantes                            | Prix                              | Clé               |
| ----------------------- | ----------------------------------------------- | --------------- | -------------- | ------------------------------------ | --------------------------------- | ----------------- |
| Pokémon                 | [TCGdex](https://tcgdex.dev/)                   | ✅ vérifié      | ✅ vérifié     | ✅ `variants_detailed` + `variantId` | ✅ Cardmarket **EUR** + TCGplayer | aucune            |
| Lorcana                 | [LorcanaJSON](https://lorcanajson.org/)         | ✅ FR/DE/IT     | ✅ officielles | ✅ `foilTypes` + **`foilMask`**      | ❌                                | fichiers          |
| Lorcana                 | [Lorcast](https://lorcast.com/docs/api/cards)   | ❌ EN seulement | ❌             | prix foil uniquement                 | TCGplayer USD                     | aucune            |
| Magic                   | [Scryfall](https://scryfall.com/docs/api)       | ✅ vérifié      | ✅             | ✅ `finishes: nonfoil/foil/etched`   | ✅                                | UA requis         |
| Yu-Gi-Oh                | [YGOPRODeck](https://ygoprodeck.com/api-guide/) | ✅ noms         | EN             | sets + raretés                       | ✅                                | aucune            |
| One Piece, Dragon Ball  | [apitcg.com](https://apitcg.com/)               | ?               | ?              | ✅                                   | ?                                 | clé (inscription) |
| One Piece, Gundam, etc. | [Scrydex](https://scrydex.com/)                 | ?               | ?              | ✅                                   | ✅                                | **payant**        |

Ça tombe pile dans le registre existant : **un module par jeu**, chacun
déclarant `types: ["tcg"]`. Aucun concept nouveau côté providers.

Sur la couverture par jeu (sondé le 2026-07-26) : **Pokémon** est le mieux
servi — TCGdex répond en français sur la recherche par nom (112 résultats pour
« Dracaufeu »), sans clé. **One Piece** et **Dragon Ball Fusion World** sont
couverts par apitcg.com, qui exige une clé obtenue par inscription (répond
`API key is required` sans elle) ; le périmètre exact des données et les
langues restent à vérifier une fois la clé en main.

Deux remarques qui comptent :

- **TCGdex est le meilleur du lot** et il est gratuit sans clé : images FR
  servies (`assets.tcgdex.net/fr/...`, vérifié 200), variantes détaillées avec
  un id par variante, et surtout **des prix Cardmarket en euros**, ce qui colle
  au reste de l'app là où TCGplayer est en dollars.
- **Lorcana n'a pas de source FR + prix**. LorcanaJSON a le FR et les images
  officielles mais aucun prix ; Lorcast a des prix mais uniquement en anglais.
  Si les prix Lorcana comptent, il faudra croiser les deux — le moteur de
  consensus sait déjà faire ça.

## 3. Les « variants » — le vocabulaire

Trois axes **orthogonaux**, souvent confondus :

1. **Le tirage** (`print`) — set + numéro + langue. Une illustration alternative
   ou une « full art » est **une autre carte**, avec son propre numéro. Ça va
   dans la clé d'identité.
2. **La finition** (`finish` / `treatment`) — la même carte, imprimée
   différemment. C'est une propriété de **l'exemplaire que tu possèdes**, pas de
   la carte : elle appartient à `Item`, pas à `Metadata`.
   - Pokémon : `normal`, `holo`, `reverse`, `firstEdition`, `wPromo`
   - Magic : `nonfoil`, `foil`, `etched`
   - Lorcana : `None`, `Silver`, `Satin`, `Magma`, `VerticalWave`, `Lava`…
     (ce sont des **noms d'effet**, pas des niveaux)
3. **La rareté** — `Commune`, `Rare`, `Enchantée`, `Iconique`… Propriété de la
   carte, déjà modélisable en fait.

« Foil », « holo », « reverse », « irisé » sont donc tous de l'axe 2. Le mot
générique de l'industrie est **finish** (ou _treatment_).

## 4. Les doublons — décidé : N items, regroupés à l'affichage

Un collectionneur possède 4× la même carte. **On garde `Item` = un objet
physique**, on n'ajoute pas de colonne quantité.

Pourquoi : un exemplaire porte déjà, individuellement, une `condition`, des
`PriceOffer` et des `LoanRequest`. On prête **un** exemplaire, pas 1,5 sur 3 ;
chacun a son prix d'achat et son état. Une colonne quantité obligerait
aussitôt à ré-attacher état + prêt + prix _par unité_, c'est-à-dire à recréer
la table `Item` dans un champ JSON. Et la mécanique de doublons existe déjà
(`ITEM_COPY_SLUG_MARKER`, slugs `-copy-N`).

Le regroupement est donc un **transform d'affichage**, à côté de
`queryCollectionItems` dans la page d'étagère — générique pour tous les types
par construction, pas une mécanique TCG. Zéro migration ; les doublons de jeux
déjà saisis en bénéficient immédiatement.

**Clé de regroupement** — deux exemplaires fusionnent si c'est le même objet :

| Axe                                | Dans la clé ? |
| ---------------------------------- | ------------- |
| Métadonnée (la carte, le jeu)      | ✅            |
| Variante (finition, édition)       | ✅            |
| Langue de l'exemplaire             | ✅            |
| **État** (neuf / occasion / abîmé) | ❌            |

L'état décrit la **santé** de l'objet, pas son identité : il change dans le
temps (une carte neuve se joue, un jeu neuf s'ouvre). S'il séparait les
groupes, on ne pourrait jamais dire « j'ai 3 Elsa ». La vignette affiche
`Elsa foil ×3` ; le détail du groupe liste les exemplaires avec état, prix
d'achat et statut de prêt. Corollaire : plus besoin de « (copie) » dans le
titre.

**Dette signalée, non traitée ici** : l'enum `Condition` mélange deux axes —
`new`/`used`/`damaged` sont des états, mais `loose` décrit _ce qu'on possède_
(cartouche seule vs boîte complète) et pilote une gamme de prix distincte.
C'est de la variante déguisée en état. Le jour où l'axe variante existe,
`loose` doit migrer dessus.

Reste à couvrir :

- **La langue de l'exemplaire.** Rien ne la porte aujourd'hui.
- **La gradation** (PSA / CGC / Beckett) — **hors périmètre**, décidé. À
  rouvrir le jour où une carte sous coque entre dans la collection.

## 5. L'effet holographique

L'effet de [poke-holo](https://poke-holo.simey.me/) superpose trois couches
pilotées par la position du pointeur : l'image de la carte, une couche
« foil », et un **masque** qui dit où l'effet s'applique.

Ce qui a été vérifié :

- **Lorcana : réaliste avec les assets officiels.** LorcanaJSON expose un
  `images.foilMask` par carte, servi par l'API Ravensburger — **3078 masques
  sur 3154 cartes FR (97 %)**, vérifié en téléchargeant l'un d'eux (96 ko,
  HTTP 200). C'est exactement la couche qui manque d'habitude, et elle est
  first-party.
- **Pokémon : possible mais pas propre.** Le CDN de poke-holo répond (vérifié),
  mais c'est **leur bande passante** et leur build partiel, set par set.
  Hotlinker n'est pas une option pour un produit ; re-héberger pose une
  question de licence à trancher.
- **Les autres jeux : non.** Aucun masque public.

**Proposition** : effet masqué (le vrai) pour Lorcana, effet procédural
générique (sans masque, piloté par `foilTypes`/`finish`) ailleurs. Le mode
plein écran des cartes seulement, comme demandé.

### 5 bis. Pourquoi Lorcana est une exception — et comment le tester ailleurs

_(vérifié le 2026-07-29)_

Les masques Lorcana sont publics **parce que Ravensburger a un visualiseur web**
(`cards.disneylorcana.com`). Un rendu dans un navigateur oblige à servir les
masques côté client : ils sont donc sur un CDN public, et les recettes elles-mêmes
sont dans une feuille de style lisible. Ce n'est pas de la générosité, c'est une
conséquence technique — et c'est ce qui a permis de tout transcrire.

**D'où le test à faire pour tout nouveau jeu, avant d'envisager quoi que ce
soit d'autre : l'éditeur a-t-il un visualiseur web officiel qui _rend_ les
foils ?** Si oui, masques et recettes sont accessibles comme pour Lorcana. Sinon,
il n'y a rien à copier, et il n'y aura rien.

Ce qui a été testé en direct, et qui échoue à ce test :

| Source                    | Ce qu'elle publie sur les finitions                                      | Masque   |
| ------------------------- | ------------------------------------------------------------------------ | -------- |
| **TCGdex**                | `variants: {holo, normal, reverse, firstEdition, wPromo}` — des booléens | ❌ aucun |
| **Scryfall** (Magic)      | `finishes: [nonfoil, foil]` + tailles d'image                            | ❌ aucun |
| **flibustier** (Pocket)   | métadonnées + URLs d'images                                              | ❌ aucun |
| Site officiel Pokémon TCG | images à plat, aucun rendu de foil                                       | ❌ aucun |

Un scan haute résolution **n'est pas** un masque : ces sources disent *qu'*une
carte existe en foil, jamais _où_ le foil se pose. Attention aux documents qui
cochent « résolu » sur cette base — c'est une confusion de catégorie.

**Pokémon TCG Pocket** : `RaenonX-PokemonTCGP/pokemon-tcgp-apk-dumper` mirrore
l'APK en CI (650 Mo, `current.zip` + archives, **aucune licence**). Quelqu'un
automatise donc déjà le dump — mais s'en servir place au même endroit que le
faire soi-même : ce sont des assets Nintendo. Décompiler pour **comprendre** la
technique est défendable (exception d'interopérabilité, et c'est ce qu'on a fait
en lisant du GPL sans le copier) ; embarquer les masques dans `public/` ne l'est
pas. Et la question préalable reste entière : Pocket est un jeu **numérique**,
sans état ni prix de revente — sa place dans un suivi de collection physique
n'est pas établie.

## 6. Le dos de carte

Les dos sont **constants par jeu** (une image, parfois deux selon l'époque),
pas par carte — c'est quelques fichiers, pas un chantier de données. Un onglet
dédié en plein écran, avec un retournement 3D, est une petite feature isolée.

**Ravensburger ne publie pas le dos** _(cherché le 2026-07-29)_ : son catalogue
n'a aucun champ `back`/`reverse`, `card_sets[]` ne porte qu'une vignette de set,
son visualiseur ne sert que deux logos, et le site marketing ne montre jamais
une carte de dos — logique, leur visualiseur ne retourne jamais les cartes.
Rien n'a été vérifié pour les autres éditeurs.

Le dos est donc traité comme de la **décoration** : `Shelf.cardBackUrl`, une
image ou une URL fournie par le collectionneur, rien de résolu automatiquement.
Vide ⇒ les cartes ne se retournent pas, mais s'inclinent quand même : une carte
reste un objet physique.

**Ce que le champ accepte est une seule fonction**, `normalizeCardBackUrl` —
importée par le formulaire _et_ par la route. Écrite deux fois, elle a divergé :
le formulaire acceptait le `/uploads/…` rendu par l'upload, l'API n'acceptait
que des URLs absolues, donc choisir une image enregistrait sans rien stocker et
effaçait au passage le dos précédent. Un champ dont les deux côtés valident
séparément est un champ qui perdra des données.

## 6 bis. Pièges LorcanaJSON (vérifiés, pas lus dans la doc)

- **L'identité n'existe que dans `allCards.json`.** Les fichiers par set
  (`sets/setdata.N.json`) n'ont ni `setCode`, ni `variant`, ni `promoGrouping`.
- **`fullIdentifier` est inexploitable comme clé.** Il contredit le `setCode`
  explicite sur certaines promos (`11/P3 • FR • 1` appartient au set **9**) et
  les vieux enregistrements EN utilisent une autre forme (`1 TFC • EN • 1/P1`).
  15 divergences sur 6386. Reconstruire l'identité en le parsant aurait rangé
  des cartes dans le mauvais set, silencieusement.
- **Le poids est gérable** : 9 Mo parsés mais 1,6 Mo sur le fil en gzip, ~480 ms.
  D'où un index allégé en mémoire, revalidé via le fichier `.md5` compagnon.
- **`varnishType` est un second axe de finition** (`HighGloss`,
  `MetallicHotFoil`), indépendant de `foilTypes`.

## 7. Découpage proposé

1. **Lorcana FR de bout en bout** : ajout par recherche, `printKey`, images,
   finitions. Sans prix.
2. **Plein écran** : effet holo masqué + dos + retournement 3D.
3. **Pokémon via TCGdex** : apporte les prix en euros et les variantes
   `reverse`/`holo` en prime.
4. **Magic / Yu-Gi-Oh**, puis Scrydex si on veut One Piece & co.

## 8. Décisions prises (2026-07-26)

- **Doublons** : N items, regroupés à l'affichage. Voir §4.
- **Prix** : aucun traitement spécial. Lorcana sort sans prix parce qu'aucune
  source gratuite n'en publie en FR — pas parce que ce serait câblé en dur. Un
  provider qui déclare la capacité prix est appelé par le flux prix normal,
  comme pour tous les autres types.
- **Cartes gradées** : hors périmètre.

## 9. Ce que l'app mobile apprend (dump du 2026-07-30)

Le viewer web n'était pas incomplet — il est _entier pour ce qu'il est_. L'app
tourne sur un moteur différent, et c'est de là que vient l'écart.

### Méthode

`Disney Lorcana TCG Companion 2026.4`, Unity 6000.3.17f1, IL2CPP. Deux sources :

- `global-metadata.dat` (non compressé) → tous les noms de classes et de champs.
  C'est ce qui a livré le **vocabulaire des finitions**, et donc le bug : notre
  table n'en connaissait que 11 sur 13.
- `data.unity3d`, lu avec UnityPy → l'inventaire des matériaux et **leurs
  paramètres**. `strings` seul ne suffit pas : le corps est compressé et rend
  des noms tronqués (`FoilLoreh`, `FoilEffecJ`) qui ressemblent à des trouvailles.

On relève des **faits de configuration** — quels effets existent, quels réglages
les distinguent. Pas leur code de shader : sur un build mobile il est de toute
façon compilé en bytecode GPU.

### Vocabulaire complet

**Finitions (13)** — Silver, Satin, Lore, Lava, Magma, Glitter, VerticalWave,
SeaWave, RainbowPillars, FreeForm1, FreeForm2, **Tempest**, **CalendarWave**.
Les deux dernières manquaient à `FINISH_SHADERS` et tombaient sur `silver`.

**Vernis (6)** — HighGloss, MatteHotFoil, MetallicHotFoil, SnowHotFoil,
RainbowHotFoil, ChromeRainbowHotFoil. Notre table était complète.

### L'architecture diffère du viewer web

Le web a **une recette CSS par finition**. L'app a **8 shader graphs pour 23
matériaux** : plusieurs finitions partagent un graph et ne se distinguent que par
leurs réglages. `CardFoilLore` est le cheval de trait — il sert CalendarWave,
SeaWave, Magma et les variantes Lore.

Le nom du matériau porte la **combinaison** finition + vernis
(`CardSeaWaveMatteHotFoil`, `CardMagmaChromeRainbowHotFoilMaterial`) : chez eux
la paire est pré-écrite, chez nous elle est composée à la volée par deux couches.
Les deux donnent le même résultat ; la leur coûte un matériau par paire, la nôtre
reste combinatoire.

### Les familles de réglages

Ce que l'app expose et que le CSS n'a pas :

| famille             | paramètres                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| motif / arc-en-ciel | `_MotifColorWeight`, `_RainbowStrength`, `_MotifToRainbowRatio`                                                                         |
| lavis               | `_Inkwash_Strength`, `_Inkwash_Compactness`                                                                                             |
| animation           | `_Speed`, `_TimeFactor`, `_FoilMorphSpeed`                                                                                              |
| vernis              | `_VarnishBevelStrength`, `_VarnishDarkenStrength`, `_VarnishHighlightStrength`, `_VarnishOutlineStrength`, `_VarnishDistortionStrength` |
| hot foil            | `_HotFoilBrightness`, `_HotFoilContrast`, `_HotFoilOffset`                                                                              |
| relief              | `_FoilDisplacementStrength`, `_Parallax`                                                                                                |
| divers              | `_GlitterSize`, `_FoilMidToneStrength`, `_FoilHighlightStrength`                                                                        |

### Ce qui n'est pas portable, et pourquoi

`_FoilDisplacementStrength`, `_Parallax`, `_VarnishBevelStrength` et
`_VarnishOutlineStrength` sont des opérations de **géométrie et d'éclairage 3D**
— déplacement de surface, biseau éclairé, contour. Une pile de `mix-blend-mode`
CSS ne sait pas les faire : elle compose des images, elle ne modèle pas une
surface. Copier ces shaders n'est pas « difficile », c'est sans objet.

**L'app vaut donc comme spécification, pas comme source à porter.** Elle dit
quels effets existent et quels axes les séparent ; le viewer web reste la seule
source directement transposable, et nos recettes lui correspondent déjà
déclaration par déclaration (`holoShaderParity.test.ts`).

Gain réel de ce dump : deux finitions enfin rendues correctement, un garde qui
empêche qu'un look transcrit reste débranché, et une liste d'axes pour la salle
d'essai.
