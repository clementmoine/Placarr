# Handoff foil Placarr → Claude (2026-08-07)

> **Archivé le 2026-08-24** — Boucle de handoff fermée ; le contenu durable a été recopié dans `foil_effects.md` / `foil_css_sources.md`.

Tu reprends le chantier **foil CSS/WebGL** (Pokémon + Lorcana) sur le repo
[Placarr](https://github.com/…) — branche locale `feat/foundation-postgres-tests`,
**gros working tree dirty, ne pas committer sauf demande explicite du user**.

Conversation Cursor précédente : agent transcript
`76cd3da7-5b1d-4a54-8875-ff7576a43494` (« Unity pokeball / Radiant / simey »).

Quand tu as fini : **rédige un handoff de retour** (même format : état, diffs
clés, tests, ouvertures, pièges) pour que Cursor / Composer reprenne.

---

## 1. Intent produit (ne pas dévier)

| Pack    | Surface   | Source de vérité                                                                                                |
| ------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| Pokémon | **WebGL** | TCG Live (Unity HoloFoil GLES3)                                                                                 |
| Pokémon | **CSS**   | **Structure** simey (poke-holo / poke-151) + **paint** plaques Live dump (`data/pokemon/foil/textures/_shared`) |
| Lorcana | **CSS**   | Site cards.disneylorcana.com                                                                                    |
| Lorcana | **WebGL** | App Lorcana TCG Unity                                                                                           |

- Pas de bijection CSS ↔ WebGL. Mapping **par intention visuelle**.
- Ne **pas** charger les `.css` simey au runtime — adaptation dans `HoloShader`.
- Simey = **vendored** dans `third_party/` (plus de git submodules).
- Unification DRY complète des deux packs = **plus tard**. Pour l’instant :
  même **contrat** (`EffectPackModule`), sources différentes.
- Principes repo : `.cursor/rules/placarr-principles.mdc` + `placarr-testing.mdc`.
  Hors `providers/`, pas de literal provider id. Tests verts ; ne pas affaiblir
  les guards.

---

## 2. Docs à lire en premier

| Doc                        | Rôle                                              |
| -------------------------- | ------------------------------------------------- |
| `docs/foil_effects.md`     | Contrat commun packs + couches                    |
| `docs/foil_css_sources.md` | Leaf Live → look CSS (simey/APK)                  |
| `docs/foil_new_finish.md`  | Checklist opérateur « nouveau finish en minutes » |
| `docs/data-layout.md`      | `data/<pack>/foil/` ↔ `/foil/<pack>/…`            |
| `third_party/README.md`    | Refresh simey vendored                            |
| `src/effects/README.md`    | Skeleton pack                                     |

---

## 3. Fait récemment (à ne pas défaire)

### Architecture / process

- GPL Placarr + NOTICE simey ; simey vendored (pas submodules).
- Docs contrat + checklist nouveau finish.
- `pnpm foil:audit-gaps` (`scripts/foil/auditGaps.ts` + `gapMaps.ts`) — gaps Live
  frags / SHARED / LIVE_FINISH_CSS / simey unported / Lorcana unlisted stems.
- Dump Lorcana web : `parseAllAssetStems` + `unlistedStems` dans `logs/web-source.json`
  (`src/providers/lorcanatcg/dumpWeb.ts`).

### CSS Pokémon = simey choreography + Live plates

Fichiers :

- `src/core/render/holoShadersSimey.ts` — recettes catalogue/rareté : overlays
  simey, paint via `url(/foil/pokemon/textures/_shared/….webp)` aligné
  `SHARED_BY_FOIL` (`materials.ts`).
- `src/core/render/holoShadersPokemon.ts` — Radiant multi-pass + leafs APK-only
  (Sun*, Thatch, Tinsel…).
- `src/effects/pokemon/cssRecipes.ts` — `LIVE_FINISH_CSS` / catalogue → ids.
- Idle vs pointer : `src/core/render/foil/pointerCss.ts` — idle : glare figé 50%,
  `--opacity: 0` ; motifs/tilt restent.

**Radiant** (playroom seed souvent Dracaufeu Radieux `swsh10-5_fr_011`) :

1. `radiantHolo` — lattice CSS ±45° (simey `--barwidth`)
2. `radiantHoloHalo` — spot glare (`opacityFollowsGlare`)
3. `radiantHoloCoat` — base sombre + `FX_T_Gradient_Shine_Dull` +
   `FX_T_Spectrum_BlackSide` (clip art window)
4. `radiantHoloSparkle` — `T_Noise_Random`

Ne pas remettre le spotlight dans le `background-blend` du lattice (ça tuait
les losanges quand idle mettait opacity à 0).

### WebGL

- Renderer partagé `core/render/foil/webgl/renderer.ts` — pack-blind.
- Pokémon materials : `materials.ts` + `materialSheets.json` + `SHARED_BY_FOIL`.
- Lorcana : `manifest.json` + `resolveMaterial.ts` (souvent dump → ship).

---

## 4. État « à vérifier / calibrer » (travail probable pour toi)

1. **Fidélité visuelle CSS** vs poke-holo + MuMu/Live — surtout Radiant, Rainbow,
   Cosmos, FlatSilver_CC. Les plaques brutes en CSS peuvent lire « plates »
   (commentaire historique dans `holoShadersPokemon` : Unity déforme/éclaire ;
   parfois mieux sampler en gradients). L’utilisateur a demandé **simey + layers
   APK** : garder la structure, ajuster blend/size/opacity si washout.
2. **Playroom** `/admin?tab=tcg-effects` — comparer backends Auto | WebGL | CSS
   sur le même finish.
3. **Audit gaps** — `pnpm foil:audit-gaps` ; s’assurer que `package.json` expose
   bien le script ; corriger gaps réels si dump présent.
4. **Catalogue** `regularHolo` / `reverseHolo` — encore CSS pur simey (pas de
   leaf Live dédié) : OK sauf si l’utilisateur veut aussi des plaques.
5. Gros dirty tree (providers, prisma, scripts pokemon/lorcana…) — **scope foil
   seulement** sauf demande contraire. Ne pas commit massif.

---

## 5. Fichiers chauds

```
src/core/render/holoShaders.ts          # type HoloShader, holoLayerStyle, maskedByStyle
src/core/render/holoShadersSimey.ts     # CSS simey + Live paint
src/core/render/holoShadersPokemon.ts   # Radiant + APK-only
src/core/render/foil/pointerCss.ts      # idle vs pointer
src/components/HoloCardImage.tsx        # chaîne overlays + cardGlow
src/effects/pokemon/cssRecipes.ts
src/effects/pokemon/materials.ts        # SHARED_BY_FOIL (source of truth stems)
src/effects/pokemon/cssGuard.test.ts    # ne pas casser
src/core/render/holoShadersSimey.test.ts
scripts/foil/auditGaps.ts
third_party/simeydotme-pokemon-cards-{css,151}/
data/pokemon/foil/textures/_shared/     # 70 webp (peut manquer hors machine dump)
```

Tests utiles :

```bash
pnpm exec vitest run src/effects/pokemon/cssGuard.test.ts \
  src/core/render/holoShadersSimey.test.ts src/effects/pokemon
pnpm foil:audit-gaps
```

---

## 6. Ce que l’utilisateur veut à terme

- Même **manière** de gérer CSS + WebGL sur Pokémon et Lorcana (docs, skeleton
  pack, audits) même si sources différentes.
- Nouveau finish upstream (simey **ou** Live **ou** Lorcana) → dump/re-vendor →
  map row → ship **en minutes** (`docs/foil_new_finish.md`).
- Fidélité aux originaux **maintenant** ; DRY centralisé **plus tard**.

---

## 7. Format du handoff de retour (obligatoire)

Quand l’utilisateur revient vers Cursor, fournis :

1. **Verdict** (1–3 phrases)
2. **Changements** (fichiers + pourquoi)
3. **Tests** lancés + résultat
4. **Visuel** (ce qui est mieux / encore faux vs poke-holo / Live)
5. **Ouvert** (todos concrets, pas de refacto vague)
6. **Pièges** (idle glare, carve vs paint, FlatSilver_CC vs FlatSilver, etc.)

Ne pas inventer de mega-refactor « un seul shader pour tout ».
