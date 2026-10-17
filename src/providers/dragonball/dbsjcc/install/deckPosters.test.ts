import { describe, expect, it } from "vitest";

import { loadSealedProductsIndex } from "@/providers/shared/sealedProducts/persistProductsIndex";

import { DBS_JCC_PACK_ID } from "../pack";
import {
  installDbsjccDeckPosters,
  isDbsjccPosterSealedSlug,
} from "./deckPosters";

describe("dbsjcc deck posters", () => {
  it("recognises poster sealed slugs", () => {
    expect(isDbsjccPosterSealedSlug("part9-poster-1217")).toBe(true);
    expect(isDbsjccPosterSealedSlug("part9-starter-1216")).toBe(false);
  });

  it("attaches the Héros poster on the Série 9 starter", () => {
    const report = installDbsjccDeckPosters();
    expect(report.missing).toEqual([]);
    expect(report.attached + report.purged).toBeGreaterThanOrEqual(1);

    const again = installDbsjccDeckPosters();
    expect(again.attached).toBe(1);
    expect(again.purged).toBe(0);

    const index = loadSealedProductsIndex(DBS_JCC_PACK_ID);
    const heros = Object.values(index.products).find(
      (row) => row.slug === "part9-starter-1216",
    );
    expect(heros?.poster).toMatch(
      /\/assets\/dragonball\/jcc\/products\/part9-starter-1216\/fr\/poster\.dbzcollection\.jpg$/,
    );
    expect(
      Object.values(index.products).some((row) =>
        isDbsjccPosterSealedSlug(row.slug),
      ),
    ).toBe(false);
  });
});
