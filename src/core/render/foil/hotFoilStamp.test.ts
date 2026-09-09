import { describe, expect, it } from "vitest";

import { hotFoilStampUniforms } from "@/core/render/foil/hotFoilStamp";
import type { FoilMaterial } from "@/core/render/foil/types";

function colors(entries: FoilMaterial["colors"]): Pick<FoilMaterial, "colors"> {
  return { colors: entries };
}

describe("hotFoilStampUniforms", () => {
  it("routes Metallic-style stamps to _HotFoilColor only", () => {
    expect(
      hotFoilStampUniforms(
        colors({
          _HotFoilColor: [0.2, 0.4, 0.2, 1],
          _VarnishLightColor: [0.8, 0.6, 0.4, 1],
        }),
      ),
    ).toEqual(new Set(["_HotFoilColor"]));
  });

  it("routes Snow-style stamps to _VarnishLightColor (HotFoilColor compiled out)", () => {
    expect(
      hotFoilStampUniforms(
        colors({
          _VarnishLightColor: [0.86, 0.94, 0.95, 1],
        }),
      ),
    ).toEqual(new Set(["_VarnishLightColor"]));
  });
});
