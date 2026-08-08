/**
 * Client-safe Live `foil_mask` overrides that change WebGL uniforms / CC plates.
 *
 * Keys are `bundle_stem::variant` (std / ph / sph / mph). Stem alone is not
 * unique — the same art bundle carries Reverse + Poké/Master Ball laminates.
 * Sourced from `live-cards.sqlite`; full identity sqlite stays server-only.
 */
import liveFoilMasksJson from "./liveFoilMasks.json";

const LIVE_FOIL_MASKS = liveFoilMasksJson as Record<string, string>;

const OVERRIDE_MASKS = new Set([
  "CastAndCure",
  "ReverseLaminatePokeBall",
  "ReverseLaminateMasterBall",
]);

export type LiveFoilMaskLookup = {
  /** Live variant: std / ph / sph / mph. */
  variant?: string | null;
};

function normalizeStem(bundleStem: string): string {
  return bundleStem.trim().toLowerCase();
}

function normalizeVariant(variant: string | null | undefined): string | null {
  const v = variant?.trim().toLowerCase();
  return v || null;
}

/** Live foil_mask enum when it toggles CC foil / laminate plates. */
export function liveFoilMaskForBundle(
  bundleStem: string | null | undefined,
  opts?: LiveFoilMaskLookup,
): string | null {
  if (!bundleStem) return null;
  const stem = normalizeStem(bundleStem);
  if (!stem) return null;

  const variant = normalizeVariant(opts?.variant);
  if (variant) {
    const hit = LIVE_FOIL_MASKS[`${stem}::${variant}`];
    if (hit) return hit;
  }

  // Playroom / unknown variant: prefer CastAndCure on this stem (SunPillar
  // seeds), never invent a laminate plate from a random sph/mph sibling.
  for (const [key, mask] of Object.entries(LIVE_FOIL_MASKS)) {
    if (!key.startsWith(`${stem}::`)) continue;
    if (mask === "CastAndCure") return mask;
  }
  return null;
}

/** True when a Live foil_mask changes CC / laminate uniforms. */
export function isLiveFoilMaskOverride(mask: string | null | undefined): boolean {
  return Boolean(mask && OVERRIDE_MASKS.has(mask));
}
