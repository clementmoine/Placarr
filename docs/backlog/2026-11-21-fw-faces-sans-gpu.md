# Faces Fusion World sans GPU — recherche et recommandation (2026-11-21)

> Demande du propriétaire : repenser le rendu GPU des faces Dragon Ball Fusion
> World (`dbsfw/extract/bakeClientFaceS3tc.ts`) sans s'attacher à l'existant,
> pour une app qui tournera dans un conteneur — et un rendu **parfait**.
> **Fait le 2026-11-21** (ADR-025) : décodeur `src/lib/unity/bcn.ts`,
> compositeur `dbsfw/extract/composeClientFace.ts`, sortie « corrigé +
> Lanczos » choisie par le propriétaire, Chrome supprimé. **2026-11-22** :
> BC7 / ASTC / ETC2 vérifiés contre le GPU Metal, ETC1 corrigé (R↔B),
> fallback unityfs-js et filtres morts retirés, calques foil en Lanczos
> (`cpu-lanczos-v2`) — voir ADR-025. Reste : ré-extraction Lorcana (le
> manifeste foil `data/lorcana/foil/manifest.json` manque).

## Conclusion courte

Le « tramage 4×4 » des rendus CPU ne venait pas du CPU mais d'un **bug du
décodeur de textures** `@arkntools/unity-js-tools` : l'alpha BC3 (DXT5) des
pixels 10 à 15 de chaque bloc 4×4 est faux (indices au-delà du 32e bit mal
extraits). Avec un décodeur conforme à la spec, la composition CPU reproduit
le rendu WebGL **au niveau de deux GPU entre eux** (≈ 60 dB, écart ≤ 3/255).
Chrome et le GPU peuvent disparaître.

## Ce que fait le rendu actuel

`bakeClientFaceS3tc.ts` (612 lignes, commit `a259fe28`) lance Chrome en
headless, pilote une page par le protocole DevTools, téléverse chaque calque
Unity compressé (BC1 / BC3, niveau 0) en texture WebGL2 `LINEAR`, les compose
dans un fragment shader puis relit les pixels :

- ordre Frost : `picture`, `frame`, `middle`, `frameTop`, `text`, puis
  `costRing` et `badge` (images RGBA) ;
- chaque texture **entière** est étirée sur le canevas (512×1024 ou
  1024×1024 → 512×715, ou 733×1024 en mise en page `print-widen`) ;
- fusion `over` en alpha droit sur fond blanc, octets d'affichage.

Quand Chrome manque ou échoue, `cardFaces.ts` retombe sur le chemin CPU
(`bake = "cpu"`) — décodé avec le paquet fautif.

## Pourquoi les tentatives CPU tramaient

Historique (`docs/fusion_world_digital.md`, commits `36d59ffb`, `a259fe28`) :
les sessions précédentes ont vu la trame et l'ont attribuée à la compression
DXT elle-même, puis l'ont « soignée » par filtres successifs
(`resolvePlateWithMip1` rejeté trop flou, `deblockPlateDxt`,
`softenPlateChrome`, `solidifyPlateInk`, suréchantillonnage 4×) avant de
passer au GPU.

Diagnostic du 2026-11-21 (scripts `scratch/bcExactCheck.mjs`,
`scratch/decDiff.mjs`, `scratch/bcBlockDump.mjs`) :

