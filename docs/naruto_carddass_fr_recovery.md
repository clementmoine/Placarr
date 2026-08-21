# Naruto CACG FR — recovery carddass.fr & trous

Journal d’audit **2026-08-12** (màj **2026-08-13**). Objectif : documenter ce
qui a été **épuisé** pour les faces officielles, ce qui a été **comblé** hors
Wayback, et les pistes encore ouvertes.

Voir aussi : [naruto_carddass_tcg.md](naruto_carddass_tcg.md),
`data/naruto/carddass/logs/coverage.*` + `known-cards.*`,
staging `data/naruto/carddass/staging/` (README).

## 0. Règles (catalogue vs staging)

| Destination                                                       | Contenu                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **`cards/{family}/{id}/{lang}/`**                                 | Faces **utilisées** (art, `art.corrected`, `art.reconstructed`, thumb)  |
| **`staging/carddass-fr/`**                                        | Miroir site non utilisé + pages/PDF/CDX (inspectable)                   |
| **`src/providers/narutoccg/curated/cards/{family}/{id}/{lang}/`** | Reconstruct hand-made (`art.reconstructed.png`) + preuve (`source.jpg`) |
| **`staging/bandaicg-en/`**, **`carddas-jp/`**                     | Autres lignes (≠ CACG FR)                                               |

Med / tin **mappés** quittent staging (**move**). Re-scrape **ne re-télécharge
pas** un med/tin déjà présent sous `cards/` (sauf `--force`).

CLI : `pnpm naruto:cards` (pipeline complet).

---

## 1. Wayback `carddass.fr` — épuisé

CDX `www.carddass.fr/naruto/images/*` → **933** images, **747** faces typées
sous `cards/`, extras → `staging/carddass-fr/images/`. **0** fail typé.

Limite : index Apache S5 listait des JPEG **jamais crawlés** (404 partout :
Wayback, archive.today, Common Crawl, …). Re-scraper ne les ramène pas.

`-vc` = version corrigée → `art.corrected.jpg` (priorité catalogue).

---

## 2. Trous S5 — **comblés** (2026-08-13)

| Number                                          | Officiel CDX | Catalogue                                                            |
| ----------------------------------------------- | :----------: | -------------------------------------------------------------------- |
| `ni232` `ni236` `ni252` `ni253` `ta221` `ta226` |     non      | `art.reconstructed.webp` (depuis Coleka / Ultrajeux via reconstruct) |
| `ni241` `te212`                                 |  `-vc` seul  | `art.corrected` + reconstruct préféré                                |

Coverage MN S1–S5 : **711/711**. Preuves :
`curated/cards/{family}/{id}/fr/source.jpg` +
`curated/sources/reconstructed-provenance.json`.

---

## 3. « Sans image » vs non publiées

Principe : **on ne supprime rien** (numéros, noms, refs, images sources). Si ce
n’est pas sorti en papier, la carte reste dans le ledger en **non publiée**.

`pnpm naruto:cards -- --only known` :

| Bucket                   | Sens                                                             |
| ------------------------ | ---------------------------------------------------------------- |
| **`missingArt`**         | Imprimée / attestée collectible, vraiment sans image             |
| **`unreleased`**         | Non publiée papier — S6 annulée **+** refs HTML seules (`ta090`) |
| **`unreleasedHtmlOnly`** | Sous-ensemble : uniquement `carddass-html`                       |

`ta090` : href `images/cartes/2/TACTIQUE-090.jpg` ; absent checklist S2 /
Apache / MN / Coleka → **non publiée**, toujours dans `cards[]`.

---

## 4. Sources essayées (hors CDX) — résumé

