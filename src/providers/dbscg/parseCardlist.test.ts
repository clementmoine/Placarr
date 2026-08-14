import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseDbsCardlistHtml,
  parseDbsSeriesOptions,
  resolveCardlistUrl,
} from "./parseCardlist";

const fixture = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "fixtures/bt1-sample.html",
  ),
  "utf8",
);

describe("parseDbsCardlistHtml", () => {
  const cards = parseDbsCardlistHtml(fixture);

  it("reads each print once, Leaders included", () => {
    expect(cards.map((card) => card.cardNumber)).toEqual([
      "BT1-001",
      "BT1-005",
      "BT1-011_SPR",
    ]);
  });

  it("maps a Leader verso to cardBackUrl, not a second print", () => {
    const champa = cards.find((card) => card.cardNumber === "BT1-001");
    expect(champa).toMatchObject({
      printKey: "dbscg:bt1-001",
      name: "Champa",
      awakenedName: "Champa, Dieu de la destruction",
      cardType: "LEADER",
      color: "Rouge",
      rarity: "Rare[R]",
      character: "Champa",
    });
    expect(champa?.imageUrl).toBe(
      "https://www.dbs-cardgame.com/europe-fr/images/cartes/cardimg/BT1-001.png",
    );
    expect(champa?.backImageUrl).toBe(
      "https://www.dbs-cardgame.com/europe-fr/images/cartes/cardimg/BT1-001_b.png",
    );
  });

  it("keeps a Combat print flat (no Leader verso)", () => {
    const combat = cards.find((card) => card.cardNumber === "BT1-005");
    expect(combat?.cardType).toBe("COMBAT");
    expect(combat?.backImageUrl).toBeNull();
    expect(combat?.name).toMatch(/Champa/i);
  });

  it("treats _SPR as grouping on the same collector number", () => {
    const spr = cards.find((card) => card.cardNumber === "BT1-011_SPR");
    expect(spr?.printKey).toBe("dbscg:bt1-011-spr");
    expect(spr?.grouping).toBe("spr");
    expect(spr?.setCode).toBe("bt1");
    expect(spr?.number).toBe("011");
  });
});

describe("parseDbsSeriesOptions", () => {
  it("reads numeric category ids from category_exp", () => {
    const html = `
      <select name="category_exp">
        <option value="">Unspecified</option>
        <option value="461001">BT1 Booster -GALACTIC BATTLE-</option>
        <option value="461002">BT2 Booster -UNION FORCE-</option>
      </select>
      <select name="character">
        <option value="Goku">Goku</option>
      </select>`;
    expect(parseDbsSeriesOptions(html)).toEqual([
      { categoryId: "461001", label: "BT1 Booster -GALACTIC BATTLE-" },
      { categoryId: "461002", label: "BT2 Booster -UNION FORCE-" },
    ]);
  });
});

describe("resolveCardlistUrl", () => {
  it("resolves the relative cardimg path Bandai ships", () => {
    expect(resolveCardlistUrl("../images/cartes/cardimg/BT1-001.png")).toBe(
      "https://www.dbs-cardgame.com/europe-fr/images/cartes/cardimg/BT1-001.png",
    );
  });
});
