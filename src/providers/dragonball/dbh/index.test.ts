import { describe, expect, it } from "vitest";

import { dbhModule } from "./index";
import {
  formatDbhReference,
  parseDbhPrinted,
  dbhPrintKey,
} from "./printKey";
import { parseDbhCategories, parseDbhCategoryCards } from "./scrape/cardlist";

describe("dbh", () => {
  it("declares local catalogue under dragonball/heroes", () => {
    expect(dbhModule.info.id).toBe("dbh");
    expect(dbhModule.catalog?.dataPack).toBe("dragonball/heroes");
    expect(dbhModule.printGames).toEqual(["dbh"]);
    expect(dbhModule.info.defaultLanguage).toBe("ja");
  });

  it("parses Heroes printed refs", () => {
    expect(parseDbhPrinted("H1-01")).toEqual({
      set: "h1",
      number: "01",
      printed: "H1-01",
    });
    expect(parseDbhPrinted("GDM10-SEC")).toEqual({
      set: "gdm10",
      number: "sec",
      printed: "GDM10-SEC",
    });
    expect(dbhPrintKey("h1", "01")).toBe("dbh:h1-01");
    expect(formatDbhReference("h1", "01")).toBe("H1-01");
  });

  it("parses category hub and card blocks", () => {
    const hub = `
      <a href="/dbh/cardlist/?search=true&category=133001">第1弾</a>
      <a href="/dbh/cardlist/?search=true&category=133301">GDM1弾</a>
    `;
    expect(parseDbhCategories(hub)).toEqual([
      { id: "133001", label: "第1弾" },
      { id: "133301", label: "GDM1弾" },
    ]);

    const page = `
      <div class="card">
        <div class="dummys clearfix"><img src="../image/cardlist/dummys/H1-01.jpg" alt="" /><div class="rare">★★</div></div>
        <ul class="prof"><li>H1-01</li><li>孫悟空</li></ul>
      </div>
    `;
    expect(parseDbhCategoryCards(page, "133001", "第1弾")).toEqual([
      {
        printed: "H1-01",
        set: "h1",
        number: "01",
        nameJa: "孫悟空",
        rarity: "★★",
        categoryId: "133001",
        categoryLabel: "第1弾",
        faceUrl:
          "https://www.carddass.com/dbh/image/cardlist/dummys/H1-01.jpg",
      },
    ]);
  });

  it("does not claim JCC or Masters prints", async () => {
    await expect(
      dbhModule.lookupPrint!({ printKey: "dbsjcc:part1-d0001" }),
    ).resolves.toBeNull();
    await expect(
      dbhModule.lookupPrint!({ printKey: "dbscg:bt1-001" }),
    ).resolves.toBeNull();
  });
});
