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
  uploads/                 → /uploads/…   (user media only, flat)
  lorcana/ | pokemon/
    catalog.sqlite         # pack catalogue index
    cards-index.json       # client-safe export (schema v1) — data only
    liveFoilMasks.json     # Pokémon (optional)
    liveOwned.json / reprintMeta.json  # Pokémon (optional)
    cards/                 → /assets/<pack>/cards/…
      back.webp            # pack default verso (see foil_apk_sources.md)
      {set}/{lang}/{card}/ # art.*, mask.*, thumb.*, …
    foil/                  → /assets/<pack>/… (shaders, textures FX, web, meta)
      shaders/ textures/ web/
      manifest.json | materialSheets.json | frag-stems.json | shared-motifs.json …
      card-uv-rect.json    # Pokémon UV crop (optional; APK-gated)
      full_foil_mask.webp  # Pokémon pack-level (optional)
    staging/               # apks, cdn-*, malie-*, unity-data, config-cache…
    logs/
      last-run.json
      web-source.json      # Lorcana dump provenance
  launchbox|icollect|nointro/
  indexes/title-idf/
```

`public/` stays git-static only (icons, SW, …).

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

## Scripts — one folder per pack

| Path | Role | pnpm |
|------|------|------|
| `scripts/lorcana/` | Node: web CSS + cards; Python: Unity APK | `foil:lorcana` · `foil:lorcana:cards` |
| `scripts/pokemon/` | Node: CDN scrape, SQLite index, audits; Python: UnityFS extract | `foil:pokemon` · `:scrape` · `:sources` · `:index-cards` |
| `scripts/foil/` | Gap audit + layout migrate/rebuild | `foil:audit-gaps` |
| `scripts/icollect/` | catalog index | `icollect:update` |
| `scripts/launchbox/` | Metadata.zip → SQLite (+ `--enqueue` job) | `launchbox:update` |
| `scripts/nointro/` | DAT → SQLite (+ `--enqueue` job) | `nointro:update` |
| `scripts/title-idf/` | title-token DF | `title-idf:update` |

**Node vs Python:** everything that is not Unity asset extract runs under `tsx` / Node. Python stays only where **UnityPy** is required. Shared path helpers: `scripts/lib/foilPaths.ts` (+ `scripts/lib/paths.py`).

Historical Live handoff notes: [archive/tcglive_effects.md](archive/tcglive_effects.md).
