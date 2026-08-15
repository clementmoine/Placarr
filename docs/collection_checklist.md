# Check-list de collection — « ce qui existe » vs « ce que j'ai »

Demandé le **2026-08-15**. Une vue par collection listant *tout ce qui existe*
— tous les jeux PS1, toutes les cartes Naruto — avec une case cochée quand on
le possède, une vignette, et un export imprimable.

C'est une **fonctionnalité utilisateur**, pas de la maintenance : à mettre dans
la roadmap, pas dans la dette.

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
