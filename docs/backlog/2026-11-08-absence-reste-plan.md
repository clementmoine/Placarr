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

**Statut 2026-11-08 :** **livré** — PrintPicker + ItemModal create (printKey/barcode) + Scan review + QuickScan. Dialog partagé `AwaitedReceiptDialog`. Matching barcode (`findReceivableByBarcode`) pour jeux / scellés.

**Quoi.** Quand on ajoute une carte/objet dont l’identité existe déjà en `away` ou `wanted`, proposer de **récupérer / recevoir** plutôt qu’un doublon.

**Exemple.** Commande Cardmarket → PrintPicker / scan / saisie libre → « Tu l’attendais ? » → Recevoir.

**Hors scope.** Matching Vinted automatique sans confirmation.

---

### P1 — Modal d’ajout : Catalogue vs Saisie libre

**Statut 2026-11-08 :** **menu + matching saisie libre livrés** — Catalogue / Saisie libre / scellé ; ItemModal reçoit `receivableItems` et intercepte le create. Reste : polish typographique des parcours.

**Quoi.** Deux parcours explicites : **Depuis le catalogue** et **Saisie libre**.

**Exemple.** Étagère Lorcana → + → « Depuis le catalogue » / « Saisie libre » / « Produit scellé ».

---

### P1 — Trocs (`ItemTradeLink`) — UI + API

**Statut 2026-11-08 :** **livré** — `GET/POST/DELETE …/trades`, panneau fiche `ItemTradeLinks`, badge `Échangé ↔ {name}`. Pas encore de picker intégré dans ItemModal (lien depuis la fiche suffit).

**Quoi.** Lier optionnellement un item échangé à la contrepartie reçue. Visible sur les deux fiches.

**Exemple.** NI-001 échangé contre Luffy → badge « Échangé ↔ Luffy » + panneau troc avec lien croisé.

**Reste.** Picker troc dans ItemModal ; rompre le lien à la récupération (P3).

---

### P2 — UI « Déclarer les pulls » (scellé random)

**Statut 2026-11-08 :** **livré** — `SealedDeclareModal` + bouton fiche « Déclarer les cartes » (`canDeclareSealedPulls`). API `declare` inchangée ; déclaration partielle OK (qty par print).

**Quoi.** Après ouverture (ou directement), déclarer les cartes sorties sans inventer la loterie.

**Exemple.** Display ouverte → Déclarer → chercher prints → qty → enfants + event `declared`.

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

- [x] Ajout d’un print déjà `away`/`wanted` propose la réception avant create (PrintPicker + ItemModal + scan).
- [x] Menu d’ajout distingue Catalogue et Saisie libre (étagère print).
- [x] Échange lié visible sur les deux fiches (API + panneau fiche + badge).
- [x] Ouverture random → UI declare utilisable.
- [ ] Export et/ou stats portent présence + prix de cession.
