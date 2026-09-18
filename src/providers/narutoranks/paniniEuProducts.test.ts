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

import { packProductsIndexPath } from "@/lib/packPaths";

import { readInkworksProductsLedger } from "./inkworksOfficial";
import { NARUTO_RANKS_PACK_ID } from "./pack";
import {
  ingestNinjaRanksSealedProducts,
  readPaniniEuProductsLedger,
} from "./paniniEuProducts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "panini-eu-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

const TINY = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function tmpDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

/** JPEG officiels Inkworks en staging + packshots EU curés, dans des tmp. */
function stageBothEditions(): { staging: string; curated: string } {
  const staging = tmpDir("nr-inkworks-stage-");
  const inkworks = readInkworksProductsLedger();
  for (const sku of inkworks.skus) {
    writeFileSync(path.join(staging, sku.art), TINY);
  }
  writeFileSync(path.join(staging, inkworks.logo.file), TINY);

  const curated = tmpDir("nr-eu-curated-");
  const eu = readPaniniEuProductsLedger();
  const lang = eu.lang?.trim().toLowerCase();
  for (const sku of eu.skus) {
    const dir = path.join(curated, sku.slug, lang);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, sku.art), TINY);
    if (sku.back) writeFileSync(path.join(dir, sku.back), TINY);
  }
  return { staging, curated };
}

describe("Naruto Ninja Ranks sealed products — éditions US + EU", () => {
  it("regroupe les SKU Inkworks US et Panini EU dans un seul index", () => {
    tmpDataRoot();
    const { staging, curated } = stageBothEditions();
    const report = ingestNinjaRanksSealedProducts({
      stagingDir: staging,
      curatedProductsDir: curated,
    });
    expect(report).toMatchObject({ written: 6, skipped: 0 });

    const index = JSON.parse(
      readFileSync(packProductsIndexPath(NARUTO_RANKS_PACK_ID), "utf8"),
    ) as {
      products: Record<
        string,
        {
          slug: string;
          kind: string;
          image: string;
          imageBack: string | null;
          lang: string;
          setCode: string | null;
          catalogueSetId: string | null;
          cardsPerPack: number | null;
          packsContained: number | null;
          priceCents: number | null;
        }
      >;
    };
    expect(Object.keys(index.products).sort()).toEqual([
      "naruto/ninja-ranks::booster",
      "naruto/ninja-ranks::booster-eu",
      "naruto/ninja-ranks::collector-album",
      "naruto/ninja-ranks::collector-album-eu",
      "naruto/ninja-ranks::display",
      "naruto/ninja-ranks::display-eu",
    ]);

    // Le lot US garde sa provenance Inkworks.
    expect(index.products["naruto/ninja-ranks::booster"]).toMatchObject({
      lang: "EN",
      image: "/assets/naruto/ninja-ranks/products/booster/en/art.inkworks.jpg",
    });

    // Chaque SKU EU est rattaché au set nr et nommé d'après l'hôte du packshot.
    expect(index.products["naruto/ninja-ranks::booster-eu"]).toMatchObject({
      kind: "booster",
      lang: "fr",
      setCode: "nr",
      catalogueSetId: "nr",
      cardsPerPack: 5,
      packsContained: 1,
      priceCents: 150,
      image:
        "/assets/naruto/ninja-ranks/products/booster-eu/fr/art.paninimania.jpg",
      imageBack: null,
    });
    expect(index.products["naruto/ninja-ranks::display-eu"]).toMatchObject({
      kind: "display",
      lang: "fr",
      packsContained: 24,
      priceCents: null,
      image:
        "/assets/naruto/ninja-ranks/products/display-eu/fr/art.kleinanzeigen.jpg",
      imageBack:
        "/assets/naruto/ninja-ranks/products/display-eu/fr/back.kleinanzeigen.jpg",
    });
    expect(
      index.products["naruto/ninja-ranks::collector-album-eu"],
    ).toMatchObject({
      kind: "coffret",
      lang: "fr",
      priceCents: 260,
      image:
        "/assets/naruto/ninja-ranks/products/collector-album-eu/fr/art.paninimania.jpg",
      imageBack:
        "/assets/naruto/ninja-ranks/products/collector-album-eu/fr/back.paninimania.jpg",
    });
    expect(
      existsSync(
        path.join(
          path.dirname(packProductsIndexPath(NARUTO_RANKS_PACK_ID)),
          "products",
          "booster-eu",
          "fr",
          "art.paninimania.jpg",
        ),
      ),
    ).toBe(true);
  });

  it("saute un SKU EU dont le packshot curé manque, sans toucher au lot US", () => {
    tmpDataRoot();
    const { staging, curated } = stageBothEditions();
    rmSync(path.join(curated, "booster-eu", "fr", "art.paninimania.jpg"));
    const report = ingestNinjaRanksSealedProducts({
      stagingDir: staging,
      curatedProductsDir: curated,
    });
    expect(report.written).toBe(5);
    const index = JSON.parse(
      readFileSync(packProductsIndexPath(NARUTO_RANKS_PACK_ID), "utf8"),
    ) as { products: Record<string, unknown> };
    expect(index.products["naruto/ninja-ranks::booster-eu"]).toBeUndefined();
    expect(index.products["naruto/ninja-ranks::booster"]).toBeDefined();
  });
});
