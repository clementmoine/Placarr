/**
 * One catalogue face (+ Live mask when dumped) per HoloFoil material so the
 * playroom can show every Unity effect without collapsing on finish "holo".
 *
 * Prefer Live pack art under `/assets/pokemon/cards/{set}/{lang}/{num}/…` when the dump
 * has a row for that shader; TCGdex HD remains cold-start fallback only.
 * Mask = scraped `_w` from the same dump (or pack fallback).
 */

import { pokemonCardTextureUrl } from "@/lib/packAssetUrls";
import { bundlesForShader, variantsForBundle } from "./cardFoilLookups";
import {
  foilManifestToShader,
  foilSheetAliasName,
  listPokemonFoilNames,
  type PokemonPaperFoilName,
} from "./foilNames";
import { liveFoilMaskForBundle, liveLaminatePreferForBundle } from "./liveFoilMasks";
import { faceQuarterTurnsForPokemonPrint } from "./faceOrientation";
import { POKEMON_MAT_ALIASES } from "./materials";
import { lookupByBundle } from "./liveCardsLookups";
import { ownedBundlesForShader } from "./liveOwnedBundles";
import { formatPlayroomFaceCaption, pickLiveCardDisplayName } from "./liveSetDisplay";

const LANG = "fr";

type Seed = {
  /** TCGdex image base (no /high.png). */
  imageBase: string;
  label: string;
  /**
   * Prefer this Live bundle when dumped — used when we own the print and want
   * a 1:1 playroom ↔ app comparison (e.g. Charkos-ex for SunPillar).
   */
  bundleId?: string;
  /**
   * When the seed face sits on its side (BREAK / TURBO). Client-safe — Live
   * rarity sqlite is not available in the browser playroom path.
   */
  faceQuarterTurns?: 0 | 1 | 2 | 3;
  /**
   * Simey `--card-glow` for Radiant spotlight (type colour). Applied on the
   * CSS face so poke-holo.simey.me and the playroom share the same falloff.
   */
  cardGlow?: string;
};

/**
 * Representative printed card per Live foil leaf — diverse eras so the bench
 * is readable. Exact Live recipe may differ; the shader under test is the
 * material name, not the catalogue finish.
 *
 * When a dump exists, `bundleId` MUST point at the face we actually show and
 * `label` MUST name that face (client has no Live sqlite — seed label is the
 * caption). Never leave label as a TCGdex fantasy while art is another dump.
 */
/**
 * Representative printed card per Live foil leaf — curated overrides only.
 * Missing leaves seed from the first dump/owned bundle for that shader.
 */
