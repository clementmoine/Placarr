import { describe, expect, it } from "vitest";

import { parsePrintKey } from "@/core/identify/printKey";

import type { DbscardsProductPage } from "./parseProducts";
import {
  catalogFullRefFromPrintKey,
  catalogRefFromPrintKey,
  completeProductContainsPrints,
  extractProductSeriesCodes,
  resolveProductCatalogSeries,
  setCodeVariants,
  unionContainsPrints,
  type DbscardsCatalogIndex,
  type DbscardsCatalogPrint,
} from "./completePrints";

function print(
  printKey: string,
  setCode: string,
  setName: string,
  name: string,
): DbscardsCatalogPrint {
  return {
    printKey,
    setCode,
    setName,
    name,
    ref: catalogRefFromPrintKey(printKey)!,
    fullRef: catalogFullRefFromPrintKey(printKey)!,
    grouping: parsePrintKey(printKey)?.grouping ?? null,
  };
}

function indexOf(prints: DbscardsCatalogPrint[]): DbscardsCatalogIndex {
  const bySetCode = new Map<string, DbscardsCatalogPrint[]>();
  const bySetName = new Map<string, DbscardsCatalogPrint[]>();
  for (const row of prints) {
    const code = bySetCode.get(row.setCode);
    if (code) code.push(row);
    else bySetCode.set(row.setCode, [row]);
    const name = bySetName.get(row.setName);
    if (name) name.push(row);
    else bySetName.set(row.setName, [row]);
  }
  return { bySetCode, bySetName };
}

function product(
  partial: Partial<DbscardsProductPage> &
    Pick<DbscardsProductPage, "slug" | "containsPrints">,
): DbscardsProductPage {
  return {
    path: `/products/decks/${partial.slug}`,
    category: "decks",
    name: partial.slug,
    image: null,
    sku: null,
    price: null,
    currency: null,
    setCode: null,
    lang: "FR",
    releaseDate: null,
    declaredCardCount: null,
    containsPrintsIsPreview: false,
    relatedProducts: [],
    tables: {},
    ...partial,
  };
}

const radiance = "DECK DE DÉMARRAGE -Final Radiance-";
const bt23 = "ZENKAI Série -BOOST- PERFECT COMBINATION";
const ge02 = "EXPANSION SET －PREMIUM PACK－【GE02】";

const catalog = indexOf([
  print("dbscg:sd23-01", "sd23", radiance, "Vegetto SSB"),
  print("dbscg:sd23-02", "sd23", radiance, "Trunks"),
  print("dbscg:sd23-07", "sd23", radiance, "Vegetto SSB, Au-Delà"),
  print("dbscg:bt13-135-pr", "bt13", radiance, "Kaïo Shin"),
  print("dbscg:sd23-01-pr", "sd23", "Premium Anniversary Box 2024", "SLR"),
  ...Array.from({ length: 120 }, (_, i) =>
    print(
      `dbscg:bt23-${String(i + 1).padStart(3, "0")}`,
      "bt23",
      bt23,
      `BT23-${i + 1}`,
    ),
  ),
  ...Array.from({ length: 8 }, (_, i) =>
    print(
      `dbscg:ge02-${String(i + 1).padStart(2, "0")}`,
      "ex06",
      ge02,
      `GE02-${i}`,
    ),
  ),
  print("dbscg:ex13-01", "ex13", "Premium Anniversary Box 2023", "one reprint"),
  ...Array.from({ length: 36 }, (_, i) =>
    print(
      `dbscg:ex19-${String(i + 1).padStart(2, "0")}`,
      "ex19",
      "Special Anniversary Box 2021",
      `EX19-${i + 1}`,
    ),
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    print(
      `dbscg:usb-${String(i + 1).padStart(2, "0")}`,
      "usb",
      "Ultimate Starter Box",
      `USB-${i + 1}`,
    ),
  ),
  ...Array.from({ length: 58 }, (_, i) =>
    print(
      `dbscg:ex23-${String(i + 1).padStart(2, "0")}`,
      "ex23",
      "Premium Anniversary Box 2023",
      `EX23-${i + 1}`,
    ),
  ),
]);

