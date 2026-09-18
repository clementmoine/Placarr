import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { packCardsDir, packProductsIndexPath } from "@/lib/packPaths";

import { ingestColekaAlbum, readColekaAlbumLedger } from "./colekaAlbum";
import { NARUTO_ULTRA_PACK_ID } from "./pack";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "coleka-album-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

const TINY_WEBP = Buffer.from("RIFF....WEBP", "ascii");

describe("Ultra Challenge Coleka album", () => {
  it("mints the album as a sealed SKU without inventing cards", () => {
    tmpDataRoot();
    const ledger = readColekaAlbumLedger();
    expect(ledger.sku.slug).toBe("collector-album");
    expect(ledger.printedUrl).toBe("www.paninigroup.com");

    const staging = mkdtempSync(path.join(os.tmpdir(), "coleka-stage-"));
    roots.push(staging);
    writeFileSync(path.join(staging, ledger.sku.file), TINY_WEBP);

    const report = ingestColekaAlbum({ stagingDir: staging });
    expect(report).toMatchObject({ written: 1, skipped: 0 });

    const index = JSON.parse(
      readFileSync(packProductsIndexPath(NARUTO_ULTRA_PACK_ID), "utf8"),
    ) as {
      products: Record<string, { kind: string; image: string; name: string }>;
    };
    expect(Object.keys(index.products)).toEqual([
      "naruto/ultra-challenge::collector-album",
    ]);
    expect(
      index.products["naruto/ultra-challenge::collector-album"],
    ).toMatchObject({
      kind: "coffret",
      name: "Naruto Ultra Challenge collector's album",
      image:
        "/assets/naruto/ultra-challenge/products/collector-album/fr/art.coleka.webp",
    });
    expect(existsSync(packCardsDir(NARUTO_ULTRA_PACK_ID))).toBe(false);
  });
});
