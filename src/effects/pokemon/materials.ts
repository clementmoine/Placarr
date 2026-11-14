import type {
  FoilMaterial,
  FoilTextureBinding,
} from "@/core/render/foil/types";
import { foilTextureFile } from "@/effects/foilTextureFile";
import { lazyLiveList } from "@/effects/lazyLiveList";
import {
  loadMaterialSheets,
  loadSharedMotifs,
  loadTextureFlags,
} from "@/lib/foilMetaLoad";

import {
  foilManifestToShader,
  listPokemonEffectFoilNames,
  listPokemonFoilNames,
  type PokemonPaperFoilName,
} from "./foilNames";

/**
 * Lorcana-style roles for TCG Live HoloFoil fragments.
 * Art = TCGdex / Live `_c`; foil mask = per-card `_w`.
 * Shared motifs = Unity `MAT_Cards3D_*` defaults from `shadersbundle`
 * (property → Texture2D under `textures/`).
 */
const BASE_TEXTURES: FoilMaterial["textures"] = {
  // Per-card plates ship `m_ColorSpace = sRGB` in the card bundles — Live's
  // Linear pipeline linearises them on sample. Gamma byte×17.5 on spectrum
  // clamps ~96% of SunLava to neon; Linear decode softens chroma toward the app.
  _CardColorDiffuse: { role: "art", srgb: true },
  _CardWhitePlateMask: { role: "foilMask", srgb: true },
  // Live per-card plates ride the generic per-print mask roles. Unbound
  // `_CardEtch` must sample Unity-white (see ROLE_TEXTURE_FALLBACK.varnishMask)
  // — HoloFoil multiplies foil by shine*0.35+etch²; opaque black crushed gold.
  // Cold-foil stays black when missing so the second plate stays off.
  _CardEtch: { role: "varnishMask", srgb: true },
  _CardColdFoilMask: { role: "secondVarnishMask", srgb: true },
};

/** Shared defaults from `MAT_Cards3D_*` when a leaf omits the sheet value. */
const BASE_FLOATS: FoilMaterial["floats"] = {
  _OverallBrightness: 1,
  _CardLighting_On: 1,
  _NormalMask_On: 1,
  _ShadowDarknessLimit: 0.75,
  _FoilAnimation: 1,
  /*
    Live global — not on MAT sheets. Unbound WebGL floats stay 0 and freeze
    spectrum/time scroll that multiplies `_Time.y * _GlobalReducedMotionSetting`.
  */
  _GlobalReducedMotionSetting: 1,
};

/**
 * `MAT_Cards3D_*` recorded uniforms — `data/pokemon/foil/materialSheets.json`.
 */
function materialSheets(): Record<
  string,
  | {
      floats?: Record<string, number>;
      colors?: Record<string, number[]>;
    }
  | undefined
> {
  return loadMaterialSheets() as Record<
    string,
    | {
        floats?: Record<string, number>;
        colors?: Record<string, number[]>;
      }
    | undefined
  >;
}

/**
 * MAT leaves that reuse a dumped `.frag` but ship their own sheet / TexEnvs.
 * Live `foil_effect` never names these; playroom still lists them for parity.
 */
export const POKEMON_MAT_ALIASES = {
  FlatSilver_CC: "FlatSilver",
  Rainbow02: "Rainbow",
  SwSecreT02: "SwSecret",
} as const satisfies Record<string, PokemonPaperFoilName>;

export type PokemonMatAliasName = keyof typeof POKEMON_MAT_ALIASES;

/** Per-texture `m_ColorSpace` — `data/pokemon/foil/textureFlags.json`. */
function textureFlags(): Record<string, { srgb?: boolean } | undefined> {
  return loadTextureFlags() as Record<string, { srgb?: boolean } | undefined>;
}

/** Shared motif under `/assets/pokemon/textures/`. */
function shared(stem: string): FoilTextureBinding {
  return {
    file: foilTextureFile(stem),
    // Colour motifs are sRGB-authored; data maps (normals / direction /
    // noise) are flagged raw in the dump. Unknown stems default to colour —
    // that is the overwhelming default in the bundle.
    srgb: textureFlags()[stem]?.srgb ?? true,
    // 1px crosses / channel sparkles (Galaxy Stars, Cosmos dots, …) vanish
    // under bilinear — Live keeps them sharp; match with nearest sampling.
    ...(POINT_FILTER_SPARKLE_STEMS.has(stem)
      ? { filter: "point" as const, mipmaps: false }
      : {}),
  };
}

