import { describe, expect, it, afterEach } from "vitest";
import { mkdirSync, writeFileSync, mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectPhotoFallbackArt, formatKnownCardsMarkdown, isCollectorPhotoFallbackFace, isUnpublishedHtmlRef, PHYSICAL_KNOWN_SOURCES, type KnownCardsReport, type KnownSource, canonicalNarutoDiskPrefix, compareNarutoCollectors, canonicalizeNarutoPrintKey, formatNarutoReference, isJpOnlyNarutoArtwork, mintNarutoPrintKey, narutoCollectorKey, narutoCollectorNumberKey, narutoCollectorSearchNeedles, narutoCollectorsMatch, narutoDiskCardId, parseNarutoCollector, applyOfficialNames, collectorNumberOf, loadOfficialNames, type OfficialNames, appearanceSetsOf, appearanceValueForJson, mergeAppearanceValues, primaryAppearanceSet, NARUTO_PACK_ID, isNarutoDataCarddassPrintedRef, narutoCatalogueLineForCard, narutoCatalogueLineForSealed, narutoDataPackForCard, checklistIdToNumberForms, officialFrChecklistSetsForNumber, resetOfficialFrChecklistCache, syncOfficialFrChecklistAppearances, narutoPrintFacts, narutoSetLabel } from "./identity";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import type { NarutoPrintDetail } from "./search";

// —— knownCards ——
{
  describe("formatKnownCardsMarkdown", () => {
    it("tolerates set rows without starters (tempete-class)", () => {
      const report: KnownCardsReport = {
        generatedAt: "2026-09-09T00:00:00.000Z",
        sets: {
          tempete: {
            series: 11,
            starters: undefined as unknown as string[],
            colekaLabel: null,
            released: true,
          },
        },
        counts: {
          "carddass-fr-checklist": 0,
          "apache-index": 0,
          "carddass-html": 0,
          "manga-news": 0,
          coleka: 0,
          "local-index": 0,
        },
        total: 0,
        missingArt: [],
        unreleased: [],
        unreleasedHtmlOnly: [],
        unattested: [],
        photoFallbackArt: [],
        cards: [],
      };
      expect(formatKnownCardsMarkdown(report)).toContain("| `tempete` | — | — |");
    });
  });

  describe("isUnpublishedHtmlRef", () => {
    it("flags lone carddass-html as unpublished (ta090-class)", () => {
      expect(isUnpublishedHtmlRef(["carddass-html"])).toBe(true);
    });

    it("does not flag empty or multi-source rows", () => {
      expect(isUnpublishedHtmlRef([])).toBe(false);
      expect(
        isUnpublishedHtmlRef(["carddass-html", "carddass-fr-checklist"]),
      ).toBe(false);
      expect(isUnpublishedHtmlRef(["manga-news"])).toBe(false);
    });

    it("physical sources alone are not unpublished-html", () => {
      for (const source of PHYSICAL_KNOWN_SOURCES) {
        expect(isUnpublishedHtmlRef([source as KnownSource])).toBe(false);
      }
    });
  });

  describe("collector photo fallback", () => {
    it("flags plain oversized art, not corrected/reconstructed", () => {
      expect(
        isCollectorPhotoFallbackFace({
          preferredArtFile: "art.jpg",
          bytes: 700_000,
        }),
      ).toBe(true);
      expect(
        isCollectorPhotoFallbackFace({
          preferredArtFile: "art.corrected.jpg",
          bytes: 700_000,
        }),
      ).toBe(false);
      expect(
        isCollectorPhotoFallbackFace({
          preferredArtFile: "art.reconstructed.webp",
          bytes: 700_000,
        }),
      ).toBe(false);
      expect(
        isCollectorPhotoFallbackFace({
          preferredArtFile: "art.jpg",
          bytes: 60_000,
        }),
      ).toBe(false);
    });

    it("skips dirs that prefer corrected even if art.jpg is huge", () => {
      const root = mkdtempSync(path.join(tmpdir(), "naruto-photo-fb-"));
      const card = path.join(root, "s4", "fr", "ni165");
      mkdirSync(card, { recursive: true });
      writeFileSync(path.join(card, "art.jpg"), Buffer.alloc(400_000));
      writeFileSync(path.join(card, "art.corrected.jpg"), Buffer.alloc(80_000));
      const gap = path.join(root, "s4", "fr", "ni194");
      mkdirSync(gap, { recursive: true });
      writeFileSync(path.join(gap, "art.jpg"), Buffer.alloc(400_000));
      const rows = collectPhotoFallbackArt(root);
      expect(rows.map((r) => r.printKey)).toEqual(["naruto:ni-0194"]);
      expect(rows[0]?.priority).toBe("high");
    });
  });
}

