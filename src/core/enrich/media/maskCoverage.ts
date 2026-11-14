/**
 * Coverage math for foil / varnish masks — shared by server bake and client
 * Safari conversion. No Node imports (safe for client bundles).
 */

/** BT.601 luma, the weighting the publisher's canvas uses. */
export function lumaOf(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/**
 * A normal map's coverage: decode each channel to `-1..1`, sum, clamp at zero.
 */
export function normalMapCoverage(r: number, g: number, b: number): number {
  const x = (r / 255) * 2 - 1;
  const y = (g / 255) * 2 - 1;
  const z = (b / 255) * 2 - 1;
  return Math.max(0, x + y + z) * 255;
}

export type MaskKind = "foil" | "varnish";

/** Write coverage into alpha; keep RGB for Unity `.xyz` sampling. */
export function applyMaskCoverage(
  pixels: Uint8ClampedArray,
  kind: MaskKind,
): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    if (kind === "foil") {
      const coverage = Math.round(Math.min(255, Math.max(0, lumaOf(r, g, b))));
      pixels[i] = coverage;
      pixels[i + 1] = coverage;
      pixels[i + 2] = coverage;
      pixels[i + 3] = coverage;
    } else {
      pixels[i + 3] = Math.round(
        Math.min(255, Math.max(0, normalMapCoverage(r, g, b))),
      );
    }
  }
}

/** True when alpha is effectively opaque everywhere (JPEG / unbaked PNG). */
export function alphaIsUniformOpaque(
  pixels: Uint8ClampedArray,
  sampleStep = 64,
): boolean {
  let min = 255;
  let max = 0;
  for (let i = 3; i < pixels.length; i += 4 * sampleStep) {
    const a = pixels[i]!;
    if (a < min) min = a;
    if (a > max) max = a;
    if (min < 250) return false;
  }
  return min >= 250 && max === 255;
}
