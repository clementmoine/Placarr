---
name: foil-finish
description: Work on Placarr's holographic foil rendering (CSS and WebGL) — port a new upstream finish, fix a foil look, add a foil effect pack for a new game, or debug masks, shaders, materials and the admin foil playroom. Covers src/effects/, src/core/render/foil and holoShaders.
---

# Foil finishes and effect packs

Contract: `docs/foil_effects.md`. Operator checklist per surface: `docs/foil_new_finish.md`.
Pokémon CSS (Simey choreography × Live paint): `docs/foil_css_sources.md`. What still needs an APK: `docs/foil_apk_sources.md`. Disk layout: `docs/data-layout.md` § Foil packs. Fusion World client: `docs/fusion_world_digital.md`.

## Model

```
Provider (stamps effectPack id only)
  → src/effects/<pack>/        finish → CSS ids + FoilMaterial (one folder = one game)
  → src/core/render/holoShaders*  CSS look library (stable ids, shared)
  → src/core/render/foil/*        EffectPackModule, backend select, WebGL, pointer/idle
  → FoilCardImage / HoloCardImage, admin playroom
```

| Pack | CSS source of truth | WebGL source of truth |
| ---- | ------------------- | --------------------- |
| Pokémon | Simey structure (vendored, adapted in `HoloShader`, never loaded as `.css`) + Live plate paint | TCG Live HoloFoil `.frag` + sheets |
| Lorcana | cards.disneylorcana.com | Lorcana TCG Unity app |

- Fidelity to the source first; Lorcana/Pokémon duplication is accepted (ADR-005). No CSS ↔ WebGL bijection — map by visual intent. No "mega-shader".
- No provider id literal in `src/effects/` or core; the core never picks a default finish for a pack.
- Without a real mask/plate, a foil print shows a **flat face** + finish tag — no fake CSS holo.

## Porting a new finish

1. Let / run Catalogue Sync for the pack (admin or worker; `foilExtract` runs on the interactive worker). New sets, frags and textures should arrive with **no `src/` edit**.
2. Read the gaps: `GET /api/admin/foil-status` → `gaps` (engine `computeFoilGaps` in `src/lib/admin/foilGaps.ts`).
3. Port only what gaps list: rare override in `materials.ts`, alias in `cssRecipes.ts` when the `Leaf`→`leaf` convention misses, or a new `HoloShader` recipe for a genuinely new look.
4. Check it in the admin playroom (CSS and WebGL) via the preview server.

## New game effect pack

Identify two sources (reference CSS + app shaders) or document the single-source fallback; dump under `data/<id>/foil/`; create `src/effects/<id>/` on the skeleton of `docs/foil_effects.md` §3; register in `src/effects/index.ts`; the provider stamps `effectPack: "<id>"`; a card back (`cardBackUrl`) is mandatory.

## Done when

- `pnpm test` green (incl. `cssGuard`, `src/effects/blindnessGuard.test.ts`).
- Visual check in the playroom, both backends where the pack has them.
- Remaining APK-gated dependencies stay listed in `docs/foil_apk_sources.md` — never a silent debt.