// —— collectorIdentity ——
{
  describe("parseNarutoCollector", () => {
    it.each([
      ["ni001", "ninja", 1, "ni"],
      ["N-001", "ninja", 1, "N"],
      ["忍-1", "ninja", 1, "忍"],
      ["te001", "jutsu", 1, "te"],
      ["J-001", "jutsu", 1, "J"],
      ["ta081", "mission", 81, "ta"],
      ["TA-81", "mission", 81, "TA"],
      ["M-081", "mission", 81, "M"],
      ["ST-226", "mission", 226, "ST"],
      ["JU-1002", "jutsu", 1002, "JU"],
      ["MI-976", "mission", 976, "MI"],
      ["作-81", "mission", 81, "作"],
      ["cl001", "client", 1, "cl"],
      ["C-035", "client", 35, "C"],
      ["騎-7", "knight", 7, "騎"],
      ["ki007", "knight", 7, "ki"],
    ] as const)("reads %s as %s %s", (raw, family, number, prefix) => {
      const id = parseNarutoCollector(raw);
      expect(id?.family).toBe(family);
      expect(id?.number).toBe(number);
      expect(id?.printedPrefix).toBe(prefix);
    });

    it.each(["NR-1", "NR-0001", "FF-1", "SD-1", "NW-1", "BL-1", "PN-1", "UC-1"])(
      "does not swallow Panini Ninja Ranks / Ultra %s as Carddass",
      (raw) => {
        expect(parseNarutoCollector(raw)).toBeNull();
      },
    );

    /*
      Data Carddass arcade vit dans `narutodatacarddass`. Hors Carddass :
      `NM-`/`DN-`/`DT-`/`NX-` → null (pas de mint `naruto:dn-…`).
    */
    it("refuse Data Carddass arcade (autre provider)", () => {
      expect(parseNarutoCollector("NM-081")).toBeNull();
      expect(parseNarutoCollector("DN-001")).toBeNull();
      expect(parseNarutoCollector("DN-032T")).toBeNull();
      expect(parseNarutoCollector("DT-002T")).toBeNull();
    });

    it("keeps a promo grouping off the collector number", () => {
      expect(parseNarutoCollector("te030-cdf")).toEqual({
        family: "jutsu",
        number: 30,
        grouping: "cdf",
        printedPrefix: "te",
      });
      expect(parseNarutoCollector("PR忍-1-R")).toEqual({
        family: "promo",
        number: 1,
        grouping: "R",
        printedPrefix: "prni",
      });
      expect(parseNarutoCollector("PR-005R")).toEqual({
        family: "promo",
        number: 5,
        grouping: "R",
        printedPrefix: "PR",
      });
      expect(narutoDiskCardId("PR-005R")).toBe("pr0005-R");
      expect(narutoDiskCardId("Pr 005R")).toBe("pr0005-R");
      expect(mintNarutoPrintKey("PR-005R")).toBe("naruto:pr-0005-r");
      expect(narutoCollectorsMatch("PR-005", "PR-005R")).toBe(false);
    });

    it("keeps N-US tin exclusives off the regular N number", () => {
      expect(parseNarutoCollector("N-US097")).toEqual({
        family: "ninja",
        number: 97,
        grouping: null,
        printedPrefix: "nus",
      });
      expect(parseNarutoCollector("PR-US010")).toEqual({
        family: "promo",
        number: 10,
        grouping: null,
        printedPrefix: "prus",
      });
      expect(parseNarutoCollector("n0097-us")).toEqual({
        family: "ninja",
        number: 97,
        grouping: null,
        printedPrefix: "nus",
      });
      expect(narutoCollectorsMatch("n0097", "N-US097")).toBe(false);
      expect(narutoCollectorsMatch("n0097-us", "nus0097")).toBe(true);
    });
  });

  describe("疾風伝 printed prefixes", () => {
    /*
      nikita files the 疾風伝 game (`nrts`) under 忍伝 / 術伝 / 作伝. We store those
      lines as `shi` / `mju` / `msa`, and only the Latin form used to fold — the
      printed kanji resolved to nothing, so a 疾風伝 face could not be joined.
    */
    it("folds 忍伝 / 術伝 / 作伝 onto the ids we store", () => {
      expect(narutoDiskCardId("忍伝-037")).toBe("shi0037");
      expect(narutoDiskCardId("術伝-023")).toBe("mju0023");
      expect(narutoDiskCardId("作伝-026")).toBe("msa0026");
    });

    it("keeps 忍伝-学 on gaku — it is a longer prefix than 忍伝", () => {
      expect(narutoDiskCardId("忍伝-学-001")).toBe("gaku0001");
      expect(narutoDiskCardId("忍伝学001")).toBe("gaku0001");
      expect(narutoDiskCardId("忍伝-001")).toBe("shi0001");
    });

    it("does not collapse a 疾風伝 number onto the 巻ノ card of the same number", () => {
      expect(narutoDiskCardId("忍伝-037")).not.toBe(narutoDiskCardId("忍-37"));
      expect(narutoCollectorsMatch("忍伝-037", "忍-37")).toBe(false);
    });
  });

  describe("騎 knight numbers", () => {
    /*
      騎士 (Temujin, the Gelel knights) is a fifth base type minted inside regular
      JP releases — 騎-1〜6 on the 2005-08 filing sheet, 騎-7〜8 in 巻ノ十三. It was
      skipped as "not a prefix we mint" until cardcheckbox published the ranges and
      nikita turned out to serve `K-007.jpg`.
    */
    it("mints 騎 on its own family and disk prefix", () => {
      expect(narutoDiskCardId("騎-7")).toBe("ki0007");
      expect(narutoDiskCardId("KI-7")).toBe("ki0007");
      expect(parseNarutoCollector("騎-7")?.family).toBe("knight");
    });

    it("does not fold 騎 onto PR騎 — the promo sequence is another card", () => {
      expect(narutoDiskCardId("PR騎-1")).toBe("prki0001");
      expect(parseNarutoCollector("PR騎-1")?.family).toBe("promo");
      expect(narutoCollectorsMatch("騎-1", "PR騎-1")).toBe(false);
    });

    it("sorts knights after clients and before the promo sequences", () => {
      const sorted = ["prni0001", "ki0007", "cl0002", "ni0001"].sort(
        compareNarutoCollectors,
      );
      expect(sorted).toEqual(["ni0001", "cl0002", "ki0007", "prni0001"]);
    });
  });

  describe("narutoCollectorsMatch", () => {
    it("treats Carddass prefixes as the same impression, not CCG N/J/M", () => {
      expect(narutoCollectorsMatch("ni001", "n001")).toBe(false);
      expect(narutoCollectorsMatch("NI-001", "忍-1")).toBe(true);
      expect(narutoCollectorsMatch("ta081", "M-081")).toBe(false);
      expect(narutoCollectorsMatch("TA-81", "作-81")).toBe(true);
      expect(narutoCollectorsMatch("te001", "J-001")).toBe(false);
      expect(narutoCollectorsMatch("ST-226", "ta226")).toBe(true);
      expect(narutoCollectorsMatch("JU-1002", "j1002")).toBe(true);
    });

    it("shares a number key across a promo grouping, for art fallback", () => {
      expect(narutoCollectorNumberKey("te030-cdf")).toBe("te:0030");
      expect(narutoCollectorNumberKey("te030")).toBe("te:0030");
      expect(narutoCollectorNumberKey("ni024")).toBe("ni:0024");
      expect(narutoCollectorNumberKey("n024")).toBe("n:0024");
    });

    it("does not collapse ninja 1 with jutsu 1 or a different number", () => {
      expect(narutoCollectorsMatch("ni001", "te001")).toBe(false);
      expect(narutoCollectorsMatch("n001", "n002")).toBe(false);
      expect(narutoCollectorsMatch("ta081", "ta080")).toBe(false);
      expect(narutoCollectorsMatch("te030", "te030-cdf")).toBe(false);
    });
  });

  describe("compareNarutoCollectors", () => {
    it("lines locale printings of the same number up together, ignoring series", () => {
      const numbers = ["m081", "ni001", "ta081", "N-001", "J-001", "te001"];
      const sorted = [...numbers].sort(compareNarutoCollectors);
      expect(sorted.map((n) => narutoCollectorKey(n))).toEqual([
        "ni:0001",
        "n:0001",
        "te:0001",
        "j:0001",
        "ta:0081",
        "m:0081",
      ]);
    });

    it("keeps N-US off the regular N number — tin exclusives are another sequence", () => {
      const numbers = [
        "N-US001",
        "N-0002",
        "NI-001",
        "N-0001",
        "J-US001",
        "J-001",
      ];
      const sorted = [...numbers].sort(compareNarutoCollectors);
      expect(sorted.map((n) => narutoCollectorKey(n))).toEqual([
        "ni:0001",
        "n:0001",
        "n:0002",
        "nus:0001",
        "j:0001",
        "jus:0001",
      ]);
    });

    it("files tourney reprints with PR, not beside the booster number", () => {
      const numbers = [
        "ni063-promo",
        "ni063",
        "ni065",
        "pr011",
        "te085-promo",
        "te085",
        "te030-cdf",
        "te030",
      ];
      const sorted = [...numbers].sort(compareNarutoCollectors);
      expect(sorted).toEqual([
        "ni063",
        "ni065",
        "te030",
        "te085",
        "ni063-promo",
        "te030-cdf",
        "te085-promo",
        "pr011",
      ]);
    });

    it("files PR忍 with French PR-nn, not beside NI", () => {
      const numbers = ["PR-忍-1", "NI-001", "PR-11", "N-001", "OP忍-1"];
      const sorted = [...numbers].sort(compareNarutoCollectors);
      expect(sorted.map((n) => narutoCollectorKey(n))).toEqual([
        "ni:0001",
        "n:0001",
        "prni:0001",
        "opni:0001",
        "pr:0011",
      ]);
    });

    it("keeps 幕 / 忍者学校 after NI/N within ninja, not interleaved", () => {
      const numbers = [
        "NI-001",
        "N-001",
        "shi0001",
        "gaku0001",
        "J-001",
        "mju0001",
      ];
      const sorted = [...numbers].sort(compareNarutoCollectors);
      expect(sorted.map((n) => narutoCollectorKey(n))).toEqual([
        "ni:0001",
        "n:0001",
        "shi:0001",
        "gaku:0001",
        "j:0001",
        "mju:0001",
      ]);
    });
  });

  describe("narutoCollectorSearchNeedles", () => {
    it("expands a French number onto the English disk id", () => {
      expect(narutoCollectorSearchNeedles("NI-001")).toEqual(
        expect.arrayContaining(["ni001", "n001", "ni0001", "n0001"]),
      );
      expect(narutoCollectorSearchNeedles("NI-001")).not.toContain("prni0001");
      expect(narutoCollectorSearchNeedles("TA-81")).toEqual(
        expect.arrayContaining(["ta081", "m081", "st081"]),
      );
    });

    it("does not search N-US097 inside the regular N-097 folder", () => {
      expect(narutoCollectorSearchNeedles("N-US097")).toEqual(
        expect.arrayContaining(["nus97", "nus097", "nus0097"]),
      );
      expect(narutoCollectorSearchNeedles("N-US097")).not.toContain("n0097");
      expect(narutoDiskCardId("N-US097")).toBe("nus0097");
      expect(formatNarutoReference("tin1", "nus0097")).toBe("N-US097");
      expect(formatNarutoReference("s3", "n0097-us")).toBe("N-US097");
      expect(mintNarutoPrintKey("N-US097")).toBe("naruto:nus-0097");
    });

    it("does not search 幕 / 忍者学校 inside NI/N/J/M folders", () => {
      expect(narutoCollectorSearchNeedles("GAKU-001")).toEqual(
        expect.arrayContaining(["gaku1", "gaku001", "gaku0001"]),
      );
      expect(narutoCollectorSearchNeedles("GAKU-001")).not.toContain("ni0001");
      expect(narutoCollectorSearchNeedles("shi0001")).toEqual(
        expect.arrayContaining(["shi1", "shi001", "shi0001"]),
      );
      expect(narutoCollectorSearchNeedles("shi0001")).not.toContain("ni0001");
      expect(narutoCollectorSearchNeedles("mju0062")).not.toContain("j0062");
      expect(narutoCollectorSearchNeedles("msa0044")).not.toContain("m0044");
    });
  });

  describe("canonicalizeNarutoPrintKey", () => {
    it("folds series-baked keys onto the printed prefix", () => {
      expect(canonicalizeNarutoPrintKey("naruto:s6-ni064")).toBe(
        "naruto:ni-0064",
      );
      expect(canonicalizeNarutoPrintKey("naruto:s2-ni064")).toBe(
        "naruto:ni-0064",
      );
      expect(canonicalizeNarutoPrintKey("naruto:ni-0064")).toBe("naruto:ni-0064");
      expect(mintNarutoPrintKey("ni064")).toBe("naruto:ni-0064");
    });

    it("re-pads a prefix key so ni-086 is the same print as ni-0086", () => {
      expect(canonicalizeNarutoPrintKey("naruto:ni-086")).toBe("naruto:ni-0086");
      expect(canonicalizeNarutoPrintKey("naruto:ni-0086")).toBe("naruto:ni-0086");
    });

    it("rewrites a leftover n-0097-us key onto the US prefix", () => {
      expect(canonicalizeNarutoPrintKey("naruto:n-0097-us")).toBe(
        "naruto:nus-0097",
      );
      expect(canonicalizeNarutoPrintKey("naruto:nus-0097")).toBe(
        "naruto:nus-0097",
      );
    });

    it("keeps a promo grouping off the retail number", () => {
      expect(canonicalizeNarutoPrintKey("naruto:promo-ni024")).toBe(
        "naruto:ni-0024-promo",
      );
    });
  });

  describe("Data Carddass — hors catalogue Carddass", () => {
    it("ne confond pas NM/DN avec le CCG US N/M", () => {
      // `N-1646` / `M-012` restent tabletop/CCG ; l'arcade est rejetée plus haut.
      expect(parseNarutoCollector("N-1646")?.family).toBe("ninja");
      expect(parseNarutoCollector("忍-11")?.family).toBe("ninja");
      expect(parseNarutoCollector("M-012")?.family).toBe("mission");
      expect(parseNarutoCollector("NM-049")).toBeNull();
      expect(parseNarutoCollector("DN-032T")).toBeNull();
    });
  });

  describe("isJpOnlyNarutoArtwork", () => {
    it("marque les bonus PS1, pas le retail ni les promos", () => {
      expect(isJpOnlyNarutoArtwork("ni0001-ps")).toBe(true);
      expect(isJpOnlyNarutoArtwork("ni0001")).toBe(false);
      expect(isJpOnlyNarutoArtwork("ni0023-promo")).toBe(false);
    });
  });
}

