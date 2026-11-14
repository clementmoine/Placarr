import { describe, expect, it } from "vitest";

import { ccgtraderGameApiUrl, parseCcgtraderGame } from "./fetchGame";
import {
  CCGTRADER_API_ORIGIN,
  CCGTRADER_GAME_FIELDS,
  ccgtraderAssetUrl,
  ccgtraderGamePageUrl,
} from "./site";

describe("ccgtrader site helpers", () => {
  it("builds game page + Directus asset URLs", () => {
    expect(ccgtraderGamePageUrl("pokemon-tcg")).toBe(
      "https://www.ccgtrader.net/games/pokemon-tcg",
    );
    expect(ccgtraderAssetUrl("7le1t5u9evswcck4")).toBe(
      `${CCGTRADER_API_ORIGIN}/_/assets/7le1t5u9evswcck4`,
    );
    expect(ccgtraderAssetUrl("abc", "card-large")).toBe(
      `${CCGTRADER_API_ORIGIN}/_/assets/abc?key=card-large`,
    );
  });

  it("queries Directus under /_/items/game with url_title filter", () => {
    const url = ccgtraderGameApiUrl("dragon-ball-super-card-game");
    expect(url).toContain(`${CCGTRADER_API_ORIGIN}/_/items/game?`);
    expect(url).toContain("filter%5Burl_title%5D%5Beq%5D=dragon-ball-super-card-game");
    expect(url).toContain(`fields=${CCGTRADER_GAME_FIELDS.join(",")}`);
  });
});

describe("parseCcgtraderGame", () => {
  it("flattens series.sets into set rows with series names", () => {
    const game = parseCcgtraderGame(
      {
        id: 260,
        name: "Dragon Ball Super Card Game",
        url_title: "dragon-ball-super-card-game",
        publisher: "Bandai",
        in_print: true,
        languages: ["en", "fr"],
        series: [
          {
            id: 1,
            name: "DBS: BT Block",
            sort: 1,
            sets: [
              {
                id: 10,
                name: "Galactic Battle",
                url_title: "galactic-battle-bt1",
                release_date: "2017-07-28",
                status: "published",
              },
            ],
          },
          {
            id: 2,
            name: "DBS: Promo Cards",
            sets: [
              {
                id: 99,
                name: "DBS Promo Cards",
                url_title: "dbs-promo-cards-p",
                release_date: null,
                status: "published",
              },
            ],
          },
        ],
      },
      "dragon-ball-super-card-game",
    );

    expect(game.id).toBe(260);
    expect(game.pageUrl).toBe(
      "https://www.ccgtrader.net/games/dragon-ball-super-card-game",
    );
    expect(game.series.map((s) => s.name)).toEqual([
      "DBS: BT Block",
      "DBS: Promo Cards",
    ]);
    expect(game.sets).toEqual([
      {
        id: 10,
        name: "Galactic Battle",
        urlTitle: "galactic-battle-bt1",
        releaseDate: "2017-07-28",
        status: "published",
        seriesName: "DBS: BT Block",
      },
      {
        id: 99,
        name: "DBS Promo Cards",
        urlTitle: "dbs-promo-cards-p",
        releaseDate: null,
        status: "published",
        seriesName: "DBS: Promo Cards",
      },
    ]);
  });
});
