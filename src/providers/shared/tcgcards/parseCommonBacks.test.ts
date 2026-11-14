import { describe, expect, it } from "vitest";

import {
  localBackSlugFromCdnSegment,
  parseTcgCardsBackUrls,
  parseTcgCardsTypeFilterLabels,
  pickDefaultBackObservation,
  slugifyTcgCardsTypeLabel,
  tcgCardsProbeUrlsForTypeLabel,
  tcgCardsStaticOrigin,
} from "./parseCommonBacks";

describe("tcgCardsStaticOrigin", () => {
  it("maps www and fw hosts to static.<host>", () => {
    expect(tcgCardsStaticOrigin("https://www.opecards.fr")).toBe(
      "https://static.opecards.fr",
    );
    expect(tcgCardsStaticOrigin("https://fw.dbscards.fr")).toBe(
      "https://static.fw.dbscards.fr",
    );
  });
});

describe("parseTcgCardsBackUrls", () => {
  it("collects common category sleeves and original pack back", () => {
    const html = `
      <img src="https://static.opecards.fr/cards/common/back-leader.webp" data-src="x.webp" />
      <img src="https://static.opecards.fr/cards/common/back-character.webp" />
      <img src="https://static.opecards.fr/cards/common/back-don!!.webp" />
      <img src="https://static.lorcards.fr/cards/original/back.webp" data-src="face.webp" />
      <img src="https://static.opecards.fr/cards/common/back-leader.webp" />
    `;
    const rows = parseTcgCardsBackUrls(html);
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          url: "https://static.opecards.fr/cards/common/back-leader.webp",
          kind: "common",
          segment: "leader",
        },
        {
          url: "https://static.opecards.fr/cards/common/back-character.webp",
          kind: "common",
          segment: "character",
        },
        {
          url: "https://static.opecards.fr/cards/common/back-don!!.webp",
          kind: "common",
          segment: "don!!",
        },
        {
          url: "https://static.lorcards.fr/cards/original/back.webp",
          kind: "original",
          segment: null,
        },
      ]),
    );
    expect(rows.filter((r) => r.segment === "leader")).toHaveLength(1);
  });
});

describe("parseTcgCardsTypeFilterLabels", () => {
  it("reads type checkbox labels", () => {
    const html = `
      <label class="btn" for="card_filter_typesData_values_14">LEADER</label>
      <label for="card_filter_typesData_values_17">DON!!</label>
      <label for="card_filter_typesData_values_16">LIEU</label>
    `;
    expect(parseTcgCardsTypeFilterLabels(html)).toEqual([
      "LEADER",
      "DON!!",
      "LIEU",
    ]);
  });
});

describe("slugify + local slug", () => {
  it("keeps bangs for CDN probe and strips them for filenames", () => {
    expect(slugifyTcgCardsTypeLabel("DON!!")).toBe("don!!");
    expect(localBackSlugFromCdnSegment("don!!")).toBe("don");
    expect(slugifyTcgCardsTypeLabel("ÉVÉNEMENT")).toBe("evenement");
  });

  it("builds probe URLs from type labels", () => {
    expect(
      tcgCardsProbeUrlsForTypeLabel("https://static.opecards.fr", "DON!!"),
    ).toEqual([
      "https://static.opecards.fr/cards/common/back-don!!.webp",
      "https://static.opecards.fr/cards/common/back-don.webp",
    ]);
  });
});

describe("pickDefaultBackObservation", () => {
  it("prefers original, then character", () => {
    expect(
      pickDefaultBackObservation([
        {
          url: "https://static.x/cards/common/back-leader.webp",
          kind: "common",
          segment: "leader",
        },
        {
          url: "https://static.x/cards/original/back.webp",
          kind: "original",
          segment: null,
        },
      ])?.kind,
    ).toBe("original");

    expect(
      pickDefaultBackObservation([
        {
          url: "https://static.x/cards/common/back-leader.webp",
          kind: "common",
          segment: "leader",
        },
        {
          url: "https://static.x/cards/common/back-character.webp",
          kind: "common",
          segment: "character",
        },
      ])?.segment,
    ).toBe("character");
  });
});
