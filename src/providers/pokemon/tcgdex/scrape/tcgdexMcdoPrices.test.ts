import { describe, expect, it } from "vitest";

import { tcgdexMcdoPriceTargets } from "./tcgdexMcdoPrices";

describe("tcgdexMcdoPriceTargets", () => {
  it("covers PokéCardex McDo years including 2011bw / 2012bw", () => {
    const targets = tcgdexMcdoPriceTargets();
    const ids = targets.map((t) => t.setId);
    expect(ids).toEqual(expect.arrayContaining(["2011bw", "2012bw", "2023sv", "2024sv"]));
    expect(targets.find((t) => t.setId === "2011bw")?.cardCount).toBe(12);
    expect(targets.find((t) => t.setId === "2012bw")?.cardCount).toBe(12);
  });
});