// —— officialNames ——
{
  function print(number: string, set = "s5"): NarutoPrintRow {
    return {
      printKey: `naruto:${set}-${number}`,
      setCode: set,
      number,
      cardType: number.slice(0, 2),
    };
  }

  function title(
    number: string,
    fullName: string,
    rarity: string | null = null,
    set = "s5",
  ): NarutoTitleRow {
    return { printKey: `naruto:${set}-${number}`, lang: "fr", fullName, rarity };
  }

  const official: OfficialNames = new Map([
    ["ta226", { name: "Pouvoir de la marque maléfique", rarity: "commune" }],
    ["te212", { name: "Fûton, technique suprême de la boule de feu" }],
    ["ni150", { name: "Sakon" }],
  ]);

  describe("applyOfficialNames", () => {
    it("replaces a community name truncated at ~24 chars", () => {
      const prints = [print("ta226")];
      const { titles, replaced } = applyOfficialNames(
        prints,
        [title("ta226", "Pouvoir de la marque mal...")],
        official,
      );
      expect(replaced).toBe(1);
      expect(titles[0]!.fullName).toBe("Pouvoir de la marque maléfique");
    });

    it("wins over a community misreading", () => {
      // Manga-News reads "kâton"; the card and the site list say "Fûton".
      const { titles } = applyOfficialNames(
        [print("te212")],
        [title("te212", "kâton, technique suprême...")],
        official,
      );
      expect(titles[0]!.fullName).toBe(
        "Fûton, technique suprême de la boule de feu",
      );
    });

    it("keeps the printed-checklist erratum resolution", () => {
      // The printed checklist says "Temari" at NI-150; the card reads SAKON.
      const { titles } = applyOfficialNames(
        [print("ni150", "s3")],
        [title("ni150", "Sakon", null, "s3")],
        official,
      );
      expect(titles[0]!.fullName).toBe("Sakon");
    });

    it("adds a title when the community cache had none", () => {
      const { titles, added } = applyOfficialNames(
        [print("ni150")],
        [],
        official,
      );
      expect(added).toBe(1);
      expect(titles[0]).toMatchObject({ fullName: "Sakon", lang: "fr" });
    });

    it("leaves Coleka-only S6 names when official has nothing for that number", () => {
      const kept = title("te267", "Bruine de sable", "commune", "s6");
      const { titles, replaced, added } = applyOfficialNames(
        [print("te267", "s6")],
        [kept],
        official,
      );
      expect(replaced).toBe(0);
      expect(added).toBe(0);
      expect(titles).toEqual([kept]);
    });

    it("adds attested S6 FR names from the official ledger", () => {
      const names = loadOfficialNames();
      const { titles, added } = applyOfficialNames(
        [print("ni268", "s6"), print("te236", "s6")],
        [],
        names,
      );
      expect(added).toBe(2);
      expect(titles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ fullName: "Gaara", lang: "fr" }),
          expect.objectContaining({
            fullName: "La morsure du loup",
            lang: "fr",
          }),
        ]),
      );
    });

    it("fills a missing rarity without overwriting one", () => {
      const { titles } = applyOfficialNames(
        [print("ta226")],
        [title("ta226", "Pouvoir de la marque mal...", null)],
        official,
      );
      expect(titles[0]!.rarity).toBe("commune");

      const kept = applyOfficialNames(
        [print("ta226")],
        [title("ta226", "Pouvoir de la marque mal...", "holo")],
        official,
      );
      expect(kept.titles[0]!.rarity).toBe("holo");
    });

    it("strips the promo grouping suffix off the collector number", () => {
      expect(collectorNumberOf(print("te030-cdf", "promo"))).toBe("te030");
      expect(collectorNumberOf(print("ni232"))).toBe("ni232");
    });

    it("official S5 names are not site-liste HTML bleeds (NI-X glued into name)", () => {
      const names = loadOfficialNames();
      const bleed =
        /(?:Ninja|Technique|Tactique|Client)\s+(?:Holo\s+)?(?:rare\s+)?(?:NI|TE|TA|CL)-\d+|Holo\s+(?:Commune|rare)\s+(?:NI|TE|TA|CL)-\d+/i;
      for (const [id, card] of names) {
        expect(card.name, id).not.toMatch(bleed);
        expect(card.name, id).not.toMatch(/\b(?:NI|TE|TA|CL)-\d+/i);
      }
      expect(names.get("ni254")?.name).toBe("Kimimaro");
      expect(names.get("ni248")?.name).toBe("Idate Morino");
      expect(names.get("ta052")?.name).toBe("La fin du démon");
      expect(names.get("ta053")?.name).toBe("Test écrit");
    });
  });

  /*
    Le nom officiel se cherche par numéro, suffixe retiré — juste pour un
    `-promo`, qui est un retirage de la même carte. Faux pour `-ps` : le bonus de
    précommande du jeu PS1 porte les numéros 忍-1/2/3/11 avec une illustration
    **inédite**, et n'est jamais sorti hors du Japon. Il recevait le nom français
    de la carte qu'il n'est pas.
  */
  describe("un suffixe qui désigne une autre carte n'emprunte rien", () => {
    const print = (number: string) =>
      ({ printKey: `naruto:x-${number}`, number }) as never;

    /** Le registre des noms est indexé en trois chiffres : `ni023`, pas `ni0023`. */
    it("keeps looking up the base card for a reprint", () => {
      expect(collectorNumberOf(print("ni0023-promo"))).toBe("ni023");
      expect(collectorNumberOf(print("te0030-cdf"))).toBe("te030");
      expect(collectorNumberOf(print("ni0046"))).toBe("ni046");
    });

    it("refuses to for the PS1 bonus, whose art is its own", () => {
      for (const n of ["ni0001-ps", "ni0002-ps", "ni0003-ps", "ni0011-ps"]) {
        expect(collectorNumberOf(print(n)), n).toBeNull();
      }
    });
  });
}

