import type { FoilMaterial } from "@/core/render/foil/types";

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
