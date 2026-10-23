import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

import { loadSealedProductsIndex } from "@/providers/shared/sealedProducts/persistProductsIndex";

import {
  ingestLeclercSealedProducts,
  leclercCuratedProductsDir,
  readLeclercSealedLedger,
} from "./sealed";
import { LECLERC_ACTIVE_OPS } from "./pack";

describe("leclerc disney25 sealed products", () => {
  it("ships curated album + pochette packshots", () => {
    const ledger = readLeclercSealedLedger("disney25");
    expect(ledger?.products.map((p) => p.slug)).toEqual([
      "collector-album",
      "pochette",
    ]);
    expect(
      existsSync(
        path.join(
          leclercCuratedProductsDir("disney25"),
          "collector-album",
          "fr",
          "art.scan.png",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          leclercCuratedProductsDir("disney25"),
          "pochette",
          "fr",
          "art.scan.png",
        ),
      ),
    ).toBe(true);
    const pochette = ledger?.products.find((p) => p.slug === "pochette");
    expect(pochette).toMatchObject({
      kind: "booster",
      cardsPerPack: 4,
      declaredCardCount: 4,
      name: "Pochette — Découvre la magie de Disney",
    });
  });

  it("writes album + pochette (+ display stub) into products-index", () => {
    const out = ingestLeclercSealedProducts("disney25");
    expect(out.written).toBe(3);
    expect(out.skipped).toBe(0);
    const index = loadSealedProductsIndex("leclerc/disney25");
    const album = index.products["leclerc/disney25::collector-album"];
    const pochette = index.products["leclerc/disney25::pochette"];
    const display = index.products["leclerc/disney25::display"];
    expect(album).toMatchObject({
      slug: "collector-album",
      kind: "coffret",
      category: "albums",
      lang: "fr",
      name: "Album — Découvre la magie de Disney",
    });
    expect(album?.image).toContain(
      "/assets/leclerc/disney25/products/collector-album/fr/art.scan.png",
    );
    expect(album?.imageBack).toContain(
      "/assets/leclerc/disney25/products/collector-album/fr/back.scan.png",
    );
    expect(pochette).toMatchObject({
      slug: "pochette",
      kind: "booster",
      category: "boosters",
      lang: "fr",
      name: "Pochette — Découvre la magie de Disney",
      cardsPerPack: 4,
      packsContained: 1,
    });
    expect(pochette?.packComposition).toMatchObject({
      provenance: "structural",
      cardsPerPack: 4,
      slots: [
        {
          id: "card",
          count: 4,
          kind: "dedicated",
          rarities: ["card"],
        },
      ],
      possibleChase: ["Fixeez"],
    });
    expect(pochette?.image).toContain(
      "/assets/leclerc/disney25/products/pochette/fr/art.scan.png",
    );
    expect(display).toMatchObject({
      slug: "display",
      kind: "display",
      category: "displays",
      cardsPerPack: 4,
      packsContained: null,
      image: null,
    });
  });
});

describe("leclerc sealed seed stubs", () => {
  it.each(LECLERC_ACTIVE_OPS.map((op) => op.setCode))(
    "seeds album + pochette + display for %s (art optional)",
    (setCode) => {
      const out = ingestLeclercSealedProducts(setCode);
      expect(out.written).toBeGreaterThanOrEqual(3);
      expect(out.file).toBeTruthy();
      const index = loadSealedProductsIndex(`leclerc/${setCode}`);
      expect(index.products[`leclerc/${setCode}::collector-album`]).toMatchObject({
        slug: "collector-album",
        kind: "coffret",
        category: "albums",
      });
      expect(index.products[`leclerc/${setCode}::pochette`]).toMatchObject({
        slug: "pochette",
        kind: "booster",
        cardsPerPack: 4,
        packsContained: 1,
      });
      expect(index.products[`leclerc/${setCode}::display`]).toMatchObject({
        slug: "display",
        kind: "display",
        cardsPerPack: 4,
        packsContained: null,
      });
    },
  );

  it("seeds Star Wars ops even when the catalogue line is still disabled", () => {
    const out = ingestLeclercSealedProducts("sw19");
    expect(out.written).toBe(3);
    const index = loadSealedProductsIndex("leclerc/sw19");
    expect(index.products["leclerc/sw19::pochette"]?.name).toBe(
      "Pochette — Maîtriser la Force",
    );
    expect(index.products["leclerc/sw19::display"]?.image).toBeNull();
  });
});
