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

/**
 * Live identity sqlite is often EN-keyed (`me5_en_045`) while playroom / FR
 * dumps use the local stem (`me5_fr_045`). Foil mask is print-level, not
 * locale-level — try sibling locales when the exact stem misses.
 */
function siblingLocaleStems(stem: string): string[] {
  const m = /^(.+)_([a-z]{2})_(\d+[a-z0-9]*)$/i.exec(stem);
  if (!m) return [];
  const [, set, lang, num] = m;
  const out: string[] = [];
  for (const alt of ["en", "fr", "de", "ja", "it", "es", "pt"]) {
    if (alt === lang.toLowerCase()) continue;
    out.push(`${set}_${alt}_${num}`.toLowerCase());
  }
  return out;
}

/** Live foil_mask enum when it toggles CC foil / laminate plates. */
export function liveFoilMaskForBundle(
  bundleStem: string | null | undefined,
  opts?: LiveFoilMaskLookup,
): string | null {
  return liveFoilMaskFromMap(liveFoilMasksMap(), bundleStem, opts);
}

/**
 * Core lookup against an explicit map — the testable, data-independent form of
 * {@link liveFoilMaskForBundle} (unit tests must not depend on a local dump).
 */
export function liveFoilMaskFromMap(
  map: Record<string, string>,
  bundleStem: string | null | undefined,
  opts?: LiveFoilMaskLookup,
): string | null {
  if (!bundleStem) return null;
  const stem = normalizeStem(bundleStem);
  if (!stem) return null;

  const variant = normalizeVariant(opts?.variant);
  const stems = [stem, ...siblingLocaleStems(stem)];
  if (variant) {
    for (const s of stems) {
      const hit = map[`${s}::${variant}`];
      if (hit) return hit;
    }
  }

  // Playroom / unknown variant: prefer CastAndCure on this stem (SunPillar
  // seeds), including sibling locales when Live identity is EN-only.
  for (const s of stems) {
    for (const [key, mask] of Object.entries(map)) {
      if (!key.startsWith(`${s}::`)) continue;
      if (mask === "CastAndCure") return mask;
    }
  }

  /*
    Dump `card_foil` often indexes Master/Poké Ball whiteplates as `ph`/`std`
    while live-cards keys the laminate as `mph`/`sph` (e.g. Frillish
    `rsv10-5_fr_044`). When the requested variant missed, take a ReverseLaminate*
    override only if unambiguous — never pick between mph vs sph arbitrarily.
  */
  const laminates: string[] = [];
  for (const s of stems) {
    for (const v of ["mph", "sph"] as const) {
      const mask = map[`${s}::${v}`];
      if (
        mask === "ReverseLaminateMasterBall" ||
        mask === "ReverseLaminatePokeBall"
      ) {
        if (!laminates.includes(mask)) laminates.push(mask);
      }
    }
  }
  if (laminates.length === 1) return laminates[0]!;
  return null;
}

/** Prefer Live print variant for a stem when a laminate override is unique. */
export function liveLaminatePreferForBundle(
  bundleStem: string | null | undefined,
): "mph" | "sph" | null {
  return liveLaminatePreferFromMap(liveFoilMasksMap(), bundleStem);
}

/** Data-independent form of {@link liveLaminatePreferForBundle}. */
export function liveLaminatePreferFromMap(
  map: Record<string, string>,
  bundleStem: string | null | undefined,
): "mph" | "sph" | null {
  if (!bundleStem) return null;
  const stem = normalizeStem(bundleStem);
  if (!stem) return null;
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

/**
 * Dump `card_foil` stores Poké/Master Ball whiteplates as `std`/`ph` rows with
 * `_wp_sph_` / `_wp_mph_` in `mask_tex`, while `liveFoilMasks.json` keys the
 * same prints as `::sph` / `::mph`. Product resolve only knows std|ph — so the
 * map miss is normal. The plate stem (or canonical `mask-sph.webp` URL) is the
 * unambiguous signal for which ReverseLaminate* CC layer to arm.
 */
export function liveFoilMaskFromMaskTex(
  maskTex: string | null | undefined,
): string | null {
  const t = (maskTex ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.includes("_wp_mph_") || /(^|[/_])mask-mph(\.|$)/.test(t)) {
    return "ReverseLaminateMasterBall";
  }
  if (t.includes("_wp_sph_") || /(^|[/_])mask-sph(\.|$)/.test(t)) {
    return "ReverseLaminatePokeBall";
  }
  return null;
}

/**
 * Resolve a CC / laminate override: explicit enum → bundle map → whiteplate.
 */
export function resolveLiveFoilMaskOverride(opts: {
  foilMask?: string | null;
  bundleId?: string | null;
  variant?: string | null;
  maskTex?: string | null;
}): string | null {
  const explicit = (opts.foilMask ?? "").trim();
  // Caller forced MAT defaults (playroom NonFoil / no-CC) — do not re-join.
  if (explicit === "None") return null;
  if (explicit && isLiveFoilMaskOverride(explicit)) return explicit;
  if (explicit) {
    // Non-override enums (Holo, Reverse, …) leave MAT defaults alone.
    return null;
  }
  const fromMap = liveFoilMaskForBundle(opts.bundleId, {
    variant: opts.variant,
  });
  if (fromMap) return fromMap;
  return liveFoilMaskFromMaskTex(opts.maskTex);
}
