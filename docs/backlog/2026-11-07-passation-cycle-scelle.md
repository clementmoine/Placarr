# Placarr — Revue et synthèse du plan « Cycle de vie scellé & possession virtuelle »

**Copie dépôt :** `docs/backlog/2026-11-07-passation-cycle-scelle.md` (nettoyée après vérif code).

**Objet :** document de passation pour l'IA d'implémentation. Il consigne la revue du plan produit du 2026-11-07, les décisions prises avec Clément, les points à vérifier dans le code, et un ordre d'étapes proposé. **Aucune implémentation n'a été faite.** Tout ce qui est dit du code vient des fichiers que Clément a envoyés : `schema.prisma`, `itemAbsence.ts`, `buyAdvice.ts` et le dossier `src/providers/shared/sealedProducts/` (dont `indexFormat.ts`, `contentLayers.ts`, `ingest.ts`, `rewrite.ts`, `persistProductsIndex.ts`). Ne pas lire `curatedContents.ts`, `productsSqlite.ts`, `backfillLogos.ts` comme acquis : ils ont été reçus mais pas analysés. `sealedContentsTree.ts` et le code qui construit l'ensemble `missing` ont été vérifiés ensuite : voir le §0 « Corrections ».

**À faire par l'IA d'implémentation en premier :** vérifier chaque affirmation de ce document contre le code réel avant de s'y fier. En particulier les points marqués « à vérifier ».

## 0. Corrections après vérification dans le code (2026-11-07)

Une affirmation de ce document était fausse : `past` ne retombe pas dans les manquants, c'est l'inverse. Elle est corrigée ici, au §4 et au §7.

- **`past` et la checklist (corrige §4.4 et §7, étape 0).** La route `src/app/api/shelves/[shelfId]/checklist/route.ts` charge tous les items qui ont un `printKey`, sans filtrer sur `presence`, et `countsAsOwned` n'y est pas branché. Aujourd'hui un item `past` (vendu, jeté) **et** un item `wanted` comptent comme possédés : ils sortent des manquants et du conseil d'achat. Conséquence : exclure `past` et `wanted` du set possédé, et introduire le statut « déjà eu » **dans le même changement**, sinon une carte vendue réapparaîtrait comme « à acheter ».
- **Scellés absents de la checklist.** Seuls les items à `printKey` entrent dans `owned` : un scellé sans `printKey` n'est pas pris en compte aujourd'hui.
- **`sealedContentsTree.ts` existe** (même dossier que `buyAdvice.ts`) : à réutiliser pour l'arbre d'ouverture. **`itemSealedContainment.ts`** est l'index « Inclus dans » du catalogue vers les cartes, pas un containment d'items d'étagère : deux rôles distincts.
- **« L'app n'accepte que des cartes » (§1)** décrit l'interface TCG (PrintPicker), pas une contrainte de l'API : il manque un parcours « SKU scellé → item », pas une autorisation.
- **`ItemPresenceEvent`** : seule la création dans `api/items/route.ts` écrit des events aujourd'hui.

---

## 1. Intention de Clément (reformulée par lui, à respecter)

- Aujourd'hui, le parcours UX TCG (PrintPicker) pousse surtout les **cartes** — pas une contrainte API. Un **produit scellé** (display fermée, boîte, deck) est tout aussi légitime comme item d'étagère : certains collectionneurs veulent le garder fermé.
- Un scellé à contenu connu porte des **contenus virtuels** : ce qu'il garantit sans que l'utilisateur l'ait en main. Exemple donné : la boîte Leclerc qui contient l'intégralité des Fixeez (petits autocollants). Tant qu'elle est fermée, on a la boîte, pas les Fixeez déballés.
- **Sensibilité de collectionneur :** certains comptent la boîte comme « j'ai les Fixeez » (il suffit d'ouvrir) ; d'autres, tant que c'est scellé, ne l'ouvrent pas et cherchent aussi les Fixeez déballés. Donc **compter ou non les virtuels est un réglage de vue, pas une vérité globale.**
- **Après ouverture :** les contenus deviennent de vrais items, indépendants (vendre un seul, jeter un autre…). Un **historique de filiation** garde « issu de cette boîte, ouverte à telle date ».
- **La boîte** reste le même item : elle passe à l'état « vide » (coquille). L'utilisateur la garde ou la jette ; dans tous les cas on sait qu'elle est le parent de ces items.
- **Principe central :** un item dans l'étagère n'est **pas forcément possédé** aujourd'hui. Il peut être prêté, vendu, jeté, volé, perdu, échangé, attendu… mais il **a été eu**. Exemple : les jeux Exit, joués puis jetés. Un item jeté ne doit pas être proposé comme « à acheter » : on l'a déjà eu.

