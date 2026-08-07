# Foil CSS — sources, licences, Unity ↔ simey

Dernière passe 2026-08-07 (simey **vendored** dans `third_party/`, plus de
submodules).

**Règle.** Placarr = **GPL-3.0-or-later**. Arbres simey = copies locales
(`third_party/simeydotme-pokemon-cards-{css,151}/`), comme les recettes
Lorcana : on adapte petit à petit dans `HoloShader`, on ne charge pas les
`.css` upstream au runtime. Assets Pokémon officiels hors arbre.

---

## 0. Verdict (lire d’abord)

1. **Unity / Live : tous les finishes dumpés ont une recette CSS.**  
   23 `.frag` foiled + `NonFoil` = `POKEMON_FOIL_NAMES`.  
   27 feuilles matériaux = ces 24 + alias `FlatSilver_CC`, `Rainbow02`,
   `SwSecreT02`. Chaque feuille foiled a une entrée `LIVE_FINISH_CSS`.
2. **Pas de bijection Simey ↔ Unity.** Simey = rareté catalogue ; Live =
   matériau shader. On mappe **par intention visuelle**, pas 1:1.
3. **Simey branché partout où c’est utile.** Leafs APK-only (Sun*, Thatch,
   Tinsel, Squares, Stamped, Confetti, SolidColor) restent textures extract.

---

## 1. Couverture Unity → CSS

| Leaf `.frag` / sheet | CSS Placarr | Source |
|---|---|---|
| `RadiantHolo` | `radiantHolo` (+ halo / coat / sparkle) | **simey** `radiant-holo` |
| `SwSecret` / `SwSecreT02` | `rainbowHolo` | **simey** `rainbow-holo` |
| `Rainbow` | `rainbowAlt` | **simey** `rainbow-alt` |
| `Rainbow02` | `trainerGalleryHolo` | **simey** trainer-gallery |
| `Cosmos` | `cosmosHolo` | **simey** `cosmos-holo` |
| `Galaxy` | `amazingRare` | **simey** `amazing-rare` |
| `CrackedIce` | `illustrationRare` | **simey** `illustration-rare` |
| `FlatSilver` | `shinyRare` | **simey** `shiny-rare` |
| `FlatSilver_CC` | `pokeBallHolo` | **simey** `poke-ball-holo` (+ `TEX_CC_PB`) |
| `SvUltraGoldRainbow` | `secretRare` | **simey** `secret-rare` |
| `SvUltraScodix` | `hyperRare` | **simey** `hyper-rare` |
| `SvUltra` | `vFullArt` | **simey** `v-full-art` |
| `SvHolo` | `vStar` | **simey** `v-star` |
| `SwHolo` | `vRegular` | **simey** `v-regular` |
| `AceFoil` | `vMax` | **simey** `v-max` |
| `AngledPillars` | `exFullArt` | **simey** `ex-full-art` |
| `SunPillar` / `SunBeam` / `SunLava` | `sunPillar` / … | APK |
| `SolidColor` / `Squares` / `Thatch` / `Tinsel` | APK ids | APK |
| `Stamped` / `25thConfetti` | `stamped` / `confetti25th` | APK |
| `NonFoil` | plain | — |
| Catalogue `holo` / `reverse` | `regularHolo` / `reverseHolo` | **simey** |
| Catalogue extras (`cosmos`, `shiny`, `v`…) | ids simey | **simey** |

---

## 2. Simey IDs runtime (`holoShadersSimey.ts` + Radiant)

poke-holo : regular (+ bars), reverse, rainbow (+ coat), rainbow-alt,
cosmos, amazing, secret, V / VMAX / VSTAR, shiny, trainer-gallery, radiant
(lattice / halo / coat / sparkle).

poke-151 : poke-ball, ex, illustration-rare, hyper-rare.

**Intentionnellement non mappés** (one-offs / peu de valeur Live) :
`swsh-pikachu`, `trainer-full-art`, aliases TG mineurs.

---

## 3. Arbres vendored

| Upstream | Path | Pin |
|---|---|---|
| [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) | `third_party/simeydotme-pokemon-cards-css/` | `UPSTREAM_COMMIT` |
| [pokemon-cards-151](https://github.com/simeydotme/pokemon-cards-151) | `third_party/simeydotme-pokemon-cards-151/` | `UPSTREAM_COMMIT` |

Pas de `git submodule`. Voir `third_party/README.md` pour un refresh manuel.

---

## 4. Autres sources (hors simey)

| Source | Licence | Statut |
|---|---|---|
| [kongyo2/cards-css](https://github.com/kongyo2/cards-css) | MIT | textures procédurales / spring — pas encore |
| [simeydotme/hover-tilt](https://github.com/simeydotme/hover-tilt) | MIT | tilt maison OK |
| [daniel-ilett/shaders-holo-card](https://github.com/daniel-ilett/shaders-holo-card) | MIT | réf. WebGL |
| [akshaykg42/foil-shader](https://github.com/akshaykg42/foil-shader) | aucune | ne pas copier |
| Forks simey | — | **aucun apport** (audit 2026-08-07) |
