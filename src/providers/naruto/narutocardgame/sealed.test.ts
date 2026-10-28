import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

import { loadSealedProductsIndex } from "@/providers/shared/sealedProducts/persistProductsIndex";

import { narutoCardgameCuratedDir } from "./curatedPaths";
import {
  ingestNarutoCardgameSealedProducts,
  readNarutoCardgameSealedLedger,
} from "./sealed";

const EXPECTED_SLUGS = [
  "display-launch-fr",
  "display-launch-en",
  "display-launch-jp",
  "case-launch-jp",
  "premium-chakra-vol00-jp",
] as const;

describe("naruto cardgame sealed", () => {
  it("ships launch displays FR/EN/JP + case JP + Fest premium in ledger", () => {
    expect(
      existsSync(
        path.join(
          narutoCardgameCuratedDir(),
          "products",
          "display-launch-fr",
          "fr",
          "art.pixelheart.webp",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          narutoCardgameCuratedDir(),
          "products",
          "display-launch-en",
          "en",
          "art.pixelheart.webp",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          narutoCardgameCuratedDir(),
          "products",
          "display-launch-jp",
          "ja",
          "art.deckdynastie.webp",
        ),
      ),
    ).toBe(true);
    const ledger = readNarutoCardgameSealedLedger();
    expect(ledger?.products.map((p) => p.slug)).toEqual([...EXPECTED_SLUGS]);
  });

  it("writes all sealed SKUs into products-index", async () => {
    const { ensureBandaiFestPremiumPackshot } = await import(
      "./sources/bandaiFestPremium"
    );
    await ensureBandaiFestPremiumPackshot();
    const out = ingestNarutoCardgameSealedProducts();
    expect(out.written).toBeGreaterThanOrEqual(EXPECTED_SLUGS.length);
    expect(out.skipped).toBe(0);
    const index = loadSealedProductsIndex("naruto/cardgame");

    const fr = index.products["naruto/cardgame::display-launch-fr"];
    expect(fr).toMatchObject({
      slug: "display-launch-fr",
      kind: "display",
      lang: "fr",
      setCode: "launch",
      priceCents: 17999,
    });
    expect(fr?.path).toContain("pixelheart.eu");

    const en = index.products["naruto/cardgame::display-launch-en"];
    expect(en).toMatchObject({
      slug: "display-launch-en",
      kind: "display",
      lang: "en",
      priceCents: 17999,
    });
    expect(en?.path).toContain("english");

    const jpDisplay = index.products["naruto/cardgame::display-launch-jp"];
    expect(jpDisplay).toMatchObject({
      slug: "display-launch-jp",
      kind: "display",
      lang: "ja",
      priceCents: 10000,
    });
    expect(jpDisplay?.path).toContain("58417751195992");

    const jpCase = index.products["naruto/cardgame::case-launch-jp"];
    expect(jpCase).toMatchObject({
      slug: "case-launch-jp",
      kind: "case",
      lang: "ja",
      priceCents: 120000,
    });
    expect(jpCase?.path).toContain("58417751228760");

    const premium = index.products["naruto/cardgame::premium-chakra-vol00-jp"];
    expect(premium).toMatchObject({
      slug: "premium-chakra-vol00-jp",
      lang: "ja",
      setCode: "premium00",
      declaredCardCount: 6,
    });
  });
});