| Source                                                           | Pour les trous S5                                   |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| Coleka                                                           | Photos ni232/236/241/ta226/te212 — base reconstruct |
| Digigame / Ultrajeux                                             | Scans historiques (retirés de staging — faux IDs)   |
| cartes-naruto.com                                                | Checklist communauté (ledger retiré — ⊆ names)      |
| Ultrajeux Wayback `serie_5/`                                     | JPEG des 6 trous (piste dump auto encore ouverte)   |
| Yandex / ayaka / pds3                                            | Peu / rien de neuf                                  |
| [nikita.jp nrt](https://tcg-db.nikita.jp/cardlist/nrt/?mode=img) | **JP** `N/J/S` 巻ノ… — pas FR                       |

---

## 5. Hors périmètre carddass.fr

Nouvelle Série 2012 (~118), promos shuriken, gap Coleka S2 (~20), EN/JP.

### 5bis. Promos shuriken — inventaire 2026-08-13

Ledger recherche : `data/naruto/carddass/staging/narutoccgfrance/promo-attested.json`
(forum **narutoccgfrance** live + pages tournois déjà en `staging/carddass-fr/`).

- **Officiel CdF 07** : `TE-30` / `NI-23` / `NI-95` → `cards/promo/fr/` + index.
- **Tin** : `PR-011` / `PR-016` → déjà sur disque.
- **Rééditions shuriken / marketplace** : injectées en catalogue comme
  `naruto:promo-{id}` (noms FR, rarity `promo`) même **sans image** — même
  règle que S6. Source : `curated/sources/attested-promos.json` (merge à
  l’index). Faces → drop sous `cards/promo/fr/{id}/` puis `--index-only`.
- Ne pas confondre avec la liste **cartes limitées deck** (t349).

**Dos de carte** : aucun asset officiel isolé en Wayback / Ultrajeux (2026-08-13).
Dos FR : `cards/back.fr.webp` (`curated/cards/back.fr.png`). Pas de `back.webp` sans langue.
Dos par langue : `curated/cards/back.{fr|en|it|ja}.png`.

### 5ter. Photos collector en fallback (pas de render carddass) — 2026-08-13

Heuristic (rapport `pnpm naruto:cards -- --only known`) : face préférée =
plain `art.*` ≥ ~300 KB (faces site ~40–80 KB / ~350×495). Exclut
`art.corrected` / `art.reconstructed`.

| Bucket      | Cartes                         | Notes                                                                                                                              |
| ----------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **S4 high** | `ni194` Asuma, `ni195` Kurenai | Retail (pas `PROMO CARD`). Apache listait `NINJA-194/195.jpg` mais dump site absent. `ni165` / `ni177` OK via `art.corrected.jpg`. |
| **S6 low**  | faces FR sur disque            | Série annulée — photos only ; reconstruct optionnel.                                                                               |

Listé dans `logs/known-cards.{md,json}` → section **Photos collector en
fallback**. Cible : `curated/cards/{family}/{id}/{lang}/art.reconstructed.png`
→ `art.reconstructed.webp`.

### 5quater. Archives « carte de la semaine » — 2026-08-13

Spotlights stratégie (pas promos tournoi). Staging :
`staging/carddass-fr/pages/naruto__archiveN_carte_semaine_*.html`.

- Extract : `logs/carte-semaine.{json,md}` via `carteSemaine.ts` (rebuild à
  `--index-only`).
- Merge catalogue : noms FR manquants + stubs S6 si focus sans face
  (`ni309`, `te263`, `ta240`, …).

---

## 6. Fichiers de référence

| Fichier                        | Rôle                                           |
| ------------------------------ | ---------------------------------------------- |
| `logs/known-cards.{md,json}`   | Ledger toutes sources + photo-fallback / trous |
| `logs/carte-semaine.{md,json}` | Focus + IDs extraits des archives CdF          |
| `logs/coverage.*`              | MN ↔ index                                     |
| `staging/README.md`            | Layout staging                                 |
| `src/providers/narutoccg/`     | Pipeline + curated                             |

_Dernière màj : 2026-08-13 — carte-semaine → noms/stubs catalogue._
