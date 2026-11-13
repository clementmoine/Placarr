# Fusion World Digital — composition des URLs de mise à jour

> Observé le 2026-11-12 sur le lanceur Mac `DBSCG FW` (Xsolla Launcher 3.32.7,
> binaire natif `LauncherElectron`). Client ouvert en lecture seule avec
> `@/lib/unity` (`loadUnityFs`, typetree). Aucun fichier du jeu n’a été
> réécrit. Pas de code provider.

Le lanceur ne fabrique pas l’URL des morceaux. Il interroge un manifeste,
puis colle un préfixe CDN devant les chemins que ce manifeste lui donne.

## 1. Deux systèmes qu’il ne faut pas mélanger

| Système | Fichier / hôte | Rôle |
| --- | --- | --- |
| Coquille Electron (Squirrel) | `Contents/Resources/app-update.yml` : `provider: generic`, `url: http://localhost:8080/`, `channel: latest` | Mise à jour **du lanceur**, pas du jeu. Inutilisable pour prédire un build. |
| Jeu | `https://gus.xsolla.com/updates` | Manifeste des morceaux. C’est la seule source de vérité. |

CDN par défaut, en dur dans `LauncherElectron` (`setCDNOrigin`) :

`https://gamebuild.launcher.xsolla.com/`

Secours aussi compilé : `https://launcher-gamebuild-cdn.xsolla.com/`.
Le journal du 2026-11-12 confirme que l’origine active était le premier.

## 2. D’où vient chaque morceau

Requête réellement émise (journal `LauncherElectron/logs/launcher_log.txt`) :

```
https://gus.xsolla.com/updates?project_id=254594&region=&gds_version=1&platform=mac_os&stage&no_redistr=false
```

| Paramètre | Nature | Valeur observée | D’où elle sort |
| --- | --- | --- | --- |
| `project_id` | fixe pour ce jeu | `254594` | `publisher_project_id` dans `Contents/Resources/config/launcher.json` (jeu id `278885`, lanceur `5140`) |
| `platform` | fixe par OS | `mac_os` | le binaire. Un client Windows changerait cette valeur, donc le manifeste. |
| `gds_version` | version **d’API** GUS | `1` | pas la version du jeu |
| `region` | vide | | |
| `stage` | vide | | |
| `no_redistr` | fixe | `false` | |

Réponse : XML `application/xml`, racine `<actions version="0">`.
Aucun jeton. Le `254594` est public dans le paquet du lanceur.

Le manifeste du 2026-11-12 contient, dans l’ordre :

1. `extracted_size` — `data_size="7106264119"` (~6,6 Gio décompressés).
2. Neuf `torrent_download` (`torrent_type="3"`), du `.009` vers le `.001`.
3. `wait_actions`.
4. `extract` du `.001`, `format="7z"`, vers `$game_path/`.
5. `wait_actions`.
6. `version` — `version="97"`.

`16741` n’apparaît nulle part dans le lanceur. Il est le premier segment
de `torrent_link` et de `alt_data_link` **dans cet XML**. C’est l’id du
build publié chez Xsolla, pas un compteur qu’on incrémente.

Le hash `dc856891b7c7d3021a5eba934e2e71de` (32 hex, forme MD5) est dans le
nom de fichier choisi par l’éditeur au moment du publish. Il n’est pas
dérivé de `97`, ni de `254594`.

## 3. Gabarit

```
{cdn}/{buildId}/full_games/full_game_/{stem}.7z.{index}
{cdn}/{buildId}/full_games/full_game_/{stem}.7z.{index}.torrent
```

| Composant | Aujourd’hui | À la prochaine mise à jour |
| --- | --- | --- |
| `cdn` | `https://gamebuild.launcher.xsolla.com` | le même, sauf si le binaire reçoit un autre `setCDNOrigin` |
| `buildId` | `16741` | **nouveau**, lu dans le XML |
| dossier fixe | `full_games/full_game_` | repris tel quel dans les liens actuels ; à relire, pas à supposer éternel |
| `stem` | `full_game_dc856891b7c7d3021a5eba934e2e71de_` | **nouveau hash** dans le nom |
| `index` | `001`…`009`, trois chiffres | autant d’actions `torrent_download` que le XML en liste |

