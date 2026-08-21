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
import { packCardsDir, packProductsIndexPath } from "@/lib/packPaths";

import { buildNinjaRanksFromLedgers } from "./buildFromLedgers";
import {
  inkworksHarvestList,
  inkworksSkippedFiles,
  inkworksWaybackRawUrl,
  ingestInkworksProducts,
  installInkworksSampleFaces,
  readInkworksProductsLedger,
} from "./inkworksOfficial";
import { NARUTO_RANKS_PACK_ID } from "./pack";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "inkworks-official-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

const TINY = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function stageOfficialJpegs(): string {
  const staging = mkdtempSync(path.join(os.tmpdir(), "inkworks-stage-"));
  roots.push(staging);
  const ledger = readInkworksProductsLedger();
  for (const sku of ledger.skus) {
    writeFileSync(path.join(staging, sku.art), TINY);
  }
  writeFileSync(path.join(staging, ledger.logo.file), TINY);
  for (const sample of ledger.sampleCards) {
    writeFileSync(path.join(staging, sample.file), TINY);
  }
  return staging;
}

describe("Inkworks official assets", () => {
  it("dumps every official JPEG into staging; ingest still skips the marketing", () => {
    const ledger = readInkworksProductsLedger();
    expect(ledger.skus.map((row) => row.slug)).toEqual([
      "booster",
      "display",
      "collector-album",
    ]);
    expect(inkworksHarvestList(ledger).map((row) => row.file)).toEqual(
      Object.keys(ledger.captures).sort(),
    );
    expect(inkworksSkippedFiles(ledger)).toEqual([
      "nnrsetssm.jpg",
      "nnrcard1sm.jpg",
      "nnrcard1med.jpg",
      "nnrpism.jpg",
      "nnrpimed2.jpg",
      "paninilogosm.jpg",
    ]);
    expect(inkworksHarvestList(ledger).map((row) => row.file)).toEqual(
      expect.arrayContaining(inkworksSkippedFiles(ledger)),
    );
    expect(inkworksWaybackRawUrl(ledger.captures["nnrwrapmed.jpg"]!)).toBe(
      "https://web.archive.org/web/20060624044103id_/http://inkworks.com/images/productsimg/naruto/ninjaranks/nnrwrapmed.jpg",
    );
  });

  it("writes booster, display and album as sealed products, not as cards", () => {
    tmpDataRoot();
    const staging = stageOfficialJpegs();
    const report = ingestInkworksProducts({ stagingDir: staging });
    expect(report.written).toBe(3);
    expect(report.skipped).toBe(0);

    const index = JSON.parse(
      readFileSync(packProductsIndexPath(NARUTO_RANKS_PACK_ID), "utf8"),
    ) as {
      products: Record<
        string,
        { slug: string; kind: string; image: string; name: string }
      >;
    };
    expect(Object.keys(index.products).sort()).toEqual([
      "naruto/ninja-ranks::booster",
      "naruto/ninja-ranks::collector-album",
      "naruto/ninja-ranks::display",
    ]);
    expect(index.products["naruto/ninja-ranks::booster"]).toMatchObject({
      kind: "booster",
      name: "Naruto: Ninja Ranks booster pack",
      image: "/assets/naruto/ninja-ranks/products/booster/en/art.inkworks.jpg",
    });
    expect(index.products["naruto/ninja-ranks::display"].kind).toBe("display");
    expect(index.products["naruto/ninja-ranks::collector-album"].kind).toBe(
      "coffret",
    );
    expect(
      existsSync(path.join(packCardsDir(NARUTO_RANKS_PACK_ID), "booster")),
    ).toBe(false);
  });

  it("installs only the two attested sample faces", () => {
    tmpDataRoot();
    const staging = stageOfficialJpegs();
    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    buildNinjaRanksFromLedgers({ index });
    const faces = installInkworksSampleFaces(index, { stagingDir: staging });
    expect(faces).toEqual({ installed: 2, skipped: [] });
    expect(index.lookupRow("naruto:sd-0001")?.art).toBe("art.inkworks.jpg");
    expect(index.lookupRow("naruto:bl-0001")?.art).toBe("art.inkworks.jpg");
    expect(index.lookupRow("naruto:nr-0001")?.art).toBeNull();
    expect(
      existsSync(
        path.join(
          packCardsDir(NARUTO_RANKS_PACK_ID),
          "sd",
          "0001",
          "en",
          "art.inkworks.jpg",
        ),
      ),
    ).toBe(true);
  });

  it("attests sell-sheet UPCs without minting a case SKU", () => {
    const { sellSheet, skus } = readInkworksProductsLedger();
    expect(skus.map((row) => row.slug)).not.toContain("case");
    expect(upcAChecksumOk(sellSheet.upc.pack)).toBe(true);
    expect(upcAChecksumOk(sellSheet.upc.display)).toBe(true);
    expect(upcAChecksumOk(sellSheet.upc.case)).toBe(true);
    expect(upcAChecksumOk(sellSheet.upc.album)).toBe(true);
    expect(upcAChecksumOk(sellSheet.upc.albumCase)).toBe(true);
    expect(sellSheet.upc.pack).toBe("080557205523");
    expect(sellSheet.upc.album).toBe("080557205516");
  });
});

function upcAChecksumOk(digits: string): boolean {
  if (!/^\d{12}$/.test(digits)) return false;
  const body = digits.slice(0, 11);
  let odd = 0;
  let even = 0;
  for (let i = 0; i < body.length; i += 1) {
    const n = Number(body[i]);
    if (i % 2 === 0) odd += n;
    else even += n;
  }
  const check = (10 - ((odd * 3 + even) % 10)) % 10;
  return check === Number(digits[11]);
}
