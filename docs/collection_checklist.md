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
