import { afterEach, describe, expect, it, vi } from "vitest";

import { clearExpansionCache } from "./expansions";
import { printNumbersMatch } from "./match";

vi.mock("./client", () => ({
  cardnexusApiKey: () => "cnk_live_test",
  cardnexusGet: vi.fn(),
  cardnexusPost: vi.fn(),
  CARDNEXUS_API_KEY_ENV: "CARDNEXUS_API_KEY",
  CARDNEXUS_BASE_URL: "https://public-api.cardnexus.com/v1",
  CARDNEXUS_MIN_INTERVAL_MS: 1000,
}));

import { cardnexusGet, cardnexusPost } from "./client";
import { fetchCardnexusCardForPrintKey } from "./match";
import { matchExpansionId } from "./expansions";
import { centsFromPricesByFinish } from "./prices";
import { cardnexusGameIdForPrintGame } from "./games";

const getMock = vi.mocked(cardnexusGet);
const postMock = vi.mocked(cardnexusPost);

afterEach(() => {
  clearExpansionCache();
  vi.clearAllMocks();
});

describe("cardnexusGameIdForPrintGame", () => {
  it.each([
    ["lorcana", "lorcana"],
    ["pokemon", "pokemon"],
    ["yugioh", "ygo"],
    ["mtg", "mtg"],
    ["onepiece", "onepiece"],
    ["narutomythos", "naruto-mythos"],
    ["dbsfw", "dbs-fusion"],
    ["dbscg", "dbs-masters"],
    ["boardgames", null],
  ] as const)("%s → %s", (printGame, expected) => {
    expect(cardnexusGameIdForPrintGame(printGame)).toBe(expected);
  });
});

describe("printNumbersMatch", () => {
  it.each([
    ["223", "223", true],
    ["001", "1", true],
    ["1", "001", true],
    ["4a", "4A", true],
    ["20", "223", false],
  ])("%s vs %s → %s", (a, b, ok) => {
    expect(printNumbersMatch(a, b)).toBe(ok);
  });
});

describe("matchExpansionId", () => {
  it("matches exact and unique prefix codes", () => {
    const map = new Map([
      ["12", 1130],
      ["me05-pitch-black", 1813],
      ["me04-chaos-rising", 1248],
    ]);
    expect(matchExpansionId(map, "12")).toBe(1130);
    expect(matchExpansionId(map, "ME05")).toBe(1813);
    expect(matchExpansionId(map, "nope")).toBeNull();
  });

  it("refuses ambiguous set prefixes", () => {
    const map = new Map([
      ["me05-pitch-black", 1813],
      ["me05-alt", 9999],
    ]);
    expect(matchExpansionId(map, "me05")).toBeNull();
  });
});

describe("centsFromPricesByFinish", () => {
  it("reads EU NM standard + foil", () => {
    const cents = centsFromPricesByFinish({
      Standard: {
        cardnexus: {
          low: { amount: 1.5, currency: "EUR" },
          regions: {
            eu: {
              currency: "EUR",
              low: 1.4,
              byCondition: { NM: { low: 1.25 } },
            },
          },
        },
      },
      Foil: {
        cardnexus: {
          regions: { eu: { currency: "EUR", low: 9.99 } },
        },
      },
    });
    expect(cents.newCents).toBe(125);
    expect(cents.foilCents).toBe(999);
  });
});

describe("fetchCardnexusCardForPrintKey", () => {
  it("resolves lorcana:12-223 via expansion + printNumber", async () => {
    getMock.mockResolvedValueOnce({
      data: [{ id: 1130, code: "12", name: "Wilds Unknown" }],
    });
    postMock.mockResolvedValueOnce({
      data: [
        {
          id: 212092,
          gameId: "lorcana",
          name: "Jessie - Lively Cowgirl",
          printNumber: "223",
          expansion: { id: 1130, code: "12" },
          pricesByFinish: {
            Foil: {
              cardnexus: {
                regions: { eu: { currency: "EUR", low: 120 } },
              },
            },
          },
        },
      ],
    });

    const card = await fetchCardnexusCardForPrintKey("lorcana:12-223");
    expect(card).toEqual({
      id: 212092,
      name: "Jessie - Lively Cowgirl",
      gameId: "lorcana",
      printNumber: "223",
      expansionCode: "12",
      sourceUrl: "https://cardnexus.com/product/212092",
      newCents: null,
      foilCents: 12000,
    });
    expect(postMock).toHaveBeenCalledWith(
      "/products/search",
      expect.objectContaining({ expansionId: 1130, printNumber: "223" }),
      undefined,
    );
  });

  it("returns null without a supported game", async () => {
    expect(await fetchCardnexusCardForPrintKey("boardgames:foo-1")).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });
});