Morceaux `001`–`008` : 524 288 000 octets (500 Mio). Le `.009` : 348 684 244.
Le dernier n’est pas plein : le nombre de volumes n’est pas un multiple fixe.

`$cdn_url` est l’origine ci-dessus. `$temp_path` devient, sur ce Mac :

`~/Library/Application Support/DBSCG FW/Games/DRAGON BALL SUPER CARD GAME FUSION WORLD/default/update/`

`$game_path` :

`…/default/game/` → `DBSCGFW.app` une fois le `.001` extrait (7z multi-volume :
seul le premier volume est passé à `7zr`, les suivants sont à côté).

## 4. Peut-on prédire l’URL suivante avec un simple +1 ?

Non.

- Passer `version` de 97 à 98 ne compose rien : ce chiffre est posé **après**
  l’extraction, il n’entre pas dans le chemin.
- Passer `16741` à `16742` est une supposition. Le prochain build peut
  sauter, ou réutiliser un autre id.
- Le hash change avec le contenu. Sans le XML, il est inconnu.
- Le nombre de morceaux change avec la taille.

Détection d’une mise à jour, même idée que le probe CDN Pokémon
(relire le manifeste, comparer, ne pas deviner) :

1. `GET` le GUS avec `project_id=254594` et `platform=mac_os`.
2. Lire `action type="version"`. S’il diffère du `97` déjà noté, le build a bougé.
3. Lire chaque `alt_data_link` et le préfixer par le CDN. Ce sont les URLs.
4. Les `.torrent` à côté portent le même chemin en `url-list` (web seed) plus
   deux trackers (`35.210.31.1:6969` et `35.209.75.22:6969`). Le bdecode ne
   sert qu’à relire un torrent déjà téléchargé ; il ne prédit pas le suivant.

Squirrel (`app-update.yml`) ne participe pas à cette comparaison.

## 5. Client extrait — où sont les cartes

Build `97` (fichier `.version` : `&game=97`). `7zr` ne tourne plus, le
dossier `update/` a été retiré. L’application est
`…/default/game/DBSCGFW.app` (`app.info` : BANDAI Co., Ltd. / DBSCGFW).
À côté : `.local-chromium`.

`Contents/Resources/Data/` est un joueur Unity classique, pas le catalogue
de cartes :

| Fichier | Rôle | Taille |
| --- | --- | --- |
| `globalgamemanagers` + `.assets` + `.assets.resS` | scènes / managers | ~9 Mo |
| `resources.assets` + `.resS` | ressources joueur | 17 Mo + 177 Mo |
| `sharedassets0.assets`, `sharedassets1.assets`, `level0`, `level1` | scènes vides ou presque | < 60 Ko hors managers |
| `il2cpp_data/`, `ScriptingAssemblies.json` | IL2CPP | |

Les faces, cadres et foils sont des **Addressables UnityFS**
(`magic` `UnityFS`) :

`Contents/Resources/Data/StreamingAssets/aa/StandaloneOSX/*.bundle`

3 559 bundles, ~5,9 Go. Index : `aa/catalog.json` (29 Mo) et `settings.json`.
Préfixe stable : `packdata_assets_…`.

| Famille | Nombre | Contenu vu |
| --- | --- | --- |
| `card_series_*` sans suffixe foil | 2 364 | face ordinaire |
| `*_para` | 442 | parallèle |
| `*_superpara` | 26 | super parallèle |
| `*_front` / `*_front_para` / `*_back_para` | 78 + 12 | recto ou dos seul |
| autres queues (`para_1an`, `para_eve6`, `para_reward_…`) | le reste des 2 922 `card_series` | variantes de parallèle, pas un autre jeu |
| `card_frame` | 1 × 24 Mo | cadres couleur / coût (`Red_01_cost1`, `BattleCard_…`) |
| `card_sleeve` | 1 × 209 Mo | sleeves |
| `card_materials` | 5 Mo | matériaux foil partagés |
| `card_premiumtex` | 0,8 Mo | textures d’effet (lignes, flash, rainbow) |
| `shader` | 7,3 Mo | shaders + textures holo partagées |
| `effect_3deffect`, `effect_texture`, `effect_cardeffect` | 49 / 13 / 0,5 Mo | VFX de carte, pas le masque de face |

