# Absence étagère — reste du plan (2026-11-08)

**Statut :** plan absence **clos** (P1–P3 livrés 2026-11-08).  
**Plan source :** Cursor *Absence étagère* (`absence_étagère_f0ec5d36`).  
**Lié :** [cycle scellé](./2026-11-07-cycle-de-vie-scelle-possession-virtuelle.md), [passation](./2026-11-07-passation-cycle-scelle.md).

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

**Statut 2026-11-08 :** **livré** — `formatCessionMarkdown` + bouton « Exporter l'historique » en vue past.

**Exemple.** `NI-001 · Naruto | past | sold | 2026-10-12 | Vinted | 25,00 €`

---

### P2 — Stats cession (somme des ventes)

**Statut 2026-11-08 :** **livré** — `sumSoldAbsenceCents` + encart « Ventes : … » en vue past.

---

### P2 — Badges / ItemModal polish restant

**Statut 2026-11-08 :** **livré** — badge vendu + prix ; échangé ↔ ; timeline compacte (3 events) sous le bloc absence dans ItemModal.

---

### P3 — Rappels / anti-doublon / troc à la récupération

**Statut 2026-11-08 :** **livré**

| Idée | Preuve |
| ---- | ------ |
| Rappel commandes anciennes (≥14 j) | `ordered_ago` / `expected_ago` via `resolveAbsenceReminder` |
| Rappel `absenceExpectedAt` | `return_today` / `tomorrow` / `in_days` / `overdue` |
| Anti-doublon commande | `findOwnedIdentityPeers` + warning ItemModal |
| Rompre troc à la récupération | Dialog « Contrepartie toujours chez toi ? » (garder / rompre) |

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
- [x] Export et/ou stats portent présence + prix de cession.
