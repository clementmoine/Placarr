# Data layout

Runtime data lives under **`data/`** (bind-mounted in Docker). Next streams it — no `public/` symlinks for uploads or foil.

## Local-first foil / catalogue media

**Scrape = bytes as published** (JPEG masks, CDN textures, art). No bake / resize
at scrape time. Runtime may transform for display (e.g. Safari alpha from a
greyscale JPEG — same idea as `cards.disneylorcana.com`).

Once a file is under `data/<pack>/foil/`, product URLs are **`/foil/<pack>/…`**.
External CDNs (Ravensburger, TCGdex, Live) are scrape sources + cold-start
fallback only. **`data/uploads/`** = user media (custom covers, crops) — not
catalogue masks. Layout stays **flat** (`hash.ext` + `hash_crop.ext`).

```
data/
  uploads/                 → /uploads/…   (user media only, flat)
  lorcana/
    apks/
    unity-data/
    lorcana.sqlite           # official local index (titles + asset paths)
    foil/                  → /foil/lorcana/…
      web/ shaders/ textures/
      cards/{printKey}/{lang}/
      cards-index.json       # client export from sqlite
      card_back.webp
      cards-index.json
    foil-last-run.json
    logs/
  pokemon/                 # TCG Live staging + foil
    apks/
    cdn-bundles/
    config-cache/
    live-cards.sqlite
    logs/
    foil/                  → /foil/pokemon/…
    foil-last-run.json
    # Rainier / auth / owned notes → docs/pokemon_live_rainier.md
    # playroom owned preference → src/effects/pokemon/liveOwned.json
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

URLs stay `/foil/<pack>/…`; disk is `data/<pack>/foil/…`.
Unity dumps write **lossless WebP** under `textures/` (+ `card_back.webp`).
Migrate legacy PNGs with `pnpm media:to-webp` (rewrites Lorcana `manifest.json` slots too).
`/foil/` still serves a sibling `.png` when the `.webp` URL is missing (transition).

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
| `scripts/foil/` | Gap audit (Live / simey / Lorcana web) | `foil:audit-gaps` |
| `scripts/icollect/` | catalog index | `icollect:update` |
| `scripts/launchbox/` | Metadata.zip → SQLite (+ `--enqueue` job) | `launchbox:update` |
| `scripts/nointro/` | DAT → SQLite (+ `--enqueue` job) | `nointro:update` |
| `scripts/title-idf/` | title-token DF | `title-idf:update` |

**Node vs Python:** everything that is not Unity asset extract runs under `tsx` / Node. Python stays only where **UnityPy** is required (`dump_unity` / `mobile` for Lorcana, `extract` / `card_back` for Pokémon). Shared path helpers: `scripts/lib/foilPaths.ts` (+ thin `paths.py` for the remaining Python). Each pack still has `requirements.txt`, `ensure_json.mjs`, `run.sh`. The Pokémon `.venv` may symlink to Lorcana’s for disk (same UnityPy pins).

Extras (not in `package.json`) :

```bash
tsx scripts/pokemon/auditApkCoverage.ts
tsx scripts/pokemon/audit_store.ts
tsx scripts/pokemon/audit_tcgdex_map.ts
tsx scripts/pokemon/audit_live_join.ts
pnpm media:to-webp   # PNG foil textures + uploads → lossless WebP
```

Historical Live handoff notes: [archive/tcglive_effects.md](archive/tcglive_effects.md).
