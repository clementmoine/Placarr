import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseDbscardsCardPage } from "./cardPage";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "fixtures", name), "utf8");

/** A French Leader: two sides, a `Product` block, a price and its history. */
const fr = parseDbscardsCardPage(fixture("dbscards-card-fr.html"), {
  slug: "bt31-001-uc-gogeta-ss-fusion-de-renversement-de-situation",
  lang: "fr",
  url: "https://www.dbscards.fr/cards/bt31-001-uc-gogeta-ss-fusion-de-renversement-de-situation",
});

/** An English Battle card, whose page carries no `Product` block at all. */
const en = parseDbscardsCardPage(fixture("dbscards-card-en.html"), {
  slug: "en-bt25-009-sr-event-pack-17-son-goku-attack-to-save-the-world",
  lang: "en",
});

describe("identity", () => {
  it("reads the rarity-qualified code from the page", () => {
    expect(fr.sku).toBe("BT31-001-UC");
    expect(fr.ref).toBe("bt31-001");
  });

  it("falls back to the slug where the page publishes no Product block", () => {
    // English pages carry none, so the slug is the only source there.
    expect(en.productJsonLd).toBeNull();
    expect(en.sku).toBe("BT25-009-SR");
    expect(en.ref).toBe("bt25-009");
  });
});

describe("the captioned tables", () => {
  it("keeps whatever labels the card type happens to carry", () => {
    /*
      Read as label→value pairs rather than a fixed field list: a Leader has
      Ère and Puissance per side, a Battle card has energy and combo costs, and
      a type we have never seen still lands whole instead of being dropped.
    */
    const general = fr.tables.find((t) => t.caption === "Informations générales");
    const field = (caption: string, label: string) =>
      fr.tables
        .find((t) => t.caption === caption)
        ?.fields.find((f) => f.label === label)?.values;

    expect(general).toBeDefined();
    expect(field("Informations générales", "Date Sortie")).toEqual(["03/07/2026"]);
    expect(field("Informations générales", "Rareté")).toEqual(["Uncommon"]);
    expect(field("Face Avant", "Puissance")).toEqual(["10000"]);
    expect(field("Face Arrière", "Puissance")).toEqual(["15000"]);
    // Several values under one label stay several.
    expect(field("Face Avant", "Personnages")).toEqual(["Vegeta", "Son Goku"]);
  });

  it("keeps the hrefs, which carry the site's own ids", () => {
    const type = fr.tables[0]?.fields.find((f) => f.label === "Type");
    expect(type?.links.join()).toMatch(/type=\d+/);
  });

  it("reads a Battle card's own fields without being told about them", () => {
    const front = en.tables.find((t) => t.caption === "Face Avant");
    const label = (name: string) =>
      front?.fields.find((f) => f.label === name)?.values;
    expect(label("Coût en énergie")).toEqual(["5"]);
    expect(label("Coût de Combo")).toEqual(["0"]);
    // A one-sided card has no verso table.
    expect(fr.tables.map((t) => t.caption)).toContain("Face Arrière");
    expect(en.tables.map((t) => t.caption)).not.toContain("Face Arrière");
  });
});

describe("the rules text", () => {
  it("stops at the card's own text and not at the page's next section", () => {
    /*
      Bounding the outer block swallowed the tags section that follows it,
      turning a 378-character ability into 1907 characters of whitespace and
      stray headings. The text is in `<div lang>`; only those are read.
    */
    const back = fr.descriptions.find((d) => d.title === "LEADER : DOS");
    expect(back?.text).toMatch(/^Permanent /);
    expect(back?.text).toMatch(/piochez une carte\.$/);
    expect(back?.text).not.toMatch(/Thématique/);
    expect(back?.awakened).toBe(true);
  });

  it("lists the keyword chips without taking them out of the sentence", () => {
    const front = fr.descriptions.find((d) => d.title === "LEADER : FACE");
    expect(front?.keywords).toContain("Une fois par tour");
    expect(front?.text).toContain("Une fois par tour");
  });

  it("keeps the markup, where the energy icons live", () => {
    // `<span class="ball redBall">` is empty: its meaning is entirely its class.
    const only = en.descriptions[0];
    expect(only?.lang).toBe("en");
    expect(only?.html).toMatch(/redBall/);
    expect(only?.text).not.toMatch(/redBall/);
  });

  it("titles nothing on a single-sided card", () => {
    expect(en.descriptions).toHaveLength(1);
    expect(en.descriptions[0]?.title).toBe("");
    expect(en.descriptions[0]?.awakened).toBe(false);
  });
});

describe("price", () => {
  it("reads the offer the Product block publishes", () => {
    expect(fr.offer?.price).toBe(0.1);
    expect(fr.offer?.currency).toBe("EUR");
    expect(fr.offer?.validUntil).toBe("2026-08-15");
  });

  it("keeps the thirty-day history, series by series", () => {
    expect(fr.priceHistory?.labels).toHaveLength(30);
    expect(fr.priceHistory?.series.map((s) => s.name)).toEqual([
      "Cardmarket",
      "Cardnexus",
    ]);
    // A day with no listing is a hole, not a zero.
    expect(fr.priceHistory?.series[0]?.points[0]).toBeNull();
    expect(fr.priceHistory?.series[0]?.points.at(-1)).toBe(0.1);
  });

  it("has no history and no offer where the page publishes neither", () => {
    expect(en.offer).toBeNull();
    expect(en.priceHistory).toBeNull();
  });
});

describe("sibling versions", () => {
  it("reads them with the same tile parser the list pages use", () => {
    const slr = fr.versions.find((v) => v.sku === "BT31-001-SLR");
    expect(slr?.price).toBe(108);
    expect(slr?.priceDelta).toBe(-1.99);
    expect(slr?.imageFront).toMatch(/^https:\/\/static\.dbscards\.fr\//);
  });

  it("links the French printings from an English page", () => {
    // This is how an English crawl reaches French URLs, and the reverse.
    expect(en.versions.map((v) => v.sku)).toEqual([
      "BT25-009-SR",
      "BT25-009-SPR",
    ]);
    expect(en.versions.every((v) => v.lang === "fr")).toBe(true);
  });
});

describe("what the Product block adds", () => {
  it("names every image with its language and its set", () => {
    expect(fr.images.length).toBeGreaterThan(0);
    expect(fr.images[0]?.lang).toBe("fr");
    expect(fr.images[0]?.description).toMatch(/BT31/);
    expect(fr.images.some((i) => i.representative)).toBe(true);
  });

  it("lists the characters on the card", () => {
    expect(fr.characters.map((c) => c.name).sort()).toEqual([
      "Son Goku",
      "Vegeta",
    ]);
  });

  it("keeps the block verbatim, so an unmodelled field is not lost", () => {
    expect((fr.productJsonLd as { sku?: string })?.sku).toBe("BT31-001-UC");
  });
});

describe("tags", () => {
  it("groups them as the page does", () => {
    expect(fr.tags.map((t) => t.group)).toEqual(["Synergies", "Thématiques"]);
    expect(fr.tags[0]?.labels).toContain("Efficace avec un Leader Rouge");
  });
});
