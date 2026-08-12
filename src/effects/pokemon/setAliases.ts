/**
 * Explicit TCGdex set id → TCG Live CDN set stem(s).
 *
 * Irreducible remaps only — prefer inferring joins from dump + TCGdex metadata
 * when possible; shrink this table over time.
 *
 * First entry is the primary table; further entries are sibling slices in Live
 * (radiant collection, reprints) tried when the primary bundle is missing.
 *
 * Direction that matters for Placarr: every Live dump stem should be reachable
 * from at least one TCGdex id (see `liveSetToTcgdexSets`). Cards without Live
 * data stay honest-null; Live rows without a TCGdex path are wasted assets.
 */
export const TCGDEX_TO_LIVE_SETS: Readonly<Record<string, readonly string[]>> = {
  // Hidden Fates (+ Shiny Vault slice in the same Live table; see collectorRemap)
  sm115: ["sm11-5"],
  sma: ["sm11-5"],
  // Celebrations (+ classic collection reprints)
  cel25: ["swsh7-5"],
  cel25cc: ["swsh7-5r"],
  // Double Crisis
  dc1: ["xy5-5"],
  // Generations (+ radiant collection slice in Live)
  g1: ["xy9-5", "xy9-5r"],
  // Dragon Vault
  dv1: ["bw6-5"],
  // Detective Pikachu
  det1: ["gum"],
  // Black Bolt / White Flare
  "sv10.5w": ["rsv10-5"],
  "sv10.5b": ["zsv10-5"],
  // Crown Zenith Galarian Gallery
  "swsh12.5gg": ["swsh12-5a"],
  // Black Star promos
  mep: ["mebsp"],
  svp: ["svbsp"],
  swshp: ["swshbsp"],
  xyp: ["xybsp"],
  bwp: ["bwbsp"],
  smp: ["smbsp"],
  // Trainer Gallery / Character Rare Western sets ↔ Live `*a` JP CHR tables
  // (collector numbers still differ — card-level match may be needed).
  "swsh9.5tg": ["swsh9a"],
  "swsh10.5tg": ["swsh10a"],
  "swsh11.5tg": ["swsh11a"],
  "swsh12.5tg": ["swsh12a"],
  // EN TCGdex — Legendary Treasures (+ radiant slice)
  bw11: ["bw11", "bw11r"],
};

/** @deprecated Prefer {@link TCGDEX_TO_LIVE_SETS}; kept for single-stem callers. */
export const TCGDEX_TO_LIVE_SET: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(TCGDEX_TO_LIVE_SETS).map(([k, v]) => [k, v[0]!]),
  );

/**
 * Live stems that are dump utilities / not paper catalogue prints.
 * They may stay without a TCGdex set id.
 */
export const LIVE_SET_NON_CATALOGUE: ReadonlySet<string> = new Set([
  // Free/basic energy table — not a retail expansion on TCGdex
  "ec",
  // Live digital alternate-art tables (`*alt`) from APK compendiums.
  // Not TCGdex retail sets with matching collector numbers.
  "bwalt",
  "ecalt",
  "mealt",
  "smalt",
  "svalt",
  "swshalt",
  "xyalt",
]);

export function isLiveNonCatalogueSet(stem: string | null | undefined): boolean {
  const s = stem?.trim().toLowerCase() ?? "";
  if (!s) return false;
  if (LIVE_SET_NON_CATALOGUE.has(s)) return true;
  // Future APK alt tables keep the `*alt` suffix convention.
  return s.endsWith("alt");
}

/** Reverse index: Live stem → TCGdex ids that list it. */
export function liveSetToTcgdexSets(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [tcgdex, lives] of Object.entries(TCGDEX_TO_LIVE_SETS)) {
    for (const live of lives) {
      const list = map.get(live) ?? [];
      list.push(tcgdex);
      map.set(live, list);
    }
  }
  return map;
}