---

## 2. Constats sur le code existant

### 2.1 Présence / absence (déjà largement en place)

- `schema.prisma` : enum `ItemPresence { owned, away, wanted, past }` ; enum `AbsenceReason { loaned, ordered, repair, rental, sold, exchanged, gifted, discarded, lost, stolen }` ; sur `Item` : `presence`, `absenceReason`, `absenceSince`, `absenceRecipient`, `absenceSource`, `absenceCarrier`, `absenceTracking`, `absenceOrderRef`, `absenceOrderUrl`, `absenceNote`, `absencePriceCents`, `absenceExpectedAt`.
- `itemAbsence.ts` : machine à états pure `applyAbsenceAction` (actions `depart`, `return`, `cancel`, `recover`, `receive`) ; `countsAsOwned` = `owned` ou `away` ; raisons temporaires → `away`, définitives → `past`.
- `ItemPresenceEvent` : `fromPresence`, `toPresence`, `reason`, `kind` (**String** en base, liste TypeScript seulement), `snapshot` (Json), `at`. `inferPresenceEventKind` renvoie `acquired` quand `from === to` : **un event sans changement de présence est déjà admis.**
- `ItemTradeLink` : lien entre deux items avec `eventId`, uniques et index : **modèle à copier** pour un lien de containment.

### 2.2 Ce qui manque sur `Item`

- Aucun lien **item → produit scellé du catalogue** (le catalogue identifie un SKU par `pack::slug`, cf. `sealedProductKey`). **À vérifier** dans le code non vu : comment un scellé de l'étagère serait rattaché à son SKU.
- Aucun **prix d'achat**, aucune **date d'achat** (`createdAt` est la date de saisie ; `absencePriceCents` est un prix de **vente** et est remis à null par `ownedAbsenceState` au retour).
- Aucun lien parent/enfant, aucune quantité.
- `Condition` = `new | used | loose | damaged` ; le commentaire de `condition.ts` dit que `new` couvre « scellé ou ouvert-mint ». Pas de grade slab.

### 2.3 Catalogue scellé (déjà riche)

