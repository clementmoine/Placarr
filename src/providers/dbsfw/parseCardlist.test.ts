import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseDbsFwCardlistHtml,
  parseDbsFwSeriesOptions,
  resolveFwCardlistUrl,
} from "./parseCardlist";

const fixture = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures/st01-sample.html",
  ),
  "utf8",
);

describe("parseDbsFwCardlistHtml", () => {
  const cards = parseDbsFwCardlistHtml(fixture, "STORY BOOSTER 01 [ST01]");

  it("reads the base Leader and its parallel as two prints", () => {
    expect(cards.map((card) => card.cardNumber)).toEqual([
      "ST01-001",
      "ST01-001_P1",
      "ST01-002",
    ]);
    expect(cards[0]).toMatchObject({
      printKey: "dbsfw:st01-001",
      name: "Son Goten",
      grouping: null,
    });
    expect(cards[1]).toMatchObject({
      printKey: "dbsfw:st01-001-p1",
      grouping: "p1",
    });
  });

  it("resolves the relative FW card CDN path", () => {
    expect(cards[0]?.imageUrl).toBe(
      "https://www.dbs-cardgame.com/fw/images/cards/card/en/ST01-001_f.webp",
    );
    expect(cards[2]?.imageUrl).toBe(
      "https://www.dbs-cardgame.com/fw/images/cards/card/en/ST01-002.webp",
    );
  });
});

describe("parseDbsFwSeriesOptions", () => {
  it("skips the empty ALL chip", () => {
    expect(parseDbsFwSeriesOptions(fixture)).toEqual([
      { categoryId: "583301", label: "STORY BOOSTER 01 [ST01]" },
      { categoryId: "583010", label: "BOOSTER PACK -CROSS FORCE- [FB10]" },
    ]);
  });
});

describe("resolveFwCardlistUrl", () => {
  it("resolves ../../images from the cardlist page", () => {
    expect(
      resolveFwCardlistUrl("../../images/cards/card/en/ST01-001_f.webp"),
    ).toBe(
      "https://www.dbs-cardgame.com/fw/images/cards/card/en/ST01-001_f.webp",
    );
  });
});
