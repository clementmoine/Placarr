# Third-party foil CSS (vendored)

Reference CSS trees copied into the repo (not git submodules), same spirit as
Lorcana’s dumped recipes: edit / adapt locally; refresh from upstream only when
you intentionally re-vendor.

| Path | Upstream | Licence | Pinned commit |
|---|---|---|---|
| `simeydotme-pokemon-cards-css/` | [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) (poke-holo) | GPL-3.0 | see `UPSTREAM_COMMIT` |
| `simeydotme-pokemon-cards-151/` | [pokemon-cards-151](https://github.com/simeydotme/pokemon-cards-151) | GPL-3.0 | see `UPSTREAM_COMMIT` |

**What is vendored:** `public/css/` + `LICENSE` + `README.md` only (no upstream
foil PNGs).

**Runtime:** Placarr does **not** load these `.css` files in the browser.
Recipes live in `src/core/render/holoShadersSimey.ts` /
`holoShadersPokemon.ts`, adapted under Placarr’s GPL. Use the trees as the
source of truth when porting a rarity.

## Refresh from upstream (rare)

```bash
# Example: re-copy CSS from a fresh clone, then update UPSTREAM_COMMIT.
git clone --depth 1 https://github.com/simeydotme/pokemon-cards-css.git /tmp/poke-holo
rsync -a --delete /tmp/poke-holo/public/css/ third_party/simeydotme-pokemon-cards-css/public/css/
cp /tmp/poke-holo/LICENSE /tmp/poke-holo/README.md third_party/simeydotme-pokemon-cards-css/
git -C /tmp/poke-holo rev-parse HEAD > third_party/simeydotme-pokemon-cards-css/UPSTREAM_COMMIT
```

Then re-adapt the touched recipes in `holoShadersSimey.ts` / tests.
