# Data layout

Runtime data lives under **`data/`** (bind-mounted in Docker). Next streams it — no `public/` symlinks for uploads or pack assets.

## Local-first pack / catalogue media

**Scrape = bytes as published** (JPEG masks, CDN textures, art). No bake / resize
at scrape time. Runtime may transform for display (e.g. Safari alpha from a
greyscale JPEG — same idea as `cards.disneylorcana.com`).

Once a file is under `data/<pack>/foil/` or `data/<pack>/cards/`, product URLs are
**`/assets/<pack>/…`**. External CDNs (Ravensburger, TCGdex, Live) are scrape
sources + cold-start fallback only. **`data/uploads/`** = user media (custom
covers, crops) — not catalogue masks. Layout stays **flat** (`hash.ext` +
`hash_crop.ext`).

```
data/
  uploads/
  lorcana/ | pokemon/
    catalog.sqlite | cards-index.json | products-index.json | cards/ | foil/ | staging/ | logs/
    # lorcana/staging/lorcards-products/  — Sync admin (famille TCG Cards)
    # lorcana/staging/set-logos.json      — wordmarks de chapitre (viewer)
    # lorcana/products/sets/{set12}/logo.png
    # pokemon/staging/pkmcards-products/  — Sync admin (même famille)
    # pokemon/staging/tcgdex-set-logos.json — wordmarks d'extension (API)
  # prévu, pas encore sur disque : onepiece/staging/opecards-products/,
  # yugioh/staging/ygocards-products/, mtg/staging/mtgcards-products/
  # (CLI famille ; pas encore de pack Catalogue ; mtg = rayon scellé mince)
  naruto/                          # franchise ombrelle
    carddass/                      # un pack (Carddass + CCG). `naruto/en-ccg` = alias disque
      catalog.sqlite | cards-index.json | products-index.json | appearances.json
      facts-ja.json | facts-hinokunian.json   # relevés de titres JA
      cards/
        back.fr.webp | back.en.webp | …   # sleeve par langue (pas de back.webp générique)
        back.en.webp | back.it.webp | back.ja.webp
        {ninja|jutsu|mission|client|promo}/{ni0001|n0001|nus0097}/{fr|en|it|ja}/
          art.<source>.<ext>   # un dump par hôte (carddass, nikita, suruga, …)
          art.jpg              # legacy, non renommé
          art.reconstructed.* | art.corrected.*
          face.json            # fichier affiché (raw éditeur FR > photo Coleka ; sinon pixels)
      products/
        {slug}/{fr|en|it|ja}/
          art.<source>.<ext>   # packshots, tous les hôtes
          logo.<source>.<ext>  # wordmark de série, recopié dans chaque SKU
          face.json
      staging/  carddass-fr/ | carddas-jp/ | bandaicg-en/ | goat-en-ccg/ | cardgameclub-it/ | coleka-s6-it/ | stop2shop-uns3/ …
      logs/
    en-ccg/                        # alias → carddass (staging historique peut rester ici)
    shippuden/                     # 「疾風伝 カードゲーム」 — autre jeu, autre pack
    ninja-ranks/                   # Panini / Inkworks Ninja Ranks (titres EN ; packshots en produits, éditions US Inkworks + EU Panini ; 2 faces échantillon)
      locale-specific-faces.json | prints.sqlite
    ultra-challenge/               # Panini Ultra Challenge (lamincards, 2007)
  dbs/                             # franchise Dragon Ball Super
    cg/                            # Masters (provider dbscg)
      catalog.sqlite | cards-index.json | products-index.json
      facts.json | dbscards-fr.json | dbscards-en.json | scrape-summary.json
      backup/
      cards/back.webp              → /assets/dbs/cg/cards/back.webp
      cards/{set}/fr/{card}/art.webp   # dbscards / Bandai (FR)
      cards/{set}/en/{card}/art.webp   # clone TCG Arena / Deckplanet
      staging/dragon-ball-masters-arena/  # git clone, gitignored
      staging/dbscards-products/          # Sync admin Masters
      foil/full_foil_mask.webp
      logs/
    fw/                            # Fusion World (provider dbsfw)
      catalog.sqlite | cards-index.json | products-index.json
      cards/back.webp              → /assets/dbs/fw/cards/back.webp
      staging/dbscards-products/          # Sync admin Fusion World
      foil/full_foil_mask.webp
      logs/
  launchbox|icollect/
  # nointro/ prévu — provider + index SQLite existent, rien de synchronisé sur disque
  indexes/title-idf/               # vide tant que `pnpm title-idf:update` n'a pas tourné
  logs/                            # artefacts d'audit foil (writer : src/providers/pokemontcglive/liveCard.ts)
```

