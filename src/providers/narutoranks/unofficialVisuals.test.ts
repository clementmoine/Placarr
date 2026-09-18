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

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import {
  packCardsDir,
  packProductsIndexPath,
  packSealedProductsDir,
} from "@/lib/packPaths";

import { buildNinjaRanksFromLedgers } from "./buildFromLedgers";
import {
  ingestInkworksProducts,
  readInkworksProductsLedger,
} from "./inkworksOfficial";
import { NARUTO_RANKS_PACK_ID } from "./pack";
import {
  bloggerPackRipSkippedReasons,
  installBloggerPackRip,
  readBloggerPackRipLedger,
} from "./unofficialVisuals";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "blogger-rip-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

const TINY = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function stageRip(): string {
  const staging = mkdtempSync(path.join(os.tmpdir(), "blogger-stage-"));
  roots.push(staging);
  const ledger = readBloggerPackRipLedger();
  for (const asset of ledger.assets) {
    writeFileSync(path.join(staging, asset.file), TINY);
  }
  return staging;
}

describe("Ninja Ranks unofficial dumps", () => {
  it("keeps the 3×3 pack grid and the TDmonthly tin off the catalogue", () => {
    const ledger = readBloggerPackRipLedger();
    expect(ledger.assets.map((row) => row.role).sort()).toEqual([
      "card-art",
      "card-back",
      "product-art",
    ]);
    expect(ledger.assets.some((row) => row.printed === "SD-4")).toBe(true);
    expect(bloggerPackRipSkippedReasons().join(" ")).toMatch(/collage/i);
    expect(bloggerPackRipSkippedReasons().join(" ")).toMatch(/tin/i);
  });

  it("dumps the green wrap beside the official yellow packshot, not as a SKU", () => {
    tmpDataRoot();
    const official = mkdtempSync(path.join(os.tmpdir(), "inkworks-stage-"));
    roots.push(official);
    const inkworks = readInkworksProductsLedger();
    for (const sku of inkworks.skus) {
      writeFileSync(path.join(official, sku.art), TINY);
    }
    writeFileSync(path.join(official, inkworks.logo.file), TINY);
    // Ce test porte sur le dump fan à côté du packshot éditeur : on écarte
    // les packshots curés, qui prendraient sinon la place affichée.
    ingestInkworksProducts({
      stagingDir: official,
      curatedProductsDir: path.join(official, "no-curated"),
    });

    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    buildNinjaRanksFromLedgers({ index });
    const report = installBloggerPackRip(index, { stagingDir: stageRip() });
    expect(report).toMatchObject({
      cards: 1,
      products: 1,
      backs: 1,
      skipped: [],
    });

    const boosterDir = path.join(
      packSealedProductsDir(NARUTO_RANKS_PACK_ID),
      "booster",
      "en",
    );
    expect(existsSync(path.join(boosterDir, "art.inkworks.jpg"))).toBe(true);
    expect(existsSync(path.join(boosterDir, "art.blogger.jpg"))).toBe(true);

    const products = JSON.parse(
      readFileSync(packProductsIndexPath(NARUTO_RANKS_PACK_ID), "utf8"),
    ) as {
      products: Record<string, { image: string; slug: string }>;
    };
    expect(Object.keys(products.products).sort()).toEqual([
      "naruto/ninja-ranks::booster",
      "naruto/ninja-ranks::collector-album",
      "naruto/ninja-ranks::display",
    ]);
    expect(products.products["naruto/ninja-ranks::booster"]?.image).toBe(
      "/assets/naruto/ninja-ranks/products/booster/en/art.inkworks.jpg",
    );
    expect(Object.keys(products.products).some((key) => /tin/i.test(key))).toBe(
      false,
    );
  });

  it("installs SD-4 as a blogger dump and leaves official samples alone", () => {
    tmpDataRoot();
    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    buildNinjaRanksFromLedgers({ index });
    installBloggerPackRip(index, { stagingDir: stageRip() });

    expect(index.lookupRow("naruto:sd-0004")?.art).toBe("art.blogger.jpg");
    expect(index.lookupRow("naruto:sd-0001")?.art).toBeNull();
    expect(
      existsSync(
        path.join(
          packCardsDir(NARUTO_RANKS_PACK_ID),
          "sd",
          "en",
          "0004",
          "art.blogger.jpg",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          packCardsDir(NARUTO_RANKS_PACK_ID),
          "sd",
          "en",
          "0004",
          "back.blogger.jpg",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(path.join(packCardsDir(NARUTO_RANKS_PACK_ID), "back.fr.webp")),
    ).toBe(false);
  });
});
