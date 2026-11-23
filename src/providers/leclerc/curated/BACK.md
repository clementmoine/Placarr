# Dos Leclerc

Dos de carte (Paninimania) curés par opération :

| Set | Source Paninimania / Bibelotmania |
|-----|--------------------|
| `sw15` | Bibelotmania idm=6150 (jetons Cosmic Shells) — pas de verso carte commun |
| `sw16` | Bibelotmania idm=7174 (jetons Cosmic Shells II / Rogue One) — idem |
| `sw18` | Scan dos carte Solo 2018 (STAR WARS + rayons or) → `cards/sw18/back.png` |
| `sw19` | Stickers / jeu : pas de sleeve pack ; dos **album** → `products/sw19/collector-album/fr/back.scan.jpg` |
| `marvel21` | idm=7251 « Dos de carte » |
| `marvel22` | idm=7429 |
| `marvel23` | idm=7561 |
| `marvel24` | idm=7726 |
| `disney25` | idm=7872 « Dos de cartes 1 » (mosaïque 2×4 → crop 1 dos, variante « 3 ») |
| `disney26` | Album « En route pour l'aventure ! » (27/10–13/12/2026). **Noms 2026-11-04** via [ColleX cartes](https://www.collexstash.com/fr/collections/cards/cartes-disney-leclerc-2026) + [Fixeez](https://www.collexstash.com/fr/collections/figures/fixeez-disney-leclerc-2026) (lecture album) — 7 n° illisibles + 2 partiels restent stubs. Pas de dos Paninimania / Coleka faces encore. |

