/**
 * Resolve the FoilMaterial FoilCardImage draws — pack hooks + second varnish.
 * Keeps USESECONDTOPLAYER / foil_mask upgrades out of the React tree.
 */
import type { EffectPackModule, FoilMaterial } from "./types";

export type ResolveFoilCardMaterialInput = {
  pack: EffectPackModule | null | undefined;
  materialName?: string | null;
  finish?: string | null;
  varnishType?: string | null;
  secondVarnishMaskUrl?: string | null;
  foilMask?: string | null;
  printKey?: string | null;
  title?: string | null;
};

/**
 * Same order as FoilCardImage: named material (+ print opts) → finish resolve.
 */
export function resolveFoilCardMaterial(
  input: ResolveFoilCardMaterialInput,
): FoilMaterial | null {
  const pack = input.pack;
  if (!pack) return null;

  const secondVarnishMaskUrl = input.secondVarnishMaskUrl ?? null;
  const foilMask = input.foilMask ?? null;
  const printKey = input.printKey ?? null;
  const title = input.title ?? null;
  const finish = input.finish ?? null;
  const varnishType = input.varnishType ?? null;

  const materialName = input.materialName?.trim() || null;
  if (materialName) {
    return (
      pack.materialForPrint?.(materialName, {
        secondVarnishMaskUrl,
        foilMask,
        printKey,
        title,
        finish,
      }) ?? pack.material(materialName)
    );
  }

  if (finish) {
    return pack.resolveMaterialForPrint(finish, varnishType, {
      secondVarnishMaskUrl,
      printKey,
      title,
      foilMask,
    });
  }

  return null;
}

/**
 * Dual-frag materials expose `fragmentTime` — FoilCardImage may swap scroll
 * mode on pointer. Single-frag Live keeps `_Time` in one program.
 */
export function foilMaterialHasTimeSibling(
  material: Pick<FoilMaterial, "fragmentTime"> | null | undefined,
): boolean {
  return Boolean(material?.fragmentTime?.trim());
}

/** True when the resolved fragment is a USESECONDTOPLAYER sibling. */
export function foilMaterialUsesSecondTopLayer(
  material: Pick<FoilMaterial, "fragment" | "keywords"> | null | undefined,
): boolean {
  if (!material) return false;
  if (/USESECONDTOPLAYER/i.test(material.fragment)) return true;
  return material.keywords.some((k) => /USESECONDTOPLAYER/i.test(k));
}