Pas de fichier `.shader` ni de dossier `textures/` à plat. Les textures
sont des objets `Texture2D` dans les bundles.

## 6. Foil — ce que le typetree montre

Ouverts avec le même `loadUnityFs` que Live / Lorcana. Échantillons :
`e01-05` (ordinaire), `e-111_para`, `fb01-139_superpara`,
`fb01-104_front_para`, plus `shader`, `card_materials`, `card_premiumtex`,
`card_frame`.

Une carte ordinaire n’a que la face et les textes :

`E01-05_Card`, `E01-05_Text_Ja`, `E01-05_Text_En`, matériau `Card`.

Un parallèle ajoute un calque holo et le dos :

`E-111_PARA_Front`, `E-111_PARA_Holo`, `E-111_PARA_Back`,
`E-111_PARA_Text_Ja`, `E-111_PARA_Text_En`,
`E-111_PARA_Thumbnail`. Matériaux `Card` et `CardFIeld`
(le `I` majuscule est dans le nom).

Un super parallèle ajoute des masques nommés et un foil par langue :

`FB01-139_SUPERPARA_Foil_Ja`, `FB01-139_SUPERPARA_Foil_En`,
`ef_mask00`, `ef_mask01`, `ef_mask02`, `ef_mask02_CF`,
`ef_mask03`, `ef_mask03_CF`. Le `front_para` de FB01-104 reprend
`ef_mask01` … `ef_mask05` (et les variantes `_CF`).

Textures partagées, dans `packdata_assets_shader.bundle` :

`PakipakiFoil`, `HoloMap`, `HoloMap_PARA`, `HoloRainbow`, `CardHologram`,
`CardFrameMask`.

Matériaux, dans `packdata_assets_card_materials.bundle` :

`Card Foil_holo`, `Card Tabac_holo`, `Card Variant Energy_holo`,
plus des exemples `ST01-004_PARA_Foil_En`, `ST01-004_PARA_Holo`,
`FW_E-106_PARA_Holo`, `ef_mask01`, `Tabac_Holo`.

`card_premiumtex` est une bibliothèque d’effets (`uv_line_rainbow`,
`ef_flash01`, `uv_shine`, `ef_flame00`), pas une face.

La face catalogue est l’aplat `art.client.webp` : c’est l’image affichée, comme le scan Lorcana. Le foil ne s’en sert pas seul. À côté restent les calques `layer.picture.webp` (l’illustration, là où le brillant se pose), `layer.text.webp` (le texte, au-dessus) et `layer.frame.webp` (le cadre + costRing collé), plus le masque déjà extrait. Le shader les prend sur les rôles `front`, `ink` et `frame` ; un fichier absent reste transparent et la face aplatie se voit.

### Recette flatten catalogue (aplat WebP)

Ordre produit (`CLIENT_FACE_COMPOSE_ORDER`) — proche Frost (Front→Frame→disc→Chara→CostNumber), sans coller le disc dans `_FrameTex` :

| Calque | Source dump | Pos @ print | Taille | Ordre | Transform |
|--------|-------------|-------------|--------|-------|-----------|
| picture | `*_Card` Texture2D | 0,0 | card W×H | 1 | `clientFacePixels` (63×88) |
| frame | Texture2DArray slice0 mip0 | 0,0 | card W×H | 2 | resize chrome seul |
| costRing | `Cost_01` + `CostFrame_{Color}` | Frost centre | scale×atlas | 3 | bake SS + `layer.costRing.webp` |
| text | `*_Text_En` / `_Ja` | 0,0 | card W×H | 4 | solidify + lanczos |
| badge | `{Color}_01_cost{n}` (BC7) | 0,0 | card W×H | 5 | full-face resize (runtime : BPTC si dispo) |