describe("extractProductSeriesCodes", () => {
  it("reads the slug prefix and hyphenated codes", () => {
    expect(
      extractProductSeriesCodes("sd23-starter-deck-final-radiance"),
    ).toEqual(["sd23"]);
    expect(extractProductSeriesCodes("be22-ultimate-deck-2023-ex22")).toEqual([
      "be22",
      "ex22",
    ]);
    expect(
      extractProductSeriesCodes(
        "coffret-dragon-ball-super-card-game-gift-collection-gc-02",
      ),
    ).toEqual(["gc02"]);
  });

  it("keeps a fiche series that is not a booster set", () => {
    expect(
      extractProductSeriesCodes("premium-seventh-anniversary-box-2024", "EX24"),
    ).toEqual(["ex24"]);
  });

  it("drops a booster code the fiche pinned on a deck", () => {
    expect(
      extractProductSeriesCodes("sd17-starter-deck-red-rage", "BT18"),
    ).toEqual(["sd17"]);
  });
});

describe("setCodeVariants", () => {
  it("pads and unpads the digits", () => {
    expect(setCodeVariants("sd8")).toEqual(["sd8", "sd08"]);
    expect(setCodeVariants("sd08")).toContain("sd8");
  });
});

describe("resolveProductCatalogSeries", () => {
  it("joins SD23 to the deck series, not the anniversary reprint", () => {
    const hit = resolveProductCatalogSeries(
      {
        slug: "sd23-starter-deck-final-radiance",
        name: null,
        setCode: "SD23",
        declaredCardCount: 19,
      },
      catalog,
    );
    expect(hit?.setName).toBe(radiance);
    expect(hit?.prints).toHaveLength(4);
  });

  it("does not dump a booster set onto a premium pack", () => {
    expect(
      resolveProductCatalogSeries(
        {
          slug: "premium-pack-pp14-bt23-perfect-combination",
          name: null,
          setCode: "BT23",
          declaredCardCount: 155,
        },
        catalog,
      ),
    ).toBeNull();
  });

  it("finds GE02 by the code in the Bandai series title", () => {
    const hit = resolveProductCatalogSeries(
      {
        slug: "ge02-premium-pack-clash-of-fates",
        name: null,
        setCode: null,
        declaredCardCount: 85,
      },
      catalog,
    );
    expect(hit?.setName).toBe(ge02);
    expect(hit?.prints).toHaveLength(8);
  });

  it("joins a 2021 anniversary box by title when the slug has no EX code", () => {
    const hit = resolveProductCatalogSeries(
      {
        slug: "special-anniversary-box-2021-vegeta-version-2",
        name: "Coffret Special Anniversary 2021 - Vegeta",
        setCode: null,
        declaredCardCount: 76,
      },
      catalog,
    );
    expect(hit?.setName).toBe("Special Anniversary Box 2021");
    expect(hit?.prints).toHaveLength(36);
  });

  it("joins the Ultimate Starter Box by title", () => {
    const hit = resolveProductCatalogSeries(
      {
        slug: "ultimate-starter-box-vegeta-super-saiyan-4",
        name: "Coffret Ultimate Starter Box - Vegeta Super Saiyan 4",
        setCode: null,
        declaredCardCount: null,
      },
      catalog,
    );
    expect(hit?.setName).toBe("Ultimate Starter Box");
    expect(hit?.prints).toHaveLength(10);
  });

  it("does not take Anniversary 2021 from a box slug that has no year", () => {
    expect(
      resolveProductCatalogSeries(
        {
          slug: "special-anniversary-box",
          name: "Coffret Special Anniversary Box - Son Goku Ultra Instinct",
          setCode: null,
          declaredCardCount: 490,
        },
        catalog,
      ),
    ).toBeNull();
  });

  it("does not take Anniversary 2023 from a lone EX13 reprint", () => {
    expect(
      resolveProductCatalogSeries(
        {
          slug: "special-pack-ex13-agents-de-la-destruction",
          name: null,
          setCode: null,
          declaredCardCount: 36,
        },
        catalog,
      ),
    ).toBeNull();
  });
});

