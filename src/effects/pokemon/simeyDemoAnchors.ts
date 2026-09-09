/**
 * Simey demo card → Placarr catalogue print, per Live foil leaf.
 *
 * One anchor per `LIVE_FINISH_CSS` key: the exact (or closest) card Simey shows
 * for that rarity CSS on poke-holo / poke-151, resolved to a Live FR bundle we
 * dump. Playroom inserts it as the **second** face so CSS QA uses the same art
 * as Simey — even when Live Unity assigned a different shader to that print.
 */

import { LIVE_FINISH_CSS } from "./cssRecipes";

export type SimeyDemoTree = "poke-holo" | "poke-151";

export type SimeyDemoAnchor = {
  /** Live foil leaf (AngledPillars, RadiantHolo, …). */
  leaf: string;
  /** Placarr CSS look id from LIVE_FINISH_CSS. */
  cssId: string;
  /** Simey staging tree. */
  tree: SimeyDemoTree;
  /** Rarity CSS basename without `.css`. */
  stem: string;
  /** pokemontcg.io id when known (`sv3pt5-190`). */
  pokeId: string;
  /** Human label (EN Simey / FR catalogue). */
  name: string;
  /** Rarity string on Simey’s demo. */
  rarity: string;
  /** Live dump bundle we own as catalogue art (`sv3-5_fr_190`). */
  bundleId: string;
  /** poke-holo / poke-151 `?poke=` search. */
  demoSearch: string;
};

/**
 * Leaf → Simey exemplar in our catalogue.
 * Live Unity shader on the print may differ; the point is shared face art.
 */
