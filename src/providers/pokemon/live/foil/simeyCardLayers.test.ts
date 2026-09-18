import { describe, expect, it } from "vitest";

import {
  SIMEY_HOLO_ORIGIN,
  SIMEY_SHARED_LAYER_URLS,
  SIMEY_SHARED_VENDORED,
  simeyCardLayersForBundle,
} from "./simeyCardLayers";

describe("simeyCardLayersForBundle", () => {
  it("resolves Radiant Charizard Live stem to poke-holo foil paths", () => {
    const hit = simeyCardLayersForBundle("swsh10-5_fr_011");
    expect(hit?.id).toMatch(/pgo-11|swsh10/);
    expect(hit?.foil).toContain("/img/foils/");
    expect(hit?.foil?.startsWith(SIMEY_HOLO_ORIGIN)).toBe(true);
    expect(hit?.mask).toContain("/masks/");
    expect(hit?.face).toMatch(/pokemontcg\.io/);
  });

  it("exposes shared Simey FX still hosted on the demo", () => {
    expect(SIMEY_SHARED_LAYER_URLS.glitter).toBe(
      `${SIMEY_HOLO_ORIGIN}/img/glitter.png`,
    );
    expect(SIMEY_SHARED_LAYER_URLS.grain).toBe(
      `${SIMEY_HOLO_ORIGIN}/img/grain.webp`,
    );
    expect(SIMEY_SHARED_LAYER_URLS.cosmosBottom).toContain("cosmos-bottom");
    expect(SIMEY_SHARED_LAYER_URLS.illusion).toContain("illusion.png");
  });

  it("exposes local vendored mirrors for the same shared slots", () => {
    expect(SIMEY_SHARED_VENDORED.glitter).toContain("simey_glitter");
    expect(SIMEY_SHARED_VENDORED.grain).toContain("simey_grain");
    expect(SIMEY_SHARED_VENDORED.cosmosBottom).toContain("simey_cosmos-bottom");
    expect(SIMEY_SHARED_VENDORED.illusion).toContain("simey_illusion");
  });
});
