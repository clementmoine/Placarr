# Naruto CACG FR — recovery carddass.fr & trous

Journal d’audit **2026-08-12** (màj **2026-08-13**). Objectif : documenter ce
qui a été **épuisé** pour les faces officielles, ce qui a été **comblé** hors
Wayback, et les pistes encore ouvertes.

Voir aussi : [naruto_carddass_tcg.md](naruto_carddass_tcg.md),
`data/naruto/ccg/logs/coverage.*` + `known-cards.*`,
staging `data/naruto/ccg/staging/` (README).

## 0. Règles (catalogue vs staging)

| Destination | Contenu |
|-------------|---------|
| **`cards/{set}/fr/`** | Faces **utilisées** (art, `art.corrected`, `art.reconstructed`, thumb) |
| **`staging/carddass-fr/`** | Miroir site non utilisé + pages/PDF/CDX (inspectable) |
| **`src/providers/narutoccg/curated/reconstructed/source-photos/`** | Preuves photos reconstruct (ex-Coleka) |
| **`src/providers/narutoccg/curated/reconstructed/`** | PNG hand-made → installés en `art.reconstructed.webp` |
| **`staging/bandaicg-en/`**, **`carddas-jp/`** | Autres lignes (≠ CACG FR) |

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

| Number | Officiel CDX | Catalogue |
|--------|:------------:|-----------|
| `ni232` `ni236` `ni252` `ni253` `ta221` `ta226` | non | `art.reconstructed.webp` (depuis Coleka / Ultrajeux via reconstruct) |
| `ni241` `te212` | `-vc` seul | `art.corrected` + reconstruct préféré |

Coverage MN S1–S5 : **711/711**. Preuves :
`curated/reconstructed/source-photos/` +
`src/providers/narutoccg/curated/reconstructed/provenance.json`.

---

## 3. « Sans image » vs non publiées

Principe : **on ne supprime rien** (numéros, noms, refs, images sources). Si ce
n’est pas sorti en papier, la carte reste dans le ledger en **non publiée**.

`pnpm naruto:cards -- --only known` :

| Bucket | Sens |
|--------|------|
| **`missingArt`** | Imprimée / attestée collectible, vraiment sans image |
| **`unreleased`** | Non publiée papier — S6 annulée **+** refs HTML seules (`ta090`) |
| **`unreleasedHtmlOnly`** | Sous-ensemble : uniquement `carddass-html` |

`ta090` : href `images/cartes/2/TACTIQUE-090.jpg` ; absent checklist S2 /
Apache / MN / Coleka → **non publiée**, toujours dans `cards[]`.

---

## 4. Sources essayées (hors CDX) — résumé

| Source | Pour les trous S5 |
|--------|-------------------|
| Coleka | Photos ni232/236/241/ta226/te212 — base reconstruct |
| Digigame / Ultrajeux | Scans historiques (retirés de staging — faux IDs) |
| cartes-naruto.com | Checklist communauté (ledger retiré — ⊆ names) |
| Ultrajeux Wayback `serie_5/` | JPEG des 6 trous (piste dump auto encore ouverte) |
| Yandex / ayaka / pds3 | Peu / rien de neuf |
| [nikita.jp nrt](https://tcg-db.nikita.jp/cardlist/nrt/?mode=img) | **JP** `N/J/S` 巻ノ… — pas FR |

---

## 5. Hors périmètre carddass.fr

Nouvelle Série 2012 (~118), promos shuriken, gap Coleka S2 (~20), EN/JP.

**Dos de carte** : aucun asset officiel isolé en Wayback / Ultrajeux (2026-08-13).
`cards/back.webp` = Figma provisoire (curated PNG → webp) — [BACK.md](../src/providers/narutoccg/curated/BACK.md).

---

## 6. Fichiers de référence

| Fichier | Rôle |
|---------|------|
| `logs/known-cards.{md,json}` | Ledger toutes sources |
| `logs/coverage.*` | MN ↔ index |
| `logs/known-cards.*` | Ledger attestations (checklist, apache, html, MN, coleka) |
| `staging/README.md` | Layout staging |
| `src/providers/narutoccg/` | Pipeline + curated |

*Dernière màj : 2026-08-13 — reconstruct S5, fantômes HTML, skip med/tin remap.*
