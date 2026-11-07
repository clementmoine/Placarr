import { describe, expect, it } from "vitest";

import {
  normalizePrintAssetColumns,
  printAssetsArtSql,
  printAssetsBackSql,
} from "./printAssetsCore";

describe("normalizePrintAssetColumns", () => {
  it("prefers core art/back over legacy aliases", () => {
    expect(
      normalizePrintAssetColumns({
        art: "art.webp",
        image_url: "legacy.webp",
        back: "back.webp",
        back_url: "legacy-back.webp",
      }),
    ).toEqual({ art: "art.webp", back: "back.webp" });
  });

  it("maps DBS image_url / back_url onto the core", () => {
    expect(
      normalizePrintAssetColumns({
        image_url: "https://cdn.example/face.png",
        back_url: "https://cdn.example/back.png",
      }),
    ).toEqual({
      art: "https://cdn.example/face.png",
      back: "https://cdn.example/back.png",
    });
  });

  it("treats blank strings as absent", () => {
    expect(
      normalizePrintAssetColumns({ art: "  ", image_url: "face.webp" }),
    ).toEqual({ art: "face.webp", back: null });
  });
});

describe("printAssetsArtSql / printAssetsBackSql", () => {
  it("COALESCE when both core and legacy columns exist", () => {
    const cols = new Set(["art", "image_url", "back", "back_url"]);
    expect(printAssetsArtSql(cols)).toContain("COALESCE");
    expect(printAssetsArtSql(cols)).toContain("a.art");
    expect(printAssetsArtSql(cols)).toContain("a.image_url");
    expect(printAssetsBackSql(cols)).toContain("a.back");
    expect(printAssetsBackSql(cols)).toContain("a.back_url");
  });

  it("uses the only available column", () => {
    expect(printAssetsArtSql(new Set(["image_url"]))).toBe("a.image_url");
    expect(printAssetsArtSql(new Set(["art"]))).toBe("a.art");
    expect(printAssetsBackSql(new Set(["back_url"]))).toBe("a.back_url");
    expect(printAssetsArtSql(new Set())).toBe("NULL");
  });
});
