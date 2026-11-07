# Absence étagère — reste du plan (2026-11-08)

**Statut :** socle livré (schéma, ItemModal lifecycle, badges, filtre vue étagère, bulk edit, checklist présence/virtuels, scellé MVP open/containment).  
**Plan source :** Cursor *Absence étagère* (`absence_étagère_f0ec5d36`).  
**Lié :** [cycle scellé](./2026-11-07-cycle-de-vie-scelle-possession-virtuelle.md), [passation](./2026-11-07-passation-cycle-scelle.md).

Ce document liste **uniquement ce qui n’est pas encore fait**, avec intention + exemple concret pour chaque chantier. Priorité = ordre de valeur produit.

---

## Déjà livré (ne pas rouvrir)

| Surface | Preuve |
| ------- | ------ |
| Schéma `presence` / `absence*` / `ItemPresenceEvent` / `ItemTradeLink` | `prisma/schema.prisma` + migrations 2026-11-07 |
| Core + API PATCH (+ bulk lifecycle) | `itemAbsence.ts`, `api/items`, `api/items/batch/lifecycle` |
| ItemModal : présence, raisons, retour / annuler / récupéré / trouvé | `ItemModalLifecycleFields` |
| Badges prêt / commande / past / wanted… | `formatAbsenceBadge` → ItemCard + fiche |
| Filtre grille étagère | `shelfView` + `ItemCollectionViewFilter` (active / away / wanted / past / all / doubles) |
| Bulk edit (valeurs communes, champs mixtes vides, dirty only) | `BulkEditModal` + `bulkLifecycleForm` |
| Checklist past / virtuels / possessionView | prefs + `partitionChecklistOwnership` |
| Scellé : picker, open known, containment, virtuels checklist | `sealedLifecycle`, `…/open`, `SealedPickerModal` |

---

## Ouverts (P1 → P3)

### P1 — « Tu l’attendais ? » à l’ajout

**Quoi.** Quand on ajoute une carte (catalogue ou barcode) dont le même `printKey` / identité existe déjà en `away` (commandée, prêt…) ou `wanted`, proposer de **récupérer / recevoir** cet item plutôt que d’en créer un doublon.

**Pourquoi.** Sinon on rachète ou on double une commande en cours ; le matching absence n’a de sens qu’à l’ajout.

**Exemple.** Tu as marqué *Stitch - Rock Star* en « Commandé · Cardmarket ». Au PrintPicker tu retombes sur le même tirage → dialog : « Tu l’attendais ? Commandée le 3 nov. chez Cardmarket » → **Oui** = `away`→`owned` + event `received_from_order` ; **Non, autre copie** = create normal.

**Surfaces.** PrintPicker / ItemModal create / QuickScan ; API peut réutiliser `normalize` + `buildPresenceEvent`.  
**Hors scope.** Matching Vinted automatique sans confirmation.

---

### P1 — Modal d’ajout : Catalogue vs Saisie libre

**Quoi.** Deux parcours explicites et soignés : **Depuis le catalogue** (PrintPicker / sealed picker) et **Saisie libre** (nom / code-barres hors corpus) — jamais de libellés « hasardeux / custom junk ».

**Pourquoi.** Le plan lie ce polish au matching « tu l’attendais ? » : l’ajout doit être lisible avant d’y brancher l’absence.

**Exemple.** Étagère Lorcana → menu + → « Catalogue » ouvre le picker sets/cartes ; étagère jeux sans print → « Saisie libre » = nom + barcode, même chrome que ItemModal, sans dashboard ni pills décoratives.

**Surfaces.** Menu FAB / add sur `shelves/[shelfId]/page.tsx` ; éventuelle fusion UX PrintPicker + ItemModal create.

---

### P1 — Trocs (`ItemTradeLink`) — UI + API

**Quoi.** Lier optionnellement un item `exchanged` à un ou plusieurs items reçus (edges bidirectionnels). Afficher « Échangé ↔ Titre » sur les deux fiches. Schéma déjà là ; **aucun** usage applicatif.

**Pourquoi.** Critère de succès du plan : un échange apparaît sur **les deux** côtés.