// —— appearanceSets ——
{
  describe("appearanceSetsOf", () => {
    it("normalise scalaire et liste", () => {
      expect(appearanceSetsOf("s5")).toEqual(["s5"]);
      expect(appearanceSetsOf(["s5", "s1", "s5"])).toEqual(["s1", "s5"]);
      expect(appearanceSetsOf("unknown")).toEqual([]);
    });
  });

  describe("primaryAppearanceSet", () => {
    it("préfère la plus petite série FR", () => {
      expect(primaryAppearanceSet(["s5", "s1"])).toBe("s1");
      expect(primaryAppearanceSet(["promo", "s3"])).toBe("s3");
    });

    it("ignore les 巻ノ face à une série européenne", () => {
      expect(primaryAppearanceSet(["maki3", "s1", "s5"])).toBe("s1");
    });

    it("prefers s6 over promo for shared EN CCG / tin folders", () => {
      expect(primaryAppearanceSet(["promo", "s6"])).toBe("s6");
      expect(primaryAppearanceSet(["s6", "promo"])).toBe("s6");
    });
  });

  describe("appearanceValueForJson", () => {
    it("reste scalaire pour une seule série", () => {
      expect(appearanceValueForJson(["s1"])).toBe("s1");
      expect(appearanceValueForJson(["s1", "s5"])).toEqual(["s1", "s5"]);
    });
  });

  describe("mergeAppearanceValues", () => {
    it("union sans doublon", () => {
      expect(mergeAppearanceValues("s5", ["s1", "s5"])).toEqual(["s1", "s5"]);
    });
  });
}

