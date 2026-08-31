import { describe, expect, it } from "vitest";

import {
  cardgameclubItCuratedCards,
  mergeCardgameclubItCardsIntoIndex,
  parseCardgameclubItListing,
  parseCardgameclubItListingFaces,
  parseCardgameclubItTitle,
} from "./parseCardgameclubIt";

describe("cardgameclubItCuratedCards", () => {
  it("keeps attested Magento IT titles and does not invent the rest", () => {
    const cards = cardgameclubItCuratedCards();
    expect(cards).toHaveLength(273);
    expect(cards.find((row) => row.number === "ni001")).toMatchObject({
      name: "Naruto Uzumaki",
      setCode: "s1",
    });
    expect(cards.find((row) => row.number === "te231")?.name).toBe("Juken");
    expect(cards.some((row) => row.number.startsWith("n0"))).toBe(false);
  });
});

describe("parseCardgameclubItTitle", () => {
  it("reads NI/TE/ST shop titles and maps ST to ta", () => {
    expect(
      parseCardgameclubItTitle(
        "NI01 Naruto Uzumaki rara foil -NEAR MINT-",
        "s1",
      ),
    ).toEqual({
      number: "ni001",
      name: "Naruto Uzumaki",
      setCode: "s1",
      printedRef: "NI-01",
    });
    expect(
      parseCardgameclubItTitle("ST74 Segno di riconoscenza comune", "s2"),
    ).toMatchObject({ number: "ta074", name: "Segno di riconoscenza" });
    expect(parseCardgameclubItTitle("TE-231 Juken comune", "s5")).toMatchObject(
      { number: "te231", name: "Juken" },
    );
  });
});

describe("parseCardgameclubItListingFaces", () => {
  it("pairs Magento data-name titles with 300×375 small_image URLs", () => {
    const html = `
      <div class="product-item-info">
        <a class="product-image" data-name="NI08 Iruka comune -MINT-">
          <img src="https://web.archive.org/web/20201030165412im_/https://media.cardgame-club.it/catalog/product/cache/1/small_image/300x375/9df78eab33525d08d6e5fb8d27136e95/4/-/4-564.jpg">
        </a>
      </div>
      <div class="product-item-info">
        <a data-name="ST74 Segno di riconoscenza comune -MINT-">
          <img src="https://web.archive.org/web/20201030165412im_/https://media.cardgame-club.it/catalog/product/cache/1/small_image/300x375/abc/4/-/4-625.jpg">
        </a>
      </div>
    `;
    expect(parseCardgameclubItListingFaces(html, "s2")).toEqual([
      {
        number: "ni008",
        name: "Iruka",
        setCode: "s2",
        printedRef: "NI-08",
        imageUrl:
          "https://web.archive.org/web/20201030165412im_/https://media.cardgame-club.it/catalog/product/cache/1/small_image/300x375/9df78eab33525d08d6e5fb8d27136e95/4/-/4-564.jpg",
      },
      {
        number: "ta074",
        name: "Segno di riconoscenza",
        setCode: "s2",
        printedRef: "ST-74",
        imageUrl:
          "https://web.archive.org/web/20201030165412im_/https://media.cardgame-club.it/catalog/product/cache/1/small_image/300x375/abc/4/-/4-625.jpg",
      },
    ]);
  });
});

describe("parseCardgameclubItListing", () => {
  it("pulls titles out of Magento product anchors", () => {
    const html = `
      <a>NI01 Naruto Uzumaki rara foil -NEAR MINT-</a>
      <a>TE96 Strangolare comune -NEAR MINT-</a>
    `;
    expect(parseCardgameclubItListing(html, "s1")).toEqual([
      {
        number: "ni001",
        name: "Naruto Uzumaki",
        setCode: "s1",
        printedRef: "NI-01",
      },
      {
        number: "te096",
        name: "Strangolare",
        setCode: "s1",
        printedRef: "TE-96",
      },
    ]);
  });
});

describe("mergeCardgameclubItCardsIntoIndex", () => {
  it("adds IT titles on the Carddass NI print, not a second key", () => {
    const merged = mergeCardgameclubItCardsIntoIndex({
      prints: [
        {
          printKey: "naruto:ni-0001",
          setCode: "s1",
          number: "ni0001",
          cardType: "ni",
          family: "ninja",
        },
      ],
      titles: [
        { printKey: "naruto:ni-0001", lang: "fr", fullName: "Naruto Uzumaki" },
      ],
      cards: [
        {
          number: "ni001",
          name: "Naruto Uzumaki",
          setCode: "s1",
          printedRef: "NI-01",
        },
      ],
    });
    expect(merged.addedPrints).toEqual([]);
    expect(
      merged.titles.find(
        (t) => t.printKey === "naruto:ni-0001" && t.lang === "it",
      )?.fullName,
    ).toBe("Naruto Uzumaki");
  });
});