const FOIL_SEED_OVERRIDES: Partial<Record<string, Seed>> = {
  NonFoil: {
    imageBase: "https://assets.tcgdex.net/fr/bw/bw10/1",
    label: "Arakdo",
    bundleId: "bw10_fr_001",
  },
  FlatSilver: {
    imageBase: "https://assets.tcgdex.net/fr/ec/ec/36",
    label: "Énergie Plante",
    bundleId: "ec_fr_036",
  },
  Rainbow: {
    imageBase: "https://assets.tcgdex.net/fr/bw/bw10/1",
    label: "Arakdo",
    bundleId: "bw10_fr_001",
  },
  Cosmos: {
    imageBase: "https://assets.tcgdex.net/fr/bw/bw4/40",
    label: "Raichu",
    bundleId: "bwalt_fr_038",
  },
  SunPillar: {
    // Rampardos ex / Charkos-ex (ME05) — owned CastAndCure SunPillar hero.
    // Miaouss-ex (me3_fr_062) stays in liveOwned for the multi-face bench.
    imageBase: "https://assets.tcgdex.net/fr/me/me5/045",
    label: "Charkos-ex",
    bundleId: "me5_fr_045",
  },
  SunBeam: {
    // Dracaufeu reverse Team Up (SM9 14/181) — canonical SM SunBeam reverse.
    imageBase: "https://assets.tcgdex.net/fr/sm/sm9/14",
    label: "Dracaufeu",
    bundleId: "sm9_fr_014",
  },
  SunLava: {
    imageBase: "https://assets.tcgdex.net/fr/sm/sm10/1",
    label: "Cancrelove et Mouscoto-GX",
    bundleId: "sm10_fr_001",
  },
  SvHolo: {
    imageBase: "https://assets.tcgdex.net/fr/me/me1/10",
    label: "Méganium",
    bundleId: "me1_fr_010",
  },
  SvUltra: {
    imageBase: "https://assets.tcgdex.net/fr/me/me1/3",
    label: "Méga-Florizarre-ex",
    bundleId: "me1_fr_003",
  },
  SvUltraGoldRainbow: {
    imageBase: "https://assets.tcgdex.net/fr/me/me1/187",
    label: "Méga-Gardevoir-ex",
    bundleId: "me1_fr_187",
  },
  SvUltraScodix: {
    imageBase: "https://assets.tcgdex.net/fr/sv/sv04.5/240",
    label: "Chongjian-ex",
    bundleId: "sv4-5_fr_240",
  },
  SwHolo: {
    imageBase: "https://assets.tcgdex.net/fr/swsh/swsh10.5/3",
    label: "Florizarre",
    bundleId: "swsh10-5_fr_003",
  },
  SwSecret: {
    imageBase: "https://assets.tcgdex.net/fr/swsh/swsh10.5/79",
    label: "Mewtwo VSTAR",
    bundleId: "swsh10-5_fr_079",
  },
  "25thConfetti": {
    imageBase: "https://assets.tcgdex.net/fr/swsh/cel25/1",
    label: "Tortank",
    bundleId: "swsh7-5r_fr_001",
  },
  CrackedIce: {
    imageBase: "https://assets.tcgdex.net/fr/bw/bw1/5",
    label: "Serpiroyal",
    bundleId: "bwalt_fr_002",
  },
  RadiantHolo: {
    // Same face as poke-holo.simey.me radiant demo + Live Pokémon GO #11.
    imageBase: "https://assets.tcgdex.net/fr/swsh/swsh10.5/11",
    label: "Dracaufeu Radieux",
    bundleId: "swsh10-5_fr_011",
    /** Simey `.card.fire` — Charizard spotlight colour. */
    cardGlow: "hsl(9, 81%, 59%)",
  },
  AngledPillars: {
    imageBase: "https://assets.tcgdex.net/fr/bw/bw4/54",
    label: "Mewtwo-EX",
    bundleId: "bwalt_fr_041",
  },
  Tinsel: {
    imageBase: "https://assets.tcgdex.net/fr/bw/bw10/16",
    label: "Tortank",
    bundleId: "bw10_fr_016",
  },
  Thatch: {
    imageBase: "https://assets.tcgdex.net/fr/bw/bw1/95",
    label: "Total Soin",
    bundleId: "bwalt_fr_008",
  },
  Squares: {
    imageBase: "https://assets.tcgdex.net/fr/xy/xy10/14",
    label: "Goupelin TURBO",
    bundleId: "xy10_fr_014",
    // Live Squares = XY BREAK/TURBO — same TCG rectangle, one quarter turn.
    faceQuarterTurns: 1,
  },
  Stamped: {
    imageBase: "https://assets.tcgdex.net/fr/me/mebsp/28",
    label: "Fanfare festive",
    bundleId: "mebsp_fr_028",
  },
  AceFoil: {
    imageBase: "https://assets.tcgdex.net/fr/sv/sv05/141",
    label: "Tambour de l'Éveil",
    bundleId: "sv5_fr_141",
  },
  Galaxy: {
    imageBase: "https://assets.tcgdex.net/fr/xy/xy12/11",
    label: "Dracaufeu",
    bundleId: "xy12_fr_011",
  },
  SolidColor: {
    imageBase: "https://assets.tcgdex.net/fr/bw/bw11/114",
    label: "Reshiram",
    bundleId: "bw11_fr_114",
  },
};

type BundlePick = {
  bundleId: string;
  /** Live / dump variant key (std | ph). */
  variant: "std" | "ph";
  maskTex: string;
  cardTex: string;
  etchTex: string;
  coldFoilTex: string;
};


function seedFor(shader: string): Seed {
  return (
    FOIL_SEED_OVERRIDES[shader] ?? {
      imageBase: "https://assets.tcgdex.net/fr/swsh/swsh1/1",
      label: shader,
    }
  );
}

/** How many Live faces the focus/compare bench stacks per material. */
export const PLAYROOM_FACES_PER_MATERIAL = 4;

export type PlayroomArt = {
  imageUrl: string;
  maskUrl?: string | null;
  varnishMaskUrl?: string | null;
  secondVarnishMaskUrl?: string | null;
  foilMask?: string | null;
  bundleId?: string | null;
  label?: string | null;
  faceQuarterTurns?: 0 | 1 | 2 | 3;
  /** Simey `--card-glow` for Radiant (type colour). */
  cardGlow?: string | null;
  /**
   * True when this face is in the Live carddex cache (`liveOwned.json`) —
   * safe 1:1 MuMu / playroom compare for that effect.
   */
  liveOwned?: boolean;
};

