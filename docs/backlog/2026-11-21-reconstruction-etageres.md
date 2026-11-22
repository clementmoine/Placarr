# Reconstruction des étagères — ajout sans friction + catalogues (2026-11-21)

> **Priorité P0** — à attaquer **juste après** la remise en route de
> l'environnement (clone `~/Documents/Projets/Placarr`, `data/` restauré,
> base + workers + Sync qui tournent). Entrée résumée dans
> [`../backlog.md`](../backlog.md) § P0.

## Contexte

La base PostgreSQL a été perdue en novembre 2026 (réinstallation Docker
Desktop) puis recréée **vide** le 2026-11-18 ; les dumps antérieurs n'existent
pas. Les **catalogues** (`data/<pack>/`) sont re-dérivables par Sync, mais les
**étagères de l'utilisateur** (items, présence, prix payés, photos `uploads/`)
sont perdues : il faut tout ressaisir.

C'est l'occasion de rendre l'ajout aussi rapide que possible — la
reconstruction est le premier vrai test de charge de ce parcours.

## 1. Ajout rapide, en masse

But : remettre des centaines d'objets en étagère en un minimum de gestes.

- Mesurer d'abord le parcours actuel (scan barcode, PrintPicker, saisie libre,
  QuickScan) sur un vrai lot : nombre de taps et temps par item, points de
  blocage.
- Ajout en série : enchaîner les scans / recherches sans fermer la modale,
  étagère et valeurs par défaut (état, langue, présence) mémorisées d'un item
  à l'autre.
- Page **récap** commune à tous les ajouts en masse : liste de ce qui a été
  trouvé, confiance visible, correction / rejet ligne par ligne, validation
  groupée.
- Règle d'or inchangée : rien n'est ajouté sans confirmation ; un « non
  trouvé » honnête vaut mieux qu'une fausse identification.

## 2. Scan d'une page de classeur (multi-cartes)

Ouvrir la caméra sur une page de classeur (9, 12, 16, 18 cases… selon le
format) : détecter **toutes** les cartes, identifier chacune, puis afficher la
page récap (§1) pour accepter / corriger / rejeter et ajouter en masse.

Existant à réutiliser (voir `backlog.md` § reconnaissance visuelle) :
quad detect + multi-blobs déjà calculés côté classique, identify par index
d'embeddings (Catalogue Sync), file d'inférence sérialisée
(`maxInferInFlight: 1`). L'item P4 « Identify batch parallèle » devient un
prérequis de ce chantier.

À trancher :

- Détection de la grille : déduire le format (3×3, 4×4, 3×6…) ou laisser
  l'utilisateur le choisir ; gestion des cases vides et des pochettes
  brillantes (reflets).
- Débit sur iPhone : file sérialisée suffisante si le récap se remplit
  progressivement, ou 2e session ORT.
- Une photo par page vs balayage vidéo de la page.

## 3. Catalogues hors cartes — jeux vidéo d'abord

Monter les jeux vidéo au même niveau que les TCG : un corpus d'identité local
par plateforme (une checklist « tous les jeux Switch 2 »), alimenté par Sync,
cherchable à l'ajout.

- Sources déjà branchées comme index locaux : LaunchBox, iCollect, No-Intro,
  Full Set (`src/providers/fullset/`). Les promouvoir en vrais catalogues
  (même contrat que [`../catalogue_contract.md`](../catalogue_contract.md) :
  une base, Sync `living`, provenance par fait).
- Identité VG : barcode (EAN/UPC, souvent plusieurs par jeu selon la région),
  plateforme, région / édition, ids externes (IGDB, ScreenScraper,
  PriceCharting…). Équivalent du `printKey` à définir (ADR à écrire).
- Ensuite seulement : autres domaines (livres, BD, films, musique, jeux de
  société, LEGO).

## 4. « Pas au catalogue » — le chemin libre reste de première classe

Un objet absent du catalogue (ex. un jeu Switch 2 sorti hier) doit pouvoir
s'ajouter **sans attendre** : recherche web / providers classique (schéma
d'enrichissement actuel), ou saisie libre.

- L'item garde son **origine** : `catalogue` vs `manuel / enrichi providers`,
  visible dans la fiche.
- Ce chemin ne doit jamais être un cul-de-sac ni un second modèle de données :
  même `Item`, mêmes métadonnées, mêmes faits avec provenance.

## 5. Liaison automatique a posteriori

Quand une Sync fait entrer dans le catalogue un objet qu'un item manuel décrit
déjà, l'item doit être **relié automatiquement** puis rafraîchi depuis le
catalogue.

- Existant : après `catalogProviderSync`, `enqueuePrintCatalogPropagate`
  rafraîchit les items qui ont **déjà** un `printKey` ; « promote étagère →
  corpus » remonte un item vers le catalogue (sens inverse, avec
  confirmation).
- Manque : rattacher les items **sans** lien catalogue. Après chaque Sync,
  chercher les correspondances par identifiant fort — barcode, `printKey`,
  id externe (IGDB, TCGdex, Scryfall…).
- Identifiant fort et unique → lien automatique + rafraîchissement doux
  (préserver le titre, la cover et les champs saisis par l'utilisateur, comme
  `preserveUserCover`).
- Seulement titre + plateforme + date → **proposition** à confirmer, jamais
  de lien automatique (pas de faux positif confiant).
- Traçabilité : date et source du lien, réversible depuis la fiche.

## Prérequis issus de l'audit du 2026-11-21

Voir [`2026-11-21-audit-catalogues-reseau-data.md`](2026-11-21-audit-catalogues-reseau-data.md) :
`data/` n'est pas entièrement régénérable (ledgers Carddass non rejouables,
lus au chargement des modules) et le réseau API n'a ni retry ni circuit
breaker par défaut. À traiter avant de reconstruire les étagères dessus.

## Ordre proposé

1. Remise en route complète (préalable, en cours le 2026-11-21).
2. §4 + §5 — le chemin libre et la liaison a posteriori : ils rendent la
   reconstruction sûre même avec des catalogues incomplets.
3. §1 — ajout en série + récap commun.
4. §2 — scan de page de classeur.
5. §3 — catalogues jeux vidéo, puis les autres domaines.

## Questions ouvertes

- Reste-t-il des traces de l'ancienne collection à importer (exports, photos,
  listes, comptes sur d'autres apps) pour pré-remplir plutôt que tout
  rescanner ?
- Qu'afficher dans la fiche pour distinguer « relié au catalogue », « manuel »
  et « proposition de lien en attente » ?
