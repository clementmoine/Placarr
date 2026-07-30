"use client";

import type { ComponentProps } from "react";

import { FoilCardImage } from "@/components/FoilCardImage";
import { LORCANA_EFFECT_PACK_ID } from "@/effects/lorcana";
import { parseMaterialName } from "@/effects/lorcana/resolveMaterial";

type UnityFoilCardImageProps = Omit<
  ComponentProps<typeof FoilCardImage>,
  "effectPack" | "finish" | "varnishType" | "backend"
> & {
  /** Which of the app's materials to run, e.g. `CardFoilSilver`. */
  materialName: string;
};

/**
 * Playroom bridge: Unity material name → catalogue finish/varnish on
 * {@link FoilCardImage}. Product code should pass finish metadata directly.
 *
 * @deprecated Use `FoilCardImage` with finish/varnish metadata.
 */
export function UnityFoilCardImage({
  materialName,
  ...rest
}: UnityFoilCardImageProps) {
  const { finish, varnish } = parseMaterialName(materialName);
  return (
    <FoilCardImage
      effectPack={LORCANA_EFFECT_PACK_ID}
      materialName={materialName}
      finish={finish}
      varnishType={varnish}
      backend="webgl"
      {...rest}
    />
  );
}
