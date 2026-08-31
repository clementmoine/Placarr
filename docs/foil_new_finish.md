# Nouveau finish foil — checklist opérateur

But : quand upstream ajoute un effet, le récupérer via **Catalogue Sync**
(admin / worker in-process) et ne porter à la main que les looks vraiment
nouveaux. Contrat : [foil_effects.md](foil_effects.md).
APK vs réseau : [foil_apk_sources.md](foil_apk_sources.md).

Lister les trous (admin Catalogue / tcg-effects → foil-status `gaps`) :

```bash
# même payload : GET /api/admin/foil-status → gaps
# moteur : src/lib/admin/foilGaps.ts (computeFoilGaps)
```

Rapport : payload `/api/admin/foil-status` → `gaps` (moteur `computeFoilGaps`).

---

## Auto (défaut)

- Staleness / boot → enqueue `foilExtract` (`PLACARR_FOIL_AUTO_SYNC`, défaut on).
- Manuel : admin Catalogue → Extract / Sync.

Après sync : nouveaux sets/cartes/frags/textures **sans edit `src/`**. Index sous `data/` seulement.

---

## 1. Pokémon WebGL ← TCG Live

| Étape | Action                                                        |
| ----- | ------------------------------------------------------------- |
| 1     | Catalogue Sync Pokémon (admin / worker)                       |
| 2     | Admin foil-status gaps → motifs manquants                     |
| 3     | Si motif pathologique : override B dans `materials.ts` (rare) |
| 4     | Playroom WebGL                                                |

Les `.frag` sont découverts sur disque — plus de liste `POKEMON_FOIL_NAMES`.

---

## 2. Pokémon CSS ← Live

| Étape | Action                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------- |
| 1     | Gaps → « CSS fallback only »                                                                          |
| 2     | Si convention `Leaf`→`leaf` rate : alias B dans `cssRecipes.ts` **ou** porter un nouveau `HoloShader` |
| 3     | `pnpm test` — `cssGuard`                                                                              |

---

## 3. Lorcana WebGL ← App Unity

| Étape | Action                                                   |
| ----- | -------------------------------------------------------- |
| 1     | Dump APK (one-shot — **apk-gated**, analyse CDN ouverte) |
| 2     | Nouveau `CardFoil*` : souvent rien (`resolveMaterial`)   |
| 3     | Playroom WebGL                                           |

Sans APK : produit CSS (web + cards) reste auto.

---

## 4. Lorcana CSS ← Site + catalogue API

| Étape | Action                                                                           |
| ----- | -------------------------------------------------------------------------------- |
| 1     | Catalogue Sync Lorcana (admin / worker)                                      |
| 2     | Gaps → `foilType` / `varnishType` en **fallback only** (silver / hotFoil)        |
| 3     | Nouveau look : recette `HoloShader` + alias `cssRecipes.ts` si le camelCase rate |
| 4     | Stem web inconnu (hors chrome `frame`/`menu`) → texture ou skip                  |
| 5     | Playroom CSS                                                                     |

Produit = ce path. WebGL APK = compare seulement (§3).

---

## Ordre typique

1. Laisser / lancer le sync
2. Lire gaps (admin ou CLI)
3. Porter seulement les looks / alias listés
