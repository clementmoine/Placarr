/**
 * Admin “open this face in TCG Live” — Frida goto with foil-variant prefer.
 */
import "@/effects/pokemon/cardFoilIndex";
import { variantsForBundle } from "@/effects/pokemon/cardFoilLookups";
import { liveLaminatePreferForBundle } from "@/effects/pokemon/liveFoilMasks";

import {
  fridaGotoCard,
  fridaNavAvailable,
  type FridaGotoResult,
  type LiveNavPrefer,
} from "@/lib/admin/liveNavFrida";

/** Alias de ce que la navigation Live accepte — une seule définition. */
export type LiveOpenPrefer = LiveNavPrefer;

/** Prefer foil dump variant (`ph` / `mph` / `sph`) when it carries the material. */
export function preferForLiveOpen(
  bundleId: string,
  material?: string | null,
): "" | "ph" | "mph" | "sph" {
  // Live laminate prints are keyed mph/sph even when card_foil lists `ph` first.
  const laminate = liveLaminatePreferForBundle(bundleId);
  if (laminate) return laminate;

  const vars = variantsForBundle(bundleId);
  if (vars.length === 0) return "";
  const byMaterial = material?.trim()
    ? vars.find((v) => v.shader === material.trim())
    : undefined;
  const foil =
    byMaterial ?? vars.find((v) => v.shader && v.shader !== "NonFoil") ?? null;
  /*
    `card_foil` ne stocke que `std` et `ph` — mesuré, 93 741 et 55 038 lignes,
    rien d'autre. Les clés laminate `mph` / `sph` viennent de
    `liveLaminatePreferForBundle` plus haut ; les chercher ici ne pouvait rien
    trouver.
  */
  const variant = foil?.variant;
  if (variant === "ph") return variant;
  return "";
}

export function openCardInLive(opts: {
  bundleId: string;
  material?: string | null;
  prefer?: LiveOpenPrefer;
}): FridaGotoResult {
  if (!fridaNavAvailable()) {
    return { ok: false, error: "frida scratch missing" };
  }
  // Do not spawn navd here — a concurrent attach races Frida and times out
  // (`spawnSync python3 ETIMEDOUT`). `nav.py goto` uses navd only if already up.
  const prefer: LiveOpenPrefer =
    opts.prefer !== undefined
      ? opts.prefer
      : preferForLiveOpen(opts.bundleId, opts.material);
  return fridaGotoCard(opts.bundleId, prefer);
}