/**
 * Sparse RGB/A sparkle plates — nearest filter or 1px crosses become soft
 * bokeh discs (Galaxy WebGL looked like blobs, Live shows four-point stars).
 */
const POINT_FILTER_SPARKLE_STEMS = new Set([
  "T_Holofoil_Galaxy_Stars",
  "T_Holofoil_Cosmos_Dots",
  "T_Holofoil_Cosmos_Dots_RGBA_Gradient",
  "T_Holofoil_Star_Classic",
  "T_Holofoil_Confetti_Dots",
  "T_Holofoil_Pikachu_Dot",
]);

/**
 * Pathological MAT / GLES overrides (CC unbound, stripped sampler names, …).
 * Dump TexEnvs go to `shared-motifs.json`; overrides win on conflict.
 * @see docs/foil_apk_sources.md
 */
const SHARED_MOTIF_OVERRIDES: Record<string, Record<string, string>> = {
  // Celebrations / AceFoil / Rainbow: dump shared-motifs is complete — no
  // override. Prior Celebration / Desaturate / wrong-slot plates washed foils.
  /**
   * me5-5 PikachuFoil — CC plate is StitchedRings, never TEX_CC_PB.
   * A bad pathid resolve once wrote Poké Ball laminate into shared-motifs;
   * override wins over stale server hydrate too.
   */
  PikachuFoil: {
    _Sampler51145: "FX_T_Noise_Dim",
    // GLES samples `_Normal` for etch-like microrelief (MAT bump plate).
    _Normal: "T_Normal_BumpRandom",
    _CCPatternTex: "TEX_StitchedRings",
    _SpectrumTex: "T_Holofoil_Pikachu_Spectrum",
    _TexDistort: "FX_T_Celeb_Confetti",
    _TexDots: "T_Holofoil_Pikachu_Dot",
  },

  AngledPillars: {
    _SpectrumTexture: "FX_T_Spectrum_Bands_Angled",
  },
  Cosmos: {
    // HLSLcc hash-seed samplers (`.y` → sin-hash); same plate as SvHolo.
    _Sampler5685: "FX_T_Noise_Dim",
    _Sampler5687: "FX_T_Noise_Dim",
    _Sampler5690: "FX_T_Noise_Dim",
    _Sampler5692: "FX_T_Noise_Dim",
    _FoilShineTexture: "FX_T_Gradient_Shine",
    _HolofoilSpectrumTexture: "FX_T_Spectrum_Bands_Rainbow_Bright",
    _StarsTexture: "T_Holofoil_Cosmos_Dots_RGBA_Gradient",
    _T_noise_dots: "T_CloudNoise",
  },
  CrackedIce: {
    // Spectrum / shine / stars come from shared-motifs (Bands_Vertical +
    // `_Texture_Shine`). A prior DesaturateOneSide override washed the ice
    // gray vs Live — do not reintroduce it. Hash-seed samplers only.
    _Sampler5779: "FX_T_Noise_Dim",
    _Sampler5781: "FX_T_Noise_Dim",
    _Sampler5783: "FX_T_Noise_Dim",
    _Sampler5785: "FX_T_Noise_Dim",
  },
  FlatSilver: {
    // MAT leaves CC pattern unbound (pathid 0). The frag still *samples*
    // glitter/CC spectrum, but the overlay is gated by pattern α × `_UseCCFoil`
    // — null CC ⇒ α≈0 ⇒ silver-only reverse. WebGL must not fill unbound slots
    // with opaque black (that arms SVHolo2). ReverseLaminate* / FlatSilver_CC
    // bind a real CC plate via foil_mask overrides.
    // GLES dumps rename MAT `_Tex_CC*` → `_CCPatternTex` / `_CCGlitterTex` /
    // `_CCSpectrumPatternTex` — bind the sampler names the .frag actually uses.
    // Hash-seed `_Sampler*` (same pattern as SvHolo `_Sampler51071`).
    _Sampler5705: "FX_T_Noise_Dim",
    _Sampler5710: "FX_T_Noise_Dim",
    _Sampler5724: "FX_T_Noise_Dim",
    _Sampler5739: "FX_T_Noise_Dim",
    _Sampler5769: "FX_T_Noise_Dim",
    _Sampler5777: "FX_T_Noise_Dim",
    _CCGlitterTex: "FX_T_SVUltra_Glitter",
    _CCSpectrumPatternTex: "FX_T_Spectrum_SVHolo2",
    _Tex_Shine: "T_Holofoil_Mask_Bar_Wide_Single",
    _Tex_Spectrum: "FX_T_Spectrum_FlatSilver",
  },
  FlatSilver_CC: {
    _Sampler5705: "FX_T_Noise_Dim",
    _Sampler5710: "FX_T_Noise_Dim",
    _Sampler5724: "FX_T_Noise_Dim",
    _Sampler5739: "FX_T_Noise_Dim",
    _Sampler5769: "FX_T_Noise_Dim",
    _Sampler5777: "FX_T_Noise_Dim",
    _CCPatternTex: "TEX_CC_PB",
    _CCGlitterTex: "FX_T_SVUltra_Glitter",
    _CCSpectrumPatternTex: "FX_T_Spectrum_SVHolo2",
    _Tex_Shine: "T_Holofoil_Mask_Bar_Wide_Single",
    _Tex_Spectrum: "FX_T_Spectrum_FlatSilver",
  },
  Galaxy: {
    _HolofoilSpectrumTexture: "FX_T_Spectrum_Bands_Vertical",
    _StarsTexture: "T_Holofoil_Galaxy_Stars",
    _T_noise_dots: "T_CloudNoise",
  },
  RadiantHolo: {
    _CrossTexture: "T_Holofoil_Mask_RadiantHolo_RG_X_Grad_5",
    _FoilShineTexture: "FX_T_Gradient_Shine_Dull",
    _speccyspect: "FX_T_Spectrum_BlackSide",
  },
  RGBFoil: {
    _Sampler5483: "FX_T_Noise_Dim",
    _Sampler5510: "FX_T_Noise_Dim",
  },
  Rainbow02: {
    // Alias reuses Rainbow.frag; dump has no Rainbow02 row — keep a vivid plate.
    _SpectrumTexture: "FX_T_Spectrum",
  },
  SolidColor: {
    // Spectrum from dump (`Bands_Vertical`). DesaturateOneSide washed like
    // CrackedIce — do not reintroduce. Frag sampler is `_TextureLightSheen`
    // (not the MAT `…Sheen1` typo); bars plate is unbound in dump.
    _TextureLightSheen: "T_Holofoil_Mask_Gradient_LightSheen",
    _barstexture: "T_HoloFoil_Bars_Mask",
  },
  Squares: {
    _T_Direction_RGB_Random: "T_Holofoil_Squares_Direction",
    _T_noise_dots: "FX_T_Spectrum_Bands_Vertical",
  },
  Stamped: {
    // HLSLcc stripped the hash-seed sampler (same pattern as SvHolo `_Sampler51071`).
    _Sampler5868: "FX_T_Noise_Dim",
    _CardGlitter: "FX_T_SVUltra_Glitter",
    _Highlight: "T_Stamped_HighlightPan",
    _SecondaryLowlight: "T_HoloFoil_Bars_Mask",
    _Shine_Tex: "FX_T_Highlight_Over",
  },
  SunBeam: {
    _DirectionTexture: "T_Holofoil_Distortion_Sun_Pillar",
    _SpectrumTexture: "FX_T_Spectrum_Sunbeam",
  },
  SunLava: {
    // GLES samples `_DirectionTexture` + `_SpectrumBright` (not `_Spectrum` /
    // `_FoilShineTexture`). Keep dump shared-motifs; only fill if extract gap.
    _DirectionTexture: "T_SunLava_Distortion_1",
    _SpectrumBright: "FX_T_Spectrum_SunLava",
  },
  SunPillar: {
    // Northern Cross is on the MAT, but `_UseCCFoil` defaults to 0 — CastAndCure
    // prints turn the layer on at runtime (see `applyLiveFoilMask`).
    // GLES frag samples `_CCPatternTex` (not MAT `_Tex_CC`).
    _Sampler51931: "FX_T_Noise_Dim",
    _SpectrumTexture: "FX_T_Spectrum_Sunpillar",
    _CCPatternTex: "FX_T_Northern_Cross",
    _CCSpectrumPatternTex: "FX_T_Spectrum_SVHolo2",
  },
  SvHolo: {
    // HLSLcc stripped the hash-seed sampler name; MAT has no extra TexEnv —
    // Grain is the closest noise plate in the same leaf.
    _Sampler51071: "FX_T_Noise_Dim",
    _GrainTexture: "FX_T_Noise_Dim",
    _ShineTexture: "FX_T_Spectrum_SVHolo3",
    _SpectrumTexture: "FX_T_Spectrum_SVHolo2",
  },
  SvUltra: {
    _Card_Glitter: "FX_T_SVUltra_Glitter",
    _Shine_Tex: "FX_T_Spectrum_Sunpillar3",
    _Spectrum_Tex: "FX_T_Spectrum_Rainbow",
  },
  SvUltraGoldRainbow: {
    _Sampler51220: "FX_T_Noise_Dim",
    _Sampler51226: "FX_T_Noise_Dim",
    _Sampler51267: "FX_T_Noise_Dim",
    _Sampler51352: "FX_T_Noise_Dim",
    _CardGlitter: "FX_T_SVUltra_Glitter",
    _Shine_Tex: "FX_T_Highlight_Gold_Band",
    _Spectrum_Tex: "FX_T_Spectrum_SVHolo2",
    _Tex_Distort: "FX_T_Distort",
  },
  SvUltraScodix: {
    _CardGlitter: "FX_T_SVUltra_Glitter",
    _Shine_Tex: "FX_T_Highlight_Gold_Band",
    _Spectrum_Tex: "FX_T_Spectrum_SVHolo2",
    // Stripped samplers sample `.y` like GoldRainbow's distort plate.
    _Sampler5366: "FX_T_Distort",
    _Sampler5365: "FX_T_Distort",
    _Sampler5408: "FX_T_Distort",
  },
  SwHolo: {
    _DirectionTexture: "T_Holofoil_Distortion_Sun_Pillar",
    _SpectrumTexture: "FX_T_Spectrum_Bands_Vertical",
    _T_Holofoil_Mask_BWBars: "T_Holofoil_Mask_BWBars",
  },
  SwSecreT02: {
    // Alias of SwSecret.frag — dump has no SwSecreT02 row.
    _NoiseTexture: "T_Noise_Random",
    _Spectrum: "FX_T_Spectrum_Bands_Vertical",
  },
  Thatch: {
    _RedGreenDistortion: "T_Direction_RGB_Random_3",
    _SparklesTexture: "T_Noise_Random",
    _SpectrumTexture: "FX_T_Spectrum_Bands_Vertical",
    _T_Direction_RG_Thatch: "T_Direction_RG_Thatch",
  },
  Tinsel: {
    // MAT may list `_BarsDistortion` TexEnv; the GLES frag never samples it.
    _FoilShineTexture: "FX_T_Gradient_Shine",
    _Shine_Tex: "FX_T_Gradient_Shine_Dull",
    _SpectrumBars: "FX_T_Spectrum_Bands_Rainbow",
    _Spectrum_Tex: "FX_T_Spectrum_Bands_Rainbow_Bright",
    _TinselBars: "FX_T_Tinsel_Bars",
  },
};

