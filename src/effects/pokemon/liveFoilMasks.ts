/**
 * Client-safe Live `foil_mask` overrides that change WebGL uniforms / CC plates.
 *
 * Keys are `bundle_stem::variant` (std / ph / sph / mph). Stem alone is not
 * unique — the same art bundle carries Reverse + Poké/Master Ball laminates.
 * Sourced from `data/pokemon/liveFoilMasks.json` (catalog join); full identity
 * sqlite stays server-only.
 */
import { loadLiveFoilMasks } from "@/lib/foilMetaLoad";

function liveFoilMasksMap(): Record<string, string> {
  return loadLiveFoilMasks();
}

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
    const hit = liveFoilMasksMap()[`${stem}::${variant}`];
    if (hit) return hit;
  }

  // Playroom / unknown variant: prefer CastAndCure on this stem (SunPillar
  // seeds).
  for (const [key, mask] of Object.entries(liveFoilMasksMap())) {
    if (!key.startsWith(`${stem}::`)) continue;
    if (mask === "CastAndCure") return mask;
  }

  /*
    Dump `card_foil` often indexes Master/Poké Ball whiteplates as `ph`/`std`
    while live-cards keys the laminate as `mph`/`sph` (e.g. Frillish
    `rsv10-5_fr_044`). When the requested variant missed, take a ReverseLaminate*
    override only if unambiguous — never pick between mph vs sph arbitrarily.
  */
  const laminates: string[] = [];
  for (const v of ["mph", "sph"] as const) {
    const mask = liveFoilMasksMap()[`${stem}::${v}`];
    if (
      mask === "ReverseLaminateMasterBall" ||
      mask === "ReverseLaminatePokeBall"
    ) {
      if (!laminates.includes(mask)) laminates.push(mask);
    }
  }
  if (laminates.length === 1) return laminates[0]!;
  return null;
}

/** Prefer Live print variant for a stem when a laminate override is unique. */
export function liveLaminatePreferForBundle(
  bundleStem: string | null | undefined,
): "mph" | "sph" | null {
  if (!bundleStem) return null;
  const stem = normalizeStem(bundleStem);
  if (!stem) return null;
  const map = liveFoilMasksMap();
  const mph = map[`${stem}::mph`];
  const sph = map[`${stem}::sph`];
  const mphLam =
    mph === "ReverseLaminateMasterBall" || mph === "ReverseLaminatePokeBall";
  const sphLam =
    sph === "ReverseLaminateMasterBall" || sph === "ReverseLaminatePokeBall";
  if (mphLam && !sphLam) return "mph";
  if (sphLam && !mphLam) return "sph";
  return null;
}

/** True when a Live foil_mask changes CC / laminate uniforms. */
export function isLiveFoilMaskOverride(
  mask: string | null | undefined,
): boolean {
  return Boolean(mask && OVERRIDE_MASKS.has(mask));
}
