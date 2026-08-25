> **Archivé le 2026-08-24** — Audit soldé : le CDN Steam est mort, impasse documentée.

Analyse — archive Dragon Ball Super Card Game / LeStream / CardGame.fr

Contexte

Je cherche à récupérer le maximum de contenu historique du site CardGame.fr, un ancien site consacré à Dragon Ball Super Card Game, notamment utilisé autour des émissions LeStream avec Maxildan.

Le site servait notamment à créer/consulter des decklists et était référencé à l’époque par le site officiel Dragon Ball Super Card Game.

Une ancienne page Steam Workshop correspond à un mod Tabletop Simulator :

- Nom : Dragon Ball Super : Card Game FR
- Workshop ID : 1552795176
- URL : https://steamcommunity.com/sharedfiles/filedetails/?id=1552795176
- Le Workshop est aujourd’hui supprimé/inaccessible, mais son existence est confirmée par les anciennes traces indexées.
- La description du Workshop indique que les decks étaient liés aux contenus publiés sur cardgame.fr.

Fichier fourni

Copie locale (gitignored) : `data/dbs/cg/staging/tts/WorkshopUpload`
(353 Ko, save TTS 11/2/2018). **14 decks** (Beerus, Broly, Cell, Ginyu, Goku GT,
Goku SSB, Golden Freezer, Metal Cooler, Mira, Univers 2/7, Vegeta SSB, Vegeto,
Buu) — planches TTS, pas un fichier par carte.

**CDN 2026-08-14** : les 21 URLs `cloud-3.steamusercontent.com` sont mortes
(HTTPS cert Akamai / HTTP 403 / miroirs 404). Wayback vide. Pas de dump
récupérable depuis Steam.

L’analyse du fichier montre qu’il ne s’agit pas simplement d’une référence vide : il contient réellement des données permettant de reconstruire une partie du contenu.

Ce que contient le fichier

J’ai notamment trouvé :

Decks

Deux decks sont explicitement présents :

- Deck Beerus
- Deck Broly

Les cartes sont représentées comme des objets Tabletop Simulator.

Assets

Le fichier contient environ 21 URLs uniques pointant vers des ressources steamusercontent.com.

Les URLs originales Steam sont encore présentes dans les données, notamment sous la forme :

https://cloud-3.steamusercontent.com/...

Cela signifie que le fichier conserve les références aux images/assets utilisés par le mod.

Il y a également une référence au tapis de jeu.

Hypothèse importante

Le fichier TTS peut donc servir de point de départ pour reconstruire une archive autonome du contenu historique.

L’objectif serait idéalement de :

1. Parser le fichier.
2. Extraire toutes les URLs steamusercontent.com.
3. Télécharger les assets lorsqu’ils sont toujours accessibles.
4. Identifier à quoi correspond chaque asset :
   - carte
   - verso de carte
   - leader
   - tapis
   - autre élément graphique
5. Extraire les informations des cartes/decks présentes dans les objets TTS.
6. Conserver les noms et métadonnées.
7. Construire une arborescence propre.
8. Générer éventuellement un .zip.
9. Si possible, retrouver d’autres fichiers du Workshop ou des archives de cardgame.fr pour compléter ce qui manque.

Limitation actuelle

Le Workshop Steam original semble avoir été supprimé.

L’URL historique :

https://steamcommunity.com/sharedfiles/filedetails/?id=1552795176

ne permet donc plus nécessairement de récupérer directement le Workshop depuis Steam.

Cependant, les références aux assets Steam sont encore présentes dans le fichier fourni, ce qui pourrait permettre de récupérer une partie du contenu indépendamment du Workshop.

Piste à explorer en priorité

Chercher si les assets steamusercontent.com référencés dans le fichier sont toujours accessibles.

Si oui, il serait possible de faire un script Python du genre :

save TTS
↓
parser JSON
↓
extraire URLs steamusercontent.com
↓
dédupliquer
↓
télécharger les assets
↓
identifier/classer les images
↓
reconstruire decks + cartes
↓
archive autonome

Ce que j’aimerais idéalement obtenir

L’objectif final n’est pas seulement de récupérer le Workshop TTS.

J’aimerais essayer de reconstituer le maximum du contenu historique de CardGame.fr, notamment :

- toutes les cartes accessibles
- images des cartes
- decks
- decklists
- données/métadonnées
- assets graphiques
- éventuellement les pages du site si elles sont récupérables via Wayback Machine
- éventuellement les contenus liés aux émissions LeStream / Maxildan

Il faudrait donc croiser plusieurs sources :

- le fichier TTS fourni
- Steam Workshop 1552795176
- steamusercontent.com
- Wayback Machine
- anciennes pages indexées de cardgame.fr
- éventuels mirrors
- GitHub
- anciennes ressources publiques liées au projet

Fichier source

Le fichier analysé est celui fourni dans cette conversation :

/mnt/data/WorkshopUpload

Il faut partir de ce fichier, et non supposer que le Workshop Steam est encore disponible.

Résultat déjà établi

Le point le plus intéressant est que le fichier TTS contient encore les URLs des assets Steam. Il constitue donc une source exploitable pour tenter de reconstruire le contenu historique, même si la page Workshop originale a disparu.

⸻

Objectif : déterminer jusqu’où il est possible de récupérer/reconstituer l’ancien CardGame.fr à partir de ce fichier et des archives publiques, puis automatiser la récupération des ressources.
