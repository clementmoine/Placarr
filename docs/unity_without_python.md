# Unity sans Python — recherche (2026-08-25)

Objectif : sortir **UnityPy** du chemin produit (`pokemontcglive` / `lorcanatcg`),
pas Frida QA (`nav.py` / `navd.py` hors produit).

Contexte CLI : `packPython()` dans `pokemontcglive/cli.ts` et `lorcanatcg/cli.ts`
spawn `unity/.venv/bin/python` → `extract.py`, `dump_cdn_manifest.py`,
`dump_unity.py`, etc.

Spike hors repo : `/tmp/placarr-unity-spike` (pas de dépendance ajoutée à
`package.json` tant que le wrapper n’est pas productisé).

## Surface Python produit aujourd’hui

| Module | Scripts | Rôle |
| ------ | ------- | ---- |
| `pokemontcglive/unity/` | `extract.py`, `dump_cdn_manifest.py`, `card_quad.py`, `card_back.py`, `card_crop.py` | Manifests CDN, faces/masks ASTC, shaders `.frag`, UV mesh, dos |
| `lorcanatcg/unity/` | `dump_unity.py`, `mobile.py`, `save_webp.py` | Matériaux / textures app Lorcana |

Dépendances typiques : UnityPy, lz4, Pillow.

## Matrice de besoins × faisabilité Node

Fixtures Live : `data/pokemon/staging/cdn-bundles/xybsp_fr_019`,
`shadersbundle` (UnityFS 8 / Unity **2022.3.21f1**).

| Capacité | Hot path foil | UnityPy | `@arkntools/unity-js` | `unityfs-js` (Node patché) |
| -------- | ------------- | ------- | --------------------- | -------------------------- |
| Ouvrir UnityFS + CAB + `.resS` | oui | ✅ | ✅ | ✅ si codecs **JS** (WASM Node → buffers vides) |
| MonoBehaviour typetree (`MaterialManifest` `_f/_c/_s/_w`) | oui | ✅ | ✅ `getTypeTree()` = golden Python | ✅ `getObjectUsingTreeJSON` |
| Texture2D **ASTC_RGB_8x8** (fmt 51) streaming | oui | ✅ | ⚠️ reader binaire 2022.3 cassé (`streamData` raté) ; **OK** via typetree + slice `.resS` + `decodeTexture` → RGBA | classes Texture = Vite worker ; typetree utilisable |
| Shader `compressedBlob` → GLES `#version 300 es` `.frag` | foil WebGL | ✅ | ❌ pas de classe Shader ; `shadersbundle` plante sur Texture2D | ✅ 24/24 noms TPCi (même liste disque) ; strip WebGL ≈ Python (±~50 o à parfaire) |
| Material / Sprite / Mesh UV | dos, crop, Lorcana | ✅ | partiel | classes présentes côté browser ; non golden-testées |

## Bloqueurs packaging (à traiter avant `pnpm add`)

1. **`unityfs-js`** — entry Vite (`textureDecoder.worker.js?worker&inline`)
   refuse sous Node ; LZ4/LZMA **WASM** renvoie du vide → CAB tout-zéro.
   Contournement spike : stub `TextureDecoderPool` + drivers LZ4/LZMA **JS only**.
2. **`@arkntools/unity-js`** — imports ESM sans extension + directory imports ;
   besoin d’un resolve hook (ou bundling). API : `loadAssetBundle`, pas `load`.
3. Ne pas committer ces patches dans `node_modules` : **wrapper maison**
   (`src/lib/unity/` ou `providers/*/unity/node/`) qui encapsule codecs + typetree.

## Preuves spike (extraits)

- **MaterialManifest** (arkntools) : `_f=HoloFoil_Rainbow_Amplify_J`,
  `_c=xybsp_fr_019`, `_w=xybsp_wp_fr_019` — aligné UnityPy.
- **ASTC** : slice `.resS` 262144 o → `decodeTexture` → RGBA 1024²×4 ;
  PNG écrit (~1,7 Mo) via `sharp`.
- **Shaders** : 25 objets Class_48, **24** `TPCi/Cards3D/*` avec programme
  fragment `#version 300 es` (mêmes stems que `data/pokemon/foil/shaders/`).
  Parité octet-à-octet du strip `_to_webgl2_fragment` : à finaliser (~51 o).

## Verdict

**Go conditionnel** — on peut sortir Python du hot path foil Pokémon en phases,
sans attendre une lib « complète » :

1. Le trou historique « Shader impossible en JS » est **levé** (typetree + LZ4
   plateforme 9), pas besoin d’UnityPy pour le blob.
2. Texture2D « getImage » des libs est fragile en 2022.3 ; la voie **typetree +
   `.resS` + décodeur ASTC** est stable.
3. Coût réel = **ingénierie de packaging + golden-masters**, pas invention
   d’un parser UnityFS.

**No-go immédiat** : remplacer `pnpm foil:pokemon` demain sans golden-master
ni wrapper codecs. Python reste la référence jusqu’à parité mesurée.

## Plan phasé (recommandé)

| Phase | Remplace | Critère de sortie |
| ----- | -------- | ----------------- |
| **A** | `dump_cdn_manifest.py` + lecture `MaterialManifest` | JSON / champs `_f/_c/_s/_w` = Python sur N bundles CDN |
| **B** | export Texture2D face + mask (ASTC→PNG/WebP) | hash ou SSIM vs sorties `extract.py` |
| **C** | `extract_shadersbundle` → `foil/shaders/*.frag` | stems + golden strip = disque / Python |
| **D** | `card_quad` / `card_back` / Lorcana `dump_unity` | tests module existants verts sans `.venv` |
| **E** | retirer venv + docs UnityPy ; Frida reste Python | `packPython` mort ; CI sans Python |

Ordre : A → C peut être parallèle à B (shaders n’ont pas besoin d’ASTC).
Garder UnityPy en **oracle** de test jusqu’à E.

## Alternatives écartées (pour l’instant)

- **Rester 100 % Python** — OK court terme, bloque autonomie conteneur / une
  seule toolchain.
- **Binary externe** (AssetStudio CLI, outil Rust) — possible phase E si le
  wrapper JS grossit trop ; pas nécessaire pour A–C au vu du spike.
- **Port Shader « from scratch » sans typetree** — inutile : les champs
  UnityPy (`platforms`, `offsets`, `compressedBlob`) sont déjà exposés en JS.

## Liens

- ADR-021 (cadre sortie UnityPy)
- [data-layout.md](data-layout.md) — Node vs Python
- `src/providers/pokemontcglive/unity/README.md`
- Backlog : item P2 « Sortie UnityPy »
