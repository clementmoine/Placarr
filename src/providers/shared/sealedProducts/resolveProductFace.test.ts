import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  matchSealedProductsAssetRest,
  resolveSealedProductFace,
  writeSealedProductFaceDecision,
} from "./resolveProductFace";

describe("matchSealedProductsAssetRest", () => {
  it("matches products/{slug}/{lang}/{role}", () => {
    expect(
      matchSealedProductsAssetRest([
        "products",
        "collector-album",
        "fr",
        "face",
      ]),
    ).toEqual({ slug: "collector-album", lang: "fr", role: "face" });
    expect(
      matchSealedProductsAssetRest(["products", "pochette", "fr", "back"]),
    ).toEqual({ slug: "pochette", lang: "fr", role: "back" });
    expect(matchSealedProductsAssetRest(["products", "x", "fr"])).toBeNull();
    expect(
      matchSealedProductsAssetRest([
        "products",
        "x",
        "fr",
        "art.paninimania.jpg",
      ]),
    ).toBeNull();
  });
});

describe("resolveSealedProductFace", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves face/back from face.json and dumps", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "sealed-face-"));
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const dir = path.join(
      root,
      "leclerc",
      "disney25",
      "products",
      "collector-album",
      "fr",
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "art.paninimania.jpg"), "art");
    writeFileSync(path.join(dir, "back.paninimania.jpg"), "back");
    writeSealedProductFaceDecision(dir, {
      art: "art.paninimania.jpg",
      back: "back.paninimania.jpg",
    });

    const face = resolveSealedProductFace({
      packId: "leclerc/disney25",
      slug: "collector-album",
      lang: "fr",
      role: "face",
    });
    expect(face?.artFile).toBe("art.paninimania.jpg");
    expect(face?.filePath).toContain("art.paninimania.jpg");

    const back = resolveSealedProductFace({
      packId: "leclerc/disney25",
      slug: "collector-album",
      lang: "fr",
      role: "back",
    });
    expect(back?.artFile).toBe("back.paninimania.jpg");

    const thumb = resolveSealedProductFace({
      packId: "leclerc/disney25",
      slug: "collector-album",
      lang: "fr",
      role: "thumb",
    });
    expect(thumb?.artFile).toBe("art.paninimania.jpg");
  });
});
