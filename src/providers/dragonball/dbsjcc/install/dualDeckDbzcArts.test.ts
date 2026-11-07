import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { packSealedProductsDir } from "@/lib/packPaths";

import { DBS_JCC_PACK_ID } from "../pack";

function artPath(slug: string, file = "art.dbzcollection.jpg"): string {
  return path.join(packSealedProductsDir(DBS_JCC_PACK_ID), slug, "fr", file);
}

function md5(file: string): string {
  return createHash("md5").update(readFileSync(file)).digest("hex");
}

/**
 * Regression: dbzc numeric packaging ids for dual decks were swapped onto the
 * wrong thematic SKU. After re-home, each dual has its own dbzc front and the
 * Super-Saiyans SKU must not keep a fake "back" that is another Super-Saiyans front.
 */
describe("dbsjcc dual-deck dbzc arts", () => {
  it("keeps dbzc fronts on both decks of each S1–S5 dual pair", () => {
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ["part1-starter-1190", "part1-starter-ennemis"],
      ["part2-starter-1193", "part2-starter-ruban-rouge"],
      ["part3-starter-1197", "part3-starter-championnat"],
      ["part4-starter-1200", "part4-starter-forces-du-mal"],
      ["part5-starter-1203", "part5-starter-resistance"],
    ];
    for (const [a, b] of pairs) {
      const pa = artPath(a);
      const pb = artPath(b);
      expect(existsSync(pa), pa).toBe(true);
      expect(existsSync(pb), pb).toBe(true);
      expect(md5(pa), `${a} vs ${b}`).not.toBe(md5(pb));
    }
  });

  it("does not keep a Super-Saiyans front mislabeled as imageBack", () => {
    expect(existsSync(artPath("part1-starter-1190", "back.dbzcollection.jpg"))).toBe(
      false,
    );
  });
});
