import type {
  FoilMaterial,
  FoilTextureBinding,
} from "@/core/render/foil/types";
import { foilTextureFile } from "@/effects/foilTextureFile";

import materialSheetsJson from "./materialSheets.json";
import textureFlagsJson from "./textureFlags.json";
import {
  foilManifestToShader,
  POKEMON_FOIL_NAMES,
  type PokemonPaperFoilName,
} from "./foilNames";

/**
 * Lorcana-style roles for TCG Live HoloFoil fragments.
 * Art = TCGdex / Live `_c`; foil mask = per-card `_w`.
 * Shared motifs = Unity `MAT_Cards3D_*` defaults from `shadersbundle`
 * (property → Texture2D under `textures/_shared/`).
 */
const BASE_TEXTURES: FoilMaterial["textures"] = {
  // Every per-card texture — masks and plates included — ships
  // `m_ColorSpace = sRGB` (checked in the card bundles), so the app's Linear
  // pipeline linearises them all on sample.
  _CardColorDiffuse: { role: "art", srgb: true },
  _CardWhitePlateMask: { role: "foilMask", srgb: true },
  // Live per-card plates ride the generic per-print mask roles; their black
  // fallback is the correct "no plate" neutral for cards without a dump.
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
};

/**
 * `MAT_Cards3D_*` recorded uniforms, dumped from `shadersbundle`
 * (`write_material_sheets`). Empty stub without a local dump.
 */
const MATERIAL_SHEETS = materialSheetsJson as Record<
  string,
  | {
      floats?: Record<string, number>;
      colors?: Record<string, number[]>;
    }
  | undefined
>;

/**
 * Per-texture `m_ColorSpace` from `shadersbundle` (`textureFlags.json`).
 * Empty stub without a local dump.
 */
const TEXTURE_FLAGS = textureFlagsJson as Record<
  string,
  { srgb?: boolean } | undefined
>;

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

/** Shared motif under `/foil/pokemon/textures/`. */
function shared(stem: string): FoilTextureBinding {
  return {
    file: `_shared/${foilTextureFile(stem)}`,
    // Colour motifs are sRGB-authored; data maps (normals / direction /
    // noise) are flagged raw in the dump. Unknown stems read as colour —
    // that is the overwhelming default in the bundle.
    srgb: TEXTURE_FLAGS[stem]?.srgb ?? true,
  };
}

/**
 * Dump-aligned motif slots per HoloFoil leaf (APK / CDN `shadersbundle`).
 * Keys must match GLES3 sampler names in `*.frag` (not always the Material
 * property spelling when Unity stripped names — those stay unbound).
 */
