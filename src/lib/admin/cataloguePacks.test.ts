import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCatalogueCardRows,
  catalogueAvailableLocales,
  catalogueCollectorKey,
  entryHasFoil,
  langFilesHaveFoil,
  listCatalogueCards,
  matchesCatalogueAuditFilter,
  matchesCataloguePreferredLang,
  mergeNarutoCatalogueFaces,
  catalogueBackLangFromTierSlug,
  packFaceAssetUrl,
} from "@/lib/admin/catalogueCards";
import {
  applyCataloguePackParams,
  CATALOGUE_EXTRACT_DBS_FACES_TIMEOUT_MS,
  CATALOGUE_EXTRACT_FULL_TIMEOUT_MS,
  CATALOGUE_EXTRACT_TIMEOUT_MS,
  CATALOGUE_PACKS,
  catalogueCorpusPack,
  catalogueFranchises,
  catalogueFranchiseForPack,
  cataloguePackForExtractTarget,
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
    expect(resolveCataloguePackId("optcg")).toBe("onepiece");
    expect(resolveCataloguePackId("ygo")).toBe("yugioh");
    expect(resolveCataloguePackId("magic")).toBe("mtg");
    expect(resolveCataloguePackId("scryfall")).toBe("mtg");
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
      "onepiece",
      "digimon",
      "yugioh",
      "mtg",
    ]);
    const naruto = franchises.find((row) => row.id === "naruto");
    expect(naruto?.lines.map((line) => line.id)).toEqual([
      "naruto/carddass",
      "naruto/shippuden",
      "naruto/ninja-ranks",
      "naruto/ultra-challenge",
      "naruto/mythos",
      "naruto/kayou",
      "naruto/defi-ninja",
      "naruto/data-carddass",
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

  it("keeps every pack self-describing: markers, empty probes, extract timeouts", () => {
    for (const pack of CATALOGUE_PACKS) {
      expect(pack.extractMarkers.length, pack.id).toBeGreaterThan(0);
      expect(pack.emptyUnless.length, pack.id).toBeGreaterThan(0);
      // Registry paths stay relative — foilStatus / foilCatalogSync root them.
      for (const rel of [...pack.extractMarkers, ...pack.emptyUnless]) {
        expect(path.isAbsolute(rel), `${pack.id}:${rel}`).toBe(false);
        expect(rel, `${pack.id}:${rel}`).not.toMatch(/^\.{2}([/\\]|$)/);
      }
      expect(pack.extract.timeoutMs, pack.id).toBeGreaterThan(0);
      expect(
        cataloguePackForExtractTarget(pack.extractTarget)?.id,
        pack.extractTarget,
      ).toBe(pack.id);
    }
  });

  it("declares the Pokémon-specific extract bits on the pack, not the runner", () => {
    const pokemon = cataloguePackInfo("pokemon")!;
    expect(pokemon.extract.timeoutMs).toBe(CATALOGUE_EXTRACT_TIMEOUT_MS);
    expect(pokemon.extract.timeoutMsByScope?.catalogue).toBe(
      CATALOGUE_EXTRACT_FULL_TIMEOUT_MS,
    );
    expect(pokemon.extract.postExtract).toBe("invalidatePokemonFoilNamesCache");

    const masters = cataloguePackInfo("dbs/cg")!;
    expect(masters.extract.timeoutMs).toBe(
      CATALOGUE_EXTRACT_DBS_FACES_TIMEOUT_MS,
    );
    // Static preludes live on the descriptor; dynamic packs keep none.
    expect(masters.extract.prelude?.some((l) => /TCG Arena/i.test(l))).toBe(
      true,
    );
    expect(
      cataloguePackInfo("naruto/carddass")!.extract.prelude?.some((l) =>
        /Storm 3/i.test(l),
      ),
    ).toBe(true);
    expect(pokemon.extract.prelude).toBeUndefined();
    expect(cataloguePackInfo("lorcana")!.extract.prelude).toBeUndefined();
  });

  it("limits foil meta / APK lab to Pokémon and Lorcana", () => {
    expect(
      CATALOGUE_PACKS.filter((pack) => pack.hasFoilMeta).map((pack) => pack.id),
    ).toEqual(["pokemon", "lorcana"]);
  });

  it("resolves legacy extract-target aliases through the pack resolver", () => {
    expect(resolveCataloguePackId("naruto-cacg")).toBe("naruto/carddass");
    expect(resolveCataloguePackId("naruto-en-ccg")).toBe("naruto/carddass");
    expect(resolveCataloguePackId("dbs-masters")).toBe("dbs/cg");
    expect(resolveCataloguePackId("fusion-world")).toBe("dbs/fw");
    expect(resolveCataloguePackId("ninja-ranks")).toBe("naruto/ninja-ranks");
    expect(resolveCataloguePackId("ultra-challenge")).toBe(
      "naruto/ultra-challenge",
    );
  });

  it("splits Carddass NI/TE from EN CCG N/J/M — s1 is not enough", () => {
    expect(narutoCatalogueLineForCard("ni001", "s1")).toBe("carddass-fr");
    expect(narutoCatalogueLineForCard("n001", "s1")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("n1621", "s28")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("j1002", "s28")).toBe("en-ccg");
    expect(narutoCatalogueLineForCard("jus0088", "s6")).toBe("en-ccg");
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
      "src/providers/narutocarddass/packs.ts",
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

  it("defaults pokemon/lorcana/kayou to foils", () => {
    const pokemon = cataloguePackInfo("pokemon")!;
    expect(resolveCatalogueScope(null, pokemon)).toBe("foils");
    expect(resolveCatalogueScope("all", pokemon)).toBe("all");
    expect(resolveCatalogueScope("sealed", pokemon)).toBe("sealed");
    expect(resolveCatalogueScope(null, cataloguePackInfo("naruto/kayou")!)).toBe(
      "foils",
    );
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

  it("does not show a borrowed sibling name on a locale tile", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ni-0020": {
          set: "ninja",
          card: "ni0020",
          name: "Sasuke Uchiwa",
          langs: {
            fr: { art: "art.jpg", name: "Sasuke Uchiwa" },
            ja: { name: "うちはサスケ" },
            it: {
              art: "art.jpg",
              name: "うちはサスケ",
              nameLocaleFrom: "ja",
            },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/carddass", index);
    const it = rows.find((row) => row.card === "ni0020" && row.lang === "it");
    expect(it?.name).toBeUndefined();
    expect(it?.nameLocaleFrom).toBeUndefined();
    expect(it?.label).toBe("NI-020");
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

  it("lists PS1 bonus prints in JA only — no FR tile", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ni-0001-ps": {
          set: "ninja",
          card: "ni0001-ps",
          name: "うずまきナルト",
          langs: {
            fr: { name: "Naruto Uzumaki" },
            it: { name: "Naruto Uzumaki" },
            ja: {
              name: "うずまきナルト",
              art: "art.reconstructed.webp",
              thumb: "thumb.jpg",
            },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/carddass", index);
    expect(rows.map((r) => r.lang)).toEqual(["ja"]);
    expect(rows[0]?.artUrl).toContain("/ni0001-ps/ja/");
    expect(rows[0]?.artFallbackFrom).toBeUndefined();
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

  it("does not pair a tourney reprint with its booster number in the grid", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ni-0063": {
          set: "ninja",
          card: "ni0063",
          name: "Iruka",
          langs: { fr: { art: "art.jpg" } },
        },
        "naruto:ni-0063-promo": {
          set: "ninja",
          card: "ni0063-promo",
          name: "Iruka",
          rarity: "promo",
          langs: { fr: {} },
        },
        "naruto:te-0085": {
          set: "jutsu",
          card: "te0085",
          name: "Naruto furie",
          langs: { fr: { art: "art.jpg" } },
        },
        "naruto:pr-0011": {
          set: "promo",
          card: "pr0011",
          name: "Orochimaru",
          langs: { fr: { art: "art.jpg" } },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/carddass", index, "fr").filter(
      (row) => !row.kind || row.kind === "face",
    );
    expect(rows.map((row) => row.label.replace(/ — .*$/, ""))).toEqual([
      "NI-063",
      "TE-085",
      "NI-063 · promo",
      "PR-011",
    ]);
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

  it("filtre les fiches incomplètes (sans art, sans nom ou verso seul)", () => {
    const index = {
      version: 1 as const,
      pack: "dbs/cg",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "dbscg:ok": {
          set: "bt1",
          card: "001",
          name: "Champa",
          langs: { fr: { name: "Champa", art: "art.webp" } },
        },
        "dbscg:stub": {
          set: "bt1",
          card: "002",
          name: "Stub",
          langs: { fr: { name: "Stub" } },
        },
        "dbscg:noname": {
          set: "bt1",
          card: "003",
          langs: { fr: { art: "art.webp" } },
        },
      },
    };
    const rows = buildCatalogueCardRows("dbs/cg", index, "fr");
    const incomplete = rows.filter((row) =>
      matchesCatalogueAuditFilter(row, { incompleteOnly: true }),
    );
    expect(incomplete.map((row) => row.printKey).sort()).toEqual([
      "dbscg:noname",
      "dbscg:stub",
    ]);
    expect(incomplete.every((row) => row.missingArt || !row.name)).toBe(true);

    const missingArt = rows.filter((row) =>
      matchesCatalogueAuditFilter(row, { missingArtOnly: true }),
    );
    expect(missingArt.map((row) => row.printKey)).toEqual(["dbscg:stub"]);

    const missingName = rows.filter((row) =>
      matchesCatalogueAuditFilter(row, { missingNameOnly: true }),
    );
    expect(missingName.map((row) => row.printKey)).toEqual(["dbscg:noname"]);
  });

  it("expose les locales du pack pour le sélecteur admin", () => {
    expect(cataloguePackInfo("naruto/ninja-ranks")?.catalogueLocales).toEqual([
      "en",
      "fr",
      "it",
    ]);
    expect(cataloguePackInfo("dbs/fw")?.catalogueLocales).toEqual([
      "en",
      "ja",
    ]);
    const listed = listCatalogueCards({
      pack: "naruto/ninja-ranks",
      limit: 1,
    });
    expect(listed.availableLocales).toEqual(["en", "fr", "it"]);
  });

  it("filtre aussi les dos language-specific (tier back.ja)", () => {
    expect(catalogueBackLangFromTierSlug("ja")).toBe("ja");
    expect(catalogueBackLangFromTierSlug("hr")).toBe("—");
    const jaBack = {
      printKey: "naruto/shippuden:__pack-back-tier-ja__",
      set: "",
      card: "back",
      lang: "ja",
      artUrl: "/back.ja.webp",
      hasFoil: false,
      label: "Dos · pack · JA",
      kind: "pack-back" as const,
    };
    const shared = { ...jaBack, lang: "—", kind: "pack-back" as const };
    expect(matchesCataloguePreferredLang(jaBack, "ja")).toBe(true);
    expect(matchesCataloguePreferredLang(jaBack, "fr")).toBe(false);
    expect(matchesCataloguePreferredLang(shared, "fr")).toBe(true);

    const listed = listCatalogueCards({
      pack: "naruto/shippuden",
      locales: "preferred",
      preferLang: "ja",
      limit: 20,
    });
    const backs = listed.cards.filter((row) => row.kind === "pack-back");
    expect(backs.every((row) => row.lang === "—" || row.lang === "ja")).toBe(
      true,
    );
  });

  it("Mythos missions keep set/lang/card disk paths (not Carddass M-001)", () => {
    expect(cataloguePackInfo("naruto/mythos")?.narutoCollectorDisk).toBeFalsy();
    expect(
      packFaceAssetUrl(
        "naruto/mythos",
        { set: "ks1", lang: "fr", card: "m1" },
        "art.lorenzone.webp",
      ),
    ).toBe("/assets/naruto/mythos/cards/ks1/fr/m1/art.lorenzone.webp");
    const rows = buildCatalogueCardRows(
      "naruto/mythos",
      {
        version: 1,
        pack: "naruto/mythos",
        generatedAt: "2026-01-01T00:00:00.000Z",
        cards: {
          "mythos:ks1-m1": {
            set: "ks1",
            card: "m1",
            langs: {
              fr: { name: "APPEL DE SOUTIEN", art: "art.lorenzone.webp" },
            },
            name: "APPEL DE SOUTIEN",
            rarity: "Mission",
          },
        },
      },
      "fr",
    );
    expect(rows[0]?.label).toBe("ks1 · m1 — APPEL DE SOUTIEN");
    expect(rows[0]?.artUrl).toContain("/cards/ks1/fr/m1/");
    expect(rows[0]?.missingArt).toBeUndefined();
  });

  it("Mythos distingue 0120 / 0120-a et n'invente pas de coquille EN", () => {
    const rows = buildCatalogueCardRows(
      "naruto/mythos",
      {
        version: 1,
        pack: "naruto/mythos",
        generatedAt: "2026-01-01T00:00:00.000Z",
        cards: {
          "mythos:ks1-0120": {
            set: "ks1",
            card: "0120",
            langs: {
              fr: { name: "GAARA – Le Sarcophage de Sable", art: "art.lorenzone.webp" },
            },
            name: "GAARA – Le Sarcophage de Sable",
            rarity: "R",
          },
          "mythos:ks1-0120-a": {
            set: "ks1",
            card: "0120",
            langs: {
              fr: { name: "GAARA – Le Sarcophage de Sable", art: "art.lorenzone.webp" },
            },
            name: "GAARA – Le Sarcophage de Sable",
            rarity: "R-A",
          },
        },
      },
      "en",
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.lang === "fr")).toBe(true);
    expect(rows.map((row) => row.label)).toEqual([
      "ks1 · 0120 — GAARA – Le Sarcophage de Sable",
      "ks1 · 0120-a — GAARA – Le Sarcophage de Sable",
    ]);
    expect(rows[0]?.artUrl).toContain("/ks1/fr/0120/");
    expect(rows[1]?.artUrl).toContain("/ks1/fr/0120-a/");
  });

  it("Mythos preferred FR liste aussi Shinobi Shiren (SAMPLE EN)", () => {
    expect(cataloguePackInfo("naruto/mythos")?.catalogueLocales).toEqual([
      "fr",
      "en",
    ]);
    const listed = listCatalogueCards({
      pack: "naruto/mythos",
      locales: "preferred",
      preferLang: "fr",
      limit: 500,
    });
    // KS1 (fr) + SS2 (en titles) + pack back — filter used to hide all SS2.
    expect(listed.total).toBeGreaterThan(300);
    expect(
      listed.cards.some((row) => row.printKey.startsWith("mythos:ss2-")),
    ).toBe(true);
    expect(
      listed.cards.some((row) => row.printKey.startsWith("mythos:ks1-")),
    ).toBe(true);
  });

  it("疾風伝 n'expose pas de locale FR (japonais seul)", () => {
    expect(cataloguePackInfo("naruto/shippuden")?.catalogueLocales).toEqual([
      "ja",
    ]);
    const listed = listCatalogueCards({
      pack: "naruto/shippuden",
      locales: "preferred",
      preferLang: "fr",
      limit: 5,
    });
    expect(listed.availableLocales).toEqual(["ja"]);
    expect(listed.cards.every((row) => row.lang !== "fr")).toBe(true);
    // UI defaults to FR — coerced to ja via catalogueLocales.
    expect(listed.total).toBeGreaterThan(2);
    expect(listed.cards.some((row) => row.lang === "ja")).toBe(true);
  });

  it("preferred FR n'efface pas les faces neutres ; FW sans localeArt = lang-specific", () => {
    const fr = listCatalogueCards({
      pack: "dbs/fw",
      locales: "preferred",
      preferLang: "fr",
      limit: 5,
    });
    /*
      FW declares en+ja. preferLang `fr` is coerced to `en` (first Latin
      available), so we still see English tiles — not an empty FR invent.
    */
    expect(fr.availableLocales).toEqual(["en", "ja"]);
    expect(fr.total).toBeGreaterThan(100);
    expect(fr.cards.every((row) => row.lang !== "fr")).toBe(true);

    const en = listCatalogueCards({
      pack: "dbs/fw",
      locales: "preferred",
      preferLang: "en",
      limit: 5,
    });
    expect(en.total).toBeGreaterThan(100);
    expect(en.availableLocales).toEqual(["en", "ja"]);
    expect(en.cards.some((row) => row.kind !== "pack-back")).toBe(true);
  });

  it("mesure les locales depuis l'index quand le pack ne les déclare pas", () => {
    const index = {
      version: 1 as const,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:ni-0001": {
          set: "ni",
          card: "0001",
          name: "Naruto",
          langs: {
            fr: { name: "Naruto", art: "art.webp" },
            en: { name: "Naruto", art: "art.webp" },
            ja: { name: "うずまきナルト", art: "art.webp" },
            it: { art: "art.webp" },
          },
        },
      },
    };
    const rows = buildCatalogueCardRows("naruto/carddass", index, "fr");
    expect(catalogueAvailableLocales("naruto/carddass", rows)).toEqual([
      "en",
      "fr",
      "it",
      "ja",
    ]);
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
    expect(
      listed.cards.every((r) => r.lang === "fr" || r.kind?.endsWith("-back")),
    ).toBe(true);
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
    expect(fr?.languageSpecific).toBe(true);
    // Preferred FR must not show the empty FR shell — only IT has the face.
    expect(
      matchesCataloguePreferredLang(fr!, "fr", { expandLocales: true }),
    ).toBe(false);
    const it = rows.find(
      (r) => r.printKey === "naruto:nr-0068" && r.lang === "it",
    )!;
    expect(
      matchesCataloguePreferredLang(it, "it", { expandLocales: true }),
    ).toBe(true);
    expect(
      matchesCataloguePreferredLang(it, "fr", { expandLocales: true }),
    ).toBe(false);
  });

  it("garde une face neutre visible sous chaque langue (preferred)", () => {
    const neutral = {
      printKey: "naruto:nr-0010",
      set: "nr",
      card: "0010",
      lang: "en",
      artUrl: "/x.webp",
      hasFoil: false,
      label: "Ten",
      languageSpecific: false,
    };
    expect(
      matchesCataloguePreferredLang(neutral, "fr", { expandLocales: false }),
    ).toBe(true);
    expect(
      matchesCataloguePreferredLang(
        { ...neutral, lang: "fr", artLocaleFrom: "en" },
        "fr",
        { expandLocales: true },
      ),
    ).toBe(true);
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
    expect(
      rows.find((r) => r.printKey === "naruto:ns-0001")?.landscapeFace,
    ).toBe(true);
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
