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
import {
  fetchCardnexusCardForPrintKey,
  fetchCardnexusProductForPrintKey,
} from "./match";
import { matchExpansionId } from "./expansions";
import { centsFromPricesByFinish, centsFromSealedPrices } from "./prices";
import {
  cardnexusGameIdForPrintGame,
  cardnexusGameIdsForPrint,
} from "./games";
import { cardnexusImageDownloadUrl } from "./fillFaces";
import { listSealedForExpansionId } from "./sealed";

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
    ["mythos", "naruto-mythos"],
    ["dbsfw", "dbs-fusion"],
    ["dbscg", "dbs-masters"],
    ["fab", "fab"],
    ["swu", "swu"],
    ["gundam", "gundam"],
    ["boardgames", null],
  ] as const)("%s → %s", (printGame, expected) => {
    expect(cardnexusGameIdForPrintGame(printGame)).toBe(expected);
  });
});

describe("cardnexusGameIdsForPrint", () => {
  it("routes JA pokemon to pokemon-japan only", () => {
    expect(
      cardnexusGameIdsForPrint({ printGame: "pokemon", language: "ja" }),
    ).toEqual(["pokemon-japan"]);
  });

  it("tries EN then JA for default pokemon", () => {
    expect(cardnexusGameIdsForPrint({ printGame: "pokemon" })).toEqual([
      "pokemon",
      "pokemon-japan",
    ]);
  });

  it("routes JA yugioh to OCG first", () => {
    expect(
      cardnexusGameIdsForPrint({ printGame: "yugioh", language: "ja" }),
    ).toEqual(["ygo-ocg", "ygo"]);
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

describe("centsFromSealedPrices", () => {
  it("reads EUR low from sealed prices block", () => {
    expect(
      centsFromSealedPrices({
        cardnexus: { low: { amount: 151.29, currency: "EUR" } },
      }),
    ).toBe(15129);
  });
});

describe("cardnexusImageDownloadUrl", () => {
  it("strips ImageKit /p1200.png suffix", () => {
    expect(
      cardnexusImageDownloadUrl(
        "https://img.cardnexus.com/pokemon-japan/sv4a.jpg/p1200.png",
      ),
    ).toBe("https://img.cardnexus.com/pokemon-japan/sv4a.jpg");
  });
});

describe("loadExpansionIndex pagination", () => {
  it("walks offset pages until hasMore is false", async () => {
    getMock
      .mockResolvedValueOnce({
        data: [{ id: 1, code: "a-one", name: "A" }],
        pagination: { offset: 0, limit: 100, total: 2, hasMore: true },
      })
      .mockResolvedValueOnce({
        data: [{ id: 2, code: "b-two", name: "B" }],
        pagination: { offset: 100, limit: 100, total: 2, hasMore: false },
      });

    const { loadExpansionIndex } = await import("./expansions");
    const map = await loadExpansionIndex("pokemon-japan");
    expect(map.get("a-one")).toBe(1);
    expect(map.get("b-two")).toBe(2);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock.mock.calls[0]?.[0]).toContain("offset=0");
    expect(getMock.mock.calls[1]?.[0]).toContain("offset=1");
  });
});

describe("fetchCardnexusCardForPrintKey", () => {
  it("resolves lorcana:12-223 via expansion + printNumber", async () => {
    getMock.mockResolvedValueOnce({
      data: [{ id: 1130, code: "12", name: "Wilds Unknown" }],
      pagination: { hasMore: false },
    });
    postMock.mockResolvedValueOnce({
      data: [
        {
          id: 212092,
          gameId: "lorcana",
          name: "Jessie - Lively Cowgirl",
          printNumber: "223",
          imageUrl: "https://img.cardnexus.com/lorcana/x.jpg/p1200.png",
          productType: "card",
          expansion: { id: 1130, code: "12" },
          pricesByFinish: {
            Foil: {
              cardnexus: {
                regions: { eu: { currency: "EUR", low: 120 } },
              },
            },
          },
          externalIds: { cardmarket: [{ id: 99, finish: "Foil" }] },
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
      imageUrl: "https://img.cardnexus.com/lorcana/x.jpg/p1200.png",
      productType: "card",
      productCategory: null,
      externalIds: { cardmarket: [{ id: 99, finish: "Foil" }] },
    });
    expect(postMock).toHaveBeenCalledWith(
      "/products/search",
      expect.objectContaining({
        expansionId: [1130],
        printNumber: "223",
        productType: { op: "or", values: ["card"] },
        gameFilters: { game: "lorcana" },
      }),
      undefined,
    );
  });

  it("falls back to pokemon-japan when EN expansion is missing", async () => {
    getMock
      .mockResolvedValueOnce({
        data: [{ id: 9, code: "sv3", name: "EN only" }],
        pagination: { hasMore: false },
      })
      .mockResolvedValueOnce({
        data: [{ id: 1658, code: "sv4a-shiny-treasure-ex", name: "SV4a" }],
        pagination: { hasMore: false },
      });
    postMock.mockResolvedValueOnce({
      data: [
        {
          id: 200368,
          gameId: "pokemon-japan",
          name: "Oddish",
          printNumber: "001",
          imageUrl: "https://img.cardnexus.com/pokemon-japan/oddish.jpg",
          productType: "card",
          expansion: { id: 1658, code: "sv4a-shiny-treasure-ex" },
          pricesByFinish: {
            Foil: {
              cardnexus: {
                regions: { eu: { currency: "EUR", low: 0.5 } },
              },
            },
          },
        },
      ],
    });

    const card = await fetchCardnexusCardForPrintKey("pokemon:sv4a-001");
    expect(card?.gameId).toBe("pokemon-japan");
    expect(card?.name).toBe("Oddish");
    expect(card?.foilCents).toBe(50);
  });

  it("returns product without prices when requirePrices is false", async () => {
    getMock.mockResolvedValueOnce({
      data: [{ id: 1658, code: "sv4a-shiny-treasure-ex", name: "SV4a" }],
      pagination: { hasMore: false },
    });
    postMock.mockResolvedValueOnce({
      data: [
        {
          id: 200368,
          gameId: "pokemon-japan",
          name: "Oddish",
          printNumber: "001",
          imageUrl: "https://img.cardnexus.com/x.jpg",
          productType: "card",
          expansion: { id: 1658, code: "sv4a-shiny-treasure-ex" },
          pricesByFinish: {},
        },
      ],
    });

    const card = await fetchCardnexusCardForPrintKey("pokemon:sv4a-001", {
      language: "ja",
      requirePrices: false,
    });
    expect(card?.id).toBe(200368);
    expect(card?.newCents).toBeNull();
    expect(card?.imageUrl).toContain("img.cardnexus.com");
  });

  it("returns null without a supported game", async () => {
    expect(await fetchCardnexusCardForPrintKey("boardgames:foo-1")).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("fetchCardnexusProductForPrintKey", () => {
  it("returns the raw hit for face harvest", async () => {
    getMock.mockResolvedValueOnce({
      data: [{ id: 1130, code: "12", name: "Wilds" }],
      pagination: { hasMore: false },
    });
    postMock.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          gameId: "lorcana",
          name: "Test",
          printNumber: "1",
          imageUrl: "https://img.cardnexus.com/t.jpg",
          productType: "card",
          expansion: { id: 1130, code: "12" },
          pricesByFinish: {},
        },
      ],
    });
    const hit = await fetchCardnexusProductForPrintKey("lorcana:12-1");
    expect(hit?.imageUrl).toContain("img.cardnexus.com");
  });
});

describe("listSealedForExpansionId", () => {
  it("filters with productType sealed object", async () => {
    postMock.mockResolvedValueOnce({
      data: [
        {
          id: 10,
          gameId: "pokemon",
          name: "Booster Box",
          productType: "sealed",
          productCategory: "booster_box",
          imageUrl: "https://img.cardnexus.com/box.png",
          prices: {
            cardnexus: { low: { amount: 120, currency: "EUR" } },
          },
          expansion: { id: 2743, code: "me06-delta-reign" },
        },
      ],
      pagination: { hasMore: false },
    });

    const sealed = await listSealedForExpansionId(2743, { gameId: "pokemon" });
    expect(sealed).toHaveLength(1);
    expect(sealed[0]?.priceCents).toBe(12000);
    expect(sealed[0]?.productCategory).toBe("booster_box");
    expect(postMock).toHaveBeenCalledWith(
      "/products/search",
      expect.objectContaining({
        expansionId: [2743],
        productType: { op: "or", values: ["sealed"] },
        gameFilters: { game: "pokemon" },
      }),
      expect.anything(),
    );
  });
});
