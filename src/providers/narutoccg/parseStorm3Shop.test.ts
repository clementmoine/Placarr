import { describe, expect, it } from "vitest";

import {
  parseStorm3Listing,
  parseStorm3ProductFaceUrl,
  storm3PrintKey,
} from "./parseStorm3Shop";

const LISTING = `
<a href="j1002.html">J1002 GOLEM TECHNIQUE Ulitmate Ninja Storm 3 Naruto Series 28 Common Card</a>
<a href="j1002.html">J1002 GOLEM TECHNIQUE Ulitmate Ninja Storm 3 Naruto Series 28 Common Card</a>
<a href="n1685.html">N1685 MADARA UCHIHA Ulitmate Ninja Storm 3 Naruto Series 28 Gold Foil Super Rare Card</a>
<a href="m986.html">M986 CLASH OF IDEALS Ultimate Ninja Storm 3 Naruto Series 28 Rare Card</a>
`;

const PRODUCT = `
<h1 id=itemName>J1002 GOLEM TECHNIQUE Ulitmate Ninja Storm 3 Naruto Series 28 Common Card</h1>
<div id=itemMainImage><a href="https://s.turbifycdn.com/aah/my1stop2shop/j1002-golem-technique-ulitmate-ninja-storm-3-naruto-series-28-common-card-26.gif" data-fancybox="itemimages"><img src="https://s.turbifycdn.com/aah/my1stop2shop/j1002-golem-technique-ulitmate-ninja-storm-3-naruto-series-28-common-card-27.gif" width="350" height="350" /></a></div>
`;

describe("parseStorm3Listing", () => {
  it("reads unique Series 28 singles and keeps the shop typo listing", () => {
    const cards = parseStorm3Listing(LISTING);
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.number)).toEqual(["j1002", "m986", "n1685"]);
    expect(cards[0]).toMatchObject({
      cardType: "j",
      name: "GOLEM TECHNIQUE",
      rarity: "common",
      productPath: "/j1002.html",
    });
    expect(cards.find((c) => c.number === "n1685")?.rarity).toBe("super rare");
    expect(cards.find((c) => c.number === "m986")?.rarity).toBe("rare");
  });
});

describe("parseStorm3ProductFaceUrl", () => {
  it("takes the fancybox scan, not the 350² display crop", () => {
    expect(parseStorm3ProductFaceUrl(PRODUCT)).toBe(
      "https://s.turbifycdn.com/aah/my1stop2shop/j1002-golem-technique-ulitmate-ninja-storm-3-naruto-series-28-common-card-26.gif",
    );
  });
});

describe("storm3PrintKey", () => {
  it("stays on s28 so FR Carddass s1–s6 are untouched", () => {
    expect(storm3PrintKey("N1685")).toBe("naruto:n-1685");
  });
});
