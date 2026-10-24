import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

import { loadSealedProductsIndex } from "@/providers/shared/sealedProducts/persistProductsIndex";

import { narutoCardgameCuratedDir } from "./pack";
import {
  ingestNarutoCardgameSealedProducts,
  readNarutoCardgameSealedLedger,
} from "./sealed";

describe("naruto cardgame sealed", () => {
  it("ships Pixel Heart FR display packshot", () => {
    const art = path.join(
      narutoCardgameCuratedDir(),
      "products",
      "display-launch-fr",
      "fr",
      "art.pixelheart.webp",
    );
    expect(existsSync(art)).toBe(true);
    const ledger = readNarutoCardgameSealedLedger();
    expect(ledger?.products.map((p) => p.slug)).toEqual(["display-launch-fr"]);
  });

  it("writes the FR display into data/naruto/cardgame products-index", () => {
    const out = ingestNarutoCardgameSealedProducts();
    expect(out.written).toBeGreaterThanOrEqual(1);
    expect(out.skipped).toBe(0);
    const index = loadSealedProductsIndex("naruto/cardgame");
    const display = index.products["naruto/cardgame::display-launch-fr"];
    expect(display).toMatchObject({
      slug: "display-launch-fr",
      kind: "display",
      category: "displays",
      lang: "fr",
      setCode: "launch",
      priceCents: 17999,
      packsContained: null,
      cardsPerPack: null,
    });
    expect(display?.image).toContain(
      "/assets/naruto/cardgame/products/display-launch-fr/fr/face",
    );
    expect(display?.path).toContain("pixelheart.eu");
  });
});
