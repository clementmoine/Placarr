import type {
  EffectPackModule,
  FoilBackend,
  FoilBackendPreference,
  FoilMaterial,
} from "./types";
import {
  pickDefaultCardBack,
  resolveCardBackCandidates,
  type CardBackCandidate,
} from "./cardBacks";

export type { CardBackCandidate, CardBackScope } from "./cardBacks";
export {
  pickDefaultCardBack,
  rankCardBacks,
  resolveCardBackCandidates,
  resolveSharedCardBackSkeleton,
  sharedCardBackSkeletonUrl,
} from "./cardBacks";

// ── Effect pack registry ────────────────────────────────────────────────────

const packs = new Map<string, EffectPackModule>();

export function registerEffectPack(pack: EffectPackModule): void {
  packs.set(pack.id, pack);
}

export function getEffectPack(
  id: string | null | undefined,
): EffectPackModule | null {
  if (!id) return null;
  return packs.get(id) ?? null;
}

export function listEffectPacks(): EffectPackModule[] {
  return [...packs.values()];
}

export function __resetEffectPacksForTests(): void {
  packs.clear();
}

// ── Backend selection ───────────────────────────────────────────────────────

export function selectFoilBackend(opts: {
  preference: FoilBackendPreference;
  supportsWebgl2: boolean;
  hasMaterial: boolean;
  hasPoolSlot: boolean;
}): FoilBackend {
  const { preference, supportsWebgl2, hasMaterial, hasPoolSlot } = opts;

  if (preference === "css") return "css";

  const webglReady = supportsWebgl2 && hasMaterial && hasPoolSlot;
  if (preference === "webgl" || preference === "auto") {
    return webglReady ? "webgl" : "css";
  }

  return "css";
}

// ── Hot foil stamp routing ──────────────────────────────────────────────────

/**
 * Which uniform receives the catalogue stamp colour. Metallic HotFoil stamps
 * via `_HotFoilColor`; Snow compiles that out and stamps through
 * `_VarnishLightColor`. Never override both — that washed Magma Metallic's
 * lighting with the stamp hue.
 */
export function hotFoilStampUniforms(
  material: Pick<FoilMaterial, "colors">,
): ReadonlySet<string> {
  if (material.colors._HotFoilColor) return new Set(["_HotFoilColor"]);
  return new Set(["_VarnishLightColor"]);
}

// ── House foil fallback ─────────────────────────────────────────────────────

/**
 * Honest « this print is shiny, but we have no dedicated look yet ».
 *
 * Runtime chain (all TCG packs):
 * 1. WebGL when preference allows and a material exists
 * 2. Else CSS for the requested finish / leaf when ported
 * 3. Else house {@link HOUSE_FOIL_FALLBACK_CSS_ID} (`flare`)
 *
 * Plain / None finishes stay flat — callers must not pass them here.
 */
export const HOUSE_FOIL_FALLBACK_CSS_ID = "flare" as const;

/**
 * When a shiny finish has no CSS look id yet, return the house flare band.
 * Keeps an already-resolved id; leaves empty / `None` as null.
 */
export function applyHouseFoilFallback(
  finishShaderId: string | null | undefined,
  finish: string | null | undefined,
): string | null {
  const id = typeof finishShaderId === "string" ? finishShaderId.trim() : "";
  if (id) return id;
  const f = (finish ?? "").trim();
  if (!f || /^none$/i.test(f)) return null;
  return HOUSE_FOIL_FALLBACK_CSS_ID;
}

// ── Card-back resolve ───────────────────────────────────────────────────────

/**
 * Resolve the default card-back URL for an item: print (alt face) > set > pack.
 * No shelf override — backs live on the print/pack, not the collection.
 */
export function resolveCardBackUrl(opts: {
  printCardBackUrl?: string | null;
  printKey?: string | null;
  setCode?: string | null;
  effectPackId?: string | null;
  providerId?: string | null;
}): string | null {
  return pickDefaultCardBack(resolveCardBackCandidates(opts))?.url ?? null;
}

/** Full default candidate (scope included) — for skeleton / Face·Dos UI. */
export function resolveDefaultCardBack(
  opts: Parameters<typeof resolveCardBackCandidates>[0],
): CardBackCandidate | null {
  return pickDefaultCardBack(resolveCardBackCandidates(opts));
}
