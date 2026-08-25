/**
 * TCG Live HoloFoil / Standard shader leaf names — discovered from dump
 * (`frag-stems.json` + optional server disk scan), not an allowlist.
 * Longest-first for substring matching against MaterialManifest `_f` strings.
 *
 * **Client-safe**: no `node:*`. Disk `.frag` scan is installed on the server
 * via {@link installPokemonShaderStemScanner}.
 */

import { lazyLiveList } from "@/effects/lazyLiveList";
import { loadFragStems } from "@/lib/foilMetaLoad";

/** Widened: any dumped `.frag` stem (plus NonFoil). */
export type PokemonPaperFoilName = string;

type ShaderStemScanner = () => string[];

const g = globalThis as typeof globalThis & {
  __PLACARR_POKEMON_SHADER_SCAN__?: ShaderStemScanner;
};

/** Server: register `readdir` of `data/pokemon/foil/shaders`. */
export function installPokemonShaderStemScanner(scan: ShaderStemScanner): void {
  g.__PLACARR_POKEMON_SHADER_SCAN__ = scan;
}

/**
 * MAT sheet aliases → dumped `.frag` stem. Matched before prefix rules so
 * `FlatSilver_CC` resolves as FlatSilver (shader) while `paperMaterial` can
 * still load the CC sheet by exact leaf name.
 */
const FOIL_SHEET_ALIAS_FRAG: Record<string, string> = {
  flatsilver_cc: "FlatSilver",
  flatsilvercc: "FlatSilver",
  rainbow02: "Rainbow",
  swsecret02: "SwSecret",
};

function scanShaderStems(): string[] {
  return g.__PLACARR_POKEMON_SHADER_SCAN__?.() ?? [];
}

function longestFirst(names: string[]): string[] {
  return [...new Set(names)].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );
}

let cachedFoilNames: string[] | null = null;

/** Foil leaf names present on disk / in frag-stems meta (longest-first). */
export function listPokemonFoilNames(): string[] {
  if (cachedFoilNames) return cachedFoilNames;
  const stems = [...loadFragStems(), ...scanShaderStems(), "NonFoil"];
  cachedFoilNames = longestFirst(stems.filter(Boolean));
  return cachedFoilNames;
}

/** Call after extract / frag-stems rewrite so discovery sees new leaves. */
export function invalidatePokemonFoilNamesCache(): void {
  cachedFoilNames = null;
}

/**
 * Live view of discovered foil names (lazy — safe before/after meta hydrate).
 * Prefer {@link listPokemonFoilNames} in new code.
 */
export const POKEMON_FOIL_NAMES: readonly string[] =
  lazyLiveList(listPokemonFoilNames);

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

export function foilManifestToShader(
  foil: string,
): PokemonPaperFoilName | null {
  const raw = foil.trim();
  if (!raw) return null;
  const names = listPokemonFoilNames();
  const foilSet = new Set(names);
  if (foilSet.has(raw)) return raw;

  let n = raw.replace(/^TPCi\/Cards3D\/(?:HoloFoil|Standard)\//, "");
  n = n.replace(/^Cards\/(?:Foil|Standard)\//, "");
  n = n.replace(/^HoloFoil_/, "").replace(/^Standard_/, "");

  const nLower = n.toLowerCase();
  const nCompact = nLower.replace(/_/g, "");
  const aliasFrag =
    FOIL_SHEET_ALIAS_FRAG[nLower] ?? FOIL_SHEET_ALIAS_FRAG[nCompact];
  if (aliasFrag) return aliasFrag;

  for (const name of names) {
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
