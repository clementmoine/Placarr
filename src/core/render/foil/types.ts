export type FoilBackend = "webgl" | "css";
export type FoilBackendPreference = "auto" | "webgl" | "css";

export type FoilTextureRole =
  "art" | "foilMask" | "varnishMask" | "secondVarnishMask" | "normals";

export type FoilWrap = "repeat" | "clamp" | "mirror" | "mirrorOnce";
export type FoilFilter = "point" | "bilinear" | "trilinear";

export type FoilAstcBinding = {
  file: string;
  width: number;
  height: number;
  /** GL compressed format constant name, e.g. "COMPRESSED_RGBA_ASTC_4x4_KHR" */
  format: string;
};

export type FoilTextureBinding = {
  file?: string;
  role?: FoilTextureRole;
  wrap?: FoilWrap;
  filter?: FoilFilter;
  mipmaps?: boolean;
  aniso?: number;
  astc?: FoilAstcBinding;
  /** Unity property name from the dump (Pocket / SPIR-V remaps). */
  unity?: string;
  /**
   * Unity `m_ColorSpace = sRGB`: sample through hardware sRGB→linear decode
   * (`SRGB8_ALPHA8`), the way the app's Linear pipeline reads it. Data maps
   * (normals / direction / noise) stay raw.
   */
  srgb?: boolean;
};

/**
 * Declared Unity shader properties (order matters for SPIR-V UBO rebound).
 * Pocket dumps lose OpNames; this list restores authored floats/vectors.
 */
export type FoilUnityProps = {
  scalars: readonly { name: string; range: boolean }[];
  vectors: readonly string[];
};

export type FoilMaterial = {
  graph: string;
  keywords: string[];
  fragment: string;
  fragmentTime?: string;
  /** Pocket: companion vertex stage (Vulkan → GLSL). */
  vertex?: string;
  /**
   * The source app renders in Unity's Linear colour space: its fragments emit
   * linear values and rely on an sRGB framebuffer for encoding. WebGL2's
   * default framebuffer is raw, so the renderer appends the encode to `main`.
   * Pair with `srgb` texture bindings — linear math on sRGB samples is what
   * made the render dark and oversaturated.
   */
  linearOutput?: boolean;
  /**
   * When `false`, stay on the CSS plain-art path even if the preference is
   * `webgl` / `auto`. Live Standard/NonFoil has no foil layers — running its
   * dump frag next to CSS invented a fake Unity↔web gap in the playroom.
   * Omit or `true` = WebGL-eligible.
   */
  webgl?: boolean;
  textures: Record<string, FoilTextureBinding>;
  floats: Record<string, number>;
  colors: Record<string, number[]>;
  /** Pocket: Unity time-driven float property names. */
  timeFloats?: string[];
  /** Pocket: property list for UBO rebound. */
  unityProps?: FoilUnityProps;
  /**
   * Pocket: DesignSettings draw stack (base + hologram / kira / …).
   * When set, the WebGL path runs {@link planPocketPasses}.
   */
  pocketStack?: FoilMaterial[];
  /** Pocket: design stencil mask filename under textures/. */
  stencilMaskFile?: string | null;
  /** Pocket: stencil cut-off (Unity `_AlphaThreshold`). */
  stencilThreshold?: number;
};

export type FoilCssRecipe = {
  finishShaderId: string | null;
  varnishShaderId: string | null;
};

