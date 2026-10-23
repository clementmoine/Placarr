import { describe, expect, it } from "vitest";

import {
  backfillSealedProductSetLogos,
  boutiqueCodeToCatalogueSetId,
  sealedGuaranteedPrintSignature,
  sealedProductSlugFamily,
  uniqueChapterSetFromGuarantees,
} from "./backfillLogos";
import type { SealedProductEntry } from "./indexFormat";

function entry(
  partial: Partial<SealedProductEntry> & Pick<SealedProductEntry, "slug">,
): SealedProductEntry {
  return {
    path: "",
    kind: "collector_box",
    behavior: "mixed_bundle",
    category: "collector-boxes",
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
    randomPoolScope: "none",
    randomPoolPrints: [],
    declaredCardCount: null,
    contentsKnown: false,
    containsPrintsIsPreview: true,
    prints: [],
    ...partial,
  };
}

describe("sealedProductSlugFamily", () => {
  it("strips locale suffixes so FR/EN twins share a family", () => {
    expect(sealedProductSlugFamily("collection-starter-set-collector_box-en")).toBe(
      "collection-starter-set-collector_box",
    );
    expect(sealedProductSlugFamily("collection-starter-set-collector_box")).toBe(
      "collection-starter-set-collector_box",
    );
  });
});