`naruto` = franchise ; **`naruto/carddass`** = Carddass + CCG (plus d’onglet Bandai CCG). **`naruto/shippuden`**, **`naruto/ninja-ranks`**, **`naruto/ultra-challenge`** = autres jeux, autres packs. Layout Carddass :
`cards/{family}/{ni0001|n0001|nus0097}/{lang}/` — family = tri (`ninja`…), id = préfixe
imprimé + numéro. NI et N sont **voisins**, pas la même carte. `N-US097` n’est
pas `N-097` : disque `nus0097`, printKey `naruto:nus-0097`. La série (`s1`,
`s28`) est une apparition dans `catalog.sqlite` / `appearances.json`, pas un
dossier. printKey : `naruto:ni-0001` / `naruto:n-0001` / `naruto:nus-0097`
(alias `sN-*`).
`printed=false` (S6 FR) : visible au catalogue, absent du picker.
Faces : **jamais ignorer un hôte** parce qu’une autre illustration est déjà là.
Chaque dump reste `art.<source>.<ext>` ; `face.json` choisit l’affichage
(pixels, tie-break par locale). `art.jpg` non sourcé restant = `legacy`
(thumbs EN bizarres, photos collectionneur) — le reste a été reclasse.
Produits scellés : même contrat sous `products/{slug}/{lang}/` (`art` +
`logo`). Le wordmark de série est recopié dans chaque SKU (Pokémon / Lorcana
déjà un logo par produit ; Naruto S1–S5 partagent un GIF — on duplique).
Titres attestés sans face (BGG EN S1, Coleka FR, Slab-Z JA) : print +
`langs.*.name` dans `cards-index.json`, pas de dossier vide.
PR-096 a désormais une face FR (`art.leboncoin`) et EN (`art.drive` + `art.coleka`).
Les 101 promos US Coleka `_r38199` (`PR-001`–`100` + `005R`–`009R`) vivent sous
`cards/promo/pr0nnn/en/` — pas l’ombrelle `_r4102`, pas les tins FR.
Provider : `src/providers/narutocarddass/`. Sync : Catalogue Extract (admin /
worker) — voir [naruto_carddass_tcg.md](naruto_carddass_tcg.md).
Dos = langue : `cards/back.{fr|en|it|ja}.webp` depuis
`curated/cards/back.{lang}.png`. Pas de `back.webp` sans langue sur Naruto.
Reconstruct : `curated/cards/{family}/{id}/{lang}/art.reconstructed.png`
(+ `source.jpg`). Ledgers JSON : `curated/sources/`. Le markdown **est
autorisé** dans `curated/` comme documentation locale (`BACK.md` chez dbscg,
dbsfw, narutoshippuden, narutoranks, narutoultra) — jamais installé vers
`data/` (`curatedCardsInstall` ne copie pas le markdown).