export type EffectPackModule = {
  id: string;
  /** Human label for admin UI (tabs, pickers). Falls back to `id`. */
  label?: string;
  /** Short subtitle under the label when space allows. */
  blurb?: string;
  /** Base URL for pack assets, e.g. `/assets/lorcana` */
  assetBase: string;
  /**
   * Default card back for the whole game (dump APK/CDN). Required contract —
   * packs without a known back still declare the URL the dump must fill.
   */
  cardBackUrl: string;
  /**
   * Optional set- (or dump-) scoped back. Return null to fall through to
   * {@link cardBackUrl}. Print-specific alt faces belong on the provider
   * candidate (`PrintCandidate.cardBackUrl`), not here.
   */
  resolveCardBack?(ctx: {
    setCode?: string | null;
    printKey?: string | null;
  }): string | null;
  /** When catalogue prints have no foil mask (Pocket). */
  fallbackFoilMaskUrl?: string | null;
  resolveMaterial(
    finish: string,
    varnish: string | null | undefined,
  ): FoilMaterial | null;
  /**
   * Material with USESECONDTOPLAYER sibling when second varnish mask is present.
   */
  resolveMaterialForPrint(
    finish: string,
    varnish: string | null | undefined,
    options?: {
      secondVarnishMaskUrl?: string | null;
      /** Provider-neutral print anchor — packs may map it to a dumped recipe. */
      printKey?: string | null;
      /** Catalogue title — Live name join when set+num misses. */
      title?: string | null;
      /**
       * Live foil mask enum (CastAndCure, ReverseLaminate*, …) when the
       * caller already resolved it — packs may toggle CC layers from it.
       */
      foilMask?: string | null;
    },
  ): FoilMaterial | null;
  /**
   * Optional: map catalogue signals to a dumped design / material name.
   */
  resolveEffectName?(signals: {
    finish?: string | null;
    rarity?: string | null;
    category?: string | null;
  }): string | null;
  resolveCss(
    finish: string,
    varnish: string | null | undefined,
    /**
     * Live `foil_mask` / print join — packs may swap CSS looks the same way
     * WebGL toggles CC / laminate plates.
     */
    opts?: {
      foilMask?: string | null;
      printKey?: string | null;
      title?: string | null;
    },
  ): FoilCssRecipe;
  /** All dumped material names (playroom). */
  listMaterials(): string[];
  material(name: string): FoilMaterial | null;
  /**
   * Named dumped material, with USESECONDTOPLAYER sibling when needed.
   * Playroom uses this so each tile runs the exact material, not a finish→name guess.
   */
  materialForPrint?(
    name: string,
    options?: {
      secondVarnishMaskUrl?: string | null;
      /** Live foil mask enum — toggles Cast-and-Cure / laminate CC plates. */
      foilMask?: string | null;
    },
  ): FoilMaterial | null;
  /** Parse a dumped material name into catalogue finish / varnish (playroom). */
  parseMaterialName?(name: string): {
    finish: string | null;
    varnish: string | null;
  };
  /** Pocket playroom: per-design art URL when TCGdex seeds are shared. */
  playroomArtForMaterial?(name: string): {
    imageUrl: string;
    maskUrl?: string | null;
    /** Per-card plates riding the generic mask surfaces (e.g. Live etch). */
    varnishMaskUrl?: string | null;
    secondVarnishMaskUrl?: string | null;
    /** Live `foil_mask` for the dumped seed (CastAndCure, …). */
    foilMask?: string | null;
    /** Live bundle stem when pack art comes from the CDN dump. */
    bundleId?: string | null;
    /** What to caption the bench tile with — the card the art came from. */
    label?: string | null;
    /** Quarters of a turn when the seed sits on its side (BREAK → 1). */
    faceQuarterTurns?: 0 | 1 | 2 | 3;
    cardGlow?: string | null;
    /** Face is in the Live carddex cache — MuMu 1:1 compare is possible. */
    liveOwned?: boolean;
  } | null;
  /**
   * Several Live faces for one material (seed + other sets). Focus/compare
   * stacks these so a look is checked generically, not on one print only.
   */
  playroomArtsForMaterial?(
    name: string,
    limit?: number,
  ): Array<{
    imageUrl: string;
    maskUrl?: string | null;
    varnishMaskUrl?: string | null;
    secondVarnishMaskUrl?: string | null;
    foilMask?: string | null;
    bundleId?: string | null;
    label?: string | null;
    faceQuarterTurns?: 0 | 1 | 2 | 3;
    cardGlow?: string | null;
    liveOwned?: boolean;
  }>;
};