Frost runtime (`FrostCard.frag`) sample Main→Front→Middle→Frame→Chara→CostNumber ; `Cost_01` / `CostFrame_*` **ne sont pas** des samplers Frost (disques procéduraux + `_CostNumberTex`). L’aplat catalogue garde le bake `Cost_01`+`CostFrame` en **calque séparé**.

**Géométrie costRing (dump-driven)** : dims / centre / outerDiam depuis `Cost_01` RGBA (`deriveCostRingGeometry`) ; fillSize = slot Frost 32 (`FROST_COST_FILL_SLOT`, pas `CostFrame` 226) ; offsets/scales Frost depuis `FrostCard.frag`. Scale on-card = `frostDiam / fillSize` (÷32 → ~0,625 @ 512). Pastille = `CostFrame_{Color}` (RGBA32, trim opaque → bake 4× SS) à `COST_FILL_DRAW_SIZE` (20). Isoler sur `outerDiam/2`.

Constantes produit isolées : `clientFacePolicy.ts`. Bake fill : `costRingBake.ts`. Fallback Frost/géométrie : `frostCostDisc.ts`, `costRingGeometry.ts`. Foil : `layer.frame` reste le rôle `frame` ; costRing n’est pas un binding foil.

On compose l’illustration (`*_Card`, `*_Front`, `*_Front_Card`) et la plaque de langue (`*_Text_En`, `*_Text_Ja`). Chaque couche est redimensionnée une seule fois sur la carte 63×88 (minify via `supersampleResize` 4×), puis écrite dans `art.client.webp`. Le chrome est la première tranche du tableau `Card_Battle_{Couleur}_Frame` dans `card_frame`. Le gemme chiffré vient de la plaque + badge `{Couleur}_01_cost{n}` (BC7). Une art 1:2 (512×1024) devient 512×715 (63×88). `pnpm exec tsx scripts/extractFusionWorldFaces.ts`.

## 7. Shaders — Metal traduit en GLSL ES 3.00

`packdata_assets_shader.bundle` : 94 `Shader`. Le chunk décompressé est
de la plateforme Unity **14** (Metal), pas du GLES : aucun `#version`.
Le texte Metal est dans le blob, après une table `count × (offset,
longueur, flags)`, à partir de `#include <metal_stdlib>` jusqu’au NUL.

`Frost/Card` contient **82** fragments et des vertex (le plus gros
fragment fait ~136 Ko et échantillonne `HoloMap`). `UIHologram` en
contient un. `PakipakiFoil`, `HoloMap` et `CardFrameMask` ne sont pas
des shaders : ce sont des textures du même bundle, lues par ces
programmes.

Traduction dans `src/lib/unity/metalBlob.ts` et `metalToGlsl.ts`,
branchée sur `extractShaderFragsFromBytes` quand le chunk n’a pas de
GLSL. Le dialecte hlslcc couvert :

| Metal | GLSL ES 3.00 |
| --- | --- |
| `[[ stage_in ]]`, `[[ buffer(n) ]]` | `in` aplati, `uniform` de struct |
| `texture2d` / `texturecube` / `texture2d_array` `.sample` | `texture` / `textureLod` |
| `bias(...)`, `level(...)` | biais de `texture`, `textureLod` |
| `fma`, `rsqrt`, `saturate`, `select` | produit-somme, `inversesqrt`, `clamp`, `mix` |
| `as_type<float>` | `intBitsToFloat` |
| `discard_fragment`, `mtl_Position`, `SV_TARGET0` | `discard`, `gl_Position`, `fragColor` |

Pour un shader qui a plusieurs variantes, le pipeline garde celle qui
échantillonne un holo ou un masque (`HoloMap`, `_Mask`, `Foil`), sinon
la plus longue. Le résultat passe par `toWebgl2Fragment`, comme Live et
Lorcana. Les tests `src/lib/unity/metalToGlsl.test.ts` lisent le bundle
local s’il est là et vérifient `UIHologram` et `Frost/Card`.

Ce n’est pas une preuve pixel à pixel : c’est le même source, relu en
GLSL. Le pack `dbs-fw` ne s’en sert pas encore.