/**
 * Sheet aliases that reuse a parent MAT dump but need different floats.
 * FlatSilver_CC has no own sheet — it inherits FlatSilver's `_UseCCFoil = 0`,
 * which gates Poké Ball CC off even with `_CCPatternTex` bound.
 */
const SHARED_FLOAT_OVERRIDES: Record<string, Record<string, number>> = {
  FlatSilver_CC: { _UseCCFoil: 1 },
  // Stamped keeps dump floats (SDL 0.3 + UseVertexNomal). WebGL light must
  // orbit the sheet rest `(0,0,1)` — see `restLightFromSheet` / lean contract.
};

/**
 * Merge BASE floats with a dumped sheet. Live sometimes leaves
 * `_FoilAnimation = 0` while `_FoilScrollingOn = 1` (SolidColor) — the GLES
 * frags only read the former, so a zero freezes the spectrum scroll forever.
 */
export function mergeMaterialFloats(
  sheetFloats: Record<string, number> | undefined,
  sheetName?: string,
): Record<string, number> {
  const floats = {
    ...BASE_FLOATS,
    ...sheetFloats,
    ...(sheetName ? (SHARED_FLOAT_OVERRIDES[sheetName] ?? {}) : {}),
  };
  if (
    (floats._FoilScrollingOn ?? 0) > 0 &&
    (floats._FoilAnimation ?? 0) === 0
  ) {
    floats._FoilAnimation = 1;
  }
  return floats;
}