const SHARED_BY_FOIL: Record<string, Record<string, string>> = {
  "25thConfetti": {
    _FoilShineTexture: "FX_T_Highlight_Over",
    _SpectrumTex: "FX_T_Spectrum_Celebration",
    _TexDistort: "T_CloudNoise",
    _TexDots: "FX_T_Celeb_Confetti",
  },
  AceFoil: {
    _CrossTexture: "T_Holofoil_Mask_RadiantHolo_RG_X_Grad_5",
    _FoilShineTexture: "FX_T_Gradient_Shine",
    _T_Holofoil_Mask_Bar_Thin_Single: "T_Holofoil_Mask_Bar_Thin_Single",
    _speccyspect: "FX_T_Spectrum_BlackSide",
  },
  AngledPillars: {
    _SpectrumTexture: "FX_T_Spectrum_Bands_Angled",
  },
  Cosmos: {
    _FoilShineTexture: "FX_T_Gradient_Shine",
    _HolofoilSpectrumTexture: "FX_T_Spectrum_Bands_Rainbow_Bright",
    _StarsTexture: "T_Holofoil_Cosmos_Dots_RGBA_Gradient",
    _T_noise_dots: "T_CloudNoise",
  },
  CrackedIce: {
    _HolofoilSpectrumTexture: "FX_T_Spectrum_Bands_DesaturateOneSide",
    _StarsTexture: "T_Holofoil_Mask_Cracked_Ice_RGB",
    _T_noise_dots: "T_CloudNoise_Bright",
    _TextureLightSheen: "T_Holofoil_Mask_Gradient_LightSheen",
  },
  FlatSilver: {
    // MAT leaves `_Tex_CC` unbound (pathid 0); glitter/spectrum still run.
    // ReverseLaminate* / FlatSilver_CC bind a CC plate via foil_mask overrides.
    _Tex_CC_Glitter: "FX_T_SVUltra_Glitter",
    _Tex_CC_Spectrum: "FX_T_Spectrum_SVHolo2",
    _Tex_Shine: "T_Holofoil_Mask_Bar_Wide_Single",
    _Tex_Spectrum: "FX_T_Spectrum_FlatSilver",
  },
  FlatSilver_CC: {
    _Tex_CC: "TEX_CC_PB",
    _Tex_CC_Glitter: "FX_T_SVUltra_Glitter",
    _Tex_CC_Spectrum: "FX_T_Spectrum_SVHolo2",
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
  Rainbow: {
    _DirectionTexture: "FX_T_Distort",
    _SpectrumBright: "FX_T_Highlight_Over",
    _SpectrumTexture: "FX_T_Spectrum_Rainbow",
  },
  Rainbow02: {
    _DirectionTexture: "FX_T_Distort",
    _SpectrumBright: "FX_T_Highlight_Over",
    _SpectrumTexture: "FX_T_Spectrum",
  },
  SolidColor: {
    _SpectrumTexture: "FX_T_Spectrum_Bands_DesaturateOneSide",
    _TextureLightSheen1: "T_Holofoil_Mask_Gradient_LightSheen",
    _barstexture: "T_HoloFoil_Bars_Mask",
  },
  Squares: {
    _T_Direction_RGB_Random: "T_Holofoil_Squares_Direction",
    _T_noise_dots: "FX_T_Spectrum_Bands_Vertical",
  },
  Stamped: {
    _TextureSample3: "FX_T_Gradient_Shine",
  },
  SunBeam: {
    _DirectionTexture: "T_Holofoil_Distortion_Sun_Pillar",
    _SpectrumTexture: "FX_T_Spectrum_Sunbeam",
  },
  SunLava: {
    _FoilShineTexture: "FX_T_Gradient_Shine",
    _Spectrum: "FX_T_Spectrum_Bands_Rainbow",
    _T_Holofoil_Distortion_3: "T_Holofoil_Distortion_1",
  },
  SunPillar: {
    // Northern Cross is on the MAT, but `_UseCCFoil` defaults to 0 — CastAndCure
    // prints turn the layer on at runtime (see `applyLiveFoilMask`).
    _SpectrumTexture: "FX_T_Spectrum_Sunpillar",
    _Tex_CC: "FX_T_Northern_Cross",
    _Tex_CC_Spectrum: "FX_T_Spectrum_SVHolo2",
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
  SwSecret: {
    _NoiseTexture: "T_Noise_Random",
    _Spectrum: "FX_T_Spectrum",
  },
  SwSecreT02: {
    _NoiseTexture: "T_Noise_Random",
    _Spectrum: "FX_T_Spectrum",
  },
  Thatch: {
    _RedGreenDistortion: "T_Direction_RGB_Random_3",
    _SparklesTexture: "T_Noise_Random",
    _SpectrumTexture: "FX_T_Spectrum_Bands_Vertical",
    _T_Direction_RG_Thatch: "T_Direction_RG_Thatch",
  },
  Tinsel: {
    _BarsDistortion: "T_Normal_BumpRandom",
    _FoilShineTexture: "FX_T_Gradient_Shine",
    _Shine_Tex: "FX_T_Gradient_Shine_Dull",
    _SpectrumBars: "FX_T_Spectrum_Bands_Rainbow",
    _Spectrum_Tex: "FX_T_Spectrum_Bands_Rainbow_Bright",
    _TinselBars: "FX_T_Tinsel_Bars",
  },
};

/**
 * Merge BASE floats with a dumped sheet. Live sometimes leaves
 * `_FoilAnimation = 0` while `_FoilScrollingOn = 1` (SolidColor) — the GLES
 * frags only read the former, so a zero freezes the spectrum scroll forever.
 */
export function mergeMaterialFloats(
  sheetFloats: Record<string, number> | undefined,
): Record<string, number> {
  const floats = { ...BASE_FLOATS, ...sheetFloats };
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
    textures._Tex_CC = shared("TEX_CC_PB");
    changed = true;
  } else if (mask === "ReverseLaminateMasterBall") {
    floats._UseCCFoil = 1;
    textures._Tex_CC = shared("TEX_CC_MB");
    changed = true;
  }

  if (!changed) return material;
  return { ...material, floats, textures };
}

function sheetColorsFrom(
  sheet: (typeof MATERIAL_SHEETS)[string],
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

function materialForSheet(
  sheetName: string,
  fragStem: PokemonPaperFoilName,
): FoilMaterial {
  const textures: FoilMaterial["textures"] = { ...BASE_TEXTURES };
  const sharedSlots =
    SHARED_BY_FOIL[sheetName] ?? SHARED_BY_FOIL[fragStem] ?? {};
  for (const [slot, stem] of Object.entries(sharedSlots)) {
    textures[slot] = shared(stem);
  }
  const sheet = MATERIAL_SHEETS[sheetName] ?? MATERIAL_SHEETS[fragStem];
  return {
    graph: `TPCi/Cards3D/${fragStem === "NonFoil" ? "Standard" : "HoloFoil"}/${sheetName}`,
    keywords: [],
    fragment: `${fragStem}.frag`,
    // TCG Live renders in Unity's Linear colour space (sRGB-flagged textures,
    // raw-flagged data maps): sample through sRGB decode, encode on output.
    linearOutput: true,
    textures,
    floats: mergeMaterialFloats(sheet?.floats),
    // `*_ST` stays identity like the sheet says: the app crops its square
    // card textures through mesh UVs, the dump crops the files themselves
    // (`card_crop`), so both sample the full texture.
    colors: { ...sheetColorsFrom(sheet) },
  };
}

const MATERIALS: Record<string, FoilMaterial> = Object.fromEntries([
  ...POKEMON_FOIL_NAMES.map((name) => [name, materialForSheet(name, name)]),
  ...Object.entries(POKEMON_MAT_ALIASES).map(([alias, frag]) => [
    alias,
    materialForSheet(alias, frag),
  ]),
]);

export const POKEMON_MATERIAL_NAMES = [
  ...POKEMON_FOIL_NAMES,
  ...(Object.keys(POKEMON_MAT_ALIASES) as PokemonMatAliasName[]),
];

/** Shared motif stems declared for a foil leaf (tests / audits). */
export function sharedMotifStems(
  name: string,
): Readonly<Record<string, string>> {
  return SHARED_BY_FOIL[name] ?? {};
}

export type PaperMaterialOptions = {
  /** Live `foil_mask` (CastAndCure, ReverseLaminate*, …). */
  foilMask?: string | null;
};

/** Stable overrides — new object identity each call remounts WebGL (blink). */
const MASKED_MATERIALS = new Map<string, FoilMaterial>();

export function paperMaterial(
  name: string,
  opts?: PaperMaterialOptions,
): FoilMaterial | null {
  const direct = MATERIALS[name];
  const mapped = direct ? null : foilManifestToShader(name);
  const base = direct ?? (mapped ? (MATERIALS[mapped] ?? null) : null);
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
  const shader = MATERIALS[name] ? name : foilManifestToShader(name);
  if (!shader) return { finish: null, varnish: null };
  if (shader === "NonFoil") return { finish: null, varnish: null };
  return { finish: shader, varnish: null };
}
