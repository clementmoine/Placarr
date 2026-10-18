import { describe, expect, it } from "vitest";

import {
  matchPrintsAssetRest,
  printKeyGameForPack,
} from "./resolvePrintFace";

describe("printKeyGameForPack", () => {
  it("uses the first path segment, with known corpus divergences", () => {
    expect(printKeyGameForPack("pokemon")).toBe("pokemon");
    expect(printKeyGameForPack("lorcana")).toBe("lorcana");
    expect(printKeyGameForPack("naruto/carddass")).toBe("naruto");
    expect(printKeyGameForPack("naruto/kayou")).toBe("kayou");
    expect(printKeyGameForPack("dragonball/jcc")).toBe("dbsjcc");
    expect(printKeyGameForPack("dragonball/cg")).toBe("dbscg");
  });
});

describe("matchPrintsAssetRest", () => {
  it("parses shelf-stem URLs for any pack game", () => {
    expect(matchPrintsAssetRest("pokemon", ["prints", "sv1-001-fr", "face"])).toEqual({
      printKey: "pokemon:sv1-001",
      lang: "fr",
      role: "face",
    });
    expect(
      matchPrintsAssetRest("lorcana", ["prints", "1-106-fr", "thumb"]),
    ).toEqual({
      printKey: "lorcana:1-106",
      lang: "fr",
      role: "thumb",
    });
    expect(
      matchPrintsAssetRest("dragonball/jcc", [
        "prints",
        "part1-d0050-fr",
        "face",
      ]),
    ).toEqual({
      printKey: "dbsjcc:part1-d0050",
      lang: "fr",
      role: "face",
    });
  });

  it("keeps Naruto Carddass stem matching", () => {
    expect(
      matchPrintsAssetRest("naruto/carddass", [
        "prints",
        "s1-cl0001-fr",
        "thumb",
      ]),
    ).toEqual({
      printKey: "naruto:s1-cl0001",
      lang: "fr",
      role: "thumb",
    });
  });
});
