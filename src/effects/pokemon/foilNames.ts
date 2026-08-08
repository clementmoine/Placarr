/**
 * TCG Live HoloFoil / Standard shader leaf names (platform 9 `.frag` files).
 * Longest-first for substring matching against MaterialManifest `_f` strings
 * like `HoloFoil_Rainbow_Amplify_J`.
 */
export const POKEMON_FOIL_NAMES = [
  "SvUltraGoldRainbow",
  "SvUltraScodix",
  "25thConfetti",
  "AngledPillars",
  "RadiantHolo",
  "CrackedIce",
  "FlatSilver",
  "SolidColor",
  "SunPillar",
  "SunBeam",
  "SunLava",
  "SwSecret",
  "AceFoil",
  "Squares",
  "Stamped",
  "Rainbow",
  "Galaxy",
  "Cosmos",
  "Tinsel",
  "Thatch",
  "SvUltra",
  "SvHolo",
  "SwHolo",
  "NonFoil",
] as const;

export type PokemonPaperFoilName = (typeof POKEMON_FOIL_NAMES)[number];

const FOIL_SET = new Set<string>(POKEMON_FOIL_NAMES);

/** Map MaterialManifest `_f` / shaderPath tail → dumped `.frag` stem. */
/**
 * MAT sheet aliases → dumped `.frag` stem. Matched before prefix rules so
 * `FlatSilver_CC` resolves as FlatSilver (shader) while `paperMaterial` can
 * still load the CC sheet by exact leaf name.
 */
const FOIL_SHEET_ALIAS_FRAG: Record<string, PokemonPaperFoilName> = {
  flatsilver_cc: "FlatSilver",
  flatsilvercc: "FlatSilver",
  rainbow02: "Rainbow",
  swsecret02: "SwSecret",
};

/** Exact MAT / playroom leaf name when it is a sheet alias (not a .frag stem). */
export function foilSheetAliasName(foil: string): string | null {
  const key = foil.trim().toLowerCase().replace(/_/g, "");
  const compactAliases: Record<string, string> = {
    flatsilvercc: "FlatSilver_CC",
    rainbow02: "Rainbow02",
    swsecret02: "SwSecreT02",
  };
  return compactAliases[key] ?? null;
}

export function foilManifestToShader(foil: string): PokemonPaperFoilName | null {
  const raw = foil.trim();
  if (!raw) return null;
  if (FOIL_SET.has(raw)) return raw as PokemonPaperFoilName;

  let n = raw.replace(/^TPCi\/Cards3D\/(?:HoloFoil|Standard)\//, "");
  n = n.replace(/^Cards\/(?:Foil|Standard)\//, "");
  n = n.replace(/^HoloFoil_/, "").replace(/^Standard_/, "");

  const nLower = n.toLowerCase();
  // Live sometimes inserts underscores inside CamelCase (`Cracked_Ice_…`).
  const nCompact = nLower.replace(/_/g, "");
  const aliasFrag =
    FOIL_SHEET_ALIAS_FRAG[nLower] ?? FOIL_SHEET_ALIAS_FRAG[nCompact];
  if (aliasFrag) return aliasFrag;

  for (const name of POKEMON_FOIL_NAMES) {
    const nameLower = name.toLowerCase();
    if (
      nLower === nameLower ||
      nLower.startsWith(`${nameLower}_`) ||
      nCompact === nameLower ||
      nCompact.startsWith(nameLower)
    ) {
      return name;
    }
  }
  if (/nonfoil/i.test(n)) return "NonFoil";
  return null;
}
