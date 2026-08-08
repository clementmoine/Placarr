# Nouveau finish foil — checklist opérateur

But : quand **Simey**, **TCG Live**, le **site Lorcana** ou l’**app Lorcana**
ajoutent un effet, le récupérer et le brancher dans Placarr en minutes — pas
une refonte. Contrat : [foil_effects.md](foil_effects.md).

Détecter les trous :

```bash
pnpm foil:audit-gaps          # rapport data/logs/foil-gaps.json
pnpm foil:audit-gaps -- --strict
```

---

## 1. Pokémon WebGL ← TCG Live

| Étape | Action |
|-------|--------|
| 1 | `pnpm foil:pokemon` (CDN / APK → `.frag` + `materialSheets.json`) |
| 2 | `pnpm foil:audit-gaps` → section **extraFrags** |
| 3 | Ajouter le stem dans `src/effects/pokemon/foilNames.ts` (`POKEMON_FOIL_NAMES`) |
| 4 | Remplir `SHARED_BY_FOIL` dans `materials.ts` (inspect MAT / TexEnvs) |
| 5 | Alias MAT si besoin (`POKEMON_MAT_ALIASES` / `FOIL_SHEET_ALIAS_FRAG`) |
| 6 | Playroom `/admin?tab=tcg-effects` backend **WebGL** |

Sans l’étape 3, le `.frag` est sur disque mais **invisible** au runtime.

---

## 2. Pokémon CSS ← Live (Simey = analyse optionnelle)

| Étape | Action |
|-------|--------|
| 1 | Playroom compare Unity \| CSS sur le leaf (`/admin?tab=tcg-effects&…`) |
| 2 | Lire plaques + frag Live ; optionnellement croiser Simey / photo-cards |
| 3 | Écrire / ajuster le look dans `holoShadersPokemon.ts` (Live) ; Simey ids seulement pour catalogue non-Live |
| 4 | Enregistrer l’id + mapper `LIVE_FINISH_CSS` / catalogue dans `cssRecipes.ts` |
| 5 | `pnpm test` — `cssGuard` vert ; plusieurs faces Live si possible |

Simey vendored (`third_party/`) = lecture, pas dépendance. Pas de chargement
runtime des `.css` upstream. Contrat : [foil_css_sources.md](foil_css_sources.md) §0.

**Nouveau leaf Live** : au minimum une ligne `LIVE_FINISH_CSS` (APK / house OK)
textures ou look le plus proche) pour que le playroom CSS ne tombe pas sur
`regularHolo` silencieux.

---

## 3. Lorcana WebGL ← App TCG Unity

| Étape | Action |
|-------|--------|
| 1 | `pnpm foil:lorcana` (APK → shaders + `manifest.json`) |
| 2 | Nouveau `CardFoil*` : en général **rien** — `resolveMaterial` score sur le nom |
| 3 | Si le nom casse le parse : ajuster `resolveMaterial.ts` (suffixes varnish) |
| 4 | Playroom backend **WebGL** |

C’est le chemin le plus proche de dump → ship.

---

## 4. Lorcana CSS ← Site cards.disneylorcana.com

| Étape | Action |
|-------|--------|
| 1 | `pnpm foil:lorcana` (phase web) — log **Unlisted asset stems** |
| 2 | Si nouvelle texture foil : ajouter le stem à `FOIL_STEMS` dans `dumpWeb.ts` |
| 3 | Re-dump → fichier sous `data/lorcana/foil/web/` |
| 4 | Recette `HoloShader` (`holoShaders` / `holoShadersApp`) + `FINISH_CSS` / `VARNISH_CSS` |
| 5 | Playroom backend **CSS** |

`source.json` → `unlistedStems` alimente `foil:audit-gaps` après un dump.

---

## Ordre de priorité typique

1. Dump / re-vendor  
2. `foil:audit-gaps`  
3. WebGL map (Live leaf / Unity material)  
4. CSS map (simey port ou stem site + recipe)  
5. Tests + playroom Auto / WebGL / CSS côte à côte  
