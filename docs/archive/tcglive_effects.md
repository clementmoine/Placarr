# Pokémon TCG Live — effets foil papier (handoff)

**Statut :** CDN-first opérationnel — scrape multi-`content_dir` + extract draft
`pokemon` — snapshot **2026-08-02**. Crawl ADB **supprimé**.
**Package :** `com.pokemon.pokemontcgl` (Unity + IL2CPP, Android).
**Pourquoi lui :** client officiel des cartes **papier** (vs Pocket digital-only).

> Pivot : ce doc **remplace** [pokemontcgp_effects.md](pokemontcgp_effects.md) comme
> chantier actif. Pocket reste en place et fonctionne, mais il ne progressera plus —
> voir §6.

---

## 1. Ce que le client contient (vérifié)

### Recettes de foil — `shadersbundle` (6,8 Mo)

23 shaders `TPCi/Cards3D/HoloFoil/*` + `TPCi/Cards3D/Standard/NonFoil` :

```
25thConfetti  AceFoil   AngledPillars  Cosmos    CrackedIce  FlatSilver
Galaxy        Rainbow   RadiantHolo    SolidColor Squares    Stamped
SunBeam       SunLava   SunPillar      SvHolo    SvUltra
SvUltraGoldRainbow      SvUltraScodix  SwHolo    SwSecret    Thatch  Tinsel
```

Le bundle porte aussi **70 textures** et **27 matériaux** (motifs : shine, grain,
spectrum, cracked ice, thatch, tinsel…).

Disponible sur le CDN public (`shadersbundle`, même préfixe Content/Android).

### Propriétés d'un shader — exemple `SvHolo` (16 props)

| Propriété                                                                          | Rôle                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------ |
| `_CardColorDiffuse`                                                                | le scan de la carte                        |
| `_CardWhitePlateMask`                                                              | **le masque** — où le foil s'applique      |
| `_CardEtch`                                                                        | la couche etch / relief                    |
| `_ShineTexture`, `_GrainTexture`, `_SpectrumTexture`                               | les motifs                                 |
| `_LightDirection`                                                                  | l'inclinaison (l'équivalent de notre lean) |
| `_OverallBrightness`, `_CardLighting_On`, `_NormalMask_On`, `_ShadowDarknessLimit` | réglages                                   |
| `_StencilRef`, `_StencilComp`                                                      | pochoir                                    |

### Format des shaders — **GLES3, pas Vulkan**

`platforms: [5, 9]`, blob LZ4 → deux sous-programmes :

- plateforme 0 → `#version 100` (GLES2)
- plateforme 1 → **`#version 300 es`** (GLES3)

C'est le chemin **Lorcana**, pas le chemin Pocket : aucune chaîne
SMOL-V → SPIR-V → GLSL, le GLSL est là, décompressé en LZ4.

### Une recette et un masque **par carte**

Chaque bundle `<set>_fr_<num>` contient un `MaterialManifest` (script
`TPCICardMaterialManifest`) :

```
me1_fr_073   MaterialManifest      _s TPCi/Cards3D/HoloFoil/SvHolo      _f SvHolo
                                   _c me1_fr_073       carte  1024×1024
                                   _w me1_wp_fr_073    masque  512×512
                                   _p Assets/Cards/FullCard/ME1/FR/073/me1_fr_073_svh_h_std.mat
             MaterialManifest_ph   _s TPCi/Cards3D/HoloFoil/FlatSilver  _f FlatSilver
                                   _w me1_wp_ph_fr_073
```

Deux variantes par carte : standard, et `_ph` (la reverse / parallèle). Le suffixe
`ph` est le même que celui que pokebox extrait du `longFormID`.

---

## 2. Le catalogue complet — via compendiums APK (+ longForm)

> **Correctif du 2026-08-02.** Ce doc a d'abord affirmé que les colonnes foil des
> tables étaient vides. C'était faux : la recherche portait sur le vocabulaire de
> pokebox (`SV_HOLO`, `FLAT_SILVER`) et non sur celui du client (`SvHolo`,
> `FlatSilver`). Les données sont bien là.

