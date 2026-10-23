import { describe, expect, it } from "vitest";

import { hammingDistance } from "@/core/enrich/media/imageAssets";

import {
  matchCardVisualHash,
  matchCardVisualHashAcrossPacks,
  type CardVisualIndexFile,
} from "./cardVisualIndex";

describe("matchCardVisualHash", () => {
  const index: CardVisualIndexFile = {
    version: 1,
    packId: "naruto/carddass",
    lang: "fr",
    builtAt: "2026-10-23T00:00:00.000Z",
    entries: [
      {
        printKey: "naruto:s1-ni0001",
        lang: "fr",
        set: "s1",
        card: "ni0001",
        artRel: "cards/fr/s1/ni0001/art.webp",
        hash: "0".repeat(64),
      },
      {
        printKey: "naruto:s1-ni0002",
        lang: "fr",
        set: "s1",
        card: "ni0002",
        artRel: "cards/fr/s1/ni0002/art.webp",
        hash: "1".repeat(64),
      },
    ],
  };

  it("returns nearest neighbours under maxDistance, never invents keys", () => {
    const near = "0".repeat(60) + "1111";
    expect(hammingDistance(near, "0".repeat(64))).toBe(4);
    const hits = matchCardVisualHash(near, index, { limit: 3, maxDistance: 10 });
    expect(hits[0]?.printKey).toBe("naruto:s1-ni0001");
    expect(hits[0]?.distance).toBe(4);
    expect(hits.every((h) => h.printKey.startsWith("naruto:"))).toBe(true);
  });

  it("stays empty when nothing is close (honest miss)", () => {
    const far = "1".repeat(32) + "0".repeat(32);
    expect(matchCardVisualHash(far, index, { maxDistance: 8 })).toEqual([]);
  });

  it("across-packs helper stays empty when no pack ids are given", () => {
    expect(
      matchCardVisualHashAcrossPacks("0".repeat(64), {
        packIds: [],
        maxDistance: 8,
      }),
    ).toEqual([]);
  });
});
