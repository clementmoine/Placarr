# UnityPy island (Lorcana)

Python remains **only** for Unity asset extract. Orchestration is TypeScript
(`cli.ts` / `pipeline.ts`).

```bash
cd src/providers/lorcanatcg/unity
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

`PYTHONPATH` = this folder + `lib/` when invoking `mobile.py`.
See `docs/provider_supply_modes.md`.
