import { describe, expect, it } from "vitest";

import {
  cardTypeFromCollectorNumber,
  enSetCode,
  parseBandaicgAssetPath,
} from "./parseBandaicgAsset";

describe("parseBandaicgAssetPath", () => {
  it.each([
    {
      url: "http://www.bandaicg.com/naruto/images/cards_s1/n001.jpg",
      set: "s1",
      number: "n001",
      cardType: "n",
      role: "art" as const,
    },
    {
      url: "http://www.bandaicg.com:80/naruto/images/cards_s10/j049_t.jpg",
      set: "s10",
      number: "j049",
      cardType: "j",
      role: "thumb" as const,
    },
    {
      url: "http://www.bandaicg.com/naruto/images/cards_pr/pr018b.jpg",
      set: "promo",
      number: "pr018b",
      cardType: "pr",
      role: "art" as const,
    },
    {
      url: "http://www.bandaicg.com/naruto/images/cards_pr/ps004_t.jpg",
      set: "promo",
      number: "ps004",
      cardType: "ps",
      role: "thumb" as const,
    },
    {
      url: "http://www.bandaicg.com/naruto/images/cards_s2/m117.jpg",
      set: "s2",
      number: "m117",
      cardType: "m",
      role: "art" as const,
    },
  ])("$url → $set/$number ($role)", ({ url, set, number, cardType, role }) => {
    const parsed = parseBandaicgAssetPath(url);
    expect(parsed).toMatchObject({
      set,
      number,
      cardType,
      role,
      cardId: number,
      printKey: `naruto:${set}-${number}`,
    });
  });

  it("rejects chrome and FR paths", () => {
    expect(
      parseBandaicgAssetPath(
        "http://www.bandaicg.com/naruto/images/bg_paper.jpg",
      ),
    ).toBeNull();
    expect(
      parseBandaicgAssetPath(
        "http://www.carddass.fr/naruto/images/cartes/1/NINJA-001.jpg",
      ),
    ).toBeNull();
  });
});

describe("enSetCode / cardTypeFromCollectorNumber", () => {
  it("builds series set codes (no locale prefix)", () => {
    expect(enSetCode("s1")).toBe("s1");
    expect(enSetCode("promo")).toBe("promo");
  });

  it.each([
    ["ni023", "ni"],
    ["n001", "n"],
    ["pr002", "pr"],
    ["ps004", "ps"],
    ["j049", "j"],
  ])("%s → %s", (number, type) => {
    expect(cardTypeFromCollectorNumber(number)).toBe(type);
  });
});
