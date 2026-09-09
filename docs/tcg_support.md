# Support TCG — conception

> Statut : foil CSS+WebGL livrés pour **Lorcana** et **Pokémon** (2026-08).  
> Livré : `printKey`, providers, Face/Dos (`print > set > pack`), packs sous
> `effects/<id>` + `core/render/foil` — voir [foil_effects.md](foil_effects.md).  
> Ouvert : regroupement doublons, langue exemplaire, raffinage fidélité CSS
> (simey / site) vs Unity.
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

| Jeu                                | Provider                                                                | Données FR            | Images FR                            | Variantes                             | Prix                              | Clé                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------- | --------------------- | ------------------------------------ | ------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Pokémon                            | [TCGdex](https://tcgdex.dev/) + `pokemontcglive` (catalogue local Live) | ✅ vérifié            | ✅ vérifié                           | ✅ `variants_detailed` + `variantId`  | ✅ Cardmarket **EUR** + TCGplayer | aucune                                                                                                |
| Lorcana                            | [LorcanaJSON](https://lorcanajson.org/)                                 | ✅ FR/DE/IT           | ✅ toutes langues stockées           | ✅ `foilTypes` + **`foilMask`**       | ❌ (métadonnées)                  | fichiers                                                                                              |
| Lorcana                            | [Play-In](https://www.play-in.com/)                                     | ✅ FR                 | ✅                                   | stock Mint / FOIL                     | ✅ EUR retail (scrape)            | scrape                                                                                                |
| Lorcana                            | [Lorcana.gg](https://lorcana.gg/cards/) (DotGG)                         | EN catalogue          | ✅                                   | `cmPrice` / `cmFoilPrice`             | ✅ Cardmarket **EUR** (dump API)  | dump + printKey                                                                                       |
| Lorcana                            | [Lorcast](https://lorcast.com/docs/api/cards)                           | ❌ EN seulement       | ✅ AVIF, sans masque                 | prix foil + non-foil                  | ✅ TCGplayer USD → EUR `~`        | aucune — sert aussi de **remplissage catalogue** (28 tirages que LorcanaJSON ignore, voir § 6 bis)    |
| Magic                              | [Scryfall](https://scryfall.com/docs/api)                               | ✅ vérifié            | ✅                                   | ✅ `finishes: nonfoil/foil/etched`    | ✅                                | UA requis                                                                                             |
| Yu-Gi-Oh                           | [YGOPRODeck](https://ygoprodeck.com/api-guide/)                         | ✅ noms               | EN                                   | sets + raretés                        | ✅                                | aucune                                                                                                |
| Dragon Ball Super (Masters)        | Bandai europe-fr cardlist (`dbscg`) + Deckplanet                        | ✅ FR                 | ✅ dump 260×364 (SAMPLE en fallback) | `_SPR` / `_PR` + finish `foil` maison | ❌                                | scrape local — [dragon_ball_super_card_game.md](dragon_ball_super_card_game.md)                       |
| Dragon Ball Super (Fusion World)   | Bandai fw/en cardlist (`dbsfw`)                                         | EN (pas de `/fw/fr/`) | ✅ SAMPLE WebP                       | `_P1` + finish `foil` maison          | ❌                                | scrape local — même doc                                                                               |
| One Piece, Dragon Ball FW (apitcg) | [apitcg.com](https://apitcg.com/)                                       | ?                     | SAMPLE Bandai                        | ✅                                    | ?                                 | clé — OPTCG [one_piece_tcg.md](one_piece_tcg.md) ; FW Placarr = `dbsfw` (cardlist Bandai, pas apitcg) |
| One Piece, Gundam, etc.            | [Scrydex](https://scrydex.com/)                                         | ?                     | ?                                    | ✅                                    | ✅                                | **payant**                                                                                            |
| Naruto (CACG / multi-lignes)       | pas d’API catalogue (Coleka / nikita / TCDB)                            | FR partiel            | community                            | foil physique                         | estimates / eBay                  | pack `naruto` + sets `s*` + lang `fr                                                                  | en  | jap` — [naruto_carddass_tcg.md](naruto_carddass_tcg.md) |

Ça tombe pile dans le registre existant : **un module par jeu**, chacun
déclarant `types: ["tcg"]`. Aucun concept nouveau côté providers.

Sur la couverture par jeu (sondé le 2026-07-26) : **Pokémon** est le mieux
servi — TCGdex répond en français sur la recherche par nom (112 résultats pour
« Dracaufeu »), sans clé. **One Piece** reste surtout apitcg.com (clé) —
[one_piece_tcg.md](one_piece_tcg.md). **Dragon Ball Fusion World** a un module
Placarr (`dbsfw`, cardlist Bandai) ; apitcg est une source alternative.
Faces DBS (Masters : dump Deckplanet ; FW : SAMPLE Bandai ; `cardgame.fr`) :
[dragon_ball_super_card_game.md](dragon_ball_super_card_game.md).

Deux remarques qui comptent :

- **TCGdex est le meilleur du lot** et il est gratuit sans clé : images FR
  servies (`assets.tcgdex.net/fr/...`, vérifié 200), variantes détaillées avec
  un id par variante, et surtout **des prix Cardmarket en euros**, ce qui colle
  au reste de l'app là où TCGplayer est en dollars.
- **Lorcana croise LorcanaJSON + Lorcast + Lorcana.gg + Play-In.** LorcanaJSON
  stocke titres et jaquettes **FR/EN/DE/IT** pour le même `printKey`. Lorcast
  apporte les prix TCGplayer en **USD** (fallback FX `~`). **Lorcana.gg**
  (dump DotGG) apporte les cotes Cardmarket en **EUR** natives — utile sur les
  promos sans TCGPlayer. **Play-In** contribue en EUR retail via
  `/fr/carte/…`, matché sur `printKey`.

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

**Clé de regroupement** — deux exemplaires fusionnent seulement s'ils sont
**strictement** le même objet **et** le même état :

| Axe                                | Dans la clé ? |
| ---------------------------------- | ------------- |
| Métadonnée (la carte, le jeu)      | ✅            |
| Variante (finition, édition)       | ✅            |
| Langue de l'exemplaire             | ✅            |
| **État** (neuf / occasion / abîmé) | ✅            |

Décidé 2026-08-12 : pas de « 3 Elsa » mélangeant neuf et occasion — un groupe
= même identité + même finition + même langue + **même `Condition` à 100 %**.
La vignette affiche p.ex. `Elsa foil ×3` (tous neuf) ; le détail du groupe
liste les exemplaires (prix d'achat, prêt). Corollaire : plus besoin de
« (copie) » dans le titre.

**TCG — état masqué, cote par finition (2026-07-31).** Sur les singles,
neuf / occasion n'est pas le levier utile (tu déblister pour savoir ce que
c'est). L'UI masque le chip / sélecteur d'`Condition` pour `shelfType ===
"tcg"` ; le prix héros lit le bucket market de la finition (`Item.variant` →
offres `foil` vs `new`, EUR natif puis FX `priceEstimatedFoil` /
`priceEstimated`). Même principe que l'axe variante livré — voir
[backlog.md](backlog.md) « Variantes par exemplaire ».

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
  `images.foilMask` par carte (API Ravensburger). On **scrape brut** sous
  `data/lorcana/foil/cards/{printKey}/` et on sert `/foil/lorcana/cards/…`
  (local-first — [data-layout.md](data-layout.md)). Le JPEG publié n’a pas
  d’alpha ; le runtime fait l’équivalent de `generate Safari mask` côté
  client (comme `cards.disneylorcana.com`), pas un bake au scrape.
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

**Pokémon** : identité / prix via TCGdex ; recettes foil + front Live + dos pack
via pack `pokemon` (TCG Live CDN / APK — [archive/tcglive_effects.md](archive/tcglive_effects.md),
[data-layout.md](data-layout.md)). Pas de masques first-party type LorcanaJSON
côté catalogue TCGdex.

## 6. Le dos de carte

Les dos sont résolus **au niveau item / tirage**, pas à l’étagère :

1. **Print** — alt face / dos spécifique (`PrintCandidate.cardBackUrl`), ex. leader DBS
2. **Set** — `EffectPack.resolveCardBack({ setCode, printKey })` quand le jeu change de verso par extension
3. **Pack** — `EffectPack.cardBackUrl` **obligatoire** (contrat) : `/foil/<pack>/card_back.webp` extrait du dump

`resolveCardBackUrl` / `pickDefaultCardBack` classent print > set > pack. Le défaut système n’est pas supprimable ; sans URL résolue la carte **s’incline** mais **ne tourne pas** au clic.

Plein écran : onglets **Face / Dos** (+ flip). Grille : le dos pack/set peut servir de **skeleton** le temps que la face charge (une URL partagée pour des milliers de cartes).

**Dump** : chaque chantier foil doit chercher et extraire les backs (APK / bundles / CDN / catalogue) — au minimum le défaut jeu.

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
- **`foilEffectColors` + `images.varnishMask2`** (août 2026) : teinte(s) du
  vernis stampé et second masque. Rien d'autre ne les prédit. Plus besoin du
  scrape SSO catalogue Ravensburger.
- **Le catalogue n'est pas complet** (mesuré le 2026-08-21, remonté par un
  utilisateur qui cherchait `36/P2`). LorcanaJSON ignore 28 tirages réellement
  imprimés : six promos P2 — dont les deux _Mickey Mouse – True Friend_, `15` et
  la promo puzzle `36` —, quatre C2, et les dix-huit cartes du **Format
  Coconut**, un set promo entier. Aucun ne se voyait dans l'appli, et rien ne le
  signalait. Lorcast les publie ; `lorcanatcg/lorcastFill.ts` les verse en
  **remplissage seul**, sans jamais contredire un fait de LorcanaJSON. Restent
  ouverts `25/P1` et `5/C1`, attestés par dotgg seul.
- **La référence imprimée ne se cherchait pas.** Taper `36/P2` rendait zéro, et
  `18/P2` aussi — donc les 189 promos que LorcanaJSON tenait **déjà**, pas
  seulement les 28 ajoutées par le remplissage. Aucune colonne ne porte
  l'identifiant sous cette forme, et `12/204` échouait pour une autre raison :
  le second segment est la **taille du set**, pas son code.
  `collectorQueryClause` (`lorcanatcg/indexStore.ts`) traduit les deux formes en
  une clause SQL. À savoir pour qui chercherait l'origine de ce comportement :
  il est arrivé avec `d7cb3467`, dont le message ne le mentionne pas.
- **L'APK ne porte aucune base de cartes** (mesuré le 2026-08-21, en cherchant la
  finition de `36/P2`). Les bundles Unity ne contiennent que l'UI, la
  localisation, les shaders et les textures : `datapack.unity3d` a 7 `TextAsset`
  — le plus gros est `LorcanaLocalization` — et `data.unity3d` six, tous des
  politiques de confidentialité ou des crédits. L'appli **télécharge** ses
  cartes. Ce que le dump apporte, c'est la _mécanique_ du foil : douze types
  (`CardFoilSilver`, `CardFoilGlitter`, `CardFoilLava`…) et un atlas de masques
  partagé, pas un masque par carte. Le type, lui, est une donnée de carte, donc
  hors APK. Inutile d'y rechercher un tirage : la question « telle carte est-elle
  dans l'appli ? » n'a pas de réponse dans les fichiers qu'on possède.
- **LorcanaJSON ne publie pas les sets promo comme sets.** Amont du 2026-08-15
  (format 2.3.5) : 3242 cartes, `setCode` ∈ {1…13, Q1, Q2} — ni `P1`, ni `P2`,
  ni `C2`, ni Coconut. **Chercher un promo par `setCode` ne rend donc rien, et
  c'est un faux négatif** : les promos sont bien là, 185 d'entre elles, sous
  `promoGrouping`, rangées sous l'extension de la carte réimprimée. La bonne
  requête énumère ce champ, et elle donne `P1` 1–40 (sans 25), `P2` 1–35
  (sans 15, 16, 17 ; 24 et 26 en double pour leurs variantes), `P3` 1–60,
  `P4` 9–16, `C1` 1–10 (sans 5), `C2` 1–10, plus `CC1`, `D23`, `DIS`, `PD1`.
  Les deux manques de `P1` et `C1` tombent pile sur `25/P1` et `5/C1`, les deux
  trous déjà connus par dotgg — la méthode se valide d'elle-même. Aucun des
  quatre dumps de langue (en 3242, fr 3160, de 3160, it 2757) ne porte de `P2`
  au-delà de 35, et `promoSourceCategory` n'a que sept valeurs — D23, Organized
  Play, Promo, Disney 100, Challenge, Disney Cruise, Disney Parks & Stores —
  dont aucune ne couvre les encarts de puzzle. Les 23 tirages que notre base range en `promo_grouping = P2` avec
  `["Silver"]` sont des cartes de sets numérotés (`5-1`, `5-2`…) réimprimées en
  promo, pas le set P2 lui-même. Le trou est donc **structurel**, pas un fetch
  périmé : re-tirer LorcanaJSON ne le comblera jamais.
- **Lorcast n'a pas de champ de finition.** Ses 28 champs vont de `cost` à
  `purchase_uris` ; aucun ne dit le foil. Seule la forme des prix informe, et
  indirectement : sur le set 1, les 204 cartes ont `usd` **et** `usd_foil` ; sur
  P2, aucune des 36 n'a les deux (30 foil seul, 3 normal seul, 3 sans prix) — les
  promos sont donc mono-finition. `15/P2` n'est coté qu'en non-foil (66,41 $) et
  `36/P2` pas du tout. Cela dit qu'une finition existe, jamais **laquelle** :
  c'est pourquoi ces 28 restent sans type plutôt que de recevoir le `Silver`
  majoritaire.
- **`15/P2` et `36/P2` sont deux impressions distinctes**, pas un doublon : deux
  identifiants Lorcast, même date (2024-08-09), mêmes stats, mais `15` a le cadre
  noir standard et l'encart de texte vide, quand `36` a un cadre doré pailleté et
  un texte d'ambiance. La check-list a raison de les compter séparément.
- **Une finition peut venir de l'exemplaire physique.** Ni LorcanaJSON ni Lorcast
  ne diront jamais celle des vingt-huit tirages bouchés ; une carte en main, si.
  `curated/attestedFinishes.json` porte ces observations, versées par
  `curated/attestedFinishes.ts` en toute fin de `scrapeCards`, **jamais** sur un
  tirage qui déclare déjà quelque chose. Ce qui est stocké est une **relation**,
  pas un type : l'œil constate « même finition que cette carte-là », pas
  `Glitter`, qui est un nom interne à LorcanaJSON. Le type se résout au build
  depuis la carte de référence et la suit si l'amont la corrige. Premier cas :
  `36/P2` reprend le `Glitter` de `25/P2` (Lilo – Escape Artist), attesté par le
  propriétaire et corroboré par le visuel — les deux portent le cadre doré semé
  d'étoiles, que `15/P2` n'a pas et qui reste donc sans finition.
- **Un tirage bouché par Lorcast n'a pas de masque de foil**, Lorcast n'en
  publiant aucun. Conséquence de rendu, mesurée : `CardFoilGlitter` lie
  `_MotifMask` en rôle `foilMask`, donc `foilSurfacesReady` refuse le WebGL — et
  le pack Lorcana ne déclare pas de `fallbackFoilMaskUrl`, contrairement à
  `dbscg`, `narutocarddass` et `pokemon`. La carte retombe sur la recette CSS, qui
  n'utilise que la texture partagée `glitter`. Le foil s'affiche donc, mais
  **non masqué** : sur toute la carte au lieu des seules zones foilées. Y
  remédier voudrait dire soit une source de masques pour ces vingt-huit, soit un
  masque de repli pour le pack — un choix qui les concernerait tous les
  vingt-huit, pas seulement `36/P2`.
- **Emprunter le masque d'une autre impression de la même carte : mesuré, et
  non.** L'idée tient debout — `Mickey Mouse – True Friend` existe en `1-12`,
  `9-13` et `1-10-p3`, tous avec masque — mais elle bute sur deux murs. D'abord
  la géométrie : corrélation des illustrations en niveaux de gris, meilleur
  décalage cherché en force brute sur ±28 px, deux tirages au **même** cadre
  donnent 0,978 à décalage nul (`1-12` vs `9-13`) et encore 0,887 en traversant
  les sources (`1-12` JPG local vs `15/P2` AVIF Lorcast) — donc ni le format ni
  la compression ne faussent la mesure. `1-12` vs `36/P2` tombe à 0,638, et
  `15/P2` vs `36/P2`, mêmes octets d'origine, à 0,648 : aucun décalage ne
  rattrape ça, la promo **recadre** l'illustration. Un masque est une carte par
  pixel ; décalé, il foile les mauvais. Ensuite la nature de l'objet : un masque
  `Silver` et un masque `Glitter` ne sont pas la même chose. Le premier est un
  pochoir dur, borné à la fenêtre d'illustration, moitié basse entièrement
  noire ; le second couvre la carte entière, texte et bordure compris. Même
  parfaitement aligné, le masque `Silver` foilerait les mauvaises **zones**.
- **Générer le masque depuis l'illustration : pas assez.** Le masque `Glitter`
  en dérive visiblement — 0,833 sur Lilo `25/P2`, 0,742 sur Mickey `18/P2`
  contre l'illustration désaturée — mais pas au point d'en être une fonction
  (`Silver` `1-12` tombe à 0,367, `SeaWave` `8-P2` à 0,601). L'écart, ce sont des
  retouches délibérées ; le reproduire serait inventer.
- **Ce qui marcherait, en revanche :** un masque **se transfère** entre
  impressions qui partagent le cadre, et le seuil est net (≈0,89–0,98 contre
  ≈0,64). Aucun des vingt-huit tirages sans masque n'est aujourd'hui dans ce cas
  **avec** une finition à dessiner, mais la règle vaut si l'un le devient.
- **La source des masques est l'API officielle Ravensburger**, et elle est
  ouverte. `GET https://api.lorcana.ravensburger.com/v3/catalog/{fr,en,de,it}`
  (~4,3 Mo, sans authentification, l'`User-Agent` de `setLogos.ts` suffit) rend
  `cards.{actions,characters,items,locations}[].variants[]`, chaque variante
  portant `variant_id` (`Regular` / `Foiled` / `StarterFoil`), **`foil_type`** et
  **`foil_mask_url`**. C'est de là que viennent nos masques, via LorcanaJSON —
  le dépôt n'utilisait cet endpoint que pour les logos de sets. Il confirme de
  première main le `Glitter` de `25/P2`, masque compris.
- **Fouille du 2026-08-22 : le masque de `36/P2` n'existe nulle part, et c'est
  structurel.** Les quatre catalogues de langue plafonnent P2 à 35 (plus
  `24A`/`24B`) — aucun ne porte nos six. Interrogé par `deck_building_id`
  (`a393e1fb…`), qui relie les impressions d'une même carte, l'officiel ne
  connaît que trois `Mickey Mouse – True Friend` : `12/204`, `13/204` et
  `10/P3`. La raison : `36/P2` est un **encart de puzzle**, glissé dans les six
  puzzles « Glimmers of the Realm », d'abord à Destination D23 en 2025. C'est de
  la marchandise, pas un produit que l'appli suit — et un masque n'existe que
  parce que Ravensburger le fabrique pour l'appli. Pas de fiche, donc pas de
  masque, nulle part. Vérifié en aval : Lorcast ne rend que trois tailles d'une
  même image plate et aucun champ de finition ; `lorcana-api.com` n'a ni promos
  ni champ de masque (2 694 cartes) ; les projets communautaires
  (LorcanaCardCollector, LorcanaPygres, lorcanadb, disney-lorcana-datahub)
  moissonnent tous cette même API et héritent du trou. Inutile de recommencer.
- **Deux constats à côté, dans la même fouille.** Les `C2` 15-18 versés par
  Lorcast (`Stand Out`, `Down In New Orleans`, `The Headless Horseman`,
  `Tinker Bell`) sont des cartes **franchement différentes** des `C2` 1-10
  officielles (Pegasus, Elsa, Mulan, Simba, Dragon Fire, Let it Go) : le piège du
  set `cp` ne s'est pas répété, aucun fantôme. Et les dix-huit `coconut_cards`
  du catalogue ont un schéma à part — trois URL d'image, **pas de `variants`** —
  donc leur absence de `foil_type` ne prouve rien sur leur finition ; c'est une
  piste à instruire, pas un fait.

- **Les sets d'une promo ne se recouvrent pas d'une source à l'autre.**
  LorcanaJSON range une promo sous l'extension de la carte qu'elle réimprime
  (`10/P3` → set 1) ; Lorcast n'a que le code imprimé (`P3`). L'extension de base
  n'est pas récupérable depuis Lorcast, donc un tirage venu de lui est rangé sous
  son code imprimé et apparaît comme sa propre extension. Corollaire : le set
  `cp` de Lorcast n'est **pas** fusionné — ce sont les neuf cartes de `C1`,
  numérotées autrement (`25/41/42/43` contre `1/2/3/4`).

## 7. Découpage proposé

1. **Lorcana FR de bout en bout** : ajout par recherche, `printKey`, images
   multi-langues, finitions, prix ≈ via Lorcast (USD→EUR `~`).
2. **Plein écran** : effet holo masqué + dos + retournement 3D.
3. **Pokémon via TCGdex** : apporte les prix en euros natifs et les variantes
   `reverse`/`holo` en prime.
4. **Magic / Yu-Gi-Oh**, puis Scrydex si on veut One Piece & co.
   Produits scellés déjà crawlables (famille TCG Cards) via Catalogue Sync
   (admin / worker — `scrapeTcgCardsProducts`).

## 8. Décisions prises (2026-07-26)

- **Doublons** : N items, regroupés à l'affichage. Voir §4.
- **Prix** : pas de câblage spécial par jeu. Un provider `types: ["tcg"]` avec
  capacité prix (Lorcast) est appelé par le flux normal. **Devise** : moyenne /
  consensus uniquement en EUR ; conversion FX hors moyenne, affichée en `~`.
  Lorcast indexe les promos sous des sets `P1`/`P2`/… (`P2/24`), pas sous
  `7/24bp2` — le lookup prix mappe `printKey` `…-pN` vers ce schéma. Le job
  prix relit `printKey` + aliases depuis l'item (pas seulement le payload
  d'enqueue) pour ne pas rater un match après enrichissement multi-langue.
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

**Correction (2026-07-30, deuxième passe)** : la première lecture affirmait que
le code des shaders était « de toute façon compilé en bytecode GPU ». C'est
faux, et l'erreur a coûté : un build Android cible `GLES3Plus`, et pour cette
cible Unity embarque les programmes en **GLSL texte intégral**
(`#version 300 es`) dans le blob LZ4 du shader — le dialecte exact de WebGL2.
Les huit shader graphs sont donc récupérables **et exécutables tels quels dans
le navigateur** : deux macros à basculer (`HLSLCC_ENABLE_UNIFORM_BUFFERS`,
`UNITY_SUPPORTS_UNIFORM_LOCATION`), zéro math transcrite. La leçon générale :
**vérifier la plateforme de compilation avant de déclarer un blob illisible** —
`kShaderCompPlatformGLES3Plus` = texte, Vulkan = SPIR-V (décompilable aussi,
via spirv-cross).

### Vocabulaire complet

**Finitions (13)** — Silver, Satin, Lore, Lava, Magma, Glitter, VerticalWave,
SeaWave, RainbowPillars, FreeForm1, FreeForm2, **Tempest**, **CalendarWave**.
Les deux dernières manquaient à `FINISH_SHADERS` et tombaient sur `silver`.

**Vernis (6)** — HighGloss, MatteHotFoil, MetallicHotFoil, SnowHotFoil,
RainbowHotFoil, ChromeRainbowHotFoil. Notre table était complète.

### L'architecture diffère du viewer web

Le web a **une recette CSS par finition**. L'app a **8 shader graphs pour 23
matériaux** (dont `OwnedIndicatorFoiled`, indicateur UI hors cartes) : plusieurs
finitions partagent un graph et ne se distinguent que par leurs réglages.
`CardFoilLore` est le cheval de trait — il sert CalendarWave, SeaWave, Magma et
les variantes Lore. Le port web couvre les **22 matériaux carte**.

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

### Ce qui n'est pas portable **en CSS** — et l'est en WebGL

`_FoilDisplacementStrength`, `_Parallax`, `_VarnishBevelStrength` et
`_VarnishOutlineStrength` sont des opérations de **géométrie et d'éclairage 3D**
— déplacement de surface, biseau éclairé, contour. Une pile de `mix-blend-mode`
CSS ne sait pas les faire : elle compose des images, elle ne modèle pas une
surface. Cette limite est celle du médium CSS, pas de la source : les fragments
extraits les font, puisqu'ils _sont_ le code qui les fait.

### Le port réel : `core/render/foil` + `effects/lorcana`

Pipeline : Catalogue Sync Lorcana (admin / worker) — pack complet (web CSS +
cards + Unity si APK). L’admin n’expose qu’un bouton **Lorcana**.

Sorties :

- `data/lorcana/foil/shaders/*.frag` — fragments app, variantes de keywords
  (`_VARNISHTYPE_*`, `_HOTFOILSURFACE_*`, `USESECONDTOPLAYER`…), **Tilt** et
  **Time** (`_SCROLLMODE_*`). Servis en `/foil/lorcana/…`.
- `data/lorcana/foil/manifest.json` — matériaux carte (généré, gitignoré ;
  écrit par Catalogue Extract), textures / floats / couleurs filtrés
  data-driven. Slots par-carte (`_Motif`, masques…) = rôles runtime.
- `data/lorcana/foil/textures/*.{webp,astc}` — dual WebP lossless + ASTC.
- `data/lorcana/foil/card_back.webp` — dos pack ; produit : `resolveCardBack`
  préfère le dos d'étagère.

Côté runtime, `core/render/foil/webgl/renderer.ts` compile les deux programmes,
pilote `_Tilt` / `_CosTime` / `_DeviceRotationDegrees` (compas `alpha`), et
applique le sampler state dumpé (Repeat + Bilinear sur les foils APK, mips
là où `m_MipCount > 1`). Il ne connaît aucun shader par son nom — tout passe
par la réflexion du programme (`getActiveUniform`). En produit, `FoilCardImage`
choisit WebGL2 par défaut quand le matériau et le pool le permettent, sinon
la pile CSS complète. Banc admin : `/admin?tab=catalogue` — backends
**Auto | Unity | Web**.

Les recettes CSS (`effects/lorcana/cssRecipes`) servent partout où WebGL2 manque
ou est forcé en mode Web ; `holoShaderParity.test.ts` continue de les pinner
sur la feuille de style de l'éditeur. Les deux sources coexistent dans la
salle d'essai, jugées côte à côte.

Décisions de fidélité à connaître pour juger le rendu :

- **Espace colorimétrique : Gamma.** `PlayerSettings` n'est pas lisible par
  UnityPy sur ce build, mais `m_LightsUseLinearIntensity: False` et des
  constantes de shader manifestement écrites pour des valeurs gamma pointent
  là. Aucune conversion sRGB→linéaire n'est faite, ni nécessaire à l'œil.
- **Idle = Time, interaction = Tilt.** Au repos le programme Time anime via
  `_CosTime` ; sous le pointeur / gyro on bascule sur Tilt. L'amplitude
  pointeur reste calibrée sur `_TimeFactor` (= 0.4).
- **Une carte hors écran rend son contexte WebGL** (IntersectionObserver) : le
  navigateur en tolère ~16, une grille se serait évincée elle-même.

Le chemin canonique est `effects/lorcana` + `core/render/foil` (`FoilCardImage`).

### Pokémon — pack `pokemon` (TCG Live)

> Détail : [archive/tcglive_effects.md](archive/tcglive_effects.md) · layout : [data-layout.md](data-layout.md).

Le client officiel des cartes physiques expose 23 shaders
`TPCi/Cards3D/HoloFoil/*` (GLES3) + masque / type de foil par carte.

- Sync : Catalogue Extract Pokémon (admin / worker)
- Store : `data/pokemon/foil/` → `/foil/pokemon/…`
- JSON : `src/effects/pokemon/cards.json` (généré)
- Catalogue : TCGdex (`src/providers/tcgdex`) ; série digitale Pocket (`tcgp`) exclue (`digitalOnly.ts`)
- Join identité : `data/pokemon/live-cards.sqlite` — le provider `pokemontcglive` (`src/providers/pokemontcglive/index.ts`, supplyMode `local_catalog`, hook `catalog`) ingère le catalogue local Live ; TCGdex reste le catalogue API.

**Médias sur `PrintCandidate`** (TCGdex + Live) :

| Champ                         | Source                                                                     |
| ----------------------------- | -------------------------------------------------------------------------- |
| Face (`imageUrl` / variantes) | Front Live dump (`cardTex`) si joint, sinon scan TCGdex                    |
| Dos (`cardBackUrl`)           | Pack `/foil/pokemon/card_back.webp` (Texture2D `cardBack` dans `base.apk`) |
| Foils                         | `finishShaders` + `finishFoilMaskUrls` depuis le dump Live                 |
| Attachments                   | `tcgdex-scan` + `tcglive-front` quand les deux existent                    |

**Pocket (app)** : code et docs handoff **retirés** — cartes jamais imprimées.

### Refaire pareil pour le prochain jeu

1. Source d’assets (CDN / APK) sans ADB dans le produit si possible.
2. `strings` / manifest → vocabulaire (finitions, vernis, classes).
3. Plateforme shader : GLES3+ = GLSL → WebGL2 ; Vulkan = SPIR-V → spirv-cross.
4. Pack sous `src/effects/<id>/` + `data/<id>/foil/` ; register dans `effects/`.
5. Les slots par-carte demandent l'équivalent du `foilMask` LorcanaJSON ;
   sans masque par carte, l'effet ne se confine pas (cf. §5 bis).
