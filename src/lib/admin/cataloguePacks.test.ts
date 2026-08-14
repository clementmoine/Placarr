import { describe, expect, it } from "vitest";

import {
  buildCatalogueCardRows,
  catalogueCollectorKey,
  entryHasFoil,
  langFilesHaveFoil,
} from "@/lib/admin/catalogueCards";
import {
  catalogueFranchises,
  catalogueFranchiseForPack,
  foilExtractNeedsApk,
  resolveCataloguePackId,
  resolveCatalogueScope,
  cataloguePackInfo,
} from "@/lib/admin/cataloguePacks";

describe("cataloguePacks", () => {
  it("resolves pack ids and aliases", () => {
    expect(resolveCataloguePackId("pokemon")).toBe("pokemon");
    expect(resolveCataloguePackId("carddass")).toBe("naruto/ccg");
    expect(resolveCataloguePackId("naruto")).toBe("naruto/ccg");
    expect(resolveCataloguePackId("ccg")).toBe("naruto/ccg");
    expect(resolveCataloguePackId("dbs")).toBe("dbs/cg");
    expect(resolveCataloguePackId("masters")).toBe("dbs/cg");
    expect(resolveCataloguePackId("fusionworld")).toBe("dbs/fw");
    expect(resolveCataloguePackId("nope")).toBeNull();
  });

  it("groups Dragon Ball lines under one franchise (Naruto stays one line until Panini)", () => {
    const franchises = catalogueFranchises();
    expect(franchises.map((row) => row.id)).toEqual([
      "pokemon",
      "lorcana",
      "naruto",
      "dbs",
    ]);
    const naruto = franchises.find((row) => row.id === "naruto");
    expect(naruto?.lines.map((line) => line.id)).toEqual(["naruto/ccg"]);
    const dbs = catalogueFranchiseForPack("dbs/fw");
    expect(dbs?.id).toBe("dbs");
    expect(dbs?.lines.map((line) => line.id)).toEqual(["dbs/cg", "dbs/fw"]);
    expect(foilExtractNeedsApk("naruto")).toBe(false);
    expect(foilExtractNeedsApk("dbs-cg")).toBe(false);
    expect(foilExtractNeedsApk("pokemon")).toBe(true);
  });

  it("forces all scope when pack has no foil effects", () => {
    const naruto = cataloguePackInfo("naruto/ccg")!;
    expect(resolveCatalogueScope("foils", naruto)).toBe("all");
    expect(resolveCatalogueScope(null, naruto)).toBe("all");
  });

  it("defaults pokemon/lorcana to foils", () => {
    const pokemon = cataloguePackInfo("pokemon")!;
    expect(resolveCatalogueScope(null, pokemon)).toBe("foils");
    expect(resolveCatalogueScope("all", pokemon)).toBe("all");
  });
});

describe("catalogueCards foil detection", () => {
  it("detects mask / etch / variant foil assets", () => {
    expect(langFilesHaveFoil({ art: "art.webp" })).toBe(false);
    expect(langFilesHaveFoil({ art: "art.webp", mask: "mask.webp" })).toBe(
      true,
    );
    expect(
      langFilesHaveFoil({
        art: "art.webp",
        variants: { ph: { mask: "mask-ph.webp" } },
      }),
    ).toBe(true);
    expect(
      entryHasFoil({
        set: "s1",
        card: "001",
        langs: { fr: { art: "art.jpg" }, en: { art: "a.webp", etch: "e.webp" } },
      }),
    ).toBe(true);
  });
});

