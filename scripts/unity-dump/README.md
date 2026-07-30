# unity-dump (legacy)

This folder is **deprecated** for new dumps. Use [`scripts/effects-dump/`](../effects-dump/README.md) instead:

- Pack-scoped outputs: `public/foil/<pack>/`, `src/effects/<pack>/manifest.json`
- `dump_unity.py` replaces `dump_card_effects.py` (same pipeline, `--pack` flag)
- `dump_lorcana_web.py` for viewer CSS texture sync

The original `dump_card_effects.py` and this README’s technical notes still
apply to the GLES3 → WebGL2 shader extraction method; see
`docs/tcg_support.md` §9 and `scripts/effects-dump/README.md` for current usage.
