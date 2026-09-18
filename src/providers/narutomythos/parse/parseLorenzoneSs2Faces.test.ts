import { describe, expect, it } from "vitest";

import {
  matchMythosSs2FaceUrl,
  parseMythosSs2FaceStem,
  parseMythosSs2FaceUrlsFromHtml,
} from "./parseLorenzoneSs2Faces";

describe("parseMythosSs2FaceStem", () => {
  it.each([
    [
      "001-140-hiruzen-sarutobi-leader-of-the-leaf-village-full-art-shinobi-shiren-en.webp",
      { number: "0001", grouping: null },
    ],
    [
      "031-140-kimimaro-i-am-not-his-pawn-chibi-shinobi-shiren-en.webp",
      { number: "0031", grouping: "chibi" },
    ],
    [
      "147-140-naruto-uzumaki-i-m-finding-my-own-ninja-way-pop-shinobi-shiren-en.webp",
      { number: "0147", grouping: "pop" },
    ],
    [
      "000-000-gaara-why-won-t-he-give-up-legendaire-shinobi-shiren-en.webp",
      { number: "lg00", grouping: null },
    ],
    [
      "001-000-jiraiya-pervy-sage-legendaire-shinobi-shiren-en.webp",
      { number: "lg01", grouping: null },
    ],
    [
      "mss01-140-new-forces-mission-shinobi-shiren-en.webp",
      { number: "mss01", grouping: null },
    ],
    [
      "087-141-weights-holo-shinobi-shiren-en.webp",
      { number: "0087", grouping: null },
    ],
  ])("%s", (stem, expected) => {
    expect(parseMythosSs2FaceStem(stem)).toEqual(expected);
  });
});

describe("parseMythosSs2FaceUrlsFromHtml", () => {
  it("dedupes and matches checklist keys, including grouping fallback", () => {
    const html = `
      <img src="https://cdn.shopify.com/s/files/1/0776/0848/5206/files/001-140-hiruzen-full-art-shinobi-shiren-en.webp">
      <img src="https://cdn.shopify.com/s/files/1/0776/0848/5206/files/061-140-teuchi-full-art-shinobi-shiren-en.webp">
      <img src="https://cdn.shopify.com/s/files/1/0776/0848/5206/files/Logo_Preco_Long.png">
    `;
    const hits = parseMythosSs2FaceUrlsFromHtml(html);
    expect(hits).toHaveLength(2);
    expect(matchMythosSs2FaceUrl(hits, { number: "0001" })).toContain(
      "001-140-hiruzen",
    );
    // Checklist may tag Teuchi as chibi while CDN stem is full-art only.
    expect(
      matchMythosSs2FaceUrl(hits, { number: "0061", grouping: "chibi" }),
    ).toContain("061-140-teuchi");
  });
});