// —— packs ——
{
  describe("narutoCatalogueLineForCard", () => {
    it("sépare le Carddass de table du CCG américain", () => {
      expect(narutoCatalogueLineForCard("ni001", "s1")).toBe("carddass-fr");
      expect(narutoCatalogueLineForCard("te010")).toBe("carddass-fr");
      expect(narutoCatalogueLineForCard("N-1646")).toBe("en-ccg");
      expect(narutoCatalogueLineForCard("J-006")).toBe("en-ccg");
    });

    /*
      Data Carddass arcade vit dans `narutodatacarddass`. Les refs DN/NM ne
      doivent surtout pas tomber en en-ccg (collision N/M).
    */
    it("détecte DN/NM comme arcade hors ligne CCG", () => {
      expect(isNarutoDataCarddassPrintedRef("DN-032T")).toBe(true);
      expect(isNarutoDataCarddassPrintedRef("NM-049")).toBe(true);
      expect(isNarutoDataCarddassPrintedRef("dn-1t")).toBe(true);
      expect(narutoCatalogueLineForCard("DN-032T")).not.toBe("en-ccg");
      expect(narutoCatalogueLineForCard("NM-049")).not.toBe("en-ccg");
    });

    it("ne vole pas les numéros du CCG US, qui commencent aussi par N et M", () => {
      // `NM-` doit être lu avant `N-` : sinon la borne mange le jeu de table.
      expect(narutoCatalogueLineForCard("N-001")).toBe("en-ccg");
      expect(narutoCatalogueLineForCard("M-012")).toBe("en-ccg");
      expect(narutoCatalogueLineForCard("jus0088", "s6")).toBe("en-ccg");
      expect(narutoCatalogueLineForCard("N-US088")).toBe("en-ccg");
      expect(narutoCatalogueLineForCard("PR-US001")).toBe("en-ccg");
    });
  });

  describe("narutoCatalogueLineForSealed", () => {
    it("range le scellé par langue puis par série", () => {
      expect(
        narutoCatalogueLineForSealed({ lang: "EN", slug: "display-s13" }),
      ).toBe("en-ccg");
      expect(
        narutoCatalogueLineForSealed({ lang: "JA", slug: "booster-vol5-jp" }),
      ).toBe("carddass-fr");
      expect(narutoCatalogueLineForSealed({ slug: "display-s20" })).toBe(
        "en-ccg",
      );
      expect(narutoCatalogueLineForSealed({ slug: "booster-s1" })).toBe(
        "carddass-fr",
      );
    });
  });

  describe("narutoDataPackForCard", () => {
    it("garde un seul pack Carddass sur le disque, quelle que soit la ligne", () => {
      // La ligne est un axe d'étiquetage, pas un second catalogue.
      // DN/NM : autre provider (`narutodatacarddass`) — détectés à part.
      expect(narutoDataPackForCard("ni001", "s1")).toBe(NARUTO_PACK_ID);
      expect(narutoDataPackForCard("N-1646")).toBe(NARUTO_PACK_ID);
      expect(isNarutoDataCarddassPrintedRef("DN-032T")).toBe(true);
    });
  });
}