describe("same-number art fallback (Naruto)", () => {
  it("normalizes collector keys", () => {
    expect(catalogueCollectorKey("ni024")).toBe("ni024");
    expect(catalogueCollectorKey("TE-030-cdf")).toBe("te030");
    expect(catalogueCollectorKey("te030-cdf")).toBe("te030");
  });

  it("inherits retail face onto promo stub until official art exists", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/ccg",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:s1-ni024": {
          set: "s1",
          card: "ni024",
          name: "Zabuza Momochi",
          langs: { fr: { art: "art.jpg", thumb: "thumb.jpg" } },
        },
        "naruto:promo-ni024": {
          set: "promo",
          card: "ni024",
          name: "Zabuza Momochi",
          rarity: "promo",
          langs: {},
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/ccg", index);
    const promo = rows.find((r) => r.printKey === "naruto:promo-ni024");
    const retail = rows.find((r) => r.printKey === "naruto:s1-ni024");
    expect(retail?.artUrl).toContain("/s1/");
    expect(promo?.missingArt).toBeUndefined();
    expect(promo?.artFallbackFrom).toBe("naruto:s1-ni024");
    expect(promo?.artUrl).toBe(retail?.artUrl);
    expect(promo?.thumbUrl).toBe(retail?.thumbUrl);
  });

  it("does not inherit across Pokémon set numbers", () => {
    const index = {
      version: 1 as const,
      pack: "pokemon",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "pokemon:sv1-001": {
          set: "sv1",
          card: "001",
          langs: { fr: { art: "art.webp" } },
        },
        "pokemon:sv2-001": {
          set: "sv2",
          card: "001",
          langs: {},
        },
      },
    };
    const rows = buildCatalogueCardRows("pokemon", index);
    const stub = rows.find((r) => r.printKey === "pokemon:sv2-001");
    expect(stub?.missingArt).toBe(true);
    expect(stub?.artUrl).toBe("");
    expect(stub?.artFallbackFrom).toBeUndefined();
  });

  it("prefers local art over a remote Bandai artUrl", () => {
    const index = {
      version: 1 as const,
      pack: "dbs/cg",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "dbscg:bt1-001": {
          set: "bt1",
          card: "001",
          name: "Champa",
          langs: {
            fr: {
              art: "art.webp",
              artUrl:
                "https://www.dbs-cardgame.com/europe-fr/images/cartes/cardimg/BT1-001.png",
            },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("dbs/cg", index);
    expect(rows[0]?.artUrl).toBe("/assets/dbs/cg/cards/bt1/fr/001/art.webp");
  });

  it("uses a remote artUrl when the pack stores Bandai faces, not local files", () => {
    const index = {
      version: 1 as const,
      pack: "dbs/cg",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "dbscg:bt1-001": {
          set: "bt1",
          card: "001",
          name: "Champa",
          langs: {
            fr: {
              artUrl:
                "https://www.dbs-cardgame.com/europe-fr/images/cartes/cardimg/BT1-001.png",
            },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("dbs/cg", index);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.missingArt).toBeUndefined();
    expect(rows[0]?.artUrl).toBe(
      "https://www.dbs-cardgame.com/europe-fr/images/cartes/cardimg/BT1-001.png",
    );
  });

  it("prefers non-promo donor and matches cdf grouping to base number", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/ccg",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:s3-te030": {
          set: "s3",
          card: "te030",
          langs: { fr: { art: "art.jpg" } },
        },
        "naruto:promo-te030": {
          set: "promo",
          card: "te030",
          langs: { fr: { art: "art.jpg" } },
        },
        "naruto:promo-te030-cdf": {
          set: "promo",
          card: "te030-cdf",
          name: "L'éclair pourfendeur",
          langs: {},
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/ccg", index);
    const cdf = rows.find((r) => r.printKey === "naruto:promo-te030-cdf");
    expect(cdf?.artFallbackFrom).toBe("naruto:s3-te030");
  });
});

describe("mergeCatalogueBackRows", () => {
  it("puts pack back first and set backs ahead of each set", async () => {
    const { mergeCatalogueBackRows } = await import(
      "@/lib/admin/catalogueCards"
    );
    const faces = [
      {
        printKey: "naruto:promo-ni001",
        set: "promo",
        card: "ni001",
        lang: "fr",
        artUrl: "/a",
        hasFoil: false,
        label: "promo · ni001",
      },
      {
        printKey: "naruto:s1-ni001",
        set: "s1",
        card: "ni001",
        lang: "fr",
        artUrl: "/b",
        hasFoil: false,
        label: "s1 · ni001",
      },
      {
        printKey: "naruto:s1-ni002",
        set: "s1",
        card: "ni002",
        lang: "fr",
        artUrl: "/c",
        hasFoil: false,
        label: "s1 · ni002",
      },
      {
        printKey: "naruto:s2-ni001",
        set: "s2",
        card: "ni001",
        lang: "fr",
        artUrl: "/d",
        hasFoil: false,
        label: "s2 · ni001",
      },
    ];
    const rows = mergeCatalogueBackRows({
      pack: "naruto/ccg",
      faceRows: faces,
      packBackUrl: "/assets/naruto/ccg/cards/back.webp",
      setBackUrls: {
        s1: "/assets/naruto/ccg/cards/s1/back.webp",
        // s2 intentionally missing
      },
    });
    expect(rows.map((r) => r.printKey)).toEqual([
      "naruto/ccg:__pack-back__",
      "naruto:promo-ni001",
      "naruto/ccg:__set-back-s1__",
      "naruto:s1-ni001",
      "naruto:s1-ni002",
      "naruto:s2-ni001",
    ]);
    expect(rows[0]?.kind).toBe("pack-back");
    expect(rows[0]?.label).toBe("Dos · pack");
    expect(rows[2]?.kind).toBe("set-back");
    expect(rows[2]?.label).toBe("Dos · s1");
  });

  it("leaves face order unchanged when no backs exist", async () => {
    const { mergeCatalogueBackRows } = await import(
      "@/lib/admin/catalogueCards"
    );
    const faces = [
      {
        printKey: "naruto:s1-ni001",
        set: "s1",
        card: "ni001",
        lang: "fr",
        artUrl: "/b",
        hasFoil: false,
        label: "s1 · ni001",
      },
    ];
    expect(
      mergeCatalogueBackRows({
        pack: "naruto/ccg",
        faceRows: faces,
        packBackUrl: null,
        setBackUrls: {},
      }),
    ).toEqual(faces);
  });
});
