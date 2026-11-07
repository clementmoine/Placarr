import { describe, expect, it } from "vitest";

import {
  SIMEY_MATERIALS_BRIEFS,
  simeyMaterialsReady,
} from "./simeyPaintContract";

describe("simeyPaintContract", () => {
  it("lists briefs for every Simey-backed family we ship", () => {
    expect(SIMEY_MATERIALS_BRIEFS.length).toBeGreaterThanOrEqual(5);
  });

  it("marks paint-ready families ok; Radiant/SwSecret keep topology adapt", () => {
    const cosmos = SIMEY_MATERIALS_BRIEFS.find((b) =>
      b.finish.startsWith("Cosmos"),
    );
    expect(cosmos && simeyMaterialsReady(cosmos)).toBe(true);
    const rainbow = SIMEY_MATERIALS_BRIEFS.find((b) =>
      b.finish.startsWith("Rainbow"),
    );
    expect(rainbow && simeyMaterialsReady(rainbow)).toBe(true);
    const stillAdapt = SIMEY_MATERIALS_BRIEFS.filter(
      (b) => !simeyMaterialsReady(b),
    );
    expect(stillAdapt.map((b) => b.finish)).toEqual(
      expect.arrayContaining(["RadiantHolo", "SwSecret"]),
    );
  });
});
