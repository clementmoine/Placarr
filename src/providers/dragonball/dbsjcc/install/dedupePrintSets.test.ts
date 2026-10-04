import { describe, expect, it } from "vitest";

import { clusterDbsjccCanonicalPrints } from "../canonicalPrint";

describe("dedupe clustering contract", () => {
  it("assigns letters only when several face families share a number", () => {
    const shared = "abc";
    const prints = clusterDbsjccCanonicalPrints([
      { setCode: "part1", number: "d0123", artHash: "h1" },
      { setCode: "part2", number: "d0123", artHash: shared },
      { setCode: "part3", number: "d0123", artHash: shared },
    ]);
    expect(prints.map((p) => p.printKey).sort()).toEqual([
      "dbsjcc:part1-d0123a",
      "dbsjcc:part2-d0123b",
    ]);
    expect(
      prints.find((p) => p.printKey === "dbsjcc:part2-d0123b")?.setCodes,
    ).toEqual(["part2", "part3"]);
  });
});