- sur 150 cartes, 2,2 M blocs sur 19,5 M décodés différemment de la spec,
  **uniquement sur l'alpha BC3**, **uniquement aux pixels k = 10 à 15** du
  bloc (bits d'index 30 à 47) — les deux dernières lignes de chaque bloc 4×4,
  d'où une trame régulière sur l'encre, le chrome et les contours ;
- exemple vérifié à la main : bloc `04 01 49 92 24 b6 3d 00`, pixel 11 →
  index 6 → alpha 2 selon la spec, le paquet rend 4 ;
- cause connue : le README du paquet prévient que wasm-bindgen fausse
  « rarement » des opérations binaires et que seul `decodeEtc2Rgba8` est
  corrigé ([unity-js-tools](https://github.com/arkntools/unity-js-tools)).
  La couleur BC1 / BC3 est juste (index sur 32 bits).

## Mesures

Banc `scratch/fwBakeCpuBench.mjs` (non versionné) : décodage, bilinéaire
« façon GL » (centres de texels, `CLAMP_TO_EDGE`), même formule `over`,
comparé à `art.client.webp`. Seules les cartes dont `layers.compose.json`
dit `bake: "gpu"` servent de vérité (les autres faces sur disque sont des
rendus CPU tramés).

| 60 cartes à vrai bake GPU | PSNR moyen | PSNR min | écart max | pixels > 8 |
| ------------------------- | ---------: | -------: | --------: | ---------: |
| paquet actuel | 30,3 dB | 21,2 dB | 255 | jusqu'à 7,8 % |
| **décodeur conforme (spec D3D10, ~60 lignes)** | **59,8 dB** | **57,7 dB** | **3** | **0** |

- ~50 ms par face sur un cœur, sans navigateur.
- Les 3 niveaux résiduels = arrondi de l'interpolation BC1/BC3, sur lequel
  les GPU eux-mêmes divergent ([Castaño](https://www.ludicon.com/castano/blog/2009/03/gpu-dxt-decompression/)) :
  le rendu WebGL n'est pas identique d'une machine à l'autre, le CPU l'est.
- Variante Lanczos3 (sharp) : texte nettement plus propre que le GPU, qui
  réduit 1024 → 512 sans mipmaps en sautant des texels.
- **Conséquence** : la plupart des `art.client.webp` actuels sont des rendus
  CPU tramés ; ils seront corrigés par un nouveau bake.

## Ce que disent les sources

- **Décodeurs BCn** : [bcdec](https://aras-p.info/blog/2022/06/23/Comparing-BCn-texture-decoders/)
  recommandé (domaine public, BC1–BC7, rapide) ; portage Rust
  [bcdec_rs](https://docs.rs/crate/bcdec_rs/0.2.0/source/src/lib.rs) ; pas de
  paquet npm qui l'enveloppe. Alternatives JS : [texture2ddecoder-wasm](https://www.jsdelivr.com/package/npm/texture2ddecoder-wasm)
  (documente que l'AssetStudio d'origine décode mal certains blocs BC3),
  `bcn-encdec-wasm`, `@bis-toolkit/bcn`.
- **WebGL en conteneur** : SwiftShader seulement, repli automatique
  déprécié, opt-in Chromium 139+ avec `--enable-unsafe-swiftshader`
  ([doc Chromium](https://chromium.googlesource.com/chromium/src/+/da170c2267b2201954efe1c8fa5d2d89ab09f7bf/docs/gpu/swiftshader.md),
  [Intent to Remove](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM),
  [chromedp](https://chromium.googlesource.com/external/github.com/chromedp/chromedp/+/refs/tags/v0.14.1)) ;
  Chromium Alpine désactive WebGL en headless ([aports #13272](https://gitlab.alpinelinux.org/alpine/aports/-/issues/13272)).
- **sharp** : binaires Linux x64 / arm64, glibc et musl
  ([install](https://sharp.pixelplumbing.com/install)).

## Impact au-delà de Fusion World

`src/lib/unity/texture2d.ts` utilise le même paquet (BC1, BC3, BC7, ETC1,
ASTC) pour l'extraction **Lorcana**, **Pokémon Live** et les **masques foil
Pokémon**. BC3 y a le même bug ; BC7 et ASTC (blocs de 128 bits) sont
probablement touchés — à mesurer en croisant deux décodeurs indépendants.

## Recommandation (rendu parfait, conteneur)

1. **Décodeur maison BC1 / BC3** (TypeScript, conforme D3D10, ~60 lignes,
   déjà validé à 59,8 dB face au GPU) dans `src/lib/unity/`, avec tests sur
   blocs piégeux (`c0 <= c1`, alpha 6 et 8 valeurs, indices au-delà du bit
   32) et un test de régression contre le bug constaté.
2. **BC7 / ETC / ASTC** : remplacer le paquet par un décodeur sans ce défaut
   (bcdec compilé WASM ou Rust/napi, ou texture2ddecoder-wasm), validé en
   croisant deux implémentations indépendantes sur les textures réelles
   (badges BC7, masques Pokémon).
3. **Composition** : formule `over` actuelle, bilinéaire « façon GL » par
   défaut (= rendu GPU validé), Lanczos3 en option après validation à l'œil ;
   résolution native des textures.
4. **Entrées complètes sur disque** (cadres de la bibliothèque compris) et
   test « golden » sur 4 cartes (dont `print-widen` et parallèle) :
   PSNR ≥ 55 dB face à un bake GPU de référence archivé.
5. **Retirer** Chrome, le pilotage DevTools, le serveur HTTP temporaire et
   les filtres de « soin » (`curePlateDxt`, `deblockPlateDxt`,
   `softenPlateChrome`, `solidifyPlateInk`) ; `sharedClientGuard` repasse
   au vert.
6. **Rebaker** toutes les faces FW (et réextraire Lorcana / Pokémon une fois
   le point 2 fait).
