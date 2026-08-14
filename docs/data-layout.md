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
    catalog.sqlite | cards-index.json | cards/ | foil/ | staging/ | logs/
  naruto/                          # franchise ombrelle
    ccg/                           # ligne Bandai CCG/JCC (provider narutoccg)
      catalog.sqlite | cards-index.json
      cards/{set}/{fr|en|jap}/{card}/  → /assets/naruto/ccg/cards/…
      staging/  carddass-fr/ | bandaicg-en/ | carddas-jp/ | manga-news/
      logs/
    # ultra-challenge/ …           # autres lignes produit plus tard
  dbs/                             # franchise Dragon Ball Super
    cg/                            # Masters (provider dbscg)
      catalog.sqlite | cards-index.json
      cards/back.webp              → /assets/dbs/cg/cards/back.webp
      cards/{set}/fr/{card}/art.webp   # dbscards / Bandai (FR)
      cards/{set}/en/{card}/art.webp   # clone TCG Arena / Deckplanet
      staging/dragon-ball-masters-arena/  # git clone, gitignored
      foil/full_foil_mask.webp
      logs/
    fw/                            # Fusion World (provider dbsfw)
      catalog.sqlite | cards-index.json
      cards/back.webp              → /assets/dbs/fw/cards/back.webp
      foil/full_foil_mask.webp
      logs/
  launchbox|icollect|nointro/
  indexes/title-idf/
```

`naruto` = franchise ; **`naruto/ccg`** = dataPack / catalogue. Layout cartes :
`cards/{set}/{fr|en|jap}/{cardId}/` — set = `s1`… / `promo` / `ns` / `spc`.
printKey : `naruto:s4-ta190` (locale hors clé). Provider : `src/providers/narutoccg/`.
CLI : `pnpm naruto:cards` — voir [naruto_carddass_tcg.md](naruto_carddass_tcg.md).
Dos : `cards/back.webp` depuis `src/providers/narutoccg/curated/`.

`dbs` = franchise ; **`dbs/cg`** = Masters (`dbscg:bt1-001`) ; **`dbs/fw`** =
Fusion World (`dbsfw:st01-001`, parallels `_P1`). Faces Masters FR = dbscards /
Bandai au sync HTTP. Faces Masters EN = clone
[TCG Arena](https://github.com/vitorjcorreia/Dragon-Ball-Masters-Arena) rangé
sous `cards/{set}/en/`. Faces FW = URLs Bandai SAMPLE (pas de dump). Dos
sleeve : curated dbscards (FW = même octet placeholder). CLI : `pnpm dbs:cards`
/ `pnpm dbs:fw`.

## Catalogues locaux / supply modes

Voir [provider_supply_modes.md](provider_supply_modes.md) :

- **Provider catalogue** = `ProviderModule` avec `supplyMode` + hook `catalog`
  (refresh / status / `dataPack`) — core provider-blind.
- **Récupérable** → `data/<pack>/` (jamais commit). **Manuel non rejouable** →
  `src/providers/<id>/curated/` (git), installé vers `data/` au refresh
  (Naruto : `curated/{back,reconstructed,sources}` — voir
  `src/providers/narutoccg/curated/README.md`).
- **`src/effects/`** = moteur foil (pas les octets).
- Admin **Catalogue** : refresh all / unitaire / auto (Plex-like). Distinct de
  l’onglet Refresh metadata.

**Trous correctibles (régénération incomplète, pas curated) :**

| Artefact | Gap |
|----------|-----|
| `data/pokemon/cards-index.json` | Rebuild via `rebuildPokemonCardsIndex` — `catalog.refresh` + `foil:pokemon` + `pnpm foil:pokemon:rebuild-cards-index` |
| `liveOwned.json` / `reprintMeta.json` | Régénérables (Rainier / TCGdex audit) ; besoin tokens + `ROOT` repo (fixés) |
| `catalog.refresh` Pokémon/Lorcana | Identités/scrape + faces index ; foil Unity = CLI / foilExtract |
| Naruto `curated/sources/*.json` | Ledgers manuels (checklist, names, sets, coleka…). **`apache-index`** → `data/naruto/ccg/logs/` (`pnpm naruto:cards -- --only sources`) |

Certains corpus **ne grandissent plus** (TCG Bandai arrêté, etc.) : base locale
terminée sous `data/<pack>/`. Candidat : Naruto CACG FR
([naruto_carddass_tcg.md](naruto_carddass_tcg.md)) — provider `narutoccg`.

## Foil packs

Contrat runtime + sources de vérité (CSS vs WebGL) : [foil_effects.md](foil_effects.md).

| Pack id | Label | CSS | WebGL | CLI |
|---------|-------|-----|-------|-----|
| `lorcana` | Lorcana | Site Lorcana (`foil/web`) | App TCG Unity | `pnpm foil:lorcana` |
| `pokemon` | Pokémon | Simey → `HoloShader` | TCG Live CDN/APK | `pnpm foil:pokemon` |

URLs are **`/assets/<pack>/…`**; disk render kit is `data/<pack>/foil/…`, catalogue
faces are `data/<pack>/cards/…`. Unity dumps write **lossless WebP**.

Generated TS JSON (gitignored) is ensured from stubs:

```bash
pnpm foil:ensure
```

## Admin

`/admin?tab=tcg-effects` — playroom + APK upload + extract on host.
`foilExtract` runs on the **interactive** worker (serialized, long timeout).

`next.config.js` ignores `data/` in webpack watch so foil/CDN dumps do not thrash `next dev`.

## Scripts — repo-wide only

Provider ingest lives under `src/providers/<id>/` (see
[provider_supply_modes.md](provider_supply_modes.md)).

| Path | Role | pnpm |
|------|------|------|
| `scripts/backgroundWorker.ts` | Background jobs | `worker` · `worker:icollect` |
| `scripts/providerMappingAudit.ts` | Mapping audit | `providers:audit:mapping` |
| `scripts/record-all-barcode-fixtures.ts` | Barcode fixtures | `test:record:all` |
| `scripts/buildTitleIdfIndex.ts` | Title IDF corpus | `title-idf:update` |

Pack CLIs: `src/providers/{lorcanatcg,pokemontcglive,naruto,icollect,launchbox,nointro}/`.
Pokémon Live↔CSS audit: `pnpm foil:audit-live-css` → `pokemontcglive/auditLiveVsCss.ts`.
Foil gaps: admin `/api/admin/foil-status` → `computeFoilGaps()` (`src/lib/admin/foilGaps.ts`).
UnityPy venv: preferred `src/providers/<id>/unity/.venv` (see `unity/README.md`).

**Node vs Python:** everything that is not Unity asset extract runs under `tsx` /
Node. Python stays only where **UnityPy** is required (`providers/*/unity/`).

Historical Live handoff notes: [archive/tcglive_effects.md](archive/tcglive_effects.md).
