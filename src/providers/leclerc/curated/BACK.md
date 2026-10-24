# Dos Leclerc

Dos de carte (Paninimania) curés par opération :

| Set | Source Paninimania / Bibelotmania |
|-----|--------------------|
| `sw15` | Bibelotmania idm=6150 (jetons Cosmic Shells) |
| `sw16` | Bibelotmania idm=7174 (jetons Cosmic Shells II / Rogue One) |
| `sw18` | Paninimania idm=6421 (Solo — 90 cartes) |
| `sw19` | Paninimania idm=6809 (Maîtriser la Force — stickers) |
| `marvel21` | idm=7251 « Dos de carte » |
| `marvel22` | idm=7429 |
| `marvel23` | idm=7561 |
| `marvel24` | idm=7726 |
| `disney25` | idm=7872 « Dos de cartes 1 » (mosaïque 2×4 → crop 1 dos, variante « 3 ») |
| `disney26` | **Gate 2026-10-23** — album « En route pour l'aventure ! » (27/10–13/12/2026) ; pas de dos Paninimania ni listing Coleka → stubs only, **ne pas inventer de noms** |

Fichiers : `curated/cards/<set>/back.jpg` → Sync les convertit en
`data/leclerc/<set>/cards/<set>/back.webp`.

## Scellés

**Seed / stub** (toutes les ops, y compris sans art) : `collector-album` +
`pochette` (4 cartes) + `display` (`packsContained` null tant que non attesté).
Code : `sealedSeed.ts` → Sync `products` / `ingestLeclercSealedProducts`.
Overlay curated `sources/leclerc-<set>-sealed.json` + packshots sous
`products/<set>/…` quand on les a.