**Exemple.** Tu cèdes *Naruto NI-001* contre *Luffy OP01-001*. Sur la fiche de NI-001 : badge « Échangé ↔ Monkey D. Luffy » ; sur OP01-001 : miroir + lien. Lien créable depuis ItemModal (raison `exchanged`) ou après coup.

**Surfaces.** API CRUD légère ; ItemModal ; fiche ; badge (`formatAbsenceBadge` + titre lié).  
**Idée plus tard.** Troc 1→N = plusieurs edges ; à la récupération, proposer de rompre le lien.

---

### P2 — UI « Déclarer les pulls » (scellé random)

**Quoi.** Après ouverture d’un display / booster aléatoire, flux UI pour déclarer les cartes sorties (API `POST …/declare` + `planSealedDeclare` déjà prêts, **sans consommateur UI**).

**Pourquoi.** Ouverture random ne doit pas inventer le contenu ; sans UI, le collecteur ne peut pas enregistrer les hits honnêtement.

**Exemple.** Tu ouvres une display BT31 → event `opened`. Bouton fiche « Déclarer les cartes » → multi-select / scan des prints → create enfants + event `declared` (déclaration partielle OK).

**Surfaces.** Fiche item scellé ; éventuellement ItemModal.

---

### P2 — Export présence / raison / cession

**Quoi.** Enrichir l’export checklist (ou export collection) : présence, raison, depuis, destinataire, prix de vente ; `past` dans une section « historique ».

**Pourquoi.** Aujourd’hui l’export Markdown = cases possédé/manquant booléennes ; inutile pour un inventaire de ventes / prêts.

**Exemple.** Export → ligne `NI-001 | past | sold | 2026-10-12 | Vinted | 25,00 €` ; section « Déjà eus » séparée des manquants à acheter.

**Surfaces.** `checklistMarkdown.ts` (+ éventuellement CSV collection).

---

### P2 — Stats cession (somme des ventes)

**Quoi.** Agrégat des `absencePriceCents` sur items `past` + raison `sold` (vue past ou panneau étagère).

**Pourquoi.** Le prix est déjà saisi ; sans somme, pas de lecture « j’ai revendu pour X € ».

**Exemple.** Filtre vue « Déjà eus » → encart « Ventes : 312,50 € (14 cartes) ».

**Surfaces.** Grille étagère (vue past) ou fiche checklist ; pure fonction `sumSoldAbsenceCents(items)`.

---

### P2 — Badges / ItemModal polish restant

**Quoi.**

1. Badge vendu avec prix si renseigné (`Vendu · 25 €`).
2. Badge échangé avec titre lié (dépend P1 trocs).
3. Historique compact des `ItemPresenceEvent` **dans** ItemModal (aujourd’hui timeline surtout sur la fiche).

**Exemple.** ItemModal ouvert sur une carte vendue → bloc absence « Déjà eu / Vendu » + sous le bloc les 3 derniers events (`departed` → `sold` 12 € ; …).

---

### P3 — Idées produit (hors MVP strict)

| Idée | Exemple |
| ---- | ------- |
| Rappel commandes anciennes (`ordered` + `absenceSince` > N jours) | Badge doux « Commandée il y a 21 j » |
| Rappel `absenceExpectedAt` | « Retour prévu demain » sur un prêt |
| Anti-doublon commande | Warning si `owned` du même print existe déjà quand tu passes en `ordered` |
| Rompre / annoter `ItemTradeLink` à la récupération | « Contrepartie toujours chez toi ? » |

---

## Ordre de chantier suggéré

1. Matching « tu l’attendais ? » (+ prérequis UX add Catalogue / Saisie libre si on touche au menu d’ajout).
2. Trocs UI/API.
3. Declare UI scellé.
4. Export + stats cession.
5. Polish badges / timeline ItemModal.
6. Rappels / anti-doublon (P3).

## Critères de fin (reste)

- [ ] Ajout d’un print déjà `away`/`wanted` propose la réception avant create.
- [ ] Menu d’ajout distingue Catalogue et Saisie libre.
- [ ] Échange lié visible sur les deux fiches.
- [ ] Ouverture random → UI declare utilisable.
- [ ] Export et/ou stats portent présence + prix de cession.
