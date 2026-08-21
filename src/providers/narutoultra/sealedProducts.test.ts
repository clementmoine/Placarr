import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  packCardsDir,
  packProductsIndexPath,
  packSealedProductsDir,
} from "@/lib/packPaths";

import {
  ingestUltraSealedProducts,
  readUltraReconstructedLedger,
} from "./sealedProducts";
import { NARUTO_ULTRA_PACK_ID } from "./pack";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "ultra-sealed-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TINY_WEBP = Buffer.from("RIFF....WEBP", "ascii");

function stageReconstructed(): { curated: string; coleka: string } {
  const curated = mkdtempSync(path.join(os.tmpdir(), "ultra-curated-"));
  const coleka = mkdtempSync(path.join(os.tmpdir(), "ultra-coleka-"));
  roots.push(curated, coleka);
  const album = path.join(curated, "collector-album", "fr");
  const booster = path.join(curated, "booster", "fr");
  mkdirSync(album, { recursive: true });
  mkdirSync(booster, { recursive: true });
  writeFileSync(path.join(album, "art.reconstructed.png"), TINY_PNG);
  writeFileSync(path.join(album, "back.reconstructed.png"), TINY_PNG);
  writeFileSync(path.join(booster, "art.reconstructed.png"), TINY_PNG);
  writeFileSync(path.join(coleka, "album.webp"), TINY_WEBP);
  return { curated, coleka };
}

describe("Ultra Challenge reconstructed sealed products", () => {
  it("displays the Figma upscales and keeps the Coleka dump beside the album", () => {
    tmpDataRoot();
    const { curated, coleka } = stageReconstructed();
    const report = ingestUltraSealedProducts({
      curatedProductsDir: curated,
      colekaStagingDir: coleka,
    });
    expect(report).toMatchObject({ written: 2, skipped: 0 });

    const index = JSON.parse(
      readFileSync(packProductsIndexPath(NARUTO_ULTRA_PACK_ID), "utf8"),
    ) as {
      products: Record<
        string,
        { kind: string; image: string; imageBack: string | null }
      >;
    };
    expect(Object.keys(index.products).sort()).toEqual([
      "naruto/ultra-challenge::booster",
      "naruto/ultra-challenge::collector-album",
    ]);
    expect(
      index.products["naruto/ultra-challenge::collector-album"],
    ).toMatchObject({
      kind: "coffret",
      image:
        "/assets/naruto/ultra-challenge/products/collector-album/fr/art.reconstructed.png",
      imageBack:
        "/assets/naruto/ultra-challenge/products/collector-album/fr/back.reconstructed.png",
    });
    expect(index.products["naruto/ultra-challenge::booster"]).toMatchObject({
      kind: "booster",
      image:
        "/assets/naruto/ultra-challenge/products/booster/fr/art.reconstructed.png",
    });

    const albumDir = path.join(
      packSealedProductsDir(NARUTO_ULTRA_PACK_ID),
      "collector-album",
      "fr",
    );
    expect(existsSync(path.join(albumDir, "art.reconstructed.png"))).toBe(true);
    expect(existsSync(path.join(albumDir, "back.reconstructed.png"))).toBe(
      true,
    );
    expect(existsSync(path.join(albumDir, "art.coleka.webp"))).toBe(true);
    expect(existsSync(packCardsDir(NARUTO_ULTRA_PACK_ID))).toBe(false);
  });

  it("does not mint card titles from the reconstructed album verso", () => {
    expect(
      readUltraReconstructedLedger().products.map((row) => row.slug),
    ).toEqual(["collector-album", "booster"]);
  });

  it("falls back to the Coleka album when reconstructed files are absent", () => {
    tmpDataRoot();
    const curated = mkdtempSync(path.join(os.tmpdir(), "ultra-empty-"));
    const coleka = mkdtempSync(path.join(os.tmpdir(), "ultra-coleka-"));
    roots.push(curated, coleka);
    writeFileSync(path.join(coleka, "album.webp"), TINY_WEBP);

    const report = ingestUltraSealedProducts({
      curatedProductsDir: curated,
      colekaStagingDir: coleka,
    });
    expect(report.written).toBe(1);
    const index = JSON.parse(
      readFileSync(packProductsIndexPath(NARUTO_ULTRA_PACK_ID), "utf8"),
    ) as { products: Record<string, { image: string }> };
    expect(
      index.products["naruto/ultra-challenge::collector-album"]?.image,
    ).toBe(
      "/assets/naruto/ultra-challenge/products/collector-album/fr/art.coleka.webp",
    );
  });
});
