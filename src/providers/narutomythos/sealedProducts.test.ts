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

import { readLorenzoneProductsLedger } from "./sealedProducts";
import { NARUTO_MYTHOS_PACK_ID, narutoMythosCuratedDir } from "./pack";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "mythos-sealed-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("lorenzone products ledger", () => {
  it("lists sealed Mythos SKUs with packshots", () => {
    const ledger = readLorenzoneProductsLedger();
    expect(ledger.products.length).toBeGreaterThanOrEqual(3);
    expect(ledger.products.every((row) => row.imageUrl.startsWith("https://"))).toBe(
      true,
    );
    const ks1Display = ledger.products.find((row) =>
      row.slug.includes("konoha-shido"),
    );
    expect(ks1Display?.catalogueSetId).toBe("ks1");
  });

  it("writes products-index when packshots are staged", async () => {
    tmpDataRoot();
    const ledger = readLorenzoneProductsLedger();
    const partial = { ...ledger, products: ledger.products.slice(0, 2) };
    const curated = narutoMythosCuratedDir();
    for (const product of partial.products) {
      const dest = path.join(
        curated,
        "products",
        product.slug,
        product.lang,
        "art.lorenzone.png",
      );
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, TINY_PNG);
    }
    const { ingestMythosSealedProducts } = await import("./sealedProducts");
    const report = await ingestMythosSealedProducts({ ledger: partial });
    expect(report.written).toBe(2);
    const index = JSON.parse(
      readFileSync(packProductsIndexPath(NARUTO_MYTHOS_PACK_ID), "utf8"),
    ) as { products: Record<string, unknown> };
    expect(Object.keys(index.products).length).toBe(2);
    for (const key of Object.keys(index.products)) {
      const entry = index.products[key] as { image: string | null };
      expect(entry.image).toMatch(/^\/assets\/naruto\/mythos\//);
    }
  });
});