Fichiers : `curated/cards/<set>/back.{png,jpg,webp}` → Sync les convertit en
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
| `disney26` | `display` — présentoir caisse (studio) ; `packsContained` null | `art.packshot.png` |
| `disney26` | `collector-album` — « En route pour l'aventure ! » ; **1,99€** ; EAN **8718973124716** (HRI dos, [Vinted 10600344731](https://www.vinted.com/items/10600344731-album-collector-disney-eleclerc-collection-disney-en-route-pour-laventure) ; check digit OK, barres non décodées à f800). Étiquette caisse collée en haut du dos, pas imprimée. | `art.vinted.jpg` + `back.vinted.jpg` |
| `disney26` | `fixeez-integrale` — **L'intégrale des 24 Fixeez** (édition exclusive 2026) ; EAN **8718973125386** (lu sur carton) ; contenu connu = 24 Fixeez (pas aléatoire). Packshot clean reconstruit depuis annonces Vinted set complet. | `products/disney26/fixeez-integrale/fr/art.vinted.png` |
| `marvel23` | `collector-album` — « Défie tes Héros » ; **1,99€** (Paninimania idm=7561) | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `marvel23` | `pochette` — 4 cartes (SKU distinct) | `products/marvel23/pochette/fr/art.paninimania.jpg` |
| `marvel23` | `pochette-fixeez` — 1 Fixeez (Paninimania « Pochette de 1 fixeez » + dos) | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `marvel23` | `display` — stub | — |
| `marvel20` | `collector-album` — « Deviens un Héros » ; **1,99€** ; EAN 8718973054556 / 8718973054525 (idm=7013) — stickers 1–144 + cartes mémoire C1–C40 (une campagne ; pas de ligne « Sticker Backs ») | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `marvel20` | `pochette` — **4 images + 2 cartes** (pas le seed 4 cartes) ; Coleka [`_i869968`](https://www.coleka.com/fr/stickers-autocollants/stickers-de-supermarche/marvel-2020-deviens-un-heros-leclerc/pochette_i869968) face ; dos Paninimania idm=7013 | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `marvel21` | `collector-album` — « Révèle ton Pouvoir » ; **1,99€** ([C&S 2021-11-06](https://cartesetstickers.fr/2021/11/06/e-leclerc-propose-une-collection-de-cartes-marvel/) + idm=7251) | `art.paninimania.jpg` + `back.paninimania.jpg` (+ `annonce.cartesetstickers.jpg`) |
| `marvel21` | `pochette` — 4 cartes ; **pas de Fixeez** | `products/marvel21/pochette/fr/art.paninimania.jpg` |
| `marvel22` | `collector-album` — « Pars en Mission » ; **1,99€** ([C&S 2022-11-01](https://cartesetstickers.fr/2022/11/01/e-leclerc-propose-une-collection-de-cartes-marvel-automne-2022/) + idm=7429) | idem pattern |
| `marvel22` | `pochette` — 4 cartes ; **pas de Fixeez** | `products/marvel22/pochette/fr/art.paninimania.jpg` |
| `marvel24` | `collector-album` — « Explore L'Univers Marvel avec Groot » ; **1,99€** ([C&S 2024-10-29](https://cartesetstickers.fr/2024/10/29/e-leclerc-propose-une-collection-de-cartes-marvel-automne-2024/) + idm=7726) | idem pattern |
| `marvel24` | `pochette` — 4 cartes ; Fixeez possible au centre (`possibleChase`, ≠ SKU séparée marvel23) | `art.crop.jpg` (1 pochette — crop manuel ; dual Paninimania = `art.paninimania.dual.jpg`) |
| `sw15` | `collector-album` — Cosmic Shells ; **2,99€** (Bibelotmania idm=6150) | `art.bibelotmania.jpg` + `back.bibelotmania.jpg` |
| `sw15` | `pochette` — **2 jetons** (pas le seed 4 cartes) ; Coleka [`_i204608`](https://www.coleka.com/fr/cartes-de-collection/cartes-star-wars/autres-cartes-star-wars/cosmic-shells-star-wars-leclerc/cartes-leclerc-star-wars-2015/pochette-comic-shell-star-wars-2015_i204608) (attestation, skip faces) | `art.bibelotmania.jpg` + `back.bibelotmania.jpg` |
| `sw16` | `collector-album` — Cosmic Shells II / Rogue One ; **2,99€** (idm=7174) | idem |
| `sw16` | `pochette` — **2 jetons** | `art.bibelotmania.jpg` |
| `sw18` | `collector-album` — Solo 90 cartes ; **1,99€** (Paninimania idm=6421) | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `sw18` | `pochette` — 4 cartes | `art.paninimania.jpg` + `back.paninimania.jpg` |
| `sw19` | `collector-album` — « Maîtriser la Force » ; **1,99€** (idm=6809, EAN 8718973040399) — stickers + dos jeu J1–J18 (une campagne ; pas de ligne « Sticker Backs ») | `art.paninimania.jpg` + `back.scan.jpg` (EAN album) |
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

### Disney26 — intégrale Fixeez (2026-11-04)

SKU **hors seed** : boîte collector « L'INTÉGRALE DES 24 FIXEEZ / ÉDITION EXCLUSIVE 2026 »
(EAN `8718973125386`). Les annonces Vinted disent souvent « Pomeez » — le carton
imprimé dit **Fixeez** (même famille disney25 / marvel23).

| URL | Rôle |
|-----|------|
| [Vinted 10654634248](https://www.vinted.fr/items/10654634248-set-complet-de-24-pomeez-disneyr-2026) | photos packshot / set complet |
| [Vinted 10648100734](https://www.vinted.fr/items/10648100734-vend-lot-complet-pomeez-disney-2026) | idem |
| [Vinted 10645230571](https://www.vinted.fr/items/10645230571-lintegrale-des-24-pomeez-disney-leclerc-2026) | titre « l'intégrale » |
| [Vinted 10597629201](https://www.vinted.fr/items/10597629201-fixeez-disney-2026) | photos |
| [Vinted 10599672404](https://www.vinted.fr/items/10599672404-collection-complete-fixeez-2026) | collection complète |
| [IG leclercsaintpaullesdax DfPLb02FZac](https://www.instagram.com/p/DfPLb02FZac/) | **attestation magasin** — « L'intégrale des 24 fixeez À GAGNER SUR L'APPLI » ; boîtes = lot complet 24 (instant gagnant appli + tirage Disneyland) |

Art curated : `art.vinted.png` (version clean). Ledger :
`data/leclerc/sources/leclerc-disney26-sealed.json`.

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
| sw15 | **54** | **54** | Cosmic Shells 2015 — noms densifiés 2026-11-04 depuis dump `?nbpp=240` |
| sw16 | **54** | **54** | Cosmic Shells Rogue One 2016 — idem |
| sw18 | **90** | **90** | Solo 2018 — idem |
| sw19 | **114** | **114** | Maîtriser la Force — A–H→089–096 ; J1–J18 = titres Coleka `J NN/18` |
| marvel20 | **184** | **184** | stickers 1–144 + C1–C40 → `cNN` — noms densifiés 2026-11-04 |
| marvel21 | **108** | 108 | `revele-ton-pouvoir_r22334` |
| marvel22 | **108** | 108 | |
| marvel23 | **132** | 108+24 Fixeez | Fixeez matchés checklist (+ `aka`) — pas de n° F Coleka |
| marvel24 | **132** | 108+24 Fixeez | Fixeez f01–f24 dans le filename Coleka |
| disney25 | **132** Coleka + **108** eBay cartes + Fixeez MSKU | 108+24 Fixeez | Cartes : `236426654358`. Fixeez : `236423984089` (noms nus → checklist). f06 Main de Mickey = galerie eBay `art.ebay.jpg`. Install eBay cartes : crop fixe L/R 255 (pas Fixeez). |
| disney26 | — | **99+24** noms ColleX (9 stubs album) | Faces encore absentes ; Coleka listing toujours null — gate faces/Coleka ouverte, **noms densifiés**. |

### Trous faces (0 art sur disque) — audit sources 2026-10-24

Périmètre déjà utilisé pour faces Leclerc : **Coleka** (`cartes-de-supermarche` + CDN), **eBay** (disney25 only), **Panini/Bibelotmania** (packshots album/pochette, **pas** grille faces), **TCDB / laststicker / Wayback** (rejetés : 403 / checklist sans scan bulk).

| Set | Checklist | Coleka | Autres | Verdict harvest |
|-----|----------:|--------|--------|-----------------|
| `sw15` | **54** noms Coleka | **Oui** — feuille [`cartes-leclerc-star-wars-2015_r35`](https://www.coleka.com/fr/cartes-de-collection/cartes-star-wars/autres-cartes-star-wars/cosmic-shells-star-wars-leclerc/cartes-leclerc-star-wars-2015_r35) (hub [`_r440`](https://www.coleka.com/fr/cartes-de-collection/cartes-star-wars/autres-cartes-star-wars/cosmic-shells-star-wars-leclerc_r440)) | TCDB Cosmic Shells 2015 ; Bibelotmania album | **Noms OK** — faces staging déjà là |
| `sw16` | **54** noms Coleka | **Oui** — feuille [`leclerc-cosmic-shell-2016-rogue-one_r343`](https://www.coleka.com/fr/cartes-de-collection/cartes-star-wars/autres-cartes-star-wars/cosmic-shells-star-wars-leclerc/leclerc-cosmic-shell-2016-rogue-one_r343) | SWU 1–54 ; Bibelotmania album | **Noms OK** — idem |
| `sw18` | **90** noms Coleka | **Oui** — [`leclerc-star-wars-solo_r4483`](https://www.coleka.com/fr/cartes-de-collection/cartes-star-wars/autres-cartes-star-wars/leclerc-star-wars-solo_r4483) | laststicker / TCDB / Paninimania samples | **Noms OK** — dump + Sync |
| `sw19` | **114** noms Coleka | **Oui** — [`star-wars-maitriser-la-force-leclerc-2019_r11922`](https://www.coleka.com/fr/cartes-de-collection/cartes-star-wars/autres-cartes-star-wars/star-wars-maitriser-la-force-leclerc-2019_r11922) | laststicker / eBay / Paninimania samples | **Noms OK** (A–H→089–096, J→`jNN` ; titres J = `J NN/18` Coleka) |
| `marvel20` | **184** noms Coleka | **Oui** — [`marvel-2020-deviens-un-heros-leclerc_r15811`](https://www.coleka.com/fr/stickers-autocollants/stickers-de-supermarche/marvel-2020-deviens-un-heros-leclerc_r15811) (**stickers**) | laststicker / Paninimania samples | **Noms OK** — dump + Sync (`C0NN`→`cNN`) |
| `disney26` | noms ColleX | Non | ColleX album | **Attendre** faces Coleka / eBay / scan ; noms OK |

`COLEKA_LECLERC_LISTINGS` = sw15 + sw16 + sw18 + sw19 + marvel20–24 + disney25. Hub `_r440` = doc seulement. Sync installe aussi depuis dumps staging si Flare muré.

TCDB Images / laststicker / Wayback : toujours pas de harvest faces bulk fiable (403 / promo / checklist sans art).

**Astuce** : Turnstile → ouvrir `?nbpp=240` → sauver `div.schema` →
`data/leclerc/<set>/staging/coleka-faces/listing-0.html`.

## Session 2026-11-22 — faces manquantes `sw15/display`, `sw16/display`, `disney26/pochette`

Constat : ces trois produits n'ont **jamais** eu d'image (ni git, ni NAS, ni
`curated/` ; ce n'est pas un défaut d'import — les 9 displays curés servent
bien `/face`). Les displays sw15/sw16 sont des stubs `sealedSeed.ts` (pas de
`leclerc-sw15|16-sealed.json`).

| Source | Résultat | Statut |
|--------|----------|--------|
| Bibelotmania [idm=6150](https://www.bibelotmania.com/visite.php?pag=cid508_alb&idf=3&idm=6150) / [idm=7174](https://www.bibelotmania.com/?pag=cid508_alb&idf=3&idm=7174) | 16 / 13 visuels (offre, album, plateau, pochette, Cosmic Box, jetons) — **aucun présentoir**. Copies brutes : `data/leclerc/staging/bibelotmania/` | done |
| Web (FR, collectionneurs, Coleka) | aucun présentoir Cosmic Shells 2015/2016 attesté ; seule pièce carton = « Cosmic Box » 2016 (à monter, offerte avec l'album — pas un display) | skip |
| [ColleX actu 2026](https://www.collexstash.com/fr/news/cartes-disney-leclerc-2026) | visuel offre (album, cartes, Fixeez) — **pas de pochette** | done |
| eBay [880017384331](https://www.ebay.fr/itm/880017384331) / [880018725722](https://www.ebay.fr/itm/880018725722) (lots de pochettes 2026 neuves) | pochettes photographiées, mais page anti-robot (403 / challenge) : récupération **manuelle** par le propriétaire uniquement | watch |

Reste ouvert : packshot pochette disney26 (eBay / Leboncoin / Vinted, à poser
à la main en `products/disney26/pochette/fr/art.<source>.*` avec l'URL de
l'annonce) ; displays sw15/sw16 sans source connue — ne pas réouvrir sans
nouvelle piste (photo magasin, forum Bibelotmania).

Piste écartée (2026-11-22) : [swnz CosmicShells08.jpg](https://swnz.co.nz/wp-content/uploads/2016/08/CosmicShells08.jpg)
(article : [SWNZ — « Closer look: Cosmic Shells », 2016-08-04](https://swnz.co.nz/2016/08/04/closer-look-cosmic-shells/))
= dos de pochette **Countdown NZ** (anglais, « Made for: Progressive Enterprises
Limited, Mangere », sans EAN) — même campagne BrandLoyalty mais autre marché ;
ne pas l'utiliser comme dos `fr` sw15/sw16 (le dos FR sw15 porte EAN
8718973007422 et mentions françaises). Copie brute :
`data/leclerc/staging/swnz/`. **skip**. Dos FR pochette sw16 toujours manquant.

## Session 2026-11-22 — ColleX (collexstash.com) : faces candidates

Source branchée : `collexFaces.ts` (+ parseur partagé
`providers/shared/collexstash/parseCollection.ts`). Pages déclarées dans
`COLLEX_LECLERC_COLLECTIONS` ; la Sync relit le flux RSC (toute la
collection, pas seulement les vignettes rendues), écrit
`data/leclerc/sources/collex-<set>-faces.json` puis pose `art.collex.webp`.
Citation = la page collection (une image nue n'est pas une citation ouvrable).

| Set | Page | Visuels au 2026-11-22 |
|-----|------|----------------------|
| `disney26` | [cartes](https://www.collexstash.com/fr/collections/cards/cartes-disney-leclerc-2026) + [Fixeez](https://www.collexstash.com/fr/collections/figures/fixeez-disney-leclerc-2026) | 108 + 24 — tous appariés |
| `disney25` | [cartes](https://www.collexstash.com/fr/collections/cards/cartes-disney-leclerc-2025) + [Fixeez](https://www.collexstash.com/fr/collections/figures/fixeez-disney-leclerc-2025) | 7 + 8 |
| `marvel21` | [cartes](https://www.collexstash.com/fr/collections/cards/cartes-marvel-leclerc-2021) | 108 |
| `marvel22`–`24` | pages cartes (+ Fixeez 23/24) | 0 — **watch** (repris à chaque Sync) |

- Cartes appariées par numéro imprimé ; Fixeez (sans numéro ColleX) par nom,
  seulement si un seul `fNN` du catalogue porte ce nom.
- Les visuels ColleX sont des **photos de collectionneurs** (~400 px, parfois
  sur une table) → provenance `listing_photo`, comme eBay. Le moteur
  (`pickBestCatalogueFace`) garde l'affichage eBay (Disney, ~1050 px) et
  Coleka (Marvel 21) ; ColleX reste candidate sur disque (étagère,
  reconnaissance d'image). L'étape ColleX tourne en dernier dans `faces`
  pour comparer à toutes les faces déjà posées.
- `writeAssets` : la `source_url` suit désormais la face (changer d'`art` ne
  garde plus l'URL d'une autre source).

## Session 2026-11-22 — documents d'opération

Étape Sync `documents` (réseau) : `curated/documents/<set>.json` →
`data/leclerc/<set>/documents/{lang}/{kind}/` (index + vignettes,
`harvestPackDocuments`). Classement vérifié sur le contenu (dates lues sur les
visuels / PDF) :

| Set | Documents |
|-----|-----------|
| `disney26` | règlement « Disney 2026 » (27/10–13/12/2026), liste des magasins participants, 6 pages / bandeaux catalogue `nos-catalogues-promos-v2`, page promocataloguesfr (10/11/2026), visuel 123catalogue, 3 bannières `media.e.leclerc` ; page [Jeu Disney](https://www.e.leclerc/e/jeu-disney) en lien seul |
| `disney25` | 4 pages catalogue « La magie de Disney » (28/10–13/12/2025), bannière solidwind ; feuilletage du catalogue 28/10–08/11/2025 en lien seul |
| `marvel24` | modalités « Marvel 2024 » (29/10–15/12/2024 — l'URL dit `.docx`, le fichier est un PDF) + liste des magasins |

`download: true` est requis pour les URL sans extension (CDN `/media/<hash>`,
proxy `func=proxy`) ; l'extension du fichier vient de ses octets.

## Session 2026-11-22 — passe sources externes (liste ChatGPT, revérifiée)

Point de départ : liste de ~100 URL produite par ChatGPT. **Aucune valeur
reprise telle quelle** : chaque URL a été ouverte (statut HTTP + type), les PDF
lus (texte ou rendu de page), les images regardées, les finitions relues sur
la fiche Paninimania.

**Finitions** (ledgers `data/leclerc/sources/leclerc-<set>-checklist.json`,
champ `rarity` + `raritySource`) :

| Set | Finitions | Source |
|-----|-----------|--------|
| `marvel20` | brillante 017, 030, 050, 092 ; pailletee 021, 048, 060, 108, 110, 124, 125, 134 | [Paninimania idm=7013](https://www.paninimania.com/?pag=cid508_alb&idf=15&idm=7013) |
| `sw19` | brillante 011, 022, 031, 046 ; argentee 005, 016, 067, 080 | [Paninimania idm=6809](https://www.paninimania.com/?pag=cid508_alb&idf=15&idm=6809) |

`marvel21`–`23` : les numéros proposés étaient déjà ceux du ledger (TCDB).

**Documents** : `curated/documents/<set>.json` complétés pour toutes les ops
(catalogues E.Leclerc copiés par A3 Distrib / InPromo / Pont-l'Abbé, visuels
publicitaires, articles, photos de collectionneurs, vidéos, opérations
connexes préfixées « Opération connexe — »). Catalogues lus :

| PDF | Période (couverture) | Page op |
|-----|----------------------|---------|
| A3 1005889 | 29/10–09/11/2024 | Marvel p.1 + p.3 |
| A3 1006246 | 22/10–02/11/2024 | Marvel p.3 |
| InPromo high-tech-1 (LU) | oct. 2024 (texte : op 29/10–15/12/2024) | Marvel p.2 |
| Pont-l'Abbé 21G311G | 09–20/11/2021 | Marvel p.1–2 (pochette par 30 € ou 2 produits partenaires) |
| A3 1028645 | 21–30/11/2025 (Black Friday) | Disney p.2 |
| A3 1030078 | 09–21/12/2025 | Disney/Stitch p.2 |

**Mesures de collectionneur** (Fanzine Omega, non fabricant — pas écrites dans
les ledgers scellés, faute de champ) : marvel20 album 22,4 × 29 cm, pochette
6,9 × 6,8 cm, sticker 4,4 × 6,1 cm, 52 p. couverture comprise (Paninimania
dit 50 p.) ; marvel21 album 22,5 × 29 cm, 32 p., pochette 12 × 8,8 cm, carte
5,1 × 7,7 cm. La photo Fanzine Omega de la boîte « Deviens un héros »
(« Collectionne les 144 autocollants ») est le carton présentoir marvel20 —
candidate face `display` ; aucun nombre de pochettes.

**`sw17` — MicroPopz 2017** : op ajoutée le 2026-11-22 (voir section suivante).
Documents dans `curated/documents/sw17.json`.

**Écarté** : Ouest-France « cartes Disney de retour » (renvoie à l'accueil),
YouTube `gvjS8SbiasQ` (introuvable), image LeBonCoin X-Wing (400) et
catégorie LBC (403), dialog.cm Courtheoux / cfid.fr / lesaloon1970-80
(injoignables), pages d'index Toutgagner `?page=8` (contenu glissant),
fiches eBay 266509011836 / 6087691161 (403 ; les images CDN sont gardées),
Vimeo 238365479… (404/403), profils LinkedIn individuels (pistes, pas
documents), portfolio Dal Bello et offre d'emploi L-founders (contexte
métier, pas l'op). GeekParadize MicroPopz (anti-robot) non vérifié.

## Session 2026-11-22 — op `sw17` Star Wars MicroPopz

Figurines (bustes à ventouse), pas des cartes — même pipeline de ligne
(`printKey` `leclerc:sw17-NNN`, catégorie `card`).

| Fait | Valeur | Source |
|------|--------|--------|
| Période | 24/10–09/12/2017 | [visuel modalités officiel](https://www.mintinbox.net/wp-content/uploads/2017/10/portail-s42-star-wars-1222x1203-modalites-v3.jpg) |
| Pochette | **1 MicroPopz** par tranche de 30 € ou produit partenaire | idem |
| Coffret Collector (Faucon Millenium) | **1,99 €** | idem |
| Lunettes VR (cardbox) | **2,99 €** | [scan catalogue Mintinbox](https://www.mintinbox.net/wp-content/uploads/2017/10/leclerc_micropoz-e1508152266737.jpg) |
| Noms des 25 | Coleka | [rubrique `_r2836`](https://www.coleka.com/fr/figurines-de-collection/petites-figurines/stikeez-popz/micropopz-star-wars-leclerc_r2836) (28 objets = 25 + coffret + cardbox + pochette) |
| Numérotation | **aucun n° imprimé** → 001–025 = ordre de la [planche officielle](https://www.mintinbox.net/wp-content/uploads/2017/10/portail-s42-star-wars-1222x1727-pres-micropopz-v5.jpg), rangées gauche→droite ; identique à l'ordre des fiches Coleka i153671→i153695 | contrôle visuel |

Ledgers : `data/leclerc/sources/leclerc-sw17-checklist.json` (noms + lien de
chaque fiche Coleka), `leclerc-sw17-sealed.json` (coffret, pochette 1,
`lunettes-vr` en `ephemera`), faces dans `coleka-cdn-faces.json` → `sets.sw17`
(n° explicites, car les fiches n'ont pas de « Ref. » et le listing ne
peut pas les apparier). Packshots scellés : URLs Coleka citées dans le ledger,
**pas copiés** en `curated/` (publics). Display : stub, `packsContained` null.
Pas de dos commun.

## Session 2026-11-23 — ledgers publics produits par la Sync (étape `ledgers`)

Décision du propriétaire : ce qui se relit publiquement ne vit ni en
`curated/` ni en édition manuelle de `data/` — la Sync le (re)produit, un lien
profond par fait. Nouvelle étape Sync **`ledgers`** (online, avant `seed`) :
`ledgerSync.ts`, sources déclarées par op dans `ledgerSources.ts`
(`LECLERC_LEDGER_SOURCES`, comme `COLLEX_LECLERC_COLLECTIONS`). Copie de
référence des fichiers faits à la main : `backups/leclerc-sources-2026-11-22/`.

| Fichier | Fait | Source relue | Accès |
|---------|------|--------------|-------|
| `leclerc-marvel20/sw19-checklist.json` | noms + lien fiche par carte | listing Coleka : page vivante (gabarit k5, Byparr) + dumps `?nbpp=240` déjà en staging | page 1 vivante ; complet via staging |
| idem | `rarity` (brillante / pailletee / argentee) + `raritySource` | [Paninimania idm=7013](https://www.paninimania.com/?pag=cid508_alb&idf=15&idm=7013), [idm=6809](https://www.paninimania.com/?pag=cid508_alb&idf=15&idm=6809) — blocs « Images … *code : n, n » | `httpGet` direct (Windows-1252) |
| idem | `operation` (période, pochette, seuil, prix album) | même fiche Paninimania | idem |
| `leclerc-sw17-checklist.json` | 25 noms + lien fiche | [listing `_r2836`](https://www.coleka.com/fr/figurines-de-collection/petites-figurines/stikeez-popz/micropopz-star-wars-leclerc_r2836) (28 tuiles, une page) ; repli [Wayback 2025-06-09](https://web.archive.org/web/20250609152258/https://www.coleka.com/fr/figurines-de-collection/petites-figurines/stikeez-popz/micropopz-star-wars-leclerc_r2836) | vivant OK le 2026-11-22 (cache) |
| idem | n° 001–025 | ordre des fiches Coleka i153671→i153695 (hors 3 SKU scellés déclarés) ; écrit **seulement si 25** | règle déclarée, citée ([article Mintinbox 23/10/2017](https://www.mintinbox.net/2017/10/23/leclerc-star-wars-micropopz-devoilent-officielement/), planche officielle) |
| idem | `operation` 24/10–09/12/2017, 30 € | [article Mintinbox 16/10/2017](https://www.mintinbox.net/2017/10/16/leclerc-star-wars-micropopz/) (texte) | `httpGet` |
| `leclerc-sw17-sealed.json` | coffret 1,99 €, lunettes VR 2,99 € (+ date 2017-10-24) | fiches Coleka [`coffret-collector_i153696`](https://web.archive.org/web/20250609152312/https://www.coleka.com/fr/figurines-de-collection/petites-figurines/stikeez-popz/micropopz-star-wars-leclerc/coffret-collector_i153696), [`cardbox-lunettes-vr_i153697`](https://web.archive.org/web/20250609152312/https://www.coleka.com/fr/figurines-de-collection/petites-figurines/stikeez-popz/micropopz-star-wars-leclerc/cardbox-lunettes-vr_i153697) « Prix dans le commerce » | fiche vivante = mur Turnstile → **copie Wayback** (citée par SKU, `citations.priceCents`) |
| idem | pochette = 1 MicroPopz | visuel modalités officiel (article Mintinbox 23/10/2017) | **déclaré** dans `ledgerSources.ts` (lecture d'image, pas de texte) |
| `coleka-cdn-faces.json` → `sets.sw17` | 25 URLs `thumbs.coleka.com` | vignettes du listing (`_250x250` retiré) | CDN répond sans contrôle |

Règles de l'étape :

- lecture partielle ≠ effacement : cartes, `aka`, `rarity` déjà attestés
  restent ; un prix attesté reste si sa fiche ne se relit pas ;
- finitions relues = vérité (une carte hors liste Paninimania perd son
  `rarity`) ; Paninimania injoignable → ledger non réécrit ;
- numérotation par ordre de fiche : rien n'est écrit si le compte attendu
  (25) n'est pas atteint (sinon les numéros glisseraient) ;
- la fiche Coleka « Pochette » annonce « 2 € » : **non repris** (la pochette
  est offerte par tranche de 30 €).

Écart avec la sauvegarde (Sync depuis zéro, 2026-11-22) : cartes, finitions,
bloc CDN sw17 et valeurs scellées **identiques** ; seules les métadonnées
diffèrent (libellés `source`, `url` sans `?nbpp=240`, citations ajoutées,
`operation.sources` par champ, compteurs `coverage` spécifiques
`memoryCards`/`stickers`/`gameBacks` non recalculés — gardés quand le
ledger existe).

Reste non automatisable :

- **Listings Coleka complets** marvel20 / sw19 : pages `?p=2…` et
  `?nbpp=240` derrière Turnstile, aucune copie Wayback du listing ; la Sync
  relit les dumps navigateur déjà en staging (`listing-nbpp.html`). Sans eux,
  seule la page 1 vivante (≈ 46–60 tuiles) se relit — les autres cartes du
  ledger restent (jamais effacées) mais ne sont pas re-vérifiées.
- **Concordance planche ↔ ordre Coleka** (sw17) : contrôle visuel, pas
  d'OCR ; la règle est déclarée et citée.
- **Pochette sw17 = 1 figurine** : lu sur le visuel modalités (image) ;
  l'article du 16/10 le dit en texte libre (« chaque figurine … dans un
  sachet opaque ») — valeur déclarée, citée.

Corrigé au passage : `parseColekaLeclercListing` lit aussi le gabarit
**k5** servi en direct depuis 2026-11 (`Ref. 001 · 2020`) — avant, une page
vivante rendait 0 carte et seuls les dumps staging alimentaient les faces.
`waybackCdxQueryUrl` demande `fl=timestamp,original,…` (sans, le CDX met la
urlkey en tête).
