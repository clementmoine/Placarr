import { describe, expect, it } from "vitest";

import {
  clusterDbsjccCanonicalPrints,
  parseDbsjccCardFolder,
  type DbsjccFaceCandidate,
} from "./canonicalPrint";

function face(
  setCode: string,
  number: string,
  artHash: string,
  powerGrouping?: string | null,
): DbsjccFaceCandidate {
  return { setCode, number, artHash, powerGrouping };
}

describe("clusterDbsjccCanonicalPrints", () => {
  it("keeps a single-family card without an art letter", () => {
    const prints = clusterDbsjccCanonicalPrints([
      face("part1", "d0001", "hash-goku"),
    ]);
    expect(prints).toHaveLength(1);
    expect(prints[0]).toMatchObject({
      printKey: "dbsjcc:part1-d0001",
      number: "d0001",
      artLetter: null,
      setCodes: ["part1"],
    });
  });

  it("merges same-hash Dragon Ball faces across sets and letters the rest", () => {
    const shared = "hash-shared-23456";
    const prints = clusterDbsjccCanonicalPrints([
      face("part1", "D-123", "hash-part1"),
      face("part2", "d0123", shared),
      face("part3", "d0123", shared),
      face("part4", "d0123", shared),
      face("part5", "d0123", shared),
      face("part6", "d0123", shared),
      face("part7", "d0123", "hash-part7"),
      face("part9", "d0123", "hash-part9"),
      face("part10", "d0123", "hash-part10"),
    ]);

    const byKey = Object.fromEntries(
      prints.map((print) => [print.printKey, print]),
    );
    expect(byKey["dbsjcc:part1-d0123a"]?.setCodes).toEqual(["part1"]);
    expect(byKey["dbsjcc:part2-d0123b"]?.setCodes).toEqual([
      "part2",
      "part3",
      "part4",
      "part5",
      "part6",
    ]);
    expect(byKey["dbsjcc:part7-d0123c"]?.artLetter).toBe("c");
    expect(byKey["dbsjcc:part9-d0123d"]?.artLetter).toBe("d");
    expect(byKey["dbsjcc:part10-d0123e"]?.artLetter).toBe("e");
    expect(prints).toHaveLength(5);
  });

  it("keeps kaio / enfer as distinct power groupings", () => {
    const prints = clusterDbsjccCanonicalPrints([
      face("part4", "d0437", "hash-kaio", "kaio"),
      face("part4", "d0437", "hash-enfer", "enfer"),
    ]);
    expect(prints.map((p) => p.printKey).sort()).toEqual([
      "dbsjcc:part4-d0437-enfer",
      "dbsjcc:part4-d0437-kaio",
    ]);
  });
});

describe("parseDbsjccCardFolder", () => {
  it("strips art letters so lettered home folders re-cluster", () => {
    expect(parseDbsjccCardFolder("d0123b")).toEqual({
      number: "d0123",
      powerGrouping: null,
    });
    expect(parseDbsjccCardFolder("d0437-kaio")).toEqual({
      number: "d0437",
      powerGrouping: "kaio",
    });
  });
});
