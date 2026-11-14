import { describe, expect, it } from "vitest";

import { keepCasePlasticRecipe, usesKeepCaseShell } from "./keepCasePlastic";

describe("keepCasePlasticRecipe", () => {
  it("gives PS2 a blue shell and Switch 2 a red shell", () => {
    expect(keepCasePlasticRecipe("ps2").base).toContain("255");
    expect(keepCasePlasticRecipe("switch2").base).toContain("25");
    expect(keepCasePlasticRecipe("wiiu").base).toContain("250");
  });

  it("gives Wii a light shell and Xbox a green shell", () => {
    const wii = keepCasePlasticRecipe("wii");
    expect(Number(wii.base.match(/oklch\(([\d.]+)/)?.[1])).toBeGreaterThan(0.6);
    expect(keepCasePlasticRecipe("xbox").base).toContain("145");
  });

  it("gives Nintendo DS, 3DS and Switch near-white translucent shells", () => {
    for (const key of ["ds", "3ds", "wii", "switch"] as const) {
      const shell = keepCasePlasticRecipe(key);
      expect(Number(shell.base.match(/oklch\(([\d.]+)/)?.[1])).toBeGreaterThan(
        0.75,
      );
    }
  });

  it("falls back to smoke for unknown or cardboard-era platforms", () => {
    const smoke = keepCasePlasticRecipe(null);
    expect(keepCasePlasticRecipe("n64")).toEqual(smoke);
    expect(keepCasePlasticRecipe("pc")).toEqual(smoke);
    expect(keepCasePlasticRecipe("totally-unknown")).toEqual(smoke);
  });

  it("flags keep-case shells vs cardboard retail boxes", () => {
    expect(usesKeepCaseShell("ps2")).toBe(true);
    expect(usesKeepCaseShell("switch")).toBe(true);
    expect(usesKeepCaseShell("n64")).toBe(false);
    expect(usesKeepCaseShell("gb")).toBe(false);
    expect(usesKeepCaseShell(null)).toBe(false);
  });
});
