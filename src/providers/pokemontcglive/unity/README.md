# UnityPy island (Pokémon TCG Live)

Python remains for UnityFS **texture / shader / mesh** extract. Orchestration is
TypeScript (`cli.ts`).

**ADR-021 A–B** — AssetManifest dump + card Texture2D (ASTC→lossless WebP) are Node
by default. Python still does shaders / cards.json / mesh. Escape: `PLACARR_UNITY_PYTHON=1`.
Research: [`docs/unity_without_python.md`](../../../../docs/unity_without_python.md).

```bash
cd src/providers/pokemontcglive/unity
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Or symlink to Lorcana’s venv if shared: `ln -s ../../lorcanatcg/unity/.venv .venv`

See `docs/provider_supply_modes.md`.