export const SIMEY_DEMO_ANCHORS: Readonly<Record<string, SimeyDemoAnchor>> = {
  RadiantHolo: {
    leaf: "RadiantHolo",
    cssId: "radiantHolo",
    tree: "poke-holo",
    stem: "radiant-holo",
    pokeId: "pgo-11",
    name: "Dracaufeu Radieux",
    rarity: "Radiant Rare",
    bundleId: "swsh10-5_fr_011",
    demoSearch: "Charizard",
  },
  Rainbow: {
    leaf: "Rainbow",
    cssId: "rainbowHolo",
    tree: "poke-holo",
    stem: "rainbow-holo",
    pokeId: "swsh7-215",
    name: "Mentali VMAX",
    rarity: "Rare Rainbow",
    bundleId: "swsh7_fr_215",
    demoSearch: "Umbreon",
  },
  Rainbow02: {
    leaf: "Rainbow02",
    cssId: "rainbowAlt",
    tree: "poke-holo",
    stem: "rainbow-alt",
    pokeId: "swsh7-215",
    name: "Mentali VMAX",
    rarity: "Rare Rainbow",
    bundleId: "swsh7_fr_215",
    demoSearch: "Umbreon",
  },
  SwSecret: {
    leaf: "SwSecret",
    cssId: "secretRare",
    tree: "poke-holo",
    stem: "secret-rare",
    pokeId: "swsh7-215",
    name: "Mentali VMAX",
    rarity: "Rare Rainbow / Secret stack",
    bundleId: "swsh7_fr_215",
    demoSearch: "Umbreon",
  },
  SwSecreT02: {
    leaf: "SwSecreT02",
    cssId: "secretRare",
    tree: "poke-holo",
    stem: "secret-rare",
    pokeId: "swsh10.5-79",
    name: "Mewtwo VSTAR",
    rarity: "Rare Secret",
    bundleId: "swsh10-5_fr_079",
    demoSearch: "Mewtwo",
  },
  Cosmos: {
    leaf: "Cosmos",
    cssId: "cosmosHolo",
    tree: "poke-holo",
    stem: "cosmos-holo",
    pokeId: "swshp-SWSH012",
    name: "Morpeko",
    rarity: "Rare Holo Cosmos",
    bundleId: "swsh7-5_fr_012",
    demoSearch: "Morpeko",
  },
  Galaxy: {
    leaf: "Galaxy",
    cssId: "amazingRare",
    tree: "poke-holo",
    stem: "amazing-rare",
    pokeId: "swsh4-138",
    name: "Rayquaza",
    rarity: "Amazing Rare",
    // Same print Simey demos; Live Unity may say SwSecret — still the art.
    bundleId: "swsh4_fr_138",
    demoSearch: "Rayquaza",
  },
  FlatSilver: {
    leaf: "FlatSilver",
    cssId: "flatSilver",
    tree: "poke-holo",
    stem: "reverse-holo",
    pokeId: "sv3pt5-25",
    name: "Pikachu",
    rarity: "Reverse / FlatSilver",
    bundleId: "sv3-5_fr_025",
    demoSearch: "Pikachu",
  },
  FlatSilver_CC: {
    leaf: "FlatSilver_CC",
    cssId: "pokeBallHolo",
    tree: "poke-151",
    stem: "poke-ball-holo",
    pokeId: "sv3pt5-25",
    name: "Pikachu",
    rarity: "Poké Ball reverse",
    bundleId: "sv3-5_fr_025",
    demoSearch: "Pikachu",
  },
  SvUltra: {
    leaf: "SvUltra",
    cssId: "vFullArt",
    tree: "poke-holo",
    stem: "v-full-art",
    pokeId: "swsh8-250",
    name: "Mew V",
    rarity: "Rare Ultra",
    bundleId: "swsh8_fr_250",
    demoSearch: "Mew",
  },
  SvHolo: {
    leaf: "SvHolo",
    cssId: "vStar",
    tree: "poke-holo",
    stem: "v-star",
    pokeId: "swsh9-18",
    name: "Dracaufeu VSTAR",
    rarity: "Rare Holo VSTAR",
    bundleId: "swsh9_fr_018",
    demoSearch: "Charizard",
  },
  SwHolo: {
    leaf: "SwHolo",
    cssId: "vRegular",
    tree: "poke-holo",
    stem: "v-regular",
    pokeId: "swsh7-110",
    name: "Rayquaza V",
    rarity: "Rare Holo V",
    bundleId: "swsh7_fr_110",
    demoSearch: "Rayquaza",
  },
  AceFoil: {
    leaf: "AceFoil",
    cssId: "vMax",
    tree: "poke-holo",
    stem: "v-max",
    pokeId: "swsh45sv-SV107",
    name: "Dracaufeu VMAX",
    rarity: "Rare Holo VMAX",
    bundleId: "swsh4-5_fr_107",
    demoSearch: "Charizard",
  },
  AngledPillars: {
    leaf: "AngledPillars",
    cssId: "exFullArt",
    tree: "poke-151",
    stem: "ex-full-art",
    pokeId: "sv3pt5-190",
    name: "Kangaskhan ex",
    rarity: "Ultra Rare",
    bundleId: "sv3-5_fr_190",
    demoSearch: "Kangaskhan",
  },
  SunPillar: {
    leaf: "SunPillar",
    cssId: "sunPillar",
    tree: "poke-151",
    stem: "ex-regular",
    pokeId: "sv3pt5-115",
    name: "Kangaskhan ex",
    rarity: "Double Rare",
    bundleId: "sv3-5_fr_115",
    demoSearch: "Kangaskhan",
  },
  CrackedIce: {
    leaf: "CrackedIce",
    cssId: "illustrationRare",
    tree: "poke-151",
    stem: "illustration-rare",
    pokeId: "sv3pt5-166",
    name: "Bulbizarre",
    rarity: "Illustration Rare",
    bundleId: "sv3-5_fr_166",
    demoSearch: "Bulbasaur",
  },
  SvUltraScodix: {
    leaf: "SvUltraScodix",
    cssId: "hyperRare",
    tree: "poke-151",
    stem: "hyper-rare",
    pokeId: "sv3pt5-205",
    name: "Mew-ex",
    rarity: "Hyper Rare",
    bundleId: "sv3-5_fr_205",
    demoSearch: "Mew",
  },
  SvUltraGoldRainbow: {
    leaf: "SvUltraGoldRainbow",
    cssId: "hyperRare",
    tree: "poke-151",
    stem: "hyper-rare",
    pokeId: "sv3pt5-205",
    name: "Mew-ex",
    rarity: "Hyper Rare",
    bundleId: "sv3-5_fr_205",
    demoSearch: "Mew",
  },
  SunBeam: {
    leaf: "SunBeam",
    cssId: "regularHolo",
    tree: "poke-holo",
    stem: "regular-holo",
    pokeId: "pgo-24",
    name: "Artikodin",
    rarity: "Rare Holo",
    bundleId: "swsh10-5_fr_024",
    demoSearch: "Articuno",
  },
  SunLava: {
    leaf: "SunLava",
    cssId: "shinyV",
    tree: "poke-holo",
    stem: "shiny-v",
    pokeId: "swsh45sv-SV093",
    name: "Chuchmur",
    rarity: "Rare Shiny",
    bundleId: "swsh4-5_fr_093",
    demoSearch: "Minccino",
  },
  Thatch: {
    leaf: "Thatch",
    cssId: "trainerGalleryHolo",
    tree: "poke-holo",
    stem: "trainer-gallery-holo",
    pokeId: "swsh11tg-TG03",
    name: "Dracaufeu",
    rarity: "Trainer Gallery Rare Holo",
    // TG not in FR dump folders — closest owned Thatch seed stays; use
    // catalogue Total Soin as stable second until TG plates land.
    bundleId: "bwalt_fr_008",
    demoSearch: "Charizard",
  },
  Tinsel: {
    leaf: "Tinsel",
    cssId: "shinyRare",
    tree: "poke-holo",
    stem: "shiny-rare",
    pokeId: "swsh45sv-SV093",
    name: "Chuchmur",
    rarity: "Rare Shiny",
    bundleId: "swsh4-5_fr_093",
    demoSearch: "Minccino",
  },
  Squares: {
    leaf: "Squares",
    cssId: "shinyV",
    tree: "poke-holo",
    stem: "shiny-v",
    pokeId: "swsh45sv-SV093",
    name: "Chuchmur",
    rarity: "Rare Shiny",
    bundleId: "swsh4-5_fr_093",
    demoSearch: "Minccino",
  },
  Stamped: {
    leaf: "Stamped",
    cssId: "shinyRare",
    tree: "poke-holo",
    stem: "shiny-rare",
    pokeId: "swsh45sv-SV093",
    name: "Chuchmur",
    rarity: "Rare Shiny",
    bundleId: "swsh4-5_fr_093",
    demoSearch: "Minccino",
  },
  "25thConfetti": {
    leaf: "25thConfetti",
    cssId: "trainerGalleryHolo",
    tree: "poke-holo",
    stem: "trainer-gallery-holo",
    pokeId: "cel25-1",
    name: "Tortank",
    rarity: "Celebrations",
    bundleId: "swsh7-5r_fr_001",
    demoSearch: "Blastoise",
  },
  SolidColor: {
    leaf: "SolidColor",
    cssId: "reverseHolo",
    tree: "poke-holo",
    stem: "reverse-holo",
    pokeId: "sv3pt5-25",
    name: "Pikachu",
    rarity: "Reverse",
    bundleId: "sv3-5_fr_025",
    demoSearch: "Pikachu",
  },
};

export function simeyAnchorForLeaf(
  leaf: string | null | undefined,
): SimeyDemoAnchor | null {
  const key = (leaf ?? "").trim();
  if (!key) return null;
  return SIMEY_DEMO_ANCHORS[key] ?? null;
}

/** Leaves in LIVE_FINISH_CSS with no Simey catalogue anchor. */
export function liveLeavesMissingSimeyAnchor(): string[] {
  return Object.keys(LIVE_FINISH_CSS)
    .filter((leaf) => !SIMEY_DEMO_ANCHORS[leaf])
    .sort();
}

const HOLO = "https://poke-holo.simey.me";
const ONE51 = "https://poke-151.simey.me";

export function simeyAnchorDemoUrl(anchor: SimeyDemoAnchor): string {
  const origin = anchor.tree === "poke-151" ? ONE51 : HOLO;
  return `${origin}/?poke=${encodeURIComponent(anchor.demoSearch)}`;
}