describe("completeProductContainsPrints", () => {
  it("unions the 15-tile preview with the Bandai series", () => {
    const page = completeProductContainsPrints(
      product({
        slug: "sd23-starter-deck-final-radiance",
        setCode: "SD23",
        declaredCardCount: 19,
        containsPrints: [
          {
            slug: "sd23-07-st-vegetto",
            path: "/cards/sd23-07-st-vegetto",
            ref: "sd23-07",
            sku: "SD23-07-ST",
            name: "Vegetto SSB",
          },
          {
            slug: "bt13-135-sr-kaio",
            path: "/cards/bt13-135-sr-kaio",
            ref: "bt13-135",
            sku: "BT13-135-SR",
            name: "Kaïo Shin",
          },
        ],
        containsPrintsIsPreview: true,
      }),
      catalog,
    );
    expect(page.containsPrints.map((row) => row.ref)).toEqual([
      "sd23-01",
      "sd23-02",
      "sd23-07",
      "bt13-135",
    ]);
    expect(page.containsPrints.find((row) => row.ref === "sd23-07")?.path).toBe(
      "/cards/sd23-07-st-vegetto",
    );
    expect(page.containsPrintsIsPreview).toBe(true);
  });

  it("does not dump a theme-booster series under the 100-print cut", () => {
    const tiles = [
      {
        slug: "eb1-001",
        path: "/cards/eb1-001",
        ref: "eb1-001",
        sku: "EB1-001",
        name: "Goku",
      },
    ];
    const theme = indexOf([
      ...Array.from({ length: 72 }, (_, i) =>
        print(
          `dbscg:eb1-${String(i + 1).padStart(3, "0")}`,
          "eb1",
          "Battle Evolution Booster",
          `EB1-${i + 1}`,
        ),
      ),
    ]);
    const page = completeProductContainsPrints(
      product({
        slug: "booster-eb1-battle-evolution-booster",
        category: "boosters",
        setCode: "EB1",
        declaredCardCount: 125,
        containsPrints: tiles,
        containsPrintsIsPreview: true,
      }),
      theme,
    );
    expect(page.containsPrints).toEqual(tiles);
  });

  it("leaves a booster fiche on its labelled preview", () => {
    const tiles = [
      {
        slug: "bt23-001",
        path: "/cards/bt23-001",
        ref: "bt23-001",
        sku: "BT23-001-UC",
        name: "Goku",
      },
    ];
    const page = completeProductContainsPrints(
      product({
        slug: "booster-b23-perfect-combination",
        category: "boosters",
        setCode: "BT23",
        declaredCardCount: 155,
        containsPrints: tiles,
        containsPrintsIsPreview: true,
      }),
      catalog,
    );
    expect(page.containsPrints).toEqual(tiles);
    expect(page.containsPrintsIsPreview).toBe(true);
  });

  it("leaves a lottery pack on its preview tiles", () => {
    const tiles = [
      {
        slug: "bt23-001",
        path: "/cards/bt23-001",
        ref: "bt23-001",
        sku: "BT23-001-UC",
        name: "Goku",
      },
    ];
    const page = completeProductContainsPrints(
      product({
        slug: "premium-pack-pp14-bt23-perfect-combination",
        category: "special-packs",
        setCode: "BT23",
        declaredCardCount: 155,
        containsPrints: tiles,
        containsPrintsIsPreview: true,
      }),
      catalog,
    );
    expect(page.containsPrints).toEqual(tiles);
    expect(page.containsPrintsIsPreview).toBe(true);
  });

  it("is a no-op without a catalogue", () => {
    const page = product({
      slug: "sd23-starter-deck-final-radiance",
      containsPrints: [],
    });
    expect(completeProductContainsPrints(page, null)).toBe(page);
  });
});

describe("unionContainsPrints", () => {
  it("keeps the tile slug when the catalogue repeats the ref", () => {
    const merged = unionContainsPrints(
      [
        {
          slug: "sd23-07-st-vegetto",
          path: "/cards/sd23-07-st-vegetto",
          ref: "sd23-07",
          sku: "SD23-07-ST",
          name: "Vegetto",
        },
      ],
      [print("dbscg:sd23-07", "sd23", radiance, "Vegetto SSB")],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.slug).toBe("sd23-07-st-vegetto");
  });

  it("keeps Fusion World parallels as their own prints", () => {
    const merged = unionContainsPrints(
      [
        {
          slug: "fs10-01-giblet",
          path: "/cards/fs10-01-giblet",
          ref: "fs10-01",
          sku: "FS10-01",
          name: "Giblet",
        },
      ],
      [
        print(
          "dbsfw:fs10-01",
          "fs10",
          "STARTER DECK EX GIBLET [FS10]",
          "Giblet",
        ),
        print(
          "dbsfw:fs10-01-p1",
          "fs10",
          "STARTER DECK EX GIBLET [FS10]",
          "Giblet alt",
        ),
      ],
    );
    expect(merged.map((row) => row.ref)).toEqual(["fs10-01", "fs10-01-p1"]);
    expect(merged[0]?.slug).toBe("fs10-01-giblet");
  });
});
