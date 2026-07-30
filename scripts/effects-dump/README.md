# effects-dump — Unity + web foil assets per TCG pack

Pipeline to refresh **generated** card-effect assets in the repo. Outputs are
pack-scoped under `public/foil/<pack>/` and `src/effects/<pack>/`.

Do **not** hand-edit dumped `.frag` files or `manifest.json` — regenerate with
`dump_unity.py`. Web finish mappings stay in `src/effects/lorcana/cssRecipes.ts`.

## Setup

```sh
cd scripts/effects-dump
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Unity bundle (Lorcana mobile app)

Point `--data` at the APK `assets/bin/Data` folder (contains `data.unity3d`, or
`datapack.unity3d` as fallback).

```sh
.venv/bin/python dump_unity.py \
  --pack lorcana \
  --data /path/to/apk/assets/bin/Data \
  --repo ../..
```

| Output | Path |
|--------|------|
| Shader fragments (Tilt + Time) | `public/foil/<pack>/shaders/*.frag` |
| Material bindings | `src/effects/<pack>/manifest.json` |
| Textures (PNG + best-effort ASTC) | `public/foil/<pack>/textures/` |
| Card back sprite | `public/foil/<pack>/card_back.png` |

### ASTC (best-effort)

Many in-app textures use ASTC. The script always writes **PNG** decodes via
UnityPy/Pillow. When raw block data is available (`Texture2D.get_image_data()`),
it also writes `{name}.astc` (level-0 payload, no KTX header) and adds an
`astc` object on manifest texture bindings (`file`, `width`, `height`,
`format` e.g. `COMPRESSED_RGBA_ASTC_6x6_KHR`). Extraction depends on UnityPy
and the bundle layout — treat ASTC as best-effort; PNG remains the fallback.

## Lorcana web viewer textures

Syncs root-level `public/foil/*.{jpg,png}` (excluding `lorcana/`, `app/`,
`unity/`) into `public/foil/lorcana/web/`. Optionally tries to fetch extra
`url(...foil...)` assets from [cards.disneylorcana.com](https://cards.disneylorcana.com).

```sh
.venv/bin/python dump_lorcana_web.py --repo ../..
```

Typed CSS finish → texture ids: `src/effects/lorcana/cssRecipes.ts` (not edited
by this script).

## Other games

- **Pokémon TCG Pocket** is not dumpable the same way (different stack) — see
  `docs/tcg_support.md`; support as a separate pack later.
- Legacy location: `scripts/unity-dump/` — use **effects-dump** for new work.

See also `docs/tcg_support.md` §9 for the Unity GLES → WebGL2 approach.
