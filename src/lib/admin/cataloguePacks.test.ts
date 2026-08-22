import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCatalogueCardRows,
  catalogueCollectorKey,
  entryHasFoil,
  langFilesHaveFoil,
  listCatalogueCards,
  mergeNarutoCatalogueFaces,
} from "@/lib/admin/catalogueCards";
import {
  applyCataloguePackParams,
  catalogueCorpusPack,
  catalogueFranchises,
  catalogueFranchiseForPack,
  foilExtractNeedsApk,
  narutoCatalogueLineForCard,
  narutoCatalogueLineForSealed,
  resolveCataloguePackId,
  resolveCatalogueScope,
  cataloguePackInfo,
} from "@/lib/admin/cataloguePacks";

describe("cataloguePacks", () => {
  it("resolves pack ids and aliases", () => {
    expect(resolveCataloguePackId("pokemon")).toBe("pokemon");
    expect(resolveCataloguePackId("carddass")).toBe("naruto/carddass");
    expect(resolveCataloguePackId("naruto")).toBe("naruto/carddass");
    expect(resolveCataloguePackId("cacg")).toBe("naruto/carddass");
    expect(resolveCataloguePackId("naruto/ccg")).toBe("naruto/carddass");
    expect(resolveCataloguePackId("naruto/en-ccg")).toBe("naruto/carddass");
    expect(resolveCataloguePackId("ccg")).toBe("naruto/carddass");
    expect(resolveCataloguePackId("bandaiccg")).toBe("naruto/carddass");
    expect(resolveCataloguePackId("enccg")).toBe("naruto/carddass");
    expect(resolveCataloguePackId("shippuden")).toBe("naruto/shippuden");
    expect(resolveCataloguePackId("ninjaranks")).toBe("naruto/ninja-ranks");
    expect(resolveCataloguePackId("ultrachallenge")).toBe(
      "naruto/ultra-challenge",
    );
    expect(resolveCataloguePackId("lamincards")).toBe("naruto/ultra-challenge");
    expect(resolveCataloguePackId("dbs")).toBe("dbs/cg");
    expect(resolveCataloguePackId("masters")).toBe("dbs/cg");
    expect(resolveCataloguePackId("fusionworld")).toBe("dbs/fw");
    expect(resolveCataloguePackId("nope")).toBeNull();
  });

  /*
    Naruto a plusieurs lignes, et une seule raison de les avoir : ce sont
    **des jeux distincts** — Carddass, 疾風伝, Ninja Ranks, Ultra Challenge.

    Ce que ce test protège n'a pas changé : le **CCG anglais** ne doit pas
    devenir une ligne. Il partage la numérotation et le verso du Carddass, dont
    il est la localisation ; lui donner un onglet séparerait ce qui est un même
    jeu. D'où les deux assertions sur `naruto/en-ccg`, restées intactes.
  */
  it("donne à Naruto ses lignes de jeux distincts, sans en faire une pour le CCG anglais", () => {
    const franchises = catalogueFranchises();
    expect(franchises.map((row) => row.id)).toEqual([
      "pokemon",
      "lorcana",
      "naruto",
      "dbs",
    ]);
    const naruto = franchises.find((row) => row.id === "naruto");
    expect(naruto?.lines.map((line) => line.id)).toEqual([
      "naruto/carddass",
      "naruto/shippuden",
      "naruto/ninja-ranks",
      "naruto/ultra-challenge",
    ]);
    const dbs = catalogueFranchiseForPack("dbs/fw");
    expect(dbs?.id).toBe("dbs");
    expect(dbs?.lines.map((line) => line.id)).toEqual(["dbs/cg", "dbs/fw"]);
    expect(catalogueCorpusPack("naruto/en-ccg")).toBe("naruto/carddass");
    expect(cataloguePackInfo("naruto/en-ccg")).toBeNull();
    expect(cataloguePackInfo("naruto/carddass")?.blurbFr).toContain("voisins");
    expect(foilExtractNeedsApk("naruto")).toBe(false);
    expect(foilExtractNeedsApk("dbs-cg")).toBe(false);
    expect(foilExtractNeedsApk("pokemon")).toBe(true);
  });

  it("splits Carddass NI/TE from EN CCG N/J/M — s1 is not enough", () => {
    expect(narutoCatalogueLineForCard("ni001", "s1")).toBe("carddass-fr");
    expect(narutoCatalogueLineForCard("n001", "s1")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("n1621", "s28")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("j1002", "s28")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("te001", "s1")).toBe("carddass-fr");
    expect(
      narutoCatalogueLineForSealed({
        slug: "booster-s1",
        setCode: "s1",
        lang: "FR",
      }),
    ).toBe("carddass-fr");
    expect(
      narutoCatalogueLineForSealed({
        slug: "display-s28",
        setCode: "s28",
        lang: "EN",
      }),
    ).toBe("en-ccg");
    expect(
      narutoCatalogueLineForSealed({ slug: "display-s13", setCode: "s13" }),
    ).toBe("en-ccg");
    expect(
      narutoCatalogueLineForSealed({
        slug: "display-s1-it",
        setCode: "s1",
        lang: "IT",
      }),
    ).toBe("carddass-fr");
    expect(
      narutoCatalogueLineForSealed({
        slug: "booster-vol5-jp",
        setCode: "maki5",
        lang: "JA",
      }),
    ).toBe("carddass-fr");
  });

  it("keeps Catalogue pack helpers free of node: (admin client bundle)", () => {
    const files = [
      "src/lib/admin/cataloguePacks.ts",
      "src/providers/narutoccg/packs.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(`${rel}\n${src}`).not.toMatch(/from ["']node:/);
    }
  });

  it("forces all scope when pack has no foil effects", () => {
    const naruto = cataloguePackInfo("naruto/carddass")!;
    expect(resolveCatalogueScope("sealed", naruto)).toBe("sealed");
    expect(resolveCatalogueScope("foils", naruto)).toBe("all");
    expect(resolveCatalogueScope(null, naruto)).toBe("all");
  });

  it("defaults pokemon/lorcana to foils", () => {
    const pokemon = cataloguePackInfo("pokemon")!;
    expect(resolveCatalogueScope(null, pokemon)).toBe("foils");
    expect(resolveCatalogueScope("all", pokemon)).toBe("all");
    expect(resolveCatalogueScope("sealed", pokemon)).toBe("sealed");
  });

  it("keeps the sealed tab when switching packs", () => {
    const sealed = new URLSearchParams("pack=pokemon&scope=sealed");
    applyCataloguePackParams(sealed, "naruto/carddass");
    expect(sealed.get("pack")).toBe("naruto/carddass");
    expect(sealed.get("scope")).toBe("sealed");

    const foilsToNaruto = new URLSearchParams("pack=pokemon");
    applyCataloguePackParams(foilsToNaruto, "naruto/carddass");
    expect(foilsToNaruto.get("scope")).toBe("all");

    const sealedToPokemon = new URLSearchParams("pack=dbs/cg&scope=sealed");
    applyCataloguePackParams(sealedToPokemon, "pokemon");
    expect(sealedToPokemon.get("scope")).toBe("sealed");
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
        langs: {
          fr: { art: "art.jpg" },
          en: { art: "a.webp", etch: "e.webp" },
        },
      }),
    ).toBe(true);
  });
});