Chaque expansion a un `*-compendium_0.0.json` dans `config-cache` : la liste
officielle des `clientId` (`svalt_1`, `svbsp_45`, …). C’est **cette** source
qui alimente `cdn-catalogue-setnum.txt` — pas seulement les longForm `std`/`ph`,
sinon on rate les stamped `_op_` et les tables digitales `*alt` alors que le CDN
les sert.

Les tables `card-database-*.json` portent aussi un
**`longFormID` en clair**, au format :

```
Nom_set_numéro_préfixe_Rareté_TypeDeFoil_Masque

Caterpie_xy12_3_std_Common_NonFoil_None
Caterpie_xy12_3_ph_Common_Rainbow_Reverse
Metapod_xy12_4_ph_Uncommon_Rainbow_Reverse
```

**Une regex sur le buffer décodé suffit** — inutile de finir le parseur de lignes.
Sur les 106 tables : **25 180 cartes, 24 types de foil**, chacune avec son type et
son masque. C'est le `cards.json` de la tâche 3, à l'échelle du catalogue entier et
pas seulement des cartes en cache.

Volumes par type (utile pour savoir ce qui est courant et ce qui est une curiosité) :

| Type       | Cartes |     | Type               | Cartes |
| ---------- | -----: | --- | ------------------ | -----: |
| NonFoil    |   8375 |     | Tinsel             |    242 |
| FlatSilver |   5172 |     | AngledPillars      |    203 |
| Rainbow    |   3724 |     | CrackedIce         |     91 |
| SunPillar  |   2526 |     | Thatch             |     54 |
| SunBeam    |   1949 |     | Squares            |     35 |
| Cosmos     |    608 |     | AceFoil            |     33 |
| SunLava    |    546 |     | 25thConfetti       |     25 |
| SvUltra    |    505 |     | RadiantHolo        |     16 |
| SvHolo     |    396 |     | Stamped            |     14 |
| SwHolo     |    323 |     | Galaxy             |     13 |
| SwSecret   |    308 |     | SvUltraScodix      |     11 |
|            |        |     | SvUltraGoldRainbow |      8 |
|            |        |     | SolidColor         |      3 |

### Ce que le client ne contient pas

- Les shaders de foil dans l'APK — seul `TPCi/Cards3D/Standard/NonFoil` y est ;
  les `HoloFoil/*` arrivent avec le `shadersbundle` (voir §1).

### Format binaire des tables (si on veut les colonnes proprement)