- `SealedProductEntry` porte la nomenclature : `guaranteedPrints` (avec `qty`), `guaranteedProducts` (SKU enfants, `qty`), `packsContained`, `packsBySet`, `guaranteeSets`, `structureUnits`, `randomPoolScope` (`set | listed | none | unknown`), `contentsKnown`, `containsPrintsIsPreview`, `behavior`.
- `behavior` : `no_cards`, `pack_container`, `known_bundle`, `mixed_bundle`, `random_pack` — **cinq cas, pas deux.** Le cas courant est `mixed_bundle` (ETB, tin, pack découverte : cartes garanties **et** boosters enfants), donc ouverture **récursive**.
- `resolveContentLayers` ne donne des garanties que si `contentsKnown` et pas `containsPrintsIsPreview` ; sinon `unknown`. **Règle à préserver : jamais de faux contenu.** Un aperçu boutique n'est ni une garantie ni un pool.
- `rewrite.ts` **supprime** des SKU (fusion recto/verso, `dropRedundantQuestTroveSkus`) et `rebuildFromStaging` régénère les ledgers : **un slug peut disparaître.**
- Une display est un `pack_container` avec `packsContained` (24 chez Bandai/Lorcana d'après le code). Si `null`, la pile ne peut pas être créée automatiquement.

### 2.4 Conseil d'achat (`buyAdvice.ts`)

- `planSetCompletion`, `buyOptionsForMissing`, `expandBuyImpact` sont **purs** : ils reçoivent `missing` (ensemble de printKeys), `poolSize`, des `BuyProduct`. Ils ne connaissent ni l'étagère ni les items. **Les virtuels et le « déjà eu » agissent donc en amont, dans le code qui construit `missing`** (non vu).
- `expectedNewCards` repose sur `missing / poolSize`. Retirer les virtuels de `missing` en gardant `poolSize` est cohérent (une carte virtuelle serait un doublon à l'ouverture) **mais suppose que le scellé sera ouvert** : l'UI doit le dire (« N cartes couvertes par tes scellés fermés »).
- `sealedSourcesByPrint` inclut les pools `randomPoolScope: "listed"` (loterie). **Ne pas le réutiliser tel quel pour dériver les virtuels** : une loterie n'est pas une garantie. Seules les `guaranteedPrints` de produits `contentsKnown` sans `printsArePreview` comptent.
- `expandBuyImpact` descend déjà un arbre (`toContentsTree`, `maxDepth` 4, multiplicateur `_qty`, garde `_seen`) : **réutiliser cet arbre pour l'ouverture** plutôt qu'écrire une seconde logique.
- Cas limite : un blister = `pack_container` ×1 autour d'un booster → ouvrir donne un booster scellé à ouvrir encore. Décider : deux étapes, ou raccourci en un geste.

---

## 3. Recommandations de modèle

### 3.1 Trois axes orthogonaux (conservés du plan)

Santé/grade, contenance, présence — séparés. Ne pas mettre « scellé » dans `Condition`.

### 3.2 Contenance : dériver, ne pas stocker

`sealed` / `partial` / `emptied` se **calculent** depuis les liens de containment (nombre de boosters encore fermés, contenus sortis). Seul `openedAt` est stocké. Stocker en plus l'état crée des incohérences (display `partial` dont tous les boosters sont ouverts).

### 3.3 Virtuels : dérivation à la lecture (approche A pour le MVP)

- Pas de lignes `virtual` en base : on **dérive** depuis la composition du catalogue (nomenclature type BOM : parent sans stock propre, enfants listés avec quantités). Corriger une composition ne nécessite alors aucune migration de lignes.
- Matérialiser en vrais items **uniquement à l'ouverture.**
- Conditions strictes : `contentsKnown`, pas `printsArePreview`, scellé non ouvert, présence `owned` ou `away`.
- Display aléatoire : **pas de virtuel carte-à-carte**, seulement N boosters (items réels, voir 3.5).

### 3.4 Journal : pas d'event sourcing complet

- Garder les colonnes d'état de `Item` comme **vérité**. Le journal est un **audit append-only** (timeline, provenance), pas la source de l'état.
- Piège classique à éviter : payload incomplet ; correction directe en base sans event. Corriger par un **nouvel event**.
- Étendre `ItemPresenceEvent` plutôt que créer une 2ᵉ timeline : `kind` est déjà une String. Ajouter des kinds (`opened`, `materialized`, `declared`…) avec `fromPresence = toPresence`. Si les requêtes deviennent pénibles, une table d'events plus large reste possible plus tard. **Décision à valider par l'IA d'implémentation après lecture des requêtes existantes.**
- **Figer dans le snapshot** : composition utilisée, prix, ids des enfants, nom/langue du SKU. Le catalogue peut changer ou perdre le SKU.

### 3.5 Containment

- Table `ItemContainmentLink` calquée sur `ItemTradeLink` : `parentId`, `childId`, `role` (`content` | `shell`), `eventId`.
- **Pile de boosters = N lignes** (une par booster), chacune liée à la display. Permet prêt/vente/ouverture individuels sans logique de scission. Le nombre vient de `packsContained`.
- **Shell** (carton/pochette vide) = item séparé (`kind` shell), avec sa propre santé et sa propre présence (jetable, vendable).
- **Déclaration groupée** (display aléatoire ouverte d'un coup) : event `declared` sur la display, cartes liées à la display sans booster intermédiaire. Cohabite avec des boosters ouverts un par un : tous restent « descendants de la display », seule la précision du lien diffère.
- Un item scellé doit porter son `kind` (carte / scellé / shell) et la **clé de SKU** (`pack::slug`) + un snapshot de nom/langue à l'acquisition.

### 3.6 Prix et dates

Ajouter **prix d'achat** et **date d'acquisition** en colonnes sur `Item` (requêtés souvent) et les copier dans le snapshot de l'event d'acquisition. Sans cela, le cost basis à l'ouverture sera irrécupérable. Figer valeur/prix à l'ouverture dans l'event (ne pas recalculer depuis le catalogue ensuite).

### 3.7 Flux d'ouverture (contenu connu)

Une transaction avec un `groupId` : (1) event `opened` sur le parent, `openedAt` posé ; (2) création des enfants (cartes **et** éventuels scellés enfants, récursivement, via l'arbre de contenu), liens `content`, events `materialized` ; (3) shell optionnel avec lien `shell` ; (4) jamais de suppression silencieuse du parent.

---

## 4. Décisions prises avec Clément (conversation du 2026-11-07)

1. **Le scellé est un item d'étagère de premier rang**, pas un cas à part.
2. **Compter ou non les virtuels = réglage de vue** (par vue/filtre), jamais vérité globale.
3. Après ouverture : contenus = vrais items indépendants ; boîte = même item, état vide, parent conservé dans l'historique.
4. **Un item « passé » (jeté, vendu, perdu, volé, échangé, donné) reste dans l'historique et doit compter comme « déjà eu ».** Il ne doit **pas** être proposé comme manquant à acheter par défaut. Point nouveau : `countsAsOwned` ne compte que `owned`/`away`, mais ce n'est pas branché sur la route de la checklist — vérifié, un item `past` (et `wanted`) compte aujourd'hui comme possédé et sort des manquants. Voir §0.
5. Un item prêté n'est pas jeté (l'un ou l'autre) : les raisons d'absence sont mutuellement exclusives par nature.
6. **Ne pas multiplier les états.** Garder 4 présences + une **raison** + des champs de détail **optionnels**. Filtre pour toute nouvelle raison : change-t-elle (a) si l'item revient, (b) s'il compte comme possédé, (c) s'il faut éviter de le racheter ?
7. **« Attendu »** : remplacer/élargir « commandé » par une raison plus large (commande en cours, ami qui le ramène, échange en cours). Temporaire → l'item compte comme possédé pour éviter le rachat en double (cas cité par Clément : oublier une commande en cours d'expédition puis la racheter en consultant une checklist). Champs source / transporteur / référence / date attendue restent optionnels. **Les virtuels d'un scellé seulement attendu ne comptent pas comme possédés** : on évite le rachat sans prétendre posséder (hypothèse de l'assistant, acceptée implicitement — à confirmer).

---

## 5. Raisons d'absence : état et propositions

Déjà présentes : `loaned`, `ordered`, `repair`, `rental` (temporaires) ; `sold`, `exchanged`, `gifted`, `discarded`, `lost`, `stolen` (définitives). « Égaré » = `lost`. « Volé » = `stolen`.

Propositions (à garder **seulement si** elles passent le filtre de la décision 6) :

- `consumed` (consommé/usé, ex. jeux Exit joués) — distinct de `discarded` ; utile si on veut distinguer « jeté » de « détruit à l'usage ». Définitive.
- `deposited` (en dépôt/consignation chez un tiers pour vente) — temporaire, encore à soi.
- `stored` (rangé chez quelqu'un) — temporaire ; à n'ajouter que si utile.
- `damaged_accident` — à éviter si `consumed`/`discarded` suffisent.
- Hors raisons d'absence mais à traiter : **objet emprunté** (jamais possédé, ne doit pas compter comme possédé), **retour fournisseur**, **don avec intention de récupérer**.

---

## 6. Statut d'affichage unifié (checklists et cartes)

Calculer **une seule fois** un statut par carte de checklist ; tous les écrans le consomment (ne pas refaire la logique par écran). Statuts proposés :

1. possédée pour de vrai ;
2. possédée mais absente (prêtée, attendue, réparation…), avec la raison ;
3. virtuelle (dans un scellé fermé que l'on possède) ;
4. **déjà eue** puis partie (passé) ;
5. manquante.

Affichage : badge/pastille distincte sur la carte (case pleine ; case cochée grisée + raison ; case vide + mention « tu l'as déjà eue »). **Filtres de vue** : afficher/masquer chaque catégorie. Par défaut : les « déjà eues » **ne sont pas proposées à l'achat** ; une action « je la recherche » sur la carte la remet dans les manquantes (passage `past → wanted`, déjà prévu par la machine d'états) en **conservant l'historique**. Le cas « coché mais pas vraiment » de Clément = statut 4 avec option de le réintégrer.

---

## 7. Ordre d'étapes proposé

**Étape 0 — Vérifications (avant tout code).**

- Lire `sealedContentsTree.ts` et le code qui construit `missing` / compte les possédées (`grep -rln "checklistRowIdentity\|buyOptionsForMissing" src`).
- Confirmer comment un item scellé sera rattaché à son SKU.
- Brancher `presence` dans `checklist/route.ts` : exclure `past` et `wanted` du set possédé et introduire le statut « déjà eu » dans le même changement (vérifié : aujourd'hui `past` compte comme possédé).
- Lire les requêtes existantes sur `ItemPresenceEvent` pour valider l'extension du journal.

**Étape 1 — Fonctions pures + tests, sans toucher à la base.** `containment()` (état dérivé), `virtualContents()` (dérivation depuis le catalogue avec les conditions strictes), statut d'affichage unifié. Cas de test : booster seul, display partielle, deck scellé `away`, scellé `contentsKnown=false` (aucun virtuel), `past` (déjà eu, pas manquant).

**Étape 2 — Schéma minimal.** Colonnes sur `Item` : type d'item (carte/scellé/shell), clé de SKU, `openedAt`, prix et date d'acquisition. Table `ItemContainmentLink`. Nouveaux `kind` d'events (`opened`, `materialized`, `declared`). Migration additive, rétro-compatible.

**Étape 3 — Ajout d'un scellé à l'étagère.** Saisie depuis le catalogue (modal) ; event `acquired` avec snapshot (nom, langue, prix, date).

**Étape 4 — Ouverture d'un produit à contenu connu** (un seul chemin complet), via l'arbre de contenu, avec shell optionnel et transaction.

**Étape 5 — Statut unifié + filtres + « déjà eu » dans le conseil d'achat** (en amont de `buyAdvice`, qui reste inchangé).

**Étape 6 — Display, pile de boosters, ouverture partielle, déclaration groupée.**

**Étape 7 — Reste du plan :** timeline UI, cost basis au rip, slabs/grade, WIP grading, raisons d'absence supplémentaires (§5), raison « attendu » (§4.7).

---

## 8. Risques et points ouverts

- Blister (`pack_container` ×1) : une ou deux étapes d'ouverture ?
- `packsContained = null` sur une display : saisie manuelle du nombre de boosters.
- Granularités mixtes sous une display (booster ouvert seul + déclaration groupée) : règle de lecture à écrire.
- Cohabitation de `LoanRequest` : présent dans le dépôt public (`main`), **absent du schéma local envoyé** (remplacé par la présence/absence). Ne pas le réintroduire.
- Conseil d'achat qui exclut les virtuels : afficher explicitement l'hypothèse « tu ouvriras ces scellés ».
- Version locale en avance sur le dépôt public : travailler uniquement sur la version locale de Clément.
- Les raisons d'absence ajoutées doivent rester peu nombreuses ; chaque ajout se justifie par la décision 6.

---

## 9. Ce que Clément demande à l'IA d'implémentation

Vérifier ce document contre le code, signaler toute contradiction avec le code réel (surtout les points « à vérifier »), proposer des corrections, et **ne rien implémenter sans accord** : la phase actuelle est la validation du modèle.
