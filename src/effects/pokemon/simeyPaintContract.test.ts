import { describe, expect, it } from "vitest";

import {
  SIMEY_MATERIALS_BRIEFS,
  simeyMaterialsReady,
} from "./simeyPaintContract";

describe("simeyPaintContract", () => {
  it("lists briefs for every Simey-backed family we ship", () => {
    expect(SIMEY_MATERIALS_BRIEFS.length).toBeGreaterThanOrEqual(5);
  });

  it("marks Cosmos/Galaxy ready; other briefs still have adapt slots", () => {
    const cosmos = SIMEY_MATERIALS_BRIEFS.find((b) =>
      b.finish.startsWith("Cosmos"),
    );
    expect(cosmos && simeyMaterialsReady(cosmos)).toBe(true);
    const stillAdapt = SIMEY_MATERIALS_BRIEFS.filter(
      (b) => !simeyMaterialsReady(b),
    );
    expect(stillAdapt.length).toBeGreaterThan(0);
  });
});
