import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { extractCardVisualSignals } from "@/core/identify/cardVisualSignals";
import { CARD_ART_BAND } from "@/core/identify/embedMath";

import {
  buildProductVisualIndex,
  listProductArtFaces,
  makeProductKey,
  matchProductVisualHash,
  parseProductKey,
  productVisualIndexPath,
  type ProductVisualIndexFile,
} from "./productVisualIndex";

vi.mock("@/core/identify/cardVisualSignals", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@/core/identify/cardVisualSignals")>();
  return {
    ...mod,
    extractCardVisualSignals: vi.fn(mod.extractCardVisualSignals),
  };
});
const signalsSpy = vi.mocked(extractCardVisualSignals);

const PACK = "demo/sealed";
let root: string;
let prevDataDir: string | undefined;

async function packshot(seed: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 160,
      height: 220,
      channels: 3,
      background: { r: (seed * 40) % 255, g: 30, b: 200 - seed * 15 },
    },
  })
    .jpeg()
    .toBuffer();
}

beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), "placarr-product-visual-"));
  prevDataDir = process.env.PLACARR_DATA_DIR;
  process.env.PLACARR_DATA_DIR = root;

  const packDir = path.join(root, ...PACK.split("/"));
  const a = path.join(packDir, "products", "booster-box", "fr");
  const b = path.join(packDir, "products", "etb", "en");
  mkdirSync(a, { recursive: true });
  mkdirSync(b, { recursive: true });
  writeFileSync(path.join(a, "art.official.webp"), await packshot(1));
  writeFileSync(path.join(a, "art.coleka.webp"), await packshot(2));
  writeFileSync(
    path.join(a, "face.json"),
    JSON.stringify({ art: "art.coleka.webp" }, null, 2),
  );
  writeFileSync(path.join(b, "art.webp"), await packshot(3));
});

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.PLACARR_DATA_DIR;
  else process.env.PLACARR_DATA_DIR = prevDataDir;
  rmSync(root, { recursive: true, force: true });
});

describe("productKey helpers", () => {
  it("round-trips packId::slug (nested pack ids)", () => {
    const key = makeProductKey("naruto/carddass", "booster-s1");
    expect(key).toBe("naruto/carddass::booster-s1");
    expect(parseProductKey(key)).toEqual({
      packId: "naruto/carddass",
      slug: "booster-s1",
    });
  });
});

describe("listProductArtFaces", () => {
  it("prefers face.json winner first", () => {
    const dir = path.join(root, ...PACK.split("/"), "products", "booster-box", "fr");
    expect(listProductArtFaces(dir)[0]).toBe("art.coleka.webp");
    expect(listProductArtFaces(dir)).toContain("art.official.webp");
  });
});

describe("buildProductVisualIndex", () => {
  it("walks products/{slug}/{lang}/art.* with full-frame signals", async () => {
    signalsSpy.mockClear();
    const file = await buildProductVisualIndex({ packId: PACK, write: true });
    expect(file.entries.length).toBeGreaterThanOrEqual(3);
    expect(file.entries.every((e) => e.productKey.startsWith(`${PACK}::`))).toBe(
      true,
    );
    expect(file.entries.every((e) => e.artRel.startsWith("products/"))).toBe(
      true,
    );
    expect(file.entries.every((e) => e.aHash && e.color && e.fp)).toBe(true);
    // Never art-band: every signal call must pass artBand: false.
    expect(signalsSpy.mock.calls.length).toBeGreaterThan(0);
    for (const call of signalsSpy.mock.calls) {
      expect(call[1]).toEqual({ artBand: false });
    }
    expect(CARD_ART_BAND.top).toBeGreaterThan(0); // band still exists for cards
    expect(productVisualIndexPath(PACK)).toContain("product-visual-index.json");
  });

  it("reuses fingerprints on a second build (no re-decode)", async () => {
    signalsSpy.mockClear();
    const second = await buildProductVisualIndex({ packId: PACK });
    expect(signalsSpy).not.toHaveBeenCalled();
    expect(second.entries.length).toBeGreaterThanOrEqual(3);
  });
});

describe("matchProductVisualHash", () => {
  it("returns nearest neighbours under maxDistance", () => {
    const index: ProductVisualIndexFile = {
      version: 1,
      packId: PACK,
      lang: "fr",
      builtAt: "2026-11-08T00:00:00.000Z",
      entries: [
        {
          productKey: `${PACK}::booster-box`,
          lang: "fr",
          slug: "booster-box",
          artRel: "products/booster-box/fr/art.webp",
          hash: "0".repeat(64),
        },
        {
          productKey: `${PACK}::etb`,
          lang: "en",
          slug: "etb",
          artRel: "products/etb/en/art.webp",
          hash: "1".repeat(64),
        },
      ],
    };
    const hits = matchProductVisualHash("0".repeat(60) + "1111", index, {
      limit: 3,
      maxDistance: 10,
    });
    expect(hits[0]?.productKey).toBe(`${PACK}::booster-box`);
    expect(hits[0]?.slug).toBe("booster-box");
  });
});
