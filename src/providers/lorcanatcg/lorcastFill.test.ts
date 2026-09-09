import { describe, expect, it } from "vitest";

import type { LorcastCataloguePrint } from "@/providers/lorcast/catalogue";

import {
  LORCAST_SETS_NOT_FILLED,
  lorcanaGapKey,
  lorcastSkipReason,
  selectLorcastFillPrints,
  toLorcastFillPrint,
} from "./lorcastFill";

function print(
  overrides: Partial<LorcastCataloguePrint> & {
    setCode: string;
    collectorNumber: string;
    name: string;
  },
): LorcastCataloguePrint {
  return {
    providerId: `crd_${overrides.setCode}_${overrides.collectorNumber}`,
    setName: null,
    version: null,
    rarity: null,
    cardType: null,
    color: null,
    cost: null,
    lore: null,
    strength: null,
    willpower: null,
    inkwell: null,
    subtypes: [],
    artists: [],
    flavorText: null,
    imageUrl: null,
    thumbnailUrl: null,
    ...overrides,
  };
}

describe("lorcanaGapKey", () => {
  it("range une promo sous son code promo, pas sous son extension de base", () => {
    // Ce que LorcanaJSON tient : la promo P2 nº 18, rangée en set 6.
    expect(
      lorcanaGapKey({ setCode: "6", promoGrouping: "P2", number: 18 }),
    ).toBe("P2|18");
    // Ce que Lorcast en dit : set P2, nº 18. Même trou, même clé.
    expect(
      lorcanaGapKey({ setCode: "P2", promoGrouping: "P2", number: "18" }),
    ).toBe("P2|18");
  });

  it("ignore la lettre de variante — 24 et 24b visent le même trou", () => {
    expect(lorcanaGapKey({ setCode: "P2", number: "24b" })).toBe("P2|24");
    expect(lorcanaGapKey({ setCode: "P2", number: "24" })).toBe("P2|24");
  });

  it("normalise les zéros de tête, que Lorcast met sur certains promos", () => {
    expect(lorcanaGapKey({ setCode: "P2", number: "015" })).toBe("P2|15");
  });

  it("refuse ce qui n'est pas un numéro de collection", () => {
    expect(lorcanaGapKey({ setCode: "P1", number: "25ja" })).toBeNull();
    expect(lorcanaGapKey({ setCode: "", number: "1" })).toBeNull();
  });
});

describe("toLorcastFillPrint", () => {
  it("bâtit la clé sur le code imprimé et note le groupe promo", () => {
    const mapped = toLorcastFillPrint(
      print({
        setCode: "P2",
        collectorNumber: "36",
        name: "Mickey Mouse",
        version: "True Friend",
      }),
    );
    expect(mapped).toMatchObject({
      printKey: "lorcana:p2-36",
      baseNumber: "36",
      variant: null,
      promoGrouping: "P2",
      fullName: "Mickey Mouse - True Friend",
      searchName: "mickey mouse true friend",
    });
  });

  it("ne pose pas de groupe promo sur une extension numérotée", () => {
    const mapped = toLorcastFillPrint(
      print({ setCode: "9", collectorNumber: "13", name: "Mickey Mouse" }),
    );
    expect(mapped).toMatchObject({
      printKey: "lorcana:9-13",
      promoGrouping: null,
    });
  });

  it("garde la lettre de variante dans la clé, la sort du numéro", () => {
    const mapped = toLorcastFillPrint(
      print({ setCode: "P2", collectorNumber: "24B", name: "Hiro Hamada" }),
    );
    expect(mapped).toMatchObject({
      printKey: "lorcana:p2-24b",
      baseNumber: "24",
      variant: "b",
    });
  });

  it("rejette un numéro qui porte une langue plutôt qu'une variante", () => {
    // `25ja` / `25zh` sont les tirages japonais et chinois du même 25/P1 :
    // chez nous la langue est sur l'exemplaire, jamais dans la clé de tirage.
    expect(
      toLorcastFillPrint(
        print({ setCode: "P1", collectorNumber: "25ja", name: "Mickey Mouse" }),
      ),
    ).toBeNull();
  });
});

describe("selectLorcastFillPrints", () => {
  const catalogue = [
    // Déjà chez LorcanaJSON, sous le set de la carte réimprimée.
    print({ setCode: "P2", collectorNumber: "18", name: "Mickey Mouse" }),
    // Le trou qui a lancé tout ça.
    print({
      setCode: "P2",
      collectorNumber: "36",
      name: "Mickey Mouse",
      version: "True Friend",
    }),
    // Numéro non ancrable : sorti, quoi qu'il arrive.
    print({ setCode: "P1", collectorNumber: "25ja", name: "Mickey Mouse" }),
  ];
  const covered = new Set(["P2|18"]);

  it("ne rend que ce que LorcanaJSON ignore", () => {
    expect(
      selectLorcastFillPrints(catalogue, covered).map((p) => p.printKey),
    ).toEqual(["lorcana:p2-36"]);
  });

  it("ne rend jamais deux fois la même clé", () => {
    const twice = [...catalogue, ...catalogue];
    expect(selectLorcastFillPrints(twice, covered)).toHaveLength(1);
  });

  it("laisse passer une variante seulement si son numéro est un trou", () => {
    const withVariant = [
      print({ setCode: "P2", collectorNumber: "24B", name: "Hiro Hamada" }),
    ];
    expect(
      selectLorcastFillPrints(withVariant, new Set(["P2|24"])),
    ).toHaveLength(0);
    expect(selectLorcastFillPrints(withVariant, new Set())).toHaveLength(1);
  });
});

describe("lorcastSkipReason", () => {
  it("écarte cp, dont la numérotation contredit celle de C1", () => {
    expect(lorcastSkipReason({ code: "cp", name: "Challenge Promo" })).toBe(
      LORCAST_SETS_NOT_FILLED.cp,
    );
  });

  it("laisse passer tout le reste", () => {
    expect(lorcastSkipReason({ code: "P2", name: "Promo Set 2" })).toBeNull();
    expect(
      lorcastSkipReason({ code: "Coconut", name: "Format Coconut" }),
    ).toBeNull();
  });
});