// —— officialFrChecklist ——
{
  const dirs: string[] = [];

  afterEach(() => {
    resetOfficialFrChecklistCache();
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe("checklistIdToNumberForms", () => {
    it("couvre les paddings disque pour NI-049", () => {
      expect(checklistIdToNumberForms("ni049")).toEqual(
        expect.arrayContaining(["ni49", "ni049", "ni0049"]),
      );
    });
  });

  describe("officialFrChecklistSetsForNumber", () => {
    it("liste S1 et S5 pour NI-049 (checklist papier)", () => {
      expect(officialFrChecklistSetsForNumber("ni0049")).toEqual(["s1", "s5"]);
    });
  });

  describe("syncOfficialFrChecklistAppearances", () => {
    it("écrit s1+s5 sur le disque pour ni0049", () => {
      const root = mkdtempSync(path.join(tmpdir(), "naruto-fr-check-"));
      dirs.push(root);
      const file = path.join(root, "appearances.json");
      writeFileSync(
        file,
        `${JSON.stringify({
          generatedAt: "2026-01-01T00:00:00.000Z",
          appearances: { ni0049: { fr: "s5", ja: "maki3" } },
        })}\n`,
      );

      const changed = syncOfficialFrChecklistAppearances(root);
      expect(changed).toBeGreaterThan(0);
      expect(existsSync(file)).toBe(true);

      const raw = JSON.parse(readFileSync(file, "utf8")) as {
        appearances: Record<string, Record<string, string | string[]>>;
      };
      expect(raw.appearances.ni0049?.fr).toEqual(["s1", "s5"]);
      expect(raw.appearances.ni0049?.ja).toBe("maki3");
    });
  });
}

// —— facts ——
{
  const row = (over: Partial<NarutoPrintDetail> = {}): NarutoPrintDetail => ({
    printKey: "naruto:s5-ni232",
    setCode: "s5",
    number: "ni232",
    cardType: "ni",
    lang: "fr",
    fullName: "Shikamaru Nara",
    rarity: "commune",
    art: "art.webp",
    thumb: null,
    ...over,
  });

  const value = (facts: ReturnType<typeof narutoPrintFacts>, label: string) =>
    facts.find((f) => f.label === label)?.value;

  describe("narutoSetLabel", () => {
    it("names a series by its two starters, which is what a collector recognises", () => {
      expect(narutoSetLabel("s5")).toBe("Série 5 — La quête / Un nouveau départ");
      expect(narutoSetLabel("s1")).toBe("Série 1 — Maître Hokage / Pays du Vent");
      expect(narutoSetLabel("s1", "ni001")).toBe(
        "Série 1 — Maître Hokage / Pays du Vent",
      );
    });

    it("names EN CCG Series 1 Path to Hokage without colliding with Carddass s1", () => {
      expect(narutoSetLabel("s1", "n001")).toBe("Series 1 — The Path to Hokage");
      expect(narutoSetLabel("s1", "j001")).toBe("Series 1 — The Path to Hokage");
    });

    it("names Série 6 with the French Rivalité éternelle title", () => {
      expect(narutoSetLabel("s6")).toBe("Série 6 — Rivalité éternelle");
      expect(narutoSetLabel("s6", "ni0236")).toBe("Série 6 — Rivalité éternelle");
      expect(narutoSetLabel("s6", "n0236")).toBe("Series 6 — Eternal Rivalry");
    });

    it("keeps promos out of the series numbering", () => {
      expect(narutoSetLabel("promo")).toBe("Promo (hors série)");
      expect(narutoSetLabel("promo", null, "en")).toBe("Promo (off-series)");
      expect(narutoSetLabel("promo", null, "it")).toBe("Promo (fuori serie)");
    });

    it("names late FR CCG sets with their series number", () => {
      expect(narutoSetLabel("s24")).toBe("Série 24 — Sage's Legacy");
      expect(narutoSetLabel("s28")).toBe("Série 28 — Ultimate Ninja Storm 3");
      expect(narutoSetLabel("tempete")).toBe("Série 11 — La Tempête Approche");
    });

    it("uses Series N — Bandai USA titles when the checklist language is en", () => {
      expect(narutoSetLabel("s1", null, "en")).toBe(
        "Series 1 — The Path to Hokage",
      );
      expect(narutoSetLabel("s2", null, "en")).toBe(
        "Series 2 — Coils of the Snake",
      );
      expect(narutoSetLabel("s3", null, "en")).toBe(
        "Series 3 — Curse of the Sand",
      );
      expect(narutoSetLabel("s4", null, "en")).toBe(
        "Series 4 — Revenge and Rebirth",
      );
      expect(narutoSetLabel("s5", null, "en")).toBe("Series 5 — Dream Legacy");
      expect(narutoSetLabel("s6", null, "en")).toBe("Series 6 — Eternal Rivalry");
      expect(narutoSetLabel("s24", null, "en")).toBe("Series 24 — Sage's Legacy");
      expect(narutoSetLabel("s28", null, "en")).toBe(
        "Series 28 — Ultimate Ninja Storm 3",
      );
      expect(narutoSetLabel("s7", null, "en")).toBe("Series 7 — Quest for Power");
    });

    it("uses Serie N — Italian retail titles when the checklist language is it", () => {
      expect(narutoSetLabel("s1", null, "it")).toBe(
        "Serie 1 — La Forza della Foglia",
      );
      expect(narutoSetLabel("s2", null, "it")).toBe(
        "Serie 2 — Le Spire del Serpente",
      );
      expect(narutoSetLabel("s3", null, "it")).toBe(
        "Serie 3 — La Maledizione della Sabbia",
      );
      expect(narutoSetLabel("s4", null, "it")).toBe(
        "Serie 4 — Vendetta e Redenzione",
      );
      expect(narutoSetLabel("s5", null, "it")).toBe(
        "Serie 5 — L'Eredità del Sogno",
      );
      expect(narutoSetLabel("s6", null, "it")).toBe("Serie 6 — Rivalità Eterna");
      expect(narutoSetLabel("s7", null, "it")).toBe("Serie 7 — Sete di Potere");
      expect(narutoSetLabel("s8", null, "it")).toBe(
        "Serie 8 — Il Vento del Cambiamento",
      );
    });

    it("uses the official EN CCG title for Fateful Reunion and Avenger's Wrath", () => {
      expect(narutoSetLabel("s13")).toBe("Fateful Reunion");
      expect(narutoSetLabel("s26")).toBe("Avenger's Wrath");
      expect(narutoSetLabel("s27")).toBe("Hero's Ascension");
    });

    it("uses Goat / official EN titles for Coleka-missing series", () => {
      expect(narutoSetLabel("s7")).toBe("Quest for Power");
      expect(narutoSetLabel("s16")).toBe("Broken Promises");
      expect(narutoSetLabel("s19")).toBe("Path of Pain");
      expect(narutoSetLabel("s21")).toBe("Shattered Truth");
      expect(narutoSetLabel("s22")).toBe("Weapons of War");
      expect(narutoSetLabel("s23")).toBe("Invasion");
    });

    it("names Bandai USA tins and tournament packs", () => {
      expect(narutoSetLabel("tin1")).toBe("Rebirth Tin");
      expect(narutoSetLabel("tp3")).toBe("Tournament Pack 3");
    });

    it("keeps 巻ノ五 and 第五幕 as distinct JP labels", () => {
      expect(narutoSetLabel("maki1")).toBe("巻ノ壱");
      expect(narutoSetLabel("maki5")).toBe("巻ノ五 — 実力伯仲！予選死闘編");
      expect(narutoSetLabel("maki17")).toBe("巻ノ十七");
      expect(narutoSetLabel("maku1")).toBe("第一幕");
      expect(narutoSetLabel("gaku")).toBe("忍者学校");
      expect(narutoSetLabel("maku5")).toBe("第五幕 — 再会、忌まわしき写輪眼！編");
    });
  });

  describe("narutoPrintFacts", () => {
    it("leads with the printed number, without the set prefix", () => {
      expect(value(narutoPrintFacts(row(), "narutocarddass"), "Numéro")).toBe(
        "NI-232",
      );
    });

    it("spells the card family the way the site filed it", () => {
      expect(value(narutoPrintFacts(row(), "narutocarddass"), "Type")).toBe("Ninja");
      expect(
        value(narutoPrintFacts(row({ cardType: "ta" }), "narutocarddass"), "Type"),
      ).toBe("Tactique");
    });

    it("omits Type for the promo line, which would only repeat the rarity", () => {
      const facts = narutoPrintFacts(
        row({ setCode: "promo", number: "pr016", cardType: "pr" }),
        "narutocarddass",
      );
      expect(value(facts, "Type")).toBeUndefined();
    });

    it("adds how a promo was handed out, and its shuriken count", () => {
      const facts = narutoPrintFacts(
        row({ setCode: "promo", number: "te030", cardType: "te" }),
        "narutocarddass",
      );
      expect(value(facts, "Distribution")).toContain("Coupe de France");
      expect(value(facts, "Shurikens")).toBe("★★★");
    });

    it("labels 1★ tournament promos as participation (TE-002 Shuriken)", () => {
      const facts = narutoPrintFacts(
        row({ setCode: "promo", number: "te002", cardType: "te" }),
        "narutocarddass",
      );
      expect(value(facts, "Distribution")).toBe("Tournoi — participation");
      expect(value(facts, "Shurikens")).toBe("★");
    });

    it("labels 2★ as top 5 and 3★ as vainqueur", () => {
      expect(
        value(
          narutoPrintFacts(
            row({ setCode: "promo", number: "ni063", cardType: "ni" }),
            "narutocarddass",
          ),
          "Distribution",
        ),
      ).toBe("Tournoi — top 5");
      expect(
        value(
          narutoPrintFacts(
            row({ setCode: "promo", number: "ta011", cardType: "ta" }),
            "narutocarddass",
          ),
          "Distribution",
        ),
      ).toBe("Tournoi — vainqueur");
    });

    it("labels S1 manga prerelease prints and estimates ~10 €", () => {
      const facts = narutoPrintFacts(
        row({
          setCode: "s1",
          number: "ni0019-prerelease",
          cardType: "ni",
          rarity: "prerelease",
        }),
        "narutocarddass",
      );
      expect(value(facts, "Numéro")).toBe("NI-019 · prerelease");
      expect(value(facts, "Distribution")).toBe("Avant-première manga");
      expect(value(facts, "Estimation")).toBe("10 €");
    });

    it("estimates promo cotes from Collection Naruto (1★ / CdF / tin)", () => {
      expect(
        value(
          narutoPrintFacts(
            row({ setCode: "promo", number: "te002", cardType: "te" }),
            "narutocarddass",
          ),
          "Estimation",
        ),
      ).toBe("20 €");
      expect(
        value(
          narutoPrintFacts(
            row({ setCode: "promo", number: "ni023", cardType: "ni" }),
            "narutocarddass",
          ),
          "Estimation",
        ),
      ).toBe("100 €");
      expect(
        value(
          narutoPrintFacts(
            row({ setCode: "promo", number: "pr016", cardType: "pr" }),
            "narutocarddass",
          ),
          "Estimation",
        ),
      ).toBe("5 €");
    });

    it("skips a fact it has no value for rather than emitting a blank row", () => {
      const facts = narutoPrintFacts(row({ rarity: null }), "narutocarddass");
      expect(value(facts, "Rareté")).toBeUndefined();
    });

    it("emits an approximate Collection Naruto quote as Estimation", () => {
      const facts = narutoPrintFacts(
        row({
          setCode: "s4",
          number: "ni203",
          rarity: "holo",
        }),
        "narutocarddass",
      );
      expect(value(facts, "Estimation")).toBe("25 €");
      expect(facts.find((f) => f.label === "Estimation")?.kind).toBe("price");
    });

    it("labels an EN Path to Hokage print, not the Carddass starters", () => {
      expect(
        value(
          narutoPrintFacts(
            row({
              printKey: "naruto:n-0001",
              setCode: "s1",
              number: "n0001",
              cardType: "n",
              lang: "en",
              fullName: "Naruto Uzumaki",
            }),
            "narutocarddass",
          ),
          "Extension",
        ),
      ).toBe("Series 1 — The Path to Hokage");
    });
  });
}