describe("uniqueChapterSetFromGuarantees", () => {
  it("reads the unique chapter from in-set promos", () => {
    expect(
      uniqueChapterSetFromGuarantees(
        entry({
          slug: "scrooge",
          guaranteedPrints: [
            {
              name: "Scrooge",
              slug: "x",
              ref: null,
              printKey: "lorcana:10-36-p3",
            },
          ],
        }),
      ),
    ).toBe("10");
  });

  it("refuses standalone promo groupings (D23)", () => {
    expect(
      uniqueChapterSetFromGuarantees(
        entry({
          slug: "d23",
          guaranteedPrints: [
            {
              name: "Mickey",
              slug: "x",
              ref: null,
              printKey: "lorcana:1-1-d23",
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("refuses Naruto window promos keyed under set promo", () => {
    expect(
      uniqueChapterSetFromGuarantees(
        entry({
          slug: "duopack-s28",
          setCode: "s28",
          guaranteedPrints: [
            {
              name: "PR-096",
              slug: "x",
              ref: null,
              printKey: "naruto:promo-pr0096",
            },
          ],
        }),
      ),
    ).toBeNull();
  });
});

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
    backfillSealedProductSetLogos("no-such-pack", products);
    expect(products["pokemon::b"]?.setLogo).toBe(
      "https://keep.example/logo.png",
    );
    expect(products["pokemon::a"]?.setLogo).toBeNull();
  });

  it("copies price across same retail role (display set × packs)", () => {
    const products = {
      "lorcana::fr": entry({
        slug: "display-24-boosters-set-9-fabuleux",
        kind: "display",
        behavior: "pack_container",
        catalogueSetId: "9",
        packsContained: 24,
        priceCents: 12600,
        lang: "fr",
      }),
      "lorcana::en": entry({
        slug: "fabled-display-en",
        kind: "display",
        behavior: "pack_container",
        catalogueSetId: "9",
        packsContained: 24,
        priceCents: null,
        lang: "en",
      }),
    };
    backfillSealedProductSetLogos("no-such-pack", products);
    expect(products["lorcana::en"]?.priceCents).toBe(12600);
  });

  it("estimates trove price from cheapest booster × packsContained", () => {
    const products = {
      "lorcana::booster": entry({
        slug: "booster-set-7",
        kind: "booster",
        behavior: "random_pack",
        catalogueSetId: "7",
        packsContained: 1,
        priceCents: 340,
        lang: "fr",
      }),
      "lorcana::trove": entry({
        slug: "archazias-island-trove-en",
        kind: "trove",
        behavior: "mixed_bundle",
        catalogueSetId: "7",
        packsContained: 8,
        priceCents: null,
        lang: "en",
      }),
    };
    backfillSealedProductSetLogos("no-such-pack", products);
    expect(products["lorcana::trove"]?.priceCents).toBe(2720);
  });

  it("estimates ETB / special from booster × packsContained", () => {
    const products = {
      "poke::booster": entry({
        slug: "booster-sv02",
        kind: "booster",
        behavior: "random_pack",
        catalogueSetId: "sv02",
        packsContained: 1,
        priceCents: 450,
      }),
      "poke::etb": entry({
        slug: "coffret-dresseur-elite-sv02",
        kind: "etb",
        behavior: "mixed_bundle",
        catalogueSetId: "sv02",
        packsContained: 9,
        priceCents: null,
      }),
      "poke::special": entry({
        slug: "offre-special-portfolio",
        kind: "special",
        behavior: "mixed_bundle",
        catalogueSetId: "sv02",
        packsContained: 2,
        priceCents: null,
      }),
    };
    backfillSealedProductSetLogos("no-such-pack", products);
    expect(products["poke::etb"]?.priceCents).toBe(4050);
    expect(products["poke::special"]?.priceCents).toBe(900);
  });

  it("copies logos across locale twins and shared guarantee lists", () => {
    const products = {
      "lorcana::fr": entry({
        slug: "collection-starter-set-collector_box",
        lang: "fr",
      }),
      "lorcana::en": entry({
        slug: "collection-starter-set-collector_box-en",
        lang: "en",
        setLogo: "https://example.test/fabled.png",
        catalogueSetId: "9",
      }),
      "lorcana::elsa-fr": entry({
        slug: "coffret-cadeau-fabuleux-elsa",
        name: "Coffret cadeau Fabuleux Elsa",
        priceCents: 4499,
        setLogo: "/assets/lorcana/products/sets/set9/logo.png",
        catalogueSetId: "9",
        guaranteedPrints: [
          {
            name: "Elsa",
            slug: "e",
            ref: null,
            printKey: "lorcana:5-6-p3",
          },
        ],
      }),
      "lorcana::elsa-en": entry({
        slug: "elsa-gift-box-collector_box-en",
        lang: "en",
        name: "",
        priceCents: null,
        guaranteedPrints: [
          {
            name: "Elsa",
            slug: "e",
            ref: null,
            printKey: "lorcana:5-6-p3",
          },
        ],
      }),
    };

    backfillSealedProductSetLogos("no-such-pack", products);

    expect(products["lorcana::fr"]?.setLogo).toBe(
      "https://example.test/fabled.png",
    );
    expect(products["lorcana::fr"]?.catalogueSetId).toBe("9");
    expect(products["lorcana::elsa-en"]?.setLogo).toBe(
      "/assets/lorcana/products/sets/set9/logo.png",
    );
    expect(products["lorcana::elsa-en"]?.priceCents).toBe(4499);
    expect(products["lorcana::elsa-en"]?.name).toBe(
      "Coffret cadeau Fabuleux Elsa",
    );
    expect(sealedGuaranteedPrintSignature(products["lorcana::elsa-fr"]!)).toBe(
      sealedGuaranteedPrintSignature(products["lorcana::elsa-en"]!),
    );
  });

  it("maps boutique WHW decks onto catalogue set 10 for buy advice", () => {
    const products = {
      "lorcana::deck": entry({
        slug: "set-10-lueurs-deck-simba",
        setCode: "WHW",
        packsBySet: { WHW: 1 },
        guaranteedPrints: [
          {
            name: "Simba",
            slug: "s",
            ref: null,
            printKey: "lorcana:10-70",
          },
        ],
      }),
      "lorcana::display": entry({
        slug: "display-24-boosters-set-10-lueurs",
        setCode: "WHW",
        packsBySet: { WHW: 24 },
        kind: "display",
        behavior: "pack_container",
      }),
    };

    // Avoid pack "lorcana" — resolveSetLogo may touch a local catalog.sqlite.
    backfillSealedProductSetLogos("no-such-pack", products);

    expect(products["lorcana::deck"]).toMatchObject({
      catalogueSetId: "10",
      packsBySet: { "10": 1 },
      guaranteeSets: ["10"],
    });
    expect(products["lorcana::display"]?.catalogueSetId).toBe("10");
    expect(products["lorcana::display"]?.packsBySet).toEqual({ "10": 24 });
  });
});

describe("boutiqueCodeToCatalogueSetId", () => {
  it("keeps a unique boutique→catalogue vote", () => {
    const map = boutiqueCodeToCatalogueSetId([
      entry({ slug: "a", setCode: "WHW", catalogueSetId: "10" }),
      entry({ slug: "b", setCode: "WHW", catalogueSetId: "10" }),
    ]);
    expect(map.get("whw")).toBe("10");
  });

  it("does not learn s28 → promo from a window-insert duopack", () => {
    const map = boutiqueCodeToCatalogueSetId([
      entry({
        slug: "duopack-s28",
        setCode: "s28",
        catalogueSetId: "promo",
      }),
    ]);
    expect(map.has("s28")).toBe(false);
  });
});

describe("backfillSealedProductSetLogos Storm 3", () => {
  it("keeps S28 boosters/displays on s28 despite a promo window insert", () => {
    const products = {
      "naruto::duopack": entry({
        slug: "duopack-s28",
        setCode: "s28",
        guaranteedPrints: [
          {
            name: "PR-096",
            slug: "pr",
            ref: null,
            printKey: "naruto:promo-pr0096",
          },
        ],
      }),
      "naruto::booster": entry({
        slug: "booster-s28",
        setCode: "s28",
      }),
      "naruto::display": entry({
        slug: "display-s28-fr",
        setCode: "s28",
      }),
    };
    backfillSealedProductSetLogos("naruto/carddass", products);
    expect(products["naruto::duopack"]?.catalogueSetId).not.toBe("promo");
    expect(products["naruto::booster"]?.catalogueSetId).not.toBe("promo");
    expect(products["naruto::display"]?.catalogueSetId).not.toBe("promo");
  });

  it("repairs a sqlite row already polluted as catalogueSetId=promo", () => {
    const products = {
      "naruto::duopack": entry({
        slug: "duopack-s28",
        setCode: "s28",
        catalogueSetId: "promo",
        guaranteeSets: ["promo"],
        guaranteedPrints: [
          {
            name: "PR-096",
            slug: "pr",
            ref: null,
            printKey: "naruto:promo-pr0096",
          },
        ],
      }),
    };
    backfillSealedProductSetLogos("naruto/carddass", products);
    expect(products["naruto::duopack"]?.catalogueSetId).toBe("s28");
  });
});
