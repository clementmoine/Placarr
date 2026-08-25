# UnityPy island (Pokémon TCG Live)

Python remains **only** for UnityFS extract / AssetManifest. Orchestration is
TypeScript (`cli.ts`).

Cadre de sortie Node (ADR-021) : [`docs/unity_without_python.md`](../../../../docs/unity_without_python.md).

```bash
cd src/providers/pokemontcglive/unity
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Or symlink to Lorcana’s venv if shared: `ln -s ../../lorcanatcg/unity/.venv .venv`

See `docs/provider_supply_modes.md`.