const DUMPED_BUNDLE_LIST_CACHE = new Map<string, BundlePick[]>();

function highPng(imageBase: string): string {
  return `${imageBase.replace(/\/+$/, "")}/high.png`;
}

function liveArtUrl(pick: BundlePick | null): string | null {
  if (!pick?.cardTex) return null;
  return pokemonCardTextureUrl(pick.bundleId, pick.cardTex);
}

/**
 * One named bundle's face for this shader, `ph` before `std`.
 *
 * Used for the two ordered preferences — the Live-owned faces and the seed hero
 * — where the bundle id is already known and only its variants are needed.
 * `variantsForBundle` already returns `ph` first, so the first match wins.
 */
function pickFromLookup(
  bundleId: string,
  shader: PokemonPaperFoilName,
): BundlePick | null {
  const candidates: BundlePick[] = [];
  for (const variant of variantsForBundle(bundleId)) {
    const mapped =
      foilManifestToShader(variant.shader) ||
      foilManifestToShader(variant.foil);
    if (mapped !== shader) continue;
    candidates.push({
      bundleId,
      variant: variant.variant,
      maskTex: variant.maskTex,
      cardTex: variant.cardTex,
      etchTex: variant.etchTex,
      coldFoilTex: variant.coldFoilTex,
    });
  }
  if (candidates.length === 0) return null;

  /*
    Prefer the whiteplate that matches a Live laminate override. Dump rows for
    Master Ball Frillish are often `std`+`wp_mph` (or `ph` without the plate)
    while live-cards keys the print as `mph`.
  */
  const laminatePrefer = liveLaminatePreferForBundle(bundleId);
  const score = (pick: BundlePick) => {
    const plate = (pick.maskTex ?? "").toLowerCase();
    if (laminatePrefer === "mph" && plate.includes("_wp_mph_")) return 0;
    if (laminatePrefer === "sph" && plate.includes("_wp_sph_")) return 0;
    if (liveFoilMaskForBundle(bundleId, { variant: pick.variant })) return 1;
    return 2;
  };
  candidates.sort((a, b) => score(a) - score(b));
  return candidates[0]!;
}

/**
 * Dumped bundle for this shader. Prefer an explicit seed `bundleId` when the
 * dump has that print, else the first FR row (reverse `ph` first), else any.
 */
export function pickDumpedBundleForShader(
  shader: PokemonPaperFoilName,
): BundlePick | null {
  return listDumpedBundlesForShader(shader, 1)[0] ?? null;
}

/** Set stem from `me1_fr_187` → `me1`, `swsh10-5_fr_011` → `swsh10-5`. */
function bundleSetStem(bundleId: string): string {
  const m = /^(.+?)_[a-z]{2}_\d+$/i.exec(bundleId);
  return m?.[1]?.toLowerCase() ?? bundleId.toLowerCase();
}

/**
 * Up to `limit` dumped prints for a shader — owned Live faces first, then seed,
 * then FR, then other locales. At most one face per set stem so the bench
 * checks the look across eras, not four cards from the same expansion.
 */
export function listDumpedBundlesForShader(
  shader: PokemonPaperFoilName,
  limit = PLAYROOM_FACES_PER_MATERIAL,
): BundlePick[] {
  if (limit <= 0) return [];

  let full = DUMPED_BUNDLE_LIST_CACHE.get(shader);
  if (!full) {
    const out: BundlePick[] = [];
    const seenBundle = new Set<string>();
    const seenSet = new Set<string>();

    const push = (pick: BundlePick) => {
      if (seenBundle.has(pick.bundleId)) return;
      const set = bundleSetStem(pick.bundleId);
      // First face always kept; later faces skip a set already represented.
      if (seenSet.has(set) && out.length > 0) return;
      seenBundle.add(pick.bundleId);
      seenSet.add(set);
      out.push(pick);
    };

    // Confirmed owned in Live → prefer for 1:1 playroom ↔ MuMu compare.
    // Order: FOIL_SEED hero (if owned), other Pokémon faces, then energy `ec_*`.
    const preferred = seedFor(shader).bundleId;
    const owned = ownedBundlesForShader(shader);
    const ownedRank = (id: string) => {
      if (preferred && id === preferred) return 0;
      if (/^ec_/i.test(id)) return 2;
      return 1;
    };
    const ownedOrdered = [...owned].sort(
      (a, b) => ownedRank(a) - ownedRank(b) || a.localeCompare(b),
    );
    for (const bundleId of ownedOrdered) {
      const pick = pickFromLookup(bundleId, shader);
      if (pick) push(pick);
    }

    if (preferred) {
      const pick = pickFromLookup(preferred, shader);
      if (pick) push(pick);
    }

    /*
      The dump, queried by shader instead of scanned.

      This was `Object.entries(CARDS)` over 41 546 entries, once per material,
      against a 10.7 MB static import — the import that made webpack try to ship
      the whole dump to the browser. SQLite already returns FR first and `ph`
      before `std`, which is the order this loop used to impose by hand.
    */
    for (const row of bundlesForShader(shader)) {
      if (seenBundle.has(row.bundleId)) continue;
      const mapped =
        foilManifestToShader(row.variant.shader) ||
        foilManifestToShader(row.variant.foil);
      if (mapped !== shader) continue;
      push({
        bundleId: row.bundleId,
        variant: row.variant.variant,
        maskTex: row.variant.maskTex,
        cardTex: row.variant.cardTex,
        etchTex: row.variant.etchTex,
        coldFoilTex: row.variant.coldFoilTex,
      });
    }

    full = out;
    DUMPED_BUNDLE_LIST_CACHE.set(shader, full);
  }

  return full.slice(0, limit);
}

