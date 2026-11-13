import { describe, expect, it } from "vitest";

import {
  clientFoilWebpName,
  isSharedFoilPlateName,
} from "./foilTextures";

describe("clientFoilWebpName", () => {
  it("slugifies Unity names the way existing client-* files are named", () => {
    expect(clientFoilWebpName("HoloMap")).toBe("client-holomap.webp");
    expect(clientFoilWebpName("HoloMap_main2")).toBe(
      "client-holomap-main2.webp",
    );
    expect(clientFoilWebpName("uv_line_rainbow")).toBe(
      "client-uv-line-rainbow.webp",
    );
  });
});

describe("isSharedFoilPlateName", () => {
  it("keeps Frost plates and premiumtex VFX, drops unrelated names", () => {
    expect(isSharedFoilPlateName("Rainbow")).toBe(true);
    expect(isSharedFoilPlateName("ef_flash01")).toBe(true);
    expect(isSharedFoilPlateName("uv_shine")).toBe(true);
    expect(isSharedFoilPlateName("Tabac_Holo")).toBe(true);
    expect(isSharedFoilPlateName("SomeUIButton")).toBe(false);
  });
});