| Set | SKU | Art curated |
|-----|-----|-------------|
| `disney25` | `collector-album` — « Découvre la magie de Disney » ; **1,99€** (Paninimania idm=7872, EAN 4251906523445) | `art.paninimania.jpg` + `back.paninimania.jpg` (plus de composites `art.scan`) |
| `disney25` | `pochette` — 4 cartes ; Fixeez possible non garanti (`kind: booster`) | `products/disney25/pochette/fr/art.paninimania.jpg` |
| `disney25` | `display` — stub (nb pochettes inconnu) | — |
| `marvel23` | `collector-album` — « Défie tes Héros » ; **1,99€** (Paninimania idm=7561) | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `marvel23` | `pochette` — 4 cartes (SKU distinct) | `products/marvel23/pochette/fr/art.paninimania.jpg` |
| `marvel23` | `pochette-fixeez` — 1 Fixeez (Paninimania « Pochette de 1 fixeez » + dos) | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `marvel23` | `display` — stub | — |
| `marvel20` | `collector-album` — « Deviens un Héros » ; **1,99€** ; EAN 8718973054556 / 8718973054525 (idm=7013) — stickers 1–144 + cartes mémoire C1–C40 (une campagne ; pas de ligne « Sticker Backs ») | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `marvel20` | `pochette` — **4 images + 2 cartes** (pas le seed 4 cartes) | `products/marvel20/pochette/fr/art.paninimania.jpg` |
| `marvel21` | `collector-album` — « Révèle ton Pouvoir » ; **1,99€** ([C&S 2021-11-06](https://cartesetstickers.fr/2021/11/06/e-leclerc-propose-une-collection-de-cartes-marvel/) + idm=7251) | `art.paninimania.jpg` + `back.paninimania.jpg` (+ `annonce.cartesetstickers.jpg`) |
| `marvel21` | `pochette` — 4 cartes ; **pas de Fixeez** | `products/marvel21/pochette/fr/art.paninimania.jpg` |
| `marvel22` | `collector-album` — « Pars en Mission » ; **1,99€** ([C&S 2022-11-01](https://cartesetstickers.fr/2022/11/01/e-leclerc-propose-une-collection-de-cartes-marvel-automne-2022/) + idm=7429) | idem pattern |
| `marvel22` | `pochette` — 4 cartes ; **pas de Fixeez** | `products/marvel22/pochette/fr/art.paninimania.jpg` |
| `marvel24` | `collector-album` — « Explore L'Univers Marvel avec Groot » ; **1,99€** ([C&S 2024-10-29](https://cartesetstickers.fr/2024/10/29/e-leclerc-propose-une-collection-de-cartes-marvel-automne-2024/) + idm=7726) | idem pattern |
| `marvel24` | `pochette` — 4 cartes ; Fixeez possible au centre (`possibleChase`, ≠ SKU séparée marvel23) | `art.crop.jpg` (1 pochette — crop manuel ; dual Paninimania = `art.paninimania.dual.jpg`) |
| `sw15` | `collector-album` — Cosmic Shells ; **2,99€** (Bibelotmania idm=6150) | `art.bibelotmania.jpg` + `back.bibelotmania.jpg` |
| `sw15` | `pochette` — **2 jetons** (pas le seed 4 cartes) | `art.bibelotmania.jpg` + `back.bibelotmania.jpg` |
| `sw16` | `collector-album` — Cosmic Shells II / Rogue One ; **2,99€** (idm=7174) | idem |
| `sw16` | `pochette` — **2 jetons** | `art.bibelotmania.jpg` |
| `sw18` | `collector-album` — Solo 90 cartes ; **1,99€** (Paninimania idm=6421) | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `sw18` | `pochette` — 4 cartes | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `sw19` | `collector-album` — « Maîtriser la Force » ; **1,99€** (idm=6809, EAN 8718973040399) — stickers + dos jeu J1–J18 (une campagne ; pas de ligne « Sticker Backs ») | `art.paninimania.jpg` |
| `sw19` | `pochette` — 4 images | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `sw19` | `display` — **244** pochettes × 4 = **976** stickers (carton distribution d’origine) | `art.packshot.png` → `/face` |
| `sw18`/`disney25`/`disney26`/`marvel20`–`24` | `display` — présentoir caisse (studio packshot) ; **`packsContained` null** tant que carton non attesté (Paninimania/C&S ne publient pas le nb) | `products/<set>/display/fr/art.packshot.png` → `/face` |

### Pochette / display — attesté vs Gemini (2026-10-24)

Pochettes (contenu) : OK partout via Paninimania / C&S / Bibelotmania.
**Display carton** : Gemini a proposé des chiffres pour tout — **rejetés sauf 2**.

| Set | Pochette | Display Gemini | Verdict recherche | Placarr |
|-----|----------|----------------|-------------------|---------|
| `sw15`/`sw16` | **2** jetons | 320 | aucune source carton | `null` |
| `sw18` | **4** cartes | 400 | aucune source carton | `null` |
| `sw19` | **4** images | 244 | [LBC 3185056359](https://www.leboncoin.fr/ad/collection/3185056359) « Lot en carton de 244 pochettes… 976 vignettes… 2019 » | **244** |
| `marvel20` | **4** stickers + **2** cartes | 280 | PicClick/eBay = lot **320** pochettes (revendeur), **pas** « boîte officielle 280 » ; [LBC 3230874383](https://www.leboncoin.fr/ad/collection/3230874383) « boîte… Complète » sans nb de pochettes | `null` |
| `marvel21`–`22` | **4** cartes | 320 | liens Vinted = catalogues génériques, **0** mention 320 | `null` |
| `marvel23` | **4** + Fixeez SKU à part | 420 | eBay [itm 405598492303](https://www.ebay.fr/itm/405598492303) titre « **BOITE** … **COMPLETE 420 POCHETTES** » | **420** |
| `marvel24`/`disney25` | **4** (+ Fixeez possible) | 400 | aucune attestation carton | `null` |
| `disney26` | seed **4** cartes (pas stickers) | 300 | inventé ; Gemini dit « stickers » à tort | `null` |

Audit dump URLs (2026-10-24) — **aucun nouveau `packsContained`** :

| URL | Verdict |
|-----|---------|
| [LBC 3185056359](https://www.leboncoin.fr/ad/collection/3185056359) | **OK** — sw19 carton **244** / 976 (déjà écrit) |
| [eBay 405598492303](https://www.ebay.fr/itm/405598492303) | **OK** — marvel23 **420** (déjà écrit) |
| [LBC 3230951597](https://www.leboncoin.fr/ad/collection/3230951597) | sw19 boîte remplie ; « nombreuses pochettes » ; **pas de chiffre** (photos = shipper multi-présentoirs ≠ carton 244) |
| [LBC 3230874383](https://www.leboncoin.fr/ad/collection/3230874383) | marvel20 boîte « Complète » ; set size 144 stickers ; **pas de nb pochettes** |
| [LBC 3113994907](https://www.leboncoin.fr/ad/collection/3113994907) | « Carton marvel plein » — **0** count |
| [eBay 143457174172](https://www.ebay.fr/itm/143457174172) | lot revente **25** pochettes sw19 — ≠ display |
| Vinted brand/leclerc (fr/at) | catalogues génériques — **0** carton size |
| Presse / Paninimania / C&S / Ouest-France / WTComics / Planète SW | ops + contenu pochette / album ; **pas** taille display |

Règle : lot revente ≠ taille display. On n’écrit `packsContained` que si carton / boîte complète est nommé.

Sync étape `products` → `data/leclerc/<set>/products-index.json`.

## Faces

1. **Coleka listing** (Flare) — pages 1…N, stop au Turnstile.
2. **CDN ledger** `sources/coleka-cdn-faces.json` — URLs `thumbs.coleka.com`
   découvertes via index Bing quand le listing est muré.

Sync → `art.coleka.webp` sous `data/leclerc/<set>/cards/<set>/fr/<n>/`.

### Couverture (dumps navigateur `?nbpp=240`)

| Set | Faces | Checklist | Notes |
|-----|------:|----------:|-------|
| marvel21 | **108** | 108 | `revele-ton-pouvoir_r22334` |
| marvel22 | **108** | 108 | |
| marvel23 | **132** | 108+24 Fixeez | Fixeez matchés checklist (+ `aka`) — pas de n° F Coleka |
| marvel24 | **132** | 108+24 Fixeez | Fixeez f01–f24 dans le filename Coleka |
| disney25 | **132** Coleka + **108** eBay cartes + Fixeez MSKU | 108+24 Fixeez | Cartes : `236426654358`. Fixeez : `236423984089` (noms nus → checklist). f06 Main de Mickey = galerie eBay `art.ebay.jpg`. Install eBay cartes : crop fixe L/R 255 (pas Fixeez). |
| disney26 | — (stub) | 108+24 Fixeez stub | Gate `leclercNameDensifyGate` fermée (pas Coleka / album) ; densifier dès listing réel. |

TCDB Images / laststicker / Wayback : pas exploitables (403 / promo only).

**Astuce** : Turnstile → ouvrir `?nbpp=240` → sauver `div.schema` →
`data/leclerc/<set>/staging/coleka-faces/listing-0.html`.