function textureUrlFor(
  pick: BundlePick | null,
  stem: string | undefined,
): string | null {
  if (!pick || !stem) return null;
  return pokemonCardTextureUrl(pick.bundleId, stem);
}

function resolveShaderName(name: string): PokemonPaperFoilName | null {
  const alias = foilSheetAliasName(name);
  return (
    (alias
      ? POKEMON_MAT_ALIASES[alias as keyof typeof POKEMON_MAT_ALIASES]
      : null) ??
    foilManifestToShader(name) ??
    (listPokemonFoilNames().includes(name)
      ? (name as PokemonPaperFoilName)
      : null)
  );
}

function artFromDump(
  shader: PokemonPaperFoilName,
  dumped: BundlePick | null,
): PlayroomArt {
  const seed = seedFor(shader);
  const liveRow = dumped ? lookupByBundle(dumped.bundleId) : null;
  const fallbackName =
    (dumped && seed.bundleId === dumped.bundleId ? seed.label : null) ||
    dumped?.bundleId ||
    seed.label;
  const cardName = dumped
    ? pickLiveCardDisplayName({
        nameFr: liveRow?.nameFr,
        nameEn: liveRow?.nameEn,
        prefer: "fr",
        fallback: fallbackName,
      })
    : seed.label;
  const label = dumped
    ? formatPlayroomFaceCaption(cardName, dumped.bundleId, LANG)
    : `${seed.label} (${LANG})`;
  const faceQuarterTurns =
    faceQuarterTurnsForPokemonPrint({
      rarityCode: liveRow?.rarityCode,
    }) ||
    seed.faceQuarterTurns ||
    0;

  const liveOwned = Boolean(
    dumped?.bundleId &&
      ownedBundlesForShader(shader).includes(dumped.bundleId),
  );
  return {
    imageUrl: liveArtUrl(dumped) ?? highPng(seed.imageBase),
    maskUrl: textureUrlFor(dumped, dumped?.maskTex),
    varnishMaskUrl: textureUrlFor(dumped, dumped?.etchTex),
    secondVarnishMaskUrl: textureUrlFor(dumped, dumped?.coldFoilTex),
    foilMask:
      liveFoilMaskForBundle(dumped?.bundleId, {
        variant: dumped?.variant,
      }) ??
      liveRow?.foilMask ??
      null,
    bundleId: dumped?.bundleId ?? null,
    label,
    liveOwned,
    ...(faceQuarterTurns ? { faceQuarterTurns } : {}),
    ...(seed.cardGlow ? { cardGlow: seed.cardGlow } : {}),
  };
}

/**
 * Several Live faces for one material — seed first, then other sets — so the
 * playroom can check the look is generic (not tuned to a single print).
 */
export function listPlayroomArtsForMaterial(
  name: string,
  limit = PLAYROOM_FACES_PER_MATERIAL,
): PlayroomArt[] {
  const shader = resolveShaderName(name);
  if (!shader) return [];
  const dumps = listDumpedBundlesForShader(shader, limit);
  if (dumps.length === 0) {
    // Cold-start: TCGdex seed only.
    return [artFromDump(shader, null)];
  }
  return dumps.map((dumped) => artFromDump(shader, dumped));
}

export function playroomArtForMaterial(name: string): PlayroomArt | null {
  return listPlayroomArtsForMaterial(name, 1)[0] ?? null;
}

/** Discovered foil leaves (dump) — used by tests / playroom seed lists. */
export function playroomSeedFoilNames(): PokemonPaperFoilName[] {
  return listPokemonFoilNames();
}