describe("Naruto catalogue lines", () => {
  it("puts NI and N in the same Carddass grid, one tile per locale", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:s1-ni001": {
          set: "s1",
          card: "ni001",
          name: "Naruto Uzumaki",
          langs: {
            fr: { art: "art.jpg", name: "Naruto Uzumaki" },
            ja: { name: "うずまきナルト" },
          },
        },
        "naruto:s1-n001": {
          set: "s1",
          card: "n001",
          name: "Naruto Uzumaki",
          langs: { en: { art: "art.jpg" } },
        },
        "naruto:s28-n1621": {
          set: "s28",
          card: "n1621",
          name: "Kisame",
          langs: {
            en: { art: "art.jpg", name: "Kisame Hoshigaki" },
            fr: { art: "art.jpg", name: "Kisame Hoshigaki" },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/carddass", index);
    expect(rows.map((row) => `${row.card}:${row.lang}`)).toEqual([
      "ni001:fr",
      "ni001:ja",
      "n001:en",
      "n1621:fr",
      "n1621:en",
    ]);
    expect(
      rows.find((row) => row.card === "n1621" && row.lang === "en")?.artUrl,
    ).toBe("/assets/naruto/carddass/cards/ninja/n1621/en/art.jpg");
    expect(
      rows.find((row) => row.card === "ni001" && row.lang === "ja")?.name,
    ).toBe("うずまきナルト");
  });

  it("keeps unprinted S6 FR in the catalogue and marks it", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ni-0255": {
          set: "ninja",
          card: "ni0255",
          name: "Pré-prod S6",
          langs: { fr: { art: "art.jpg", printed: false } },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/carddass", index);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.printed).toBe(false);
    expect(rows[0]?.artUrl).toContain("/ninja/ni0255/fr/");
  });

  it("shows one FR Kakashi for NI-064, not a junk S6 stub", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ni-0064": {
          set: "ninja",
          card: "ni0064",
          name: "Kakashi Hatake",
          langs: {
            fr: { name: "Kakashi Hatake", art: "art.jpg" },
            it: { name: "Kakashi Hatake" },
          },
        },
        "naruto:s6-ni064": {
          set: "s6",
          card: "ni064",
          name: "qui",
          langs: { fr: { name: "qui", printed: false } },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/carddass", index);
    const fr = rows.filter((row) => row.lang === "fr");
    expect(fr).toHaveLength(1);
    expect(fr[0]?.printKey).toBe("naruto:ni-0064");
    expect(fr[0]?.name).toBe("Kakashi Hatake");
    expect(fr[0]?.printed).toBeUndefined();
    expect(fr[0]?.artFallbackFrom).toBeUndefined();
  });

  it("shows one FR Sasuke for NI-086 even when the stub key is unpadded", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ni-0086": {
          set: "ninja",
          card: "ni0086",
          name: "Sasuke Uchiwa",
          langs: { fr: { name: "Sasuke Uchiwa", art: "art.jpg" } },
        },
        "naruto:ni-086": {
          set: "s6",
          card: "ni086",
          name: "Sasuke Uchiwa",
          langs: { fr: { name: "Sasuke Uchiwa", printed: false } },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/carddass", index);
    const fr = rows.filter((row) => row.lang === "fr");
    expect(fr).toHaveLength(1);
    expect(fr[0]?.printKey).toBe("naruto:ni-0086");
    expect(fr[0]?.name).toBe("Sasuke Uchiwa");
    expect(fr[0]?.printed).toBeUndefined();
    expect(fr[0]?.artFallbackFrom).toBeUndefined();
  });
});