`dbs` = franchise ; **`dbs/cg`** = Masters (`dbscg:bt1-001`) ; **`dbs/fw`** =
Fusion World (`dbsfw:st01-001`, parallels `_P1`). Identité Masters = cardlists
Bandai **FR** (`/europe-fr/cartes/`) et **EN** (`/us-en/cardlist/`), fusionnées
sur printKey ; `cards-index.json` porte `langs.fr.name` et `langs.en.name`.
Faces Masters FR = dbscards / Bandai au sync HTTP. Faces Masters EN = clone
[TCG Arena](https://github.com/vitorjcorreia/Dragon-Ball-Masters-Arena) rangé
sous `cards/{set}/en/`. Faces FW = URLs Bandai SAMPLE (pas de dump). Dos
sleeve : curated dbscards (FW = même octet placeholder). Sync : Catalogue
Extract Masters / Fusion World (admin / worker).

## Catalogues locaux / supply modes

Voir [provider_supply_modes.md](provider_supply_modes.md) :

- **Provider catalogue** = `ProviderModule` avec `supplyMode` + hook `catalog`
  (refresh / status / `dataPack`) — core provider-blind.
- **Récupérable** → `data/<pack>/` (jamais commit). **Manuel non rejouable** →
  `src/providers/<id>/curated/` (git), installé vers `data/` au refresh —
  contrat complet : [curated_data.md](curated_data.md).
- **`src/effects/`** = moteur foil (pas les octets).
- Admin **Catalogue** : refresh all / unitaire / auto (Plex-like). Distinct de
  l’onglet Refresh metadata.

**Trous correctibles (régénération incomplète, pas curated) :**

| Artefact                              | Gap                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/pokemon/cards-index.json`       | Rebuild via `rebuildPokemonCardsIndex` — `catalog.refresh` + Catalogue Sync Pokémon                                                                                    |
| `data/<pack>/products-index.json`     | TCG Cards : ingest au Sync. Naruto Carddass : packshots + merge `curated/products-contents.json`. Ninja Ranks : packshots Inkworks US + Panini EU (`ingestNinjaRanksSealedProducts`, écriture unique des deux éditions). |
| `data/<pack>/curated/products-contents.json` | Copie runtime de la graine git provider — ne pas éditer comme original |
| `liveOwned.json` / `reprintMeta.json` | Régénérables (Rainier / TCGdex audit) ; besoin tokens + `ROOT` repo (fixés)                                                                                           |
| `catalog.refresh` Pokémon/Lorcana     | Identités/scrape + faces index ; foil Unity = Catalogue Extract (admin / worker)                                                                                      |
| Naruto `curated/sources/*.json`       | Ledgers manuels (checklist, names, sets, coleka…). **`apache-index`** → `data/naruto/carddass/logs/` (étape sources)                                                  |

Certains corpus **ne grandissent plus** (TCG Bandai arrêté, etc.) : base locale
terminée sous `data/<pack>/`. Candidat : Naruto CACG FR
([naruto_carddass_tcg.md](naruto_carddass_tcg.md)) — provider `narutocarddass`.

## Foil packs

Contrat runtime + sources de vérité (CSS vs WebGL) : [foil_effects.md](foil_effects.md).

| Pack id   | Label   | CSS                       | WebGL            | Sync produit                          |
| --------- | ------- | ------------------------- | ---------------- | ------------------------------------- |
| `lorcana` | Lorcana | Site Lorcana (`foil/web`) | App TCG Unity    | Catalogue Extract (admin / worker)    |
| `pokemon` | Pokémon | Simey → `HoloShader`      | TCG Live CDN/APK | Catalogue Extract (admin / worker)    |

URLs are **`/assets/<pack>/…`**; disk render kit is `data/<pack>/foil/…`, catalogue
faces are `data/<pack>/cards/…`. Unity dumps write **lossless WebP**.

Generated TS JSON (gitignored) is written by Catalogue Extract when missing
(empty loaders use in-code fallbacks). `full_foil_mask.webp` is created by
`installFullFoilMask` during pack extract if absent.

## Admin

`/admin?tab=tcg-effects` — playroom + APK upload + extract on host.
`foilExtract` runs on the **interactive** worker (serialized, long timeout).

`next.config.js` ignores `data/` in webpack watch so foil/CDN dumps do not thrash `next dev`.

## Scripts — repo-wide only

Provider ingest lives under `src/providers/<id>/` (see
[provider_supply_modes.md](provider_supply_modes.md)).

| Path                                     | Role             | pnpm                         |
| ---------------------------------------- | ---------------- | ---------------------------- |
| `scripts/backgroundWorker.ts`            | Background jobs  | `worker` · `worker:icollect` |
| `scripts/providerMappingAudit.ts`        | Mapping audit    | `providers:audit:mapping`    |
| `scripts/record-all-barcode-fixtures.ts` | Barcode fixtures | `test:record:all`            |
| `scripts/buildTitleIdfIndex.ts`          | Title IDF corpus | `title-idf:update`           |

Pack extracts: in-process via `catalogueExtractRunner` (admin Catalogue Sync /
worker). Audits locaux optionnels : `tsx src/providers/pokemontcglive/audit*.ts`.
Foil gaps: admin `/api/admin/foil-status` → `computeFoilGaps()` (`src/lib/admin/foilGaps.ts`).
Unity extract: Node in-process via Catalogue Sync / worker (ADR-021 A–E). Voir
[unity_without_python.md](unity_without_python.md).

Historical Live handoff notes: [archive/tcglive_effects.md](archive/tcglive_effects.md).