/**
 * Live `foil_mask` toggles the Cast-and-Cure / laminate CC layer. The MAT sheet
 * for SunPillar ships `_UseCCFoil = 0`; CastAndCure prints flip it on. Poké /
 * Master Ball reverse laminates bind the matching CC plate on FlatSilver.
 */
export function applyLiveFoilMask(
  material: FoilMaterial,
  foilMask: string | null | undefined,
): FoilMaterial {
  const mask = (foilMask ?? "").trim();
  if (!mask || mask === "None") return material;

  const floats = { ...material.floats };
  const textures = { ...material.textures };
  let changed = false;

  if (mask === "CastAndCure") {
    floats._UseCCFoil = 1;
    changed = true;
  } else if (mask === "ReverseLaminatePokeBall") {
    floats._UseCCFoil = 1;
    // GLES FlatSilver.frag samples `_CCPatternTex` (MAT name was `_Tex_CC`).
    textures._CCPatternTex = shared("TEX_CC_PB");
    changed = true;
  } else if (mask === "ReverseLaminateMasterBall") {
    floats._UseCCFoil = 1;
    textures._CCPatternTex = shared("TEX_CC_MB");
    changed = true;
  }

  if (!changed) return material;
  return { ...material, floats, textures };
}

function sheetColorsFrom(
  sheet:
    | {
        floats?: Record<string, number>;
        colors?: Record<string, number[]>;
      }
    | undefined,
): FoilMaterial["colors"] {
  return Object.fromEntries(
    Object.entries(sheet?.colors ?? {}).map(([slot, rgba]) => [
      slot,
      [rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0, rgba[3] ?? 0] as [
        number,
        number,
        number,
        number,
      ],
    ]),
  );
}