describe("same-number art fallback (Naruto)", () => {
  it("normalizes collector keys", () => {
    expect(catalogueCollectorKey("ni024")).toBe("ni:0024");
    expect(catalogueCollectorKey("n024")).toBe("n:0024");
    expect(catalogueCollectorKey("TE-030-cdf")).toBe("te:0030");
    expect(catalogueCollectorKey("te030-cdf")).toBe("te:0030");
    expect(catalogueCollectorKey("j001")).toBe("j:0001");
    expect(catalogueCollectorKey("ta081")).toBe("ta:0081");
    expect(catalogueCollectorKey("M-081")).toBe("m:0081");
    expect(catalogueCollectorKey("n1621")).toBe("n:1621");
    expect(catalogueCollectorKey("j1002")).toBe("j:1002");
  });

  it("lines FR / EN printings of the same number, ignoring series", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:s7-n001": {
          set: "s7",
          card: "n001",
          name: "Naruto Uzumaki",
          langs: { en: { art: "art.jpg" } },
        },
        "naruto:s1-ni001": {
          set: "s1",
          card: "ni001",
          name: "Naruto Uzumaki",
          langs: { fr: { art: "art.jpg" } },
        },
        "naruto:s1-te001": {
          set: "s1",
          card: "te001",
          name: "Kunai",
          langs: { fr: { art: "art.jpg" } },
        },
        "naruto:s7-j001": {
          set: "s7",
          card: "j001",
          name: "Kunai",
          langs: { en: { art: "art.jpg" } },
        },
        "naruto:s2-ta081": {
          set: "s2",
          card: "ta081",
          name: "Livre de la Terre",
          langs: { fr: { art: "art.jpg" } },
        },
        "naruto:s2-m081": {
          set: "s2",
          card: "m081",
          name: "Earth Scroll",
          langs: { en: { art: "art.jpg" } },
        },
      },
    };
    const rows = mergeNarutoCatalogueFaces(
      buildCatalogueCardRows("naruto/carddass", index),
    );
    expect(rows.map((row) => row.card)).toEqual([
      "ni001",
      "n001",
      "te001",
      "j001",
      "ta081",
      "m081",
    ]);
    expect(rows[0]?.label).toMatch(/^NI-001/);
    expect(rows[1]?.label).toMatch(/^N-001/);
  });

  it("inherits retail face onto promo stub until official art exists", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/carddass",
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
    const rows = buildCatalogueCardRows("naruto/carddass", index);
    const promo = rows.find((r) => r.printKey === "naruto:promo-ni024");
    const retail = rows.find((r) => r.printKey === "naruto:s1-ni024");
    expect(retail?.artUrl).toContain("/ninja/ni0024/fr/");
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

  it("shows the English name when preferLang is en, and keeps FR searchable", () => {
    const index = {
      version: 1 as const,
      pack: "dbs/cg",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "dbscg:bt1-005": {
          set: "bt1",
          card: "005",
          name: "Champa, Dieu de la destruction",
          langs: {
            fr: {
              name: "Champa, Dieu de la destruction",
              art: "art.webp",
            },
            en: {
              name: "God of Destruction Champa",
              art: "art.webp",
            },
          },
        },
      },
    };
    const en = buildCatalogueCardRows("dbs/cg", index, "en");
    expect(en[0]?.name).toBe("God of Destruction Champa");
    expect(en[0]?.label).toContain("God of Destruction Champa");
    expect(en[0]?.aka).toContain("Champa, Dieu de la destruction");
    const fr = buildCatalogueCardRows("dbs/cg", index, "fr");
    expect(fr[0]?.name).toBe("Champa, Dieu de la destruction");
    expect(fr[0]?.aka).toContain("God of Destruction Champa");
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
      pack: "naruto/carddass",
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
    const rows = buildCatalogueCardRows("naruto/carddass", index);
    const cdf = rows.find((r) => r.printKey === "naruto:promo-te030-cdf");
    expect(cdf?.artFallbackFrom).toBe("naruto:s3-te030");
  });

  it("expands every locale for Ninja Ranks instead of hiding FR behind EN titles", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/ninja-ranks",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:nr-0001": {
          set: "nr",
          card: "0001",
          name: "Title Card",
          langs: {
            en: { name: "Title Card", art: "art.inkworks.jpg" },
            fr: { name: "Et voici les ninjas !", art: "art.coleka.webp" },
            it: { art: "art.imadoki.jpg" },
          },
        },
        "naruto:nr-0003": {
          set: "nr",
          card: "0003",
          name: "Group 7 puzzle",
          langs: {
            en: { name: "Group 7 puzzle" },
            fr: {
              name: "Groupe 7 puzzle",
              art: "art.reconstructed.webp",
              artW: 1043,
              artH: 1500,
            },
            it: { art: "art.imadoki.jpg" },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/ninja-ranks", index, "en");
    expect(rows).toHaveLength(6);
    const one = rows.filter((r) => r.printKey === "naruto:nr-0001");
    expect(one.map((r) => r.lang).sort()).toEqual(["en", "fr", "it"]);
    expect(one.find((r) => r.lang === "fr")?.artUrl).toContain("/nr/fr/0001/");
    const threeFr = rows.find(
      (r) => r.printKey === "naruto:nr-0003" && r.lang === "fr",
    );
    expect(threeFr?.missingArt).toBeUndefined();
    expect(threeFr?.artUrl).toContain("/nr/fr/0003/art.reconstructed.webp");
  });

  it("shows every Ninja Ranks locale even when the index has no lang slot yet", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/ninja-ranks",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ff-0004": {
          set: "ff",
          card: "0004",
          name: "Sasuke - Naruto",
          langs: {
            en: { name: "Sasuke - Naruto" },
            fr: { art: "art.coleka.webp" },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/ninja-ranks", index, "it");
    const ff4 = rows.filter((r) => r.printKey === "naruto:ff-0004");
    expect(ff4.map((r) => r.lang).sort()).toEqual(["en", "fr", "it"]);
    expect(ff4.find((r) => r.lang === "it")?.artUrl).toContain("/ff/fr/0004/");
    expect(ff4.find((r) => r.lang === "it")?.artLocaleFrom).toBe("fr");
  });

  it("filtre sur la locale préférée pour Ninja Ranks (évite 3× le même libellé)", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/ninja-ranks",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:sd-0006": {
          set: "sd",
          card: "0006",
          name: "Shikamaru",
          langs: {
            en: { name: "Shikamaru" },
            fr: { art: "art.coleka.webp" },
            it: { art: "art.imadoki.jpg" },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/ninja-ranks", index, "fr");
    expect(rows).toHaveLength(3);
    const frOnly = rows.filter((r) => r.lang === "fr");
    expect(frOnly).toHaveLength(1);
    expect(frOnly[0]?.printKey).toBe("naruto:sd-0006");
    const listed = listCatalogueCards({
      pack: "naruto/ninja-ranks",
      locales: "preferred",
      preferLang: "fr",
      limit: 500,
    });
    expect(listed.cards.every((r) => r.lang === "fr" || r.kind?.endsWith("-back"))).toBe(
      true,
    );
  });

  it("emprunte la meilleure face neutre pour une autre locale du même tirage", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/ninja-ranks",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:nr-0010": {
          set: "nr",
          card: "0010",
          name: "Ten",
          langs: {
            en: { art: "art.arcadegamecards.jpg", artW: 600, artH: 840 },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/ninja-ranks", index, "fr");
    const fr = rows.find(
      (r) => r.printKey === "naruto:nr-0010" && r.lang === "fr",
    );
    expect(fr?.artUrl).toContain("/nr/en/0010/");
    expect(fr?.artLocaleFrom).toBe("en");
  });

  it("ne vole pas la face IT d'un tirage language-specific", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/ninja-ranks",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:nr-0068": {
          set: "nr",
          card: "0068",
          name: "Second Exam Survivors",
          langs: {
            fr: { name: "Second Examen des survivants" },
            it: { art: "art.imadoki.jpg", artW: 1500, artH: 1068 },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/ninja-ranks", index, "fr");
    const fr = rows.find(
      (r) => r.printKey === "naruto:nr-0068" && r.lang === "fr",
    );
    expect(fr?.missingArt).toBe(true);
    expect(fr?.artLocaleFrom).toBeUndefined();
  });

  it("préfère arcade à Coleka pour nr-0044 Gaï FR (reflet)", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/ninja-ranks",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:nr-0044": {
          set: "nr",
          card: "0044",
          name: "Guy",
          langs: {
            en: { art: "art.arcadegamecards.jpg", artW: 748, artH: 1032 },
            fr: { name: "Gaï", art: "art.coleka.webp", artW: 750, artH: 1098 },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/ninja-ranks", index, "fr");
    const fr = rows.find(
      (r) => r.printKey === "naruto:nr-0044" && r.lang === "fr",
    );
    expect(fr?.artUrl).toContain("/nr/en/0044/");
    expect(fr?.artLocaleFrom).toBe("en");
  });

  it("préfère arcade à Coleka pour ff-0006 FR (reflet)", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/ninja-ranks",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ff-0006": {
          set: "ff",
          card: "0006",
          name: "Itachi - Sasuke",
          langs: {
            en: { art: "art.arcadegamecards.jpg", artW: 740, artH: 1032 },
            fr: { art: "art.coleka.webp", artW: 750, artH: 1096 },
            it: { art: "art.imadoki.jpg", artW: 244, artH: 342 },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/ninja-ranks", index, "fr");
    const fr = rows.find(
      (r) => r.printKey === "naruto:ff-0006" && r.lang === "fr",
    );
    expect(fr?.artUrl).toContain("/ff/en/0006/");
    expect(fr?.artLocaleFrom).toBe("en");
  });

  it("marque paysage depuis les dimensions indexées", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/ninja-ranks",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ns-0001": {
          set: "ns",
          card: "0001",
          name: "Kakashi",
          landscapePrint: true,
          langs: {
            fr: {
              name: "Kakashi",
              art: "art.coleka.webp",
              artW: 1500,
              artH: 1068,
            },
          },
        },
        "naruto:nr-0010": {
          set: "nr",
          card: "0010",
          name: "Ten",
          langs: {
            en: { art: "art.arcadegamecards.jpg", artW: 600, artH: 840 },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/ninja-ranks", index, "fr");
    expect(rows.find((r) => r.printKey === "naruto:ns-0001")?.landscapeFace).toBe(
      true,
    );
    expect(
      rows.find((r) => r.printKey === "naruto:nr-0010")?.landscapeFace,
    ).toBeUndefined();
  });
});

describe("mergeCatalogueBackRows", () => {
  it("puts pack back first and set backs ahead of each set", async () => {
    const { mergeCatalogueBackRows } =
      await import("@/lib/admin/catalogueCards");
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
      pack: "naruto/carddass",
      faceRows: faces,
      packBackUrl: "/assets/naruto/carddass/cards/back.webp",
      setBackUrls: {
        s1: "/assets/naruto/carddass/cards/s1/back.webp",
        // s2 intentionally missing
      },
    });
    expect(rows.map((r) => r.printKey)).toEqual([
      "naruto/carddass:__pack-back__",
      "naruto:promo-ni001",
      "naruto/carddass:__set-back-s1__",
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
    const { mergeCatalogueBackRows } =
      await import("@/lib/admin/catalogueCards");
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
        pack: "naruto/carddass",
        faceRows: faces,
        packBackUrl: null,
        setBackUrls: {},
      }),
    ).toEqual(faces);
  });
});
