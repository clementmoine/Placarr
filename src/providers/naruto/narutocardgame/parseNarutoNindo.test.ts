import { describe, expect, it } from "vitest";

import {
  narutoNindoDetailUrl,
  narutoNindoIdentity,
  narutoNindoListingUrl,
  parseNarutoNindoDetail,
  parseNarutoNindoListingSlugs,
} from "./parseNarutoNindo";

describe("narutoNindo URLs", () => {
  it("builds listing and detail paths", () => {
    expect(narutoNindoListingUrl("fr")).toBe("https://nindodb.com/fr/cards");
    expect(narutoNindoDetailUrl("n-009", "en")).toBe(
      "https://nindodb.com/en/cards/n-009",
    );
  });
});

describe("parseNarutoNindoListingSlugs", () => {
  it("dedupes locale card hrefs", () => {
    const html = `
      <a href="/fr/cards/n-001">x</a>
      <a href="/en/cards/n-001">y</a>
      <a href="/fr/cards/n-009">z</a>
      <a href="/fr/sets/demo">set</a>
    `;
    expect(parseNarutoNindoListingSlugs(html)).toEqual(["n-001", "n-009"]);
  });
});

describe("parseNarutoNindoDetail", () => {
  it("reads dt/dd, set slug, og face", () => {
    const html = `
      <h1>Kakashi Hatake</h1>
      <a href="/fr/sets/demo">Demo</a>
      <meta property="og:image" content="https://nindodb.com/img/cards/N-009.webp">
      <dt>DMG</dt><dd>1</dd>
      <dt>POW</dt><dd>7</dd>
      <dt>Code</dt><dd>N-009</dd>
      <dt>Type</dt><dd>Character</dd>
      <dt>Couleur</dt><dd>Rouge</dd>
      <dt>Rareté</dt><dd>R</dd>
      <dt>Illustrateur</dt><dd>LAYUP</dd>
      <dt>Set</dt><dd>Demo Decks — Naruto and Sasuke</dd>
    `;
    expect(parseNarutoNindoDetail(html, "n-009", "fr")).toMatchObject({
      slug: "n-009",
      name: "Kakashi Hatake",
      code: "N-009",
      setSlug: "demo",
      type: "Character",
      rarity: "R",
      color: "Rouge",
      illustrator: "LAYUP",
      faceUrl: "https://nindodb.com/img/cards/N-009.webp",
      stats: { DMG: "1", POW: "7" },
    });
  });
});

describe("narutoNindoIdentity", () => {
  it.each([
    [
      { slug: "n-009", code: "N-009", setSlug: "demo" },
      { setCode: "demo", number: "n009" },
    ],
    [
      { slug: "k-039", code: "K-039", setSlug: "demo" },
      { setCode: "demo", number: "n009" },
    ],
    [
      { slug: "sample-01", code: "SAMPLE-01", setSlug: "sample" },
      { setCode: "preview", number: "g01" },
    ],
    [
      { slug: "c-001", code: "C-001", setSlug: "pcc00" },
      { setCode: "premium00", number: "c001", grouping: "premiumvol00" },
    ],
    [
      { slug: "cp-001-con", code: "CP-001-CON", setSlug: "promo" },
      { setCode: "promo", number: "cp001", grouping: "gencon" },
    ],
    [
      { slug: "cp-001-yankees", code: "CP-001-YANKEES", setSlug: "promo" },
      { setCode: "promo", number: "cp001", grouping: "yankees" },
    ],
    [
      { slug: "cp-001", code: "CP-001", setSlug: "promo" },
      { setCode: "promo", number: "cp001", grouping: "event" },
    ],
  ] as const)("%j", (card, expected) => {
    expect(narutoNindoIdentity(card)).toEqual(expected);
  });
});