function motifsForLeaf(
  sheetName: string,
  fragStem: string,
): Record<string, string> {
  const generated = loadSharedMotifs();
  return {
    ...(generated[sheetName] ?? generated[fragStem] ?? {}),
    ...(SHARED_MOTIF_OVERRIDES[sheetName] ??
      SHARED_MOTIF_OVERRIDES[fragStem] ??
      {}),
  };
}

function materialForSheet(
  sheetName: string,
  fragStem: PokemonPaperFoilName,
): FoilMaterial {
  const textures: FoilMaterial["textures"] = { ...BASE_TEXTURES };
  const sharedSlots = motifsForLeaf(sheetName, fragStem);
  for (const [slot, stem] of Object.entries(sharedSlots)) {
    textures[slot] = shared(stem);
  }
  const sheet = materialSheets()[sheetName] ?? materialSheets()[fragStem];
  const isNonFoil = fragStem === "NonFoil";
  if (isNonFoil) {
    // Standard leaf samples art only — keep mask roles off so the playroom
    // does not pull a foiled print's finish/mask onto a plain face.
    delete textures._CardWhitePlateMask;
    delete textures._CardEtch;
    delete textures._CardColdFoilMask;
  }
  return {
    graph: `TPCi/Cards3D/${isNonFoil ? "Standard" : "HoloFoil"}/${sheetName}`,
    keywords: [],
    fragment: `${fragStem}.frag`,
    // Linear pipeline: sRGB plates decode on sample, OETF on output.
    // (Gamma byte×17.5 clamped → neon burn on SunLava; Linear softens chroma.)
    linearOutput: true,
    // NonFoil = plain print. CSS already resolves to null shaders; WebGL would
    // only re-blit art through Standard lighting (SDL=1 noop) and fake a gap.
    ...(isNonFoil ? { webgl: false as const } : {}),
    textures,
    floats: mergeMaterialFloats(sheet?.floats, sheetName),
    // `*_ST` stays identity like the sheet says: the app crops its square
    // card textures through mesh UVs, the dump crops the files themselves
    // (`card_crop`), so both sample the full texture.
    colors: { ...sheetColorsFrom(sheet) },
  };
}

