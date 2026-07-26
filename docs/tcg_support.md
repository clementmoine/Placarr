# Support TCG — conception

> Statut : **proposition**, aucun code écrit. Les APIs ont été sondées en direct
> le 2026-07-26 (réponses réelles, pas de la doc lue en diagonale) ; tout ce qui
> est marqué « vérifié » a été appelé.

## 1. Le vrai problème : il n'y a pas de code-barres

Toute la chaîne d'identification part d'un EAN/UPC : `BarcodeCache`, les
`buildBarcodeTasks` des providers, le moteur de consensus, le corpus de
régression. **Une carte à l'unité n'a jamais de code-barres** (seuls les
produits scellés en ont un).

Mais une carte a une identité tout aussi stable, c'est juste une clé composite :

```
jeu / set / numéro de collection / langue        → « print identity »
```

`swsh3-136 · fr` désigne exactement une carte, partout, pour toujours. C'est
l'ancre qui remplace le code-barres.

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

| Jeu                     | Provider                                        | Données FR      | Images FR      | Variantes                            | Prix                              | Clé        |
| ----------------------- | ----------------------------------------------- | --------------- | -------------- | ------------------------------------ | --------------------------------- | ---------- |
| Pokémon                 | [TCGdex](https://tcgdex.dev/)                   | ✅ vérifié      | ✅ vérifié     | ✅ `variants_detailed` + `variantId` | ✅ Cardmarket **EUR** + TCGplayer | aucune     |
| Lorcana                 | [LorcanaJSON](https://lorcanajson.org/)         | ✅ FR/DE/IT     | ✅ officielles | ✅ `foilTypes` + **`foilMask`**      | ❌                                | fichiers   |
| Lorcana                 | [Lorcast](https://lorcast.com/docs/api/cards)   | ❌ EN seulement | ❌             | prix foil uniquement                 | TCGplayer USD                     | aucune     |
| Magic                   | [Scryfall](https://scryfall.com/docs/api)       | ✅ vérifié      | ✅             | ✅ `finishes: nonfoil/foil/etched`   | ✅                                | UA requis  |
| Yu-Gi-Oh                | [YGOPRODeck](https://ygoprodeck.com/api-guide/) | ✅ noms         | EN             | sets + raretés                       | ✅                                | aucune     |
| One Piece, Gundam, etc. | [Scrydex](https://scrydex.com/)                 | ?               | ?              | ✅                                   | ✅                                | **payant** |

Ça tombe pile dans le registre existant : **un module par jeu**, chacun
déclarant `types: ["tcg"]`. Aucun concept nouveau côté providers.

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

## 4. Ce que le modèle actuel ne sait pas faire

- **La quantité.** Un collectionneur possède 4× la même carte. Aujourd'hui
  `Item` = un objet physique. Soit on crée 4 items, soit on ajoute une
  quantité — avec finition et état **par ligne**, sinon on perd l'information
  (2 normales + 1 reverse ≠ 3 exemplaires).
- **La langue de l'exemplaire.** Rien ne la porte aujourd'hui.
- **La gradation** (PSA / CGC / Beckett). L'enum `Condition` actuelle est
  pensée neuf/occasion ; le marché de la carte est piloté par la note.

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

## 6. Le dos de carte

Les dos sont **constants par jeu** (une image, parfois deux selon l'époque),
pas par carte — c'est quelques fichiers, pas un chantier de données. Un onglet
dédié en plein écran, avec un retournement 3D, est une petite feature isolée.

## 7. Découpage proposé

1. **Lorcana FR de bout en bout** : ajout par recherche, `printKey`, images,
   finitions. Sans prix.
2. **Plein écran** : effet holo masqué + dos + retournement 3D.
3. **Pokémon via TCGdex** : apporte les prix en euros et les variantes
   `reverse`/`holo` en prime.
4. **Magic / Yu-Gi-Oh**, puis Scrydex si on veut One Piece & co.

## 8. Décisions à prendre avant de coder

- **Quantité** : N items, ou un item avec quantité + lignes par finition ?
- **Prix Lorcana** : on croise LorcanaJSON (FR) et Lorcast (prix USD), ou on
  s'en passe pour la v1 ?
- **Cartes gradées** : dans le périmètre, ou plus tard ?
