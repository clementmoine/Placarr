export type FoilBackend = "webgl" | "css";
export type FoilBackendPreference = "auto" | "webgl" | "css";

export type FoilTextureRole =
  | "art"
  | "foilMask"
  | "varnishMask"
  | "secondVarnishMask"
  | "normals";

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
};

export type FoilMaterial = {
  graph: string;
  keywords: string[];
  fragment: string;
  fragmentTime?: string;
  textures: Record<string, FoilTextureBinding>;
  floats: Record<string, number>;
  colors: Record<string, number[]>;
};

export type FoilCssRecipe = {
  finishShaderId: string | null;
  varnishShaderId: string | null;
};

export type EffectPackModule = {
  id: string;
  /** Base URL for pack assets, e.g. `/foil/lorcana` */
  assetBase: string;
  cardBackUrl?: string | null;
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
    options?: { secondVarnishMaskUrl?: string | null },
  ): FoilMaterial | null;
  resolveCss(
    finish: string,
    varnish: string | null | undefined,
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
    options?: { secondVarnishMaskUrl?: string | null },
  ): FoilMaterial | null;
  /** Parse a dumped material name into catalogue finish / varnish (playroom). */
  parseMaterialName?(name: string): {
    finish: string | null;
    varnish: string | null;
  };
};
