import { describe, expect, it } from "vitest";

import { keepCasePlasticRecipe } from "./keepCasePlastic";

describe("keepCasePlasticRecipe", () => {
  it("gives PS2 a blue shell and Switch a red shell", () => {
    expect(keepCasePlasticRecipe("ps2").base).toContain("255");
    expect(keepCasePlasticRecipe("switch").base).toContain("25");
    expect(keepCasePlasticRecipe("wiiu").base).toContain("250");
  });

  it("gives Wii a light shell and Xbox a green shell", () => {
    const wii = keepCasePlasticRecipe("wii");
    expect(Number(wii.base.match(/oklch\(([\d.]+)/)?.[1])).toBeGreaterThan(0.6);
    expect(keepCasePlasticRecipe("xbox").base).toContain("145");
  });

  it("falls back to smoke for unknown or cardboard-era platforms", () => {
    const smoke = keepCasePlasticRecipe(null);
    expect(keepCasePlasticRecipe("n64")).toEqual(smoke);
    expect(keepCasePlasticRecipe("pc")).toEqual(smoke);
    expect(keepCasePlasticRecipe("totally-unknown")).toEqual(smoke);
  });
});
