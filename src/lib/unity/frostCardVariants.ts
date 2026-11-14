/**
 * Frost/Card fragment basename from material keywords.
 *
 * Extract historically kept one preferred (HoloMap-biased) `FrostCard.frag`
 * that strips EffectsLayer paths. Leaves like `effects-uv-shine` /
 * `ef-flash` / `uv-rainbow` need COUNT_ONE / FIVE siblings written by
 * {@link extractFrostCardVariantFiles} in `frostCardExtract.ts`.
 *
 * Keep this module free of unityfs / Metal imports so the effect pack can
 * resolve fragment names in Vitest without the Mac decoder worker.
 */

const COUNT_NAMES = [
  "ZERO",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
] as const;

/** Same shape as Lorcana `variantKey` — local to avoid unityfs pull-in. */
function variantKey(keywords: string[]): string {
  return [...keywords]
    .filter(
      (k) =>
        !k.startsWith("_SCROLLMODE") &&
        !k.startsWith("UNITY_") &&
        !k.startsWith("STEREO"),
    )
    .sort()
    .join("__");
}

/** Highest EffectsLayer index referenced in Metal / GLSL source (0 = none). */
export function frostEffectsLayerMax(source: string): number {
  let max = 0;
  for (let i = 1; i <= 6; i += 1) {
    if (new RegExp(`_EffectsLayer${i}(Tex|Motion)\\b`).test(source)) {
      max = i;
    }
  }
  return max;
}

export function frostEffectsLayerCountKeyword(source: string): string {
  const max = frostEffectsLayerMax(source);
  return `EFFECTS_LAYER_COUNT_${COUNT_NAMES[max] ?? "ZERO"}`;
}

/**
 * Fragment basename for a material recipe's keywords.
 * Falls back to `FrostCard.frag` when COUNT is ZERO / missing.
 */
export function frostCardFragmentForKeywords(
  keywords: readonly string[],
): string {
  const count =
    keywords.find((k) => k.startsWith("EFFECTS_LAYER_COUNT_")) ??
    "EFFECTS_LAYER_COUNT_ZERO";
  if (count === "EFFECTS_LAYER_COUNT_ZERO") return "FrostCard.frag";
  const key = variantKey(
    keywords.filter(
      (k) => k === "ARTWORK_ON" || k.startsWith("EFFECTS_LAYER_COUNT_"),
    ),
  );
  return key ? `FrostCard__${key}.frag` : "FrostCard.frag";
}

export { COUNT_NAMES as FROST_EFFECTS_LAYER_COUNT_NAMES };
