import { describe, expect, it } from "vitest";

import {
  narutoMarketFaceUrl,
  narutoMarketIdentity,
  normalizeNarutoMarketRef,
  parseNarutoMarketDataCards,
  parseNarutoMarketListingSlugs,
} from "./parseNarutoMarket";

describe("normalizeNarutoMarketRef", () => {
  it.each([
    ["N-001", "n001"],
    ["CP-001", "cp001"],
    ["C-001", "c001"],
    ["K-039", "k039"],
    ["S-001", "s001"],
    ["", null],
  ] as const)("%s → %s", (ref, expected) => {
    expect(normalizeNarutoMarketRef(ref)).toBe(expected);
  });
});

describe("narutoMarketIdentity", () => {
  it("skips artwork previews (gallery already covered)", () => {
    expect(
      narutoMarketIdentity({
        slug: "orochimaru-official-artwork-preview-01",
        ref: "",
        edition: "",
        artwork: true,
      }),
    ).toBeNull();
  });

  it("maps Gen Con SAMPLE to demo", () => {
    expect(
      narutoMarketIdentity({
        slug: "naruto-uzumaki-leader-n-001",
        ref: "N-001",
        edition: "Gen Con 2026",
        artwork: false,
      }),
    ).toEqual({ setCode: "demo", number: "n001" });
  });

  it("uses grouping for Yankees / Gen Con / event CP variants under promo", () => {
    expect(
      narutoMarketIdentity({
        slug: "chakra-card-cp-001-new-york-yankees-2026",
        ref: "CP-001",
        edition: "New York Yankees 2026",
        artwork: false,
      }),
    ).toEqual({ setCode: "promo", number: "cp001", grouping: "yankees" });
    expect(
      narutoMarketIdentity({
        slug: "chakra-card-cp-001-gen-con-2026",
        ref: "CP-001",
        edition: "Gen Con 2026",
        artwork: false,
      }),
    ).toEqual({ setCode: "promo", number: "cp001", grouping: "gencon" });
    expect(
      narutoMarketIdentity({
        slug: "chakra-card-cp-001-event-promo-2026",
        ref: "CP-001",
        edition: "Promotion événementielle 2026",
        artwork: false,
      }),
    ).toEqual({ setCode: "promo", number: "cp001", grouping: "event" });
  });

  it("maps Premium vol.00 under premium00 with grouping", () => {
    expect(
      narutoMarketIdentity({
        slug: "chakra-card-c-001-naruto-uzumaki-premium-vol-00",
        ref: "C-001",
        edition: "Premium Card Collection vol.00",
        artwork: false,
      }),
    ).toEqual({
      setCode: "premium00",
      number: "c001",
      grouping: "premiumvol00",
    });
  });
});

describe("parseNarutoMarket HTML", () => {
  it("parses data-card attrs and strips face query", () => {
    const html = `
      <div data-card="{&quot;slug&quot;:&quot;naruto-uzumaki-leader-n-001&quot;,&quot;name&quot;:&quot;Naruto Uzumaki&quot;,&quot;ref&quot;:&quot;N-001&quot;,&quot;image&quot;:&quot;/uploads/n-001.webp?v=abc&quot;,&quot;url&quot;:&quot;/fr/cards/naruto-uzumaki-leader-n-001&quot;,&quot;type&quot;:&quot;Leader&quot;,&quot;kind&quot;:&quot;leader&quot;,&quot;artwork&quot;:false,&quot;state&quot;:&quot;exemple&quot;,&quot;edition&quot;:&quot;Gen Con 2026&quot;}"></div>
    `;
    const cards = parseNarutoMarketDataCards(html);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      slug: "naruto-uzumaki-leader-n-001",
      ref: "N-001",
      artwork: false,
    });
    expect(narutoMarketFaceUrl(cards[0]!.imagePath)).toBe(
      "https://narutomarket.com/uploads/n-001.webp",
    );
  });

  it("lists slugs from listing hrefs as fallback", () => {
    const html = `
      <a href="/fr/cards/sasuke-uchiha-leader-n-012">x</a>
      <a href="/fr/cards/sasuke-uchiha-leader-n-012?from_page=1">y</a>
    `;
    expect(parseNarutoMarketListingSlugs(html)).toEqual([
      "sasuke-uchiha-leader-n-012",
    ]);
  });
});
