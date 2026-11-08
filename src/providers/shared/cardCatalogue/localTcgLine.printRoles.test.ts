/**
 * Shelf candidates mint stable `/prints/…/face` URLs; Affiche drops that twin
 * once disk `art.*` is in the gallery (same bytes, one picker row).
 */
import { describe, expect, it } from "vitest";

import { collapsePrintRoleTwinWithDiskArt } from "@/core/collect/media";
import { assetsCardUrl, assetsPrintFaceUrl } from "@/lib/packAssetUrls";

describe("localTcgLine print roles ↔ Affiche", () => {
  it("mints print-role shelf URLs (stable across preferred-source changes)", () => {
    expect(
      assetsPrintFaceUrl("pokemon", "pokemon:sv1-001", "fr", "face"),
    ).toBe("/assets/pokemon/prints/sv1-001-fr/face");
    expect(
      assetsPrintFaceUrl("pokemon", "pokemon:sv1-001", "fr", "thumb"),
    ).toBe("/assets/pokemon/prints/sv1-001-fr/thumb");
  });

  it("Affiche collapses print-role twin when disk art.* is present", () => {
    const printUrl = assetsPrintFaceUrl(
      "pokemon",
      "pokemon:sv1-001",
      "fr",
      "face",
    );
    const diskUrl = assetsCardUrl(
      "pokemon",
      { set: "sv1", lang: "fr", card: "001" },
      "art.mcdn.webp",
    );
    const collapsed = collapsePrintRoleTwinWithDiskArt([
      { type: "cover", url: printUrl, score: 1 },
      { type: "cover", url: diskUrl, score: 2 },
    ]);
    expect(collapsed.map((a) => a.url)).toEqual([diskUrl]);
  });

  it("keeps print-role alone when no disk art dump is in the gallery", () => {
    const printUrl = assetsPrintFaceUrl(
      "lorcana",
      "lorcana:1-1",
      "fr",
      "face",
    );
    const collapsed = collapsePrintRoleTwinWithDiskArt([
      { type: "cover", url: printUrl, score: 1 },
    ]);
    expect(collapsed.map((a) => a.url)).toEqual([printUrl]);
  });
});
