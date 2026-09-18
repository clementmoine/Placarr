import { describe, expect, it } from "vitest";

import { backfillSealedProductSetLogos } from "./backfillLogos";
import type { SealedProductEntry } from "./indexFormat";

function entry(
  partial: Partial<SealedProductEntry> & Pick<SealedProductEntry, "slug">,
): SealedProductEntry {
  return {
    path: "",
    kind: "display",
    behavior: "pack_container",
    category: "displays",
    name: null,
    image: null,
    imageBack: null,
    setCardCount: null,
    setLogo: null,
    setCode: null,
    catalogueSetId: null,
    lang: "fr",
    releaseDate: null,
    priceCents: null,
    cardsPerPack: null,
    packsContained: null,
    guaranteedPrints: [],
    randomPoolScope: "unknown",
    randomPoolPrints: [],
    declaredCardCount: null,
    contentsKnown: false,
    containsPrintsIsPreview: true,
    prints: [],
    ...partial,
  };
}

describe("backfillSealedProductSetLogos", () => {
  it("fills empty logos via the pack owner without overwriting", () => {
    const products = {
      "pokemon::a": entry({
        slug: "booster-foudre-noire-zekrom",
        setCode: "BLK",
        name: "Booster",
      }),
      "pokemon::b": entry({
        slug: "already",
        setLogo: "https://keep.example/logo.png",
        setCode: "BLK",
      }),
    };
    /*
      Le module pokemon réel lit le cache TCGdex disque — on ne l'assert pas
      ici (environnement). On vérifie seulement qu'un pack inconnu ne touche
      rien et qu'une entrée déjà logoée reste intacte.
    */
    backfillSealedProductSetLogos("no-such-pack", products);
    expect(products["pokemon::b"]?.setLogo).toBe(
      "https://keep.example/logo.png",
    );
    expect(products["pokemon::a"]?.setLogo).toBeNull();
  });
});
