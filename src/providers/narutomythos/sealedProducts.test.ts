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
    // LorenZone sealed inventory (2026-09): 2 KS1 displays + special packs +
    // Itachi starters + 4 Team Sets + SS2 display + Akatsuki display×2 + Design A×2.
    expect(ledger.products.length).toBe(15);
    expect(ledger.products.every((row) => row.imageUrl.startsWith("https://"))).toBe(
      true,
    );
    expect(ledger.products.every((row) => Boolean(row.catalogueSetId))).toBe(true);
    const slugs = new Set(ledger.products.map((row) => row.slug));
    expect(slugs.has("display-konoha-shido-ch1-ed1-fr")).toBe(true);
    expect(slugs.has("display-konoha-shido-ch1-ed2-fr")).toBe(true);
    expect(slugs.has("team-set-konoha-shido-naruto")).toBe(true);
    expect(slugs.has("team-set-konoha-shido-sakura")).toBe(true);
    expect(slugs.has("team-set-konoha-shido-sasuke")).toBe(true);
    expect(slugs.has("team-set-konoha-shido-kakashi")).toBe(true);
    expect(slugs.has("special-pack-akatsuki-design-a-set3-ed1-fr")).toBe(true);
    const bySet = new Map<string, number>();
    for (const row of ledger.products) {
      const id = row.catalogueSetId ?? "";
      bySet.set(id, (bySet.get(id) ?? 0) + 1);
    }
    expect(bySet.get("ks1")).toBe(10);
    expect(bySet.get("ss2")).toBe(1);
    expect(bySet.get("ak3")).toBe(4);
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
