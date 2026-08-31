import { describe, expect, it } from "vitest";

import {
  starterBoxAccessories,
  starterBoxAccessoriesLedger,
} from "./starterBoxAccessories";

describe("Carddass FR starter box accessories", () => {
  it("attests S1–S2 box extras without making the 40 cards known", () => {
    const sku = starterBoxAccessories("s1");
    expect(sku).toEqual({
      cardCount: 40,
      livretDeJeu: "per-starter",
      plateauDeJeu: "per-starter",
      jetons: 6,
      jetonNarutoAmongTokens: true,
      livretCartesACollectionner: "per-series",
    });
    expect(starterBoxAccessories("s2")?.livretCartesACollectionner).toBe(
      "per-series",
    );
    expect(starterBoxAccessories("s3")).toBeNull();
    expect(starterBoxAccessories("s5")).toBeNull();
  });

  it("keeps the seller's missing Technique / tokens as that copy, not the SKU", () => {
    const ledger = starterBoxAccessoriesLedger();
    expect(ledger.sku.jetons).toBe(6);
    expect(ledger.sku.livretCollectionCoversBothStarters).toBe(true);
    const konoha = ledger.thisCopy.find(
      (row) => row.slug === "starter-detruire-konoha",
    );
    expect(konoha?.cards).toBe("incomplete");
    expect(konoha?.cardsNote).toMatch(/that copy, not the SKU/);
    expect(ledger.sku.cardCount).toBe(40);
  });
});
