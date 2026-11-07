import { describe, expect, it } from "vitest";

import {
  listSiblingFaceBasenames,
  resolveCatalogueArtPath,
} from "./visualIndexStep";

describe("resolveCatalogueArtPath", () => {
  it("resolves Lorcana lang-first art from print_assets basename", () => {
    const hit = resolveCatalogueArtPath("lorcana", "lorcana:1-1", "fr", "art.jpg");
    expect(hit?.artRel).toBe("cards/fr/1/1/art.jpg");
    expect(hit?.set).toBe("1");
    expect(hit?.card).toBe("1");
  });

  it("resolves One Piece art under either disk layout", () => {
    const hit = resolveCatalogueArtPath(
      "onepiece",
      "onepiece:eb01-001",
      "en",
      "art.bandai.webp",
    );
    // May be missing on CI without data — skip soft when absent.
    if (!hit) return;
    expect(hit.artRel).toMatch(
      /^cards\/(en\/eb01\/001|eb01\/en\/001)\//,
    );
    expect(hit.set).toBe("eb01");
    expect(hit.card).toBe("001");
  });

  it("returns null for unparseable keys", () => {
    expect(
      resolveCatalogueArtPath("lorcana", "not-a-print-key", "fr", "art.jpg"),
    ).toBeNull();
  });
});

describe("listSiblingFaceBasenames", () => {
  it("lists every art.* next to Gaï Ninja Sensei (coleka + animecollection)", () => {
    const hit = resolveCatalogueArtPath(
      "naruto/ninja-ranks",
      "naruto:ns-0003",
      "fr",
      "art.animecollection.jpg",
    );
    if (!hit) return;
    const arts = listSiblingFaceBasenames(hit.abs, "art");
    expect(arts).toEqual(
      expect.arrayContaining([
        "art.animecollection.jpg",
        "art.coleka.webp",
      ]),
    );
    expect(arts.length).toBeGreaterThanOrEqual(2);
  });
});
