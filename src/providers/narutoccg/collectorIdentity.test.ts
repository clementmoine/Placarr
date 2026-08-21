import { describe, expect, it } from "vitest";

import {
  canonicalNarutoDiskPrefix,
  compareNarutoCollectors,
  canonicalizeNarutoPrintKey,
  formatNarutoReference,
  mintNarutoPrintKey,
  narutoCollectorKey,
  narutoCollectorNumberKey,
  narutoCollectorSearchNeedles,
  narutoCollectorsMatch,
  narutoDiskCardId,
  parseNarutoCollector,
} from "./collectorIdentity";

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
    Ce test disait l'inverse jusqu'au 2026-08-19 : `NM-`/`DN-` rendaient `null`,
    Data Carddass étant tenu hors du catalogue. La ligne arcade y entre
    désormais — même pack, familles à part. Les numéros sont lus, pas
    confondus : c'est tout l'objet des deux familles `arcade*`.
  */
  it("lit Data Carddass dans ses propres familles", () => {
    expect(parseNarutoCollector("NM-081")).toMatchObject({
      family: "arcadeMission",
      number: 81,
    });
    expect(parseNarutoCollector("DN-001")).toMatchObject({
      family: "arcadeBattle",
      number: 1,
    });
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

describe("Data Carddass — les cartes de borne", () => {
  it("lit les deux cabinets et détache le T collé au numéro", () => {
    // `DN-032T` : le T ne se sépare pas par un tiret sur la carte.
    expect(parseNarutoCollector("DN-032T")).toEqual({
      family: "arcadeBattle",
      number: 32,
      grouping: "t",
      printedPrefix: "DN",
    });
    expect(parseNarutoCollector("NM-049")).toMatchObject({
      family: "arcadeMission",
      number: 49,
      grouping: null,
    });
  });

  it("laisse le jeu de table où il est", () => {
    // `N-1646` commence par la même lettre que `NM-` : l'ordre des préfixes
    // décide, et le plus long gagne.
    expect(parseNarutoCollector("N-1646")?.family).toBe("ninja");
    expect(parseNarutoCollector("忍-11")?.family).toBe("ninja");
    expect(parseNarutoCollector("M-012")?.family).toBe("mission");
  });

  it("donne aux deux cabinets leurs propres dossiers de disque", () => {
    expect(canonicalNarutoDiskPrefix("DN")).toBe("dn");
    expect(canonicalNarutoDiskPrefix("NM")).toBe("nm");
  });
});
