import { describe, expect, it } from "vitest";

import { clusterDbsjccCanonicalPrints } from "../canonicalPrint";
import {
  stripDbsjccArtLetterFromAssetUrl,
  stripDbsjccArtLetterFromCardFolder,
  stripDbsjccArtLetterFromPrintKey,
} from "./dedupePrintSets";

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

describe("strip collapsed art letters", () => {
  it("drops a single trailing art letter before optional grouping", () => {
    expect(stripDbsjccArtLetterFromCardFolder("d0007a")).toBe("d0007");
    expect(stripDbsjccArtLetterFromCardFolder("d0250b-kaio")).toBe(
      "d0250-kaio",
    );
    expect(stripDbsjccArtLetterFromCardFolder("d0153b-main")).toBe(
      "d0153-main",
    );
    expect(stripDbsjccArtLetterFromCardFolder("d0007")).toBeNull();
    expect(stripDbsjccArtLetterFromCardFolder("detecteur")).toBeNull();
  });

  it("rewrites printKeys and asset URLs the same way", () => {
    expect(stripDbsjccArtLetterFromPrintKey("dbsjcc:part1-d0007a")).toBe(
      "dbsjcc:part1-d0007",
    );
    expect(
      stripDbsjccArtLetterFromPrintKey("dbsjcc:part4-d0250b-kaio"),
    ).toBe("dbsjcc:part4-d0250-kaio");
    expect(
      stripDbsjccArtLetterFromAssetUrl(
        "/assets/dragonball/jcc/cards/fr/part1/d0007a/art.dbzcollection.jpg",
      ),
    ).toBe(
      "/assets/dragonball/jcc/cards/fr/part1/d0007/art.dbzcollection.jpg",
    );
  });
});
