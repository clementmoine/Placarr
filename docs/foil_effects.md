# Foil effects — contrat commun (Lorcana + Pokémon)

> Les **matériaux** viennent de sources différentes. La **manière** de les
> ranger, de les résoudre et de les afficher est la même. Unification runtime
> complète = plus tard (DRY) ; fidélité source = maintenant.

## 1. Sources de vérité (fidélité)

| Pack        | Surface | Source                                                                                      | Où ça vit                                                                                  |
| ----------- | ------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Pokémon** | WebGL   | TCG Live (Unity / HoloFoil GLES3)                                                           | `data/pokemon/foil/shaders` + `effects/pokemon/materials*`                                 |
| **Pokémon** | CSS     | **Chorégraphie Simey** + **paint multi-locale Live** (faces / masks / FX) ; sinon `flare` | `holoShadersSimey` + ports ; `HoloCardImage` (`--foil-etch`, wp) |
| **Lorcana** | CSS     | Site officiel Lorcana (viewer web)                                                          | dump `data/lorcana/foil/web` → `holoShadersApp` + `cssRecipes`                             |
| **Lorcana** | WebGL   | App Lorcana TCG (Unity)                                                                     | `data/lorcana/foil/shaders` + `manifest.json`                                              |

**Règles :**

1. Ne pas forcer une bijection entre CSS et WebGL du même pack — ce sont deux
   médias, deux sources. On mappe **par intention visuelle** (finish / leaf).
2. Ne pas charger les `.css` upstream au runtime : on **adapte** dans
   `HoloShader` (comme les recettes Lorcana dumpées).
3. Assets officiels : faces sous `data/<pack>/cards/`, kit rendu sous `data/<pack>/foil/` → URL `/assets/<pack>/…`.
4. Trees simey = staging volatile `data/pokemon/staging/simey/`
   (Simey CSS sync) — **même rôle** que le dump web Lorcana.
5. **Pokémon CSS :** (a) **recette** = compositing Simey (staging) ;
   (b) **données** = faces + masks + textures FX **Live multi-locale**
   (jamais rasters EN Simey) ; (c) pas d’amont Simey → **`flare`**.
   WebGL = Live. Voir [foil_css_sources.md](foil_css_sources.md) §0.

**Statut Pokémon (2026-09-06) :** WebGL = Live ; CSS = Simey-backed only
(`LIVE_FINISH_CSS`), sinon `flare`. Pas d’invention CSS pour leaves sans
amont Simey. Voir [foil_css_sources.md](foil_css_sources.md) §0.

## 2. Couches (même partout)

```
Provider (effectPack id)
  → effects/<pack>/          finish → CSS ids + FoilMaterial
  → core/render/holoShaders* looks CSS (bibliothèque, pas de finish map)
  → core/render/foil/*       contrat pack, backend auto, WebGL, pointer/idle
  → FoilCardImage / HoloCardImage
```

| Couche                     | Responsabilité                                   | Partagé ?                 |
| -------------------------- | ------------------------------------------------ | ------------------------- |
| `effects/<pack>/`          | Map finish→recette, dump topology, join identité | Non — un dossier = un jeu |
| `core/render/holoShaders*` | Définitions de looks CSS                         | Oui (ids stables)         |
| `core/render/foil/`        | `EffectPackModule`, pool, WebGL, pointer         | Oui                       |
| UI                         | `FoilCardImage`, playroom admin                  | Oui                       |

**DRY cible (pas maintenant) :** factoriser ce qui est vraiment commun
(pointer/idle, mask overlay, backend select, playroom shell) ; **ne pas**
fusionner les dumps ni inventer un « mega-shader » unique. Les packs restent
plug-and-play comme les providers.

## 3. Forme d’un pack (`src/effects/<id>/`)

Même skeleton pour tout nouveau jeu :

| Fichier              | Rôle                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `index.ts`           | `EffectPackModule` + `registerEffectPack`                                                      |
| `cssRecipes.ts`      | `resolveCss(finish, varnish)` → ids `HoloShader`                                               |
| WebGL resolve        | Lorcana : `manifest.ts` + `resolveMaterial.ts` · Pokémon : `materials.ts` + `resolveEffect.ts` |
| `faceOrientation.ts` | quarts de tour Face (BREAK, etc.)                                                              |
| `playroomArt.ts`     | art de banc (recommandé)                                                                       |
| tests                | `cssRecipes` / material resolve / face                                                         |

Disk / URL (voir [data-layout.md](data-layout.md)) :

```
data/<pack>/cards/  →  /assets/<pack>/cards/…   (faces + back.webp)
data/<pack>/foil/   →  /assets/<pack>/…          (shaders, textures FX, web, …)
```

Sync produit : Catalogue Extract (admin / worker in-process) ·
`/admin?tab=catalogue` (backends **Auto | WebGL | CSS**).

## 4. Backend runtime

`selectFoilBackend` : **auto** / **webgl** → WebGL2 si matériau + caps + pool,
sinon CSS. Playroom force WebGL / CSS pour comparer les deux sources du **même**
finish.

Chaîne produit (tous les TCG) :

1. WebGL si demandé et matériau disponible
2. sinon CSS du finish / leaf demandé quand porté
3. sinon house **`flare`** (`HOUSE_FOIL_FALLBACK_CSS_ID`) — « shiny, pas encore
   de look dédié »

Idle vs pointer : glare figé / opacity 0 en idle ; motif + tilt restent actifs
(`foil/pointerCss`) — commun aux packs.

## 5. Checklist « prochain jeu »

1. Identifier **deux** sources (CSS de référence + shaders/app) — ou une seule
   et documenter le fallback.
2. Dump sous `data/<id>/foil/` + scripts `scripts/<id>/`.
3. Pack `src/effects/<id>/` au skeleton §3 ; register dans `effects/index.ts`.
4. Provider stamp `effectPack: "<id>"` uniquement (pas de literal hors module).
5. Dos pack obligatoire (`cardBackUrl`) ; masques par carte si le médium l’exige.

## 6. Nouveau finish (Simey / Live / site / app)

Quand une source upstream ajoute un effet : dump ou re-vendor →
admin foil-status (`computeFoilGaps`) → map → ship. Checklist par surface :
[foil_new_finish.md](foil_new_finish.md).

## 7. Docs liées

| Doc                                                      | Contenu                          |
| -------------------------------------------------------- | -------------------------------- |
| [foil_new_finish.md](foil_new_finish.md)                 | Checklist opérateur (4 surfaces) |
| [data-layout.md](data-layout.md)                         | Disque, URLs, CLI                |
| [foil_css_sources.md](foil_css_sources.md)               | Pokémon : simey ↔ Live leafs     |
| [tcg_support.md](tcg_support.md)                         | Produit TCG, dumps, Face/Dos     |
| [archive/tcglive_effects.md](archive/tcglive_effects.md) | Handoff Live (historique)        |
