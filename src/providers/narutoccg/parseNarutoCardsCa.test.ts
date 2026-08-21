import { describe, expect, it } from "vitest";

import {
  mergeNarutoCardsCaIntoIndex,
  narutoCardsCaHintBelongsOnDisk,
  narutoCardsCaMayMintPrint,
  narutoCardsCaSetsToScrape,
  parseNarutoCardsCaLabel,
  parseNarutoCardsCaSetHtml,
} from "./parseNarutoCardsCa";

const FIXTURE = `
<article aria-label="Naruto Uzumaki, N-001, C"></article>
<article aria-label="Shadow Clone Jutsu, J-US001, UR"></article>
<article aria-label="Naruto Uzumaki, N-US122, UR"></article>
<article aria-label="Main navigation"></article>
<article aria-label="Kunai, J-001, C"></article>
`;

describe("parseNarutoCardsCaLabel", () => {
  it("reads Bandai N/J and keeps N-US off n001", () => {
    expect(parseNarutoCardsCaLabel("Naruto Uzumaki, N-001, C", "s1")).toEqual({
      number: "n001",
      name: "Naruto Uzumaki",
      setCode: "s1",
      printedRef: "N-001",
      usExclusive: false,
    });
    expect(
      parseNarutoCardsCaLabel("Shadow Clone Jutsu, J-US001, UR", "s6"),
    ).toMatchObject({
      number: "jus001",
      name: "Shadow Clone Jutsu",
      usExclusive: true,
    });
    expect(parseNarutoCardsCaLabel("Main navigation", "s1")).toBeNull();
  });

  it("decodes HTML entities from aria-labels", () => {
    expect(
      parseNarutoCardsCaLabel("Let&#x27;s Take it Outside, PR-022, C", "promo"),
    ).toMatchObject({
      number: "pr022",
      name: "Let's Take it Outside",
      printedRef: "PR-022",
    });
    expect(
      parseNarutoCardsCaLabel(
        "Mission Of Capturing Missing Pet &quot;Tora&quot;, M-006, C",
        "s1",
      ),
    ).toMatchObject({
      name: 'Mission Of Capturing Missing Pet "Tora"',
    });
  });
});

describe("parseNarutoCardsCaSetHtml", () => {
  it("dedupes aria-labels and skips chrome", () => {
    expect(
      parseNarutoCardsCaSetHtml(FIXTURE, "s1").map((row) => row.number),
    ).toEqual(["j001", "jus001", "n001", "nus122"]);
  });
});

describe("narutoCardsCaSetsToScrape", () => {
  it("covers official Bandai sets and skips Kayou / set 29", () => {
    const sets = narutoCardsCaSetsToScrape();
    expect(sets.map((row) => row.setCode)).toContain("s1");
    expect(sets.map((row) => row.setCode)).toContain("s28");
    expect(sets.map((row) => row.setCode)).toContain("tp1");
    expect(sets.map((row) => row.setCode)).toContain("tin1");
    expect(sets.some((row) => row.slug === "bandai-ccg-29")).toBe(false);
  });
});

describe("narutoCardsCaMayMintPrint", () => {
  it("lets booster pages mint and blocks fanset leftovers on TP/tin", () => {
    expect(
      narutoCardsCaMayMintPrint({ usExclusive: false, setCode: "s1" }, false),
    ).toBe(true);
    expect(
      narutoCardsCaMayMintPrint({ usExclusive: false, setCode: "tp2" }, false),
    ).toBe(false);
    expect(
      narutoCardsCaMayMintPrint({ usExclusive: true, setCode: "tin1" }, false),
    ).toBe(true);
    expect(
      narutoCardsCaHintBelongsOnDisk(
        {
          number: "n1715",
          name: "Shikamaru Nara",
          setCode: "tp2",
          printedRef: "N-1715",
          usExclusive: false,
        },
        new Set(["n0145"]),
      ),
    ).toBe(false);
    expect(
      narutoCardsCaHintBelongsOnDisk(
        {
          number: "n0145",
          name: "Shikamaru Nara",
          setCode: "tp2",
          printedRef: "N-0145",
          usExclusive: false,
        },
        new Set(["n0145"]),
      ),
    ).toBe(true);
  });
});

describe("mergeNarutoCardsCaIntoIndex", () => {
  it("does not mint invented TP/tin collector numbers into the catalogue", () => {
    const invented = parseNarutoCardsCaLabel(
      "Shikamaru Nara, N-1715, C",
      "tp2",
    );
    expect(invented).toMatchObject({ number: "n1715", setCode: "tp2" });
    const merged = mergeNarutoCardsCaIntoIndex({
      prints: [
        {
          printKey: "naruto:n-0145",
          setCode: "s4",
          number: "n0145",
          cardType: "n",
          family: "ninja",
        },
      ],
      titles: [],
      cards: [
        invented!,
        parseNarutoCardsCaLabel("Shikamaru Nara, N-0145, C", "tp2")!,
      ],
    });
    expect(merged.addedPrints).toEqual([]);
    expect(merged.prints.some((p) => p.printKey === "naruto:n-1715")).toBe(
      false,
    );
    expect(
      merged.titles.find((t) => t.printKey === "naruto:n-0145")?.fullName,
    ).toBe("Shikamaru Nara");
    expect(
      merged.titles.find((t) => t.printKey === "naruto:n-1715"),
    ).toBeUndefined();
  });

  it("mints N-US beside N and does not overwrite an official EN title", () => {
    const merged = mergeNarutoCardsCaIntoIndex({
      prints: [
        {
          printKey: "naruto:n-0001",
          setCode: "s1",
          number: "n0001",
          cardType: "n",
          family: "ninja",
        },
      ],
      titles: [
        {
          printKey: "naruto:n-0001",
          lang: "en",
          fullName: "Naruto (official)",
        },
      ],
      cards: parseNarutoCardsCaSetHtml(FIXTURE, "s1"),
    });
    expect(
      merged.titles.find((t) => t.printKey === "naruto:n-0001")?.fullName,
    ).toBe("Naruto (official)");
    expect(merged.addedPrints).toContain("naruto:nus-0122");
    expect(merged.addedPrints).toContain("naruto:jus-0001");
    expect(
      merged.prints.find((p) => p.printKey === "naruto:nus-0122"),
    ).toMatchObject({
      number: "nus0122",
      grouping: null,
    });
    expect(merged.prints.some((p) => p.printKey === "naruto:n-0122")).toBe(
      false,
    );
  });
});