/** Playroom / admin picker — foiled leaves + sheet aliases; no NonFoil. */
export function listPokemonMaterialNames(): string[] {
  return [
    ...listPokemonEffectFoilNames(),
    ...(Object.keys(POKEMON_MAT_ALIASES) as PokemonMatAliasName[]),
  ];
}

/**
 * Live view of material names (lazy). Prefer {@link listPokemonMaterialNames}.
 */
export const POKEMON_MATERIAL_NAMES: readonly string[] = lazyLiveList(
  listPokemonMaterialNames,
);

/** Shared motif stems declared for a foil leaf (tests / audits). */
export function sharedMotifStems(
  name: string,
): Readonly<Record<string, string>> {
  return motifsForLeaf(name, name);
}

/** Drop cached materials after foil meta hydrate (browser). */
export function resetPaperMaterialCache(): void {
  BASE_MATERIALS.clear();
  MASKED_MATERIALS.clear();
}

export type PaperMaterialOptions = {
  /** Live `foil_mask` (CastAndCure, ReverseLaminate*, …). */
  foilMask?: string | null;
};

/** Stable overrides — new object identity each call remounts WebGL (blink). */
const MASKED_MATERIALS = new Map<string, FoilMaterial>();
const BASE_MATERIALS = new Map<string, FoilMaterial>();

function baseMaterialFor(name: string): FoilMaterial | null {
  const cached = BASE_MATERIALS.get(name);
  if (cached) return cached;

  const aliasFrag = POKEMON_MAT_ALIASES[name as PokemonMatAliasName] ?? null;
  if (aliasFrag) {
    const m = materialForSheet(name, aliasFrag);
    BASE_MATERIALS.set(name, m);
    return m;
  }

  const names = listPokemonFoilNames();
  if (names.includes(name)) {
    const m = materialForSheet(name, name);
    BASE_MATERIALS.set(name, m);
    return m;
  }

  const mapped = foilManifestToShader(name);
  if (mapped && names.includes(mapped)) {
    const m = materialForSheet(mapped, mapped);
    BASE_MATERIALS.set(mapped, m);
    return m;
  }
  return null;
}

export function paperMaterial(
  name: string,
  opts?: PaperMaterialOptions,
): FoilMaterial | null {
  const direct = baseMaterialFor(name);
  const mapped = direct ? null : foilManifestToShader(name);
  const base = direct ?? (mapped ? baseMaterialFor(mapped) : null);
  if (!base) return null;
  const mask = (opts?.foilMask ?? "").trim();
  if (!mask || mask === "None") return base;

  const cacheKey = `${direct ? name : (mapped ?? name)}::${mask}`;
  const cached = MASKED_MATERIALS.get(cacheKey);
  if (cached) return cached;

  const next = applyLiveFoilMask(base, mask);
  if (next === base) return base;
  MASKED_MATERIALS.set(cacheKey, next);
  return next;
}

/**
 * The finish a dumped material stands for.
 *
 * The **Live leaf**, not the catalogue bucket. Returning a flat `"holo"` for
 * every material meant anything resolving a look from it — the playroom's CSS
 * half above all — asked for the same finish 27 times and drew one look for the
 * whole pack, whatever the material under test. Lorcana's equivalent has always
 * returned the real finish (`CardFoilLava` → `Lava`); this now matches.
 *
 * `resolveCssRecipe` reads leaves first and falls back to the catalogue bucket,
 * so a leaf it has no recipe for still lands on the everyday holo.
 *
 * A known leaf answers as *itself*, which is the same precedence `paperMaterial`
 * uses (`direct ?? mapped`) and for the same reason. `foilManifestToShader`
 * collapses sheet aliases onto their `.frag` stem — `FlatSilver_CC` becomes
 * `FlatSilver` — which is right for picking a shader and wrong for naming a
 * finish: the CC leaf binds the Poké Ball laminate that plain FlatSilver has no
 * trace of. Asking first cost the CC prints their own look entirely.
 */
export function parsePaperMaterialName(name: string): {
  finish: string | null;
  varnish: string | null;
} {
  const shader = baseMaterialFor(name) ? name : foilManifestToShader(name);
  if (!shader) return { finish: null, varnish: null };
  // Keep "NonFoil" as the finish id so CSS resolves to plain (null shaders)
  // and the playroom does not fall through to another print's foiled finish.
  return { finish: shader, varnish: null };
}