`keys.table.contentBinary` en base64 → table binaire .NET. Trame : octet 0, chaîne
7-bit (nom de table), int32 (nb colonnes), N × (nom, type .NET), int32 (nb lignes),
puis les valeurs préfixées chacune d'un octet marqueur. Les colonnes
`System.String` se lisent bien ; **le décodage dérive sur les colonnes numériques**
et le parseur structurel reste incomplet. L’identité utile (noms, #, longForm)
est extraite via voisinage des `longFormID` → `data/pokemon/live-cards.sqlite`
(`pnpm foil:pokemon:index-cards`, aussi pendant `foil:pokemon`).

> Pipeline complet (QuickLZ + DataTable typé) documenté côté
> [ptcgl.dev](https://github.com/zwolsman/ptcgl.dev) — résumé opérable :
> [../pokemon_live_rainier.md](../pokemon_live_rainier.md) §4.

---

## 3. Cache local + CDN

`data/pokemon/` (gitignoré via `data/`) :

| Contenu                    | Rôle                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `apks/base.apk`            | Texture2D `cardBack` → `foil/card_back.png` (pendant extract)                               |
| `cdn-bundles/`             | UnityFS scrapés (cartes + `shadersbundle` + motifs partagés)                                |
| `config-cache/`            | Catalogue `card-database-*` + `asset-bundle-manifest`                                       |
| `live-cards.sqlite`        | Identité Live (nom EN/FR, #, longForm) pour jointure foil/TCGdex                            |
| `live-cards` rebuild       | `pnpm foil:pokemon:index-cards`                                                             |
| Card join audit            | `pnpm foil:pokemon:audit-join` → `logs/tcgdex-live-card-join.json`                          |
| `cdn-catalogue-setnum.txt` | Liste `set_num` depuis les **compendiums** APK (+ longForm en filet ; inclut `op` / `*alt`) |
| `logs/`                    | Scrapes                                                                                     |

Pack extrait : `data/pokemon/foil/` (shaders, textures/`cardTex`, `card_back.png`)

- `src/effects/pokemon/cards.json` (`pnpm foil:pokemon`, éventuellement `--skip-scrape`).

Runtime produit : TCGdex reste le provider catalogue ; le pack `pokemon` +
`liveJoin` / `resolveEffect` attachent **front Live**, **dos pack**, et **foils**
sur le `PrintCandidate` (voir [tcg_support.md](tcg_support.md) §Pokémon).

### CDN public

```
https://cdn.studio-prod.pokemon.com/rainier/Content/Android/{version}/{dir}/{bundle}
```

| Param     | Notes                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version` | ex. `1.40.0` (updater notes / fallback)                                                                                                                                             |
| `dir`     | `10101_0000` **ou** dirs datés du manifeste (`20260521_1700` pour `me4`, `20260716_1700` pour `me5`, …). Un 403 S3 sur un dir = souvent « pas sur ce préfixe », pas un UA manquant. |
| `bundle`  | `{set}_{lang}_{num}`                                                                                                                                                                |

```sh
pnpm foil:pokemon:sources
pnpm foil:pokemon:scrape -- --from-catalogue --langs fr,en --no-foil-t --with-shared
pnpm foil:pokemon:index-cards   # ou inclus dans foil:pokemon
pnpm foil:pokemon -- --langs fr,en --skip-scrape
```

Code : `scripts/tcglive/{cdn,extract,update,sources,card_database,index_cards}.py`.

## 4. Plan clarifié — sources, updates, sans ADB si possible

Objectif : un flow **CDN-first**, reproductible, où chaque donnée a une
**source unique** et une règle d’update. ADB / APK ne restent que pour ce que
le CDN ne sert pas (ou pas encore).

### 4.1 Matrice « quoi / où / pour quoi »

| Donnée                                            | Rôle Placarr                                             | Source nominale                                               | Fallback                       | Update                                                          |
| ------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| Bundle carte `{set}_{lang}_{num}`                 | art + masque + `MaterialManifest` (`_s/_f/_c/_w`, `_ph`) | **CDN** `…/Content/Android/{ver}/{dir}/…`                     | —                              | scrape catalogue manquant / full refresh                        |
| `shadersbundle`                                   | 23+1 shaders GLES3 + ~70 motifs foil                     | **CDN** (même préfixe, nom fixe)                              | —                              | à chaque bump `ver` / hash                                      |
| Motifs foil nommés (`t_holofoil_distortion_*`, …) | textures partagées                                       | **CDN** (certains noms 200) ; aussi **dans** `shadersbundle`  | —                              | via `shadersbundle` en priorité                                 |
| Catalogue `longFormID` / set+num                  | liste à scraper + foil/mask attendus                     | `config-cache/card-database-*` (aujourd’hui **pull device**)  | regex sur tables déjà en cache | **à clarifier** : endpoint op-core / config API vs ADB ponctuel |
| `asset-bundle-manifest` → `{dir}`                 | choisir `10101_0000` etc.                                | config-cache device aujourd’hui                               | hardcode + probe HEAD CDN      | bump client                                                     |
| `{ver}` app (`1.40.0`)                            | segment d’URL CDN                                        | PlayerPrefs / updater public (`cdn…/rainier/updater/…`)       | probe HEAD multi-versions      | bump client                                                     |
| Auth / SSO (`ptcs-urls.json`)                     | login jeu, **pas** assets foil                           | **CDN** public `…/rainier/PTCS/ptcs-urls.json`                | —                              | rare                                                            |
| Art « papier » TCGdex                             | diffuse sous le foil en app                              | **TCGdex API** (déjà)                                         | texture `_c` du bundle Live    | sync provider                                                   |
| Dos pack `card_back.png`                          | verso défaut jeu                                         | **APK** Texture2D `cardBack` (`scripts/tcglive/card_back.py`) | —                              | à chaque extract / bump APK                                     |
| Binaires IL2CPP / APK                             | reverse one-shot (pas runtime)                           | APK Play / device                                             | —                              | seulement si le CDN change de schéma                            |

**Verdict provisoire CDN-only pour le foil runtime :** cartes + `shadersbundle`
(+ motifs embarqués) suffisent à reproduire le look WebGL. Ce qui bloque encore
un « zéro ADB » total, c’est surtout le **catalogue config** (et la découverte
propre de `{ver}` / `{dir}`).

### 4.2 Analyse à faire (simplifier le process) — **priorité plan**

Avant d’empiler APK / crawl / extracteurs :

1. **Inventaire fermé des inputs runtime** — uniquement ce que le pack
   `pokemon` consomme (GLSL, uniforms, masques, mapping carte→foil).
2. **Pour chaque input : preuve de source** — HEAD/GET CDN, ou fichier
   config-cache, ou « APK only ». Documenter ici (§4.1) ; pas de troisième chemin
   « on verra ».
3. **Découverte `{ver}` / `{dir}` sans device** — updater JSON public + HEAD
   catalogue ; sinon une seule lecture PlayerPrefs / manifest puis cache local.
4. **Config catalogue sans ADB** — tracer d’où viennent les
   `card-database-*` (op-core ? signed URL ?) ; si API trouvable → scrape ;
   sinon **ADB pull config-cache uniquement** (pas de crawl UI).
5. **Politique d’update** —
   - fréquent : scrape CDN cartes manquantes + refresh `shadersbundle` ;
   - rare : refresh config-cache (catalogue) ;
   - exception : APK si le format Unity / URL change.
6. **Une commande** `effects:update:tcglive` = catalogue → scrape → extract →
   pack (idempotent, skip existants, rapport diff).

Livrable de cette analyse : tableau §4.1 **figé** + script/doc « comment
rafraîchir » (pas un second crawler).

### 4.3 Implémentation (après la matrice)

1. **[x] Scrape CDN** — `pnpm effects:scrape:tcglive` (`--from-catalogue`,
   `--langs fr|en`, `--with-shared`).
2. **[x] Faisabilité WebGL** — `MaterialManifest` + GLES3 `#version 300 es` +
   PNG masques (voir `cache/effects-dump/tcglive/WEBGL-FEASIBILITY.md`).
3. **[x] Analyse sources / updates** — matrice §4.1 +
   `pnpm effects:sources:tcglive` → `cache/…/sources-report.json`.
4. **[x] Pipeline update** — `pnpm effects:update:tcglive`
   (catalogue → scrape → extract draft `pokemon`).
5. **[x] `providers/tcglive.py`** — extract UnityFS → store (scrape séparé).
6. **Pack `pokemon` (Unity d’abord, modèle Lorcana)** — shaders GLES3 +
   masques `_w` + motifs shared + `_LightDirection` + resolve carte→recette.
   Fallback CSS fan via `cssRecipes.ts` / house looks (pas Lorcana web).
7. **[x] Audit store** — `pnpm foil:pokemon:audit-store` (frags / foils /
   masques / `cards.json`).
8. ~~**Retirer crawl Card-Dex**~~ — scripts crawl/calibrate/OCR supprimés.

### 4.4 Rafraîchir (CDN-first)

```bash
# Matrice + découverte ver/dir (fallback 1.40.0 / 10101_0000 si updater 403)
pnpm effects:sources:tcglive

# Scrape catalogue FR (+ shadersbundle). Reprend les fichiers déjà présents.
pnpm effects:scrape:tcglive -- --from-catalogue --langs fr,en --no-foil-t --with-shared

# Extract only (si scrape déjà en cache)
pnpm effects:update:tcglive -- --langs fr,en --skip-scrape

# Full: resolve → scrape → extract (limit pour smoke)
pnpm effects:update:tcglive -- --langs fr,en --scrape-limit 50 --extract-limit 50
```

**Catalogue** : toujours `config-cache/card-database-*` (ADB pull ponctuel).
Aucun endpoint op-core public trouvé — seul gap « zéro device ».
**CDN** : Content GETs publics. Deux causes de HTTP 403 distinctes :

1. **Mauvais `content_dir`** — S3 `AccessDenied` identique à un objet absent.
   Les sets récents (`me4` → `20260521_1700`, `me5` → `20260716_1700`) ne sont
   **pas** sous `10101_0000`. Le scrape probe les dirs du
   `asset-bundle-manifest` et garde le dernier dir OK comme **hint** par set —
   chaque carte est re-HEAD (un set peut vivre sur **plusieurs** dirs datés,
   ex. `mebsp`). Ancien pin dur set→un seul dir = 403 faux sur le mauvais préfixe.
2. **Soft-ban CloudFront** après scrape agressif — canary `xy8_fr_012` pour
   distinguer. Defaults doux : `--workers 1|2 --delay 0.4`.

---

## 5. Repères externes

### Cartographie (2026-08-02) — Live Unity vs fan

| Projet                                                                          | Rendu                                     | Données                                                               | Pour Placarr                                                                    |
| ------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) | CSS (gradients, blend, filters)           | scans / finitions SW-SH fan                                           | **Fallback CSS** via `resolveCss` — approximation, pas Live                     |
| [selop/pokebox](https://github.com/selop/pokebox)                               | Three.js + GLSL **réécrit d’après Simey** | [malie.io](https://malie.io/static/) (métadonnées + foil/etch layers) | Taxonomie `foilType` / masks Malie ; **pas** les `TPCi/Cards3D/HoloFoil/*.frag` |
| Omukade / Rainier fetchers                                                      | serveur / defs                            | CDN Live / assemblies                                                 | Catalogue / scrape — **pas** de renderer foil                                   |
| cards-css, card-foil, …                                                         | holo générique                            | —                                                                     | Hors Live — ne pas en faire la base produit                                     |

**Constat :** aucun dépôt public ne porte les fragments GLES3 Live (`HoloFoil_*`) en WebGL. Le chemin fidèle reste **dump APK/CDN → `/foil/pokemon`**. Simey/Pokebox = couche légère pour grille / WebGL KO / carte sans dump.

- [selop/pokebox](https://github.com/selop/pokebox) — MIT. 14 looks papier réécrits
  à la main en GLSL (d'après [pokemon-cards-css de Simey](https://github.com/simeydotme/pokemon-cards-css)),
  et surtout la **taxonomie** : `designation` + `foilType` + `foilMask` + `tags` →
  look. Utile comme grille de lecture. Ses assets viennent de malie.io (25 Go
  auto-hébergés, ni API ni licence) — non consommables.
- Notre vocabulaire de raretés TCGdex couvre déjà 38 étiquettes sur 40, FR et EN.
- Vocabulaire Live client (`SvHolo`, `FlatSilver`) ≠ pokebox / Malie **export** (`SV_HOLO`, `FLAT_SILVER`) — mapper via `malieFoilTaxonomy` / `foilManifestToShader`, pas via les labels export bruts. Spec export : [pkproto_sv](https://malie.io/static/draft/html/pkproto_sv.html) (`RAINBOW` ≠ Rainbow Rare).

---

## 6. Pourquoi on quitte Pocket

Pocket dessine **ses propres cartes**, qui n'existent pas en carton — et Placarr
ne catalogue que le physique (voir [tcg_support.md](tcg_support.md)). Ses recettes
posées sur une carte papier sont une approximation par la rareté, jamais le foil
réel de la carte. TCG Live donne la recette, le masque et le type de foil de la
carte elle-même.

Ce que Pocket laisse derrière lui et qui reste valable : le renderer multi-passes,
`adaptPocketGlsl`, le pochoir fenêtre/pleine carte, le playroom, et la leçon des
unités (`_Rotation` en degrés). Rien n'est supprimé.
