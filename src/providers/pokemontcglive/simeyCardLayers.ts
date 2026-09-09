/**
 * Simey poke-holo per-card foil/mask paths (from their cards.json).
 *
 * Processed foils live under `public/img/foils/` (gitignored) and are often
 * **404** on poke-holo.simey.me today — we still surface the URLs so QA sees
 * what Simey *would* paint. Face art = pokemontcg.io (same as their demo).
 * Shared FX (glitter, …) still host fine.
 */

import { liveSetToTcgdexSets } from "@/effects/pokemon/setAliases";
import { parsePokemonBundleStem } from "@/providers/pokemontcglive/malieCardLayers";

import simeyFoils from "@/providers/pokemontcglive/curated/sources/simey-poke-holo-foils.json";

export const SIMEY_HOLO_ORIGIN = "https://poke-holo.simey.me";

/** Shared textures Simey’s CSS recipes still load from their demo host. */
export const SIMEY_SHARED_LAYER_URLS = {
  /** Upstream demo URLs — runtime uses vendored `simey_*` under /assets/pokemon/textures. */
  glitter: `${SIMEY_HOLO_ORIGIN}/img/glitter.png`,
  grain: `${SIMEY_HOLO_ORIGIN}/img/grain.webp`,
  cosmos: `${SIMEY_HOLO_ORIGIN}/img/cosmos.png`,
  cosmosBottom: `${SIMEY_HOLO_ORIGIN}/img/cosmos-bottom.png`,
  cosmosMiddle: `${SIMEY_HOLO_ORIGIN}/img/cosmos-middle-trans.png`,
  cosmosTop: `${SIMEY_HOLO_ORIGIN}/img/cosmos-top-trans.png`,
  illusion: `${SIMEY_HOLO_ORIGIN}/img/illusion.png`,
} as const;

/** Local vendored copies (lang-agnostic) served with Live textures. */
export const SIMEY_SHARED_VENDORED = {
  glitter: "/assets/pokemon/textures/simey_glitter.webp",
  grain: "/assets/pokemon/textures/simey_grain.webp",
  cosmosBottom: "/assets/pokemon/textures/simey_cosmos-bottom.webp",
  cosmosMiddle: "/assets/pokemon/textures/simey_cosmos-middle-trans.webp",
  cosmosTop: "/assets/pokemon/textures/simey_cosmos-top-trans.webp",
  illusion: "/assets/pokemon/textures/simey_illusion.webp",
} as const;

export type SimeyCardLayers = {
  id: string;
  name: string | null;
  /** pokemontcg.io hires face (Simey demo card art). */
  face: string | null;
  /** Absolute URL to Simey processed foil map (may 404). */
  foil: string | null;
  /** Absolute URL to Simey processed mask (may 404). */
  mask: string | null;
};

type SimeyFoilCard = {
  id: string;
  set: string;
  number: string;
  name?: string | null;
  face?: string | null;
  foil?: string | null;
  mask?: string | null;
};

const CARDS = (simeyFoils as { cards: SimeyFoilCard[] }).cards;

function absSimeyPath(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SIMEY_HOLO_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

function numberKeys(num: string): string[] {
  const raw = num.trim().toLowerCase();
  if (!raw) return [];
  const stripped = raw.replace(/^0+/, "") || "0";
  const padded = /^\d+$/.test(stripped) ? stripped.padStart(3, "0") : raw;
  return [...new Set([raw, stripped, padded])];
}

const BY_SET_NUM = (() => {
  const map = new Map<string, SimeyFoilCard[]>();
  for (const card of CARDS) {
    const set = card.set.toLowerCase();
    for (const n of numberKeys(card.number)) {
      const key = `${set}|${n}`;
      const list = map.get(key) ?? [];
      list.push(card);
      map.set(key, list);
    }
  }
  return map;
})();

function toLayers(card: SimeyFoilCard): SimeyCardLayers {
  return {
    id: card.id,
    name: card.name ?? null,
    face: card.face?.trim() || null,
    foil: absSimeyPath(card.foil),
    mask: absSimeyPath(card.mask),
  };
}

/**
 * Resolve Simey poke-holo foil/mask for a Live bundle stem when the print is
 * in their demo catalogue (~90 SWSH-era cards).
 */
export function simeyCardLayersForBundle(
  bundleId: string,
): SimeyCardLayers | null {
  const parts = parsePokemonBundleStem(bundleId);
  if (!parts) return null;
  const tcgdexSets = liveSetToTcgdexSets().get(parts.set) ?? [];
  const sets = new Set<string>([
    parts.set,
    ...tcgdexSets.map((s) => s.toLowerCase()),
  ]);
  // Live `swsh10-5` ↔ TCGdex `swsh10.5`
  if (parts.set.includes("-")) {
    sets.add(parts.set.replace(/-/g, "."));
  }
  for (const set of sets) {
    for (const n of numberKeys(parts.num)) {
      const hits = BY_SET_NUM.get(`${set}|${n}`);
      if (hits?.length) return toLayers(hits[0]!);
    }
  }
  return null;
}
