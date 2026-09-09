import { beforeEach, describe, expect, it, vi } from "vitest";

const httpGet = vi.fn();

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: (...args: unknown[]) => httpGet(...args),
}));

import {
  fetchLorcastCardForPrintKey,
  lorcastLookupFromPrintKey,
  mapLorcastCard,
} from "./fetch";
import { lorcastModule } from "./index";

describe("lorcastLookupFromPrintKey", () => {
  it("parses Lorcana print keys", () => {
    expect(lorcastLookupFromPrintKey("lorcana:1-20")).toEqual({
      set: "1",
      number: "20",
      grouping: null,
    });
    expect(lorcastLookupFromPrintKey("lorcana:3-4a")).toEqual({
      set: "3",
      number: "4a",
      grouping: null,
    });
    expect(lorcastLookupFromPrintKey("lorcana:1-20-p1")).toEqual({
      set: "1",
      number: "20",
      grouping: "p1",
    });
  });

  it("rejects non-Lorcana keys", () => {
    expect(lorcastLookupFromPrintKey("pokemon:1-1")).toBeNull();
    expect(lorcastLookupFromPrintKey("ariel")).toBeNull();
  });
});

describe("mapLorcastCard", () => {
  it("maps USD prices to cents", () => {
    const card = mapLorcastCard({
      id: "crd_1",
      name: "Ariel",
      version: "On Human Legs",
      collector_number: "1",
      tcgplayer_id: 494102,
      set: { code: "1" },
      prices: { usd: "0.14", usd_foil: "0.32" },
    });
    expect(card?.prices).toEqual({ usd: 14, usdFoil: 32 });
  });

  it("keeps enchanted foil-only cards", () => {
    const card = mapLorcastCard({
      id: "crd_2",
      name: "Elsa",
      version: "Spirit of Winter",
      collector_number: "207",
      set: { code: "1" },
      prices: { usd: null, usd_foil: 917.34 },
    });
    expect(card?.prices.usd).toBeNull();
    expect(card?.prices.usdFoil).toBe(91734);
  });
});

describe("fetchLorcastCardForPrintKey", () => {
  beforeEach(() => {
    httpGet.mockReset();
  });

  it("fetches by set and number", async () => {
    httpGet.mockResolvedValue({
      status: 200,
      data: {
        id: "crd_1",
        name: "Ariel",
        version: "On Human Legs",
        collector_number: "1",
        set: { code: "1" },
        prices: { usd: "0.06", usd_foil: "0.20" },
      },
    });
    const card = await fetchLorcastCardForPrintKey("lorcana:1-1");
    expect(card?.name).toBe("Ariel");
    expect(httpGet).toHaveBeenCalledWith(
      "https://api.lorcast.com/v0/cards/1/1",
      expect.any(Object),
    );
  });

  it("returns null for an unknown promo when no title hint helps", async () => {
    httpGet.mockResolvedValue({ status: 404, data: null });
    expect(await fetchLorcastCardForPrintKey("lorcana:1-20-p1")).toBeNull();
  });

  it("resolves promo printKeys via Lorcast promo sets (P2/24)", async () => {
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/cards/7/24b")) {
        return { status: 404, data: null };
      }
      if (url.endsWith("/cards/P2/24b")) {
        return { status: 404, data: null };
      }
      if (url.endsWith("/cards/P2/24B")) {
        return {
          status: 200,
          data: {
            id: "crd_promo",
            name: "Hiro Hamada",
            version: "Armor Designer",
            collector_number: "24B",
            set: { code: "P2" },
            prices: { usd: null, usd_foil: null },
          },
        };
      }
      if (url.endsWith("/cards/P2/24")) {
        return {
          status: 200,
          data: {
            id: "crd_promo_priced",
            name: "Hiro Hamada",
            version: "Armor Designer",
            collector_number: "24",
            tcgplayer_id: 620276,
            set: { code: "P2" },
            prices: { usd: null, usd_foil: "24.38" },
          },
        };
      }
      return { status: 404, data: null };
    });

    const card = await fetchLorcastCardForPrintKey("lorcana:7-24b-p2");
    expect(card).toEqual(
      expect.objectContaining({
        setCode: "P2",
        collectorNumber: "24",
        prices: { usd: null, usdFoil: 2438 },
      }),
    );
  });
});

describe("lorcastPromoSetFromGrouping", () => {
  it("maps Placarr promo groupings to Lorcast promo set codes", async () => {
    const { lorcastPromoSetFromGrouping } = await import("./fetch");
    expect(lorcastPromoSetFromGrouping("p2")).toBe("P2");
    expect(lorcastPromoSetFromGrouping("P3")).toBe("P3");
    expect(lorcastPromoSetFromGrouping(null)).toBeNull();
    expect(lorcastPromoSetFromGrouping("pd1")).toBeNull();
  });
});

describe("lorcastModule.refreshBarcodePriceOffers", () => {
  beforeEach(() => {
    httpGet.mockReset();
  });

  it("emits USD offers for a tcg printKey", async () => {
    httpGet.mockResolvedValue({
      status: 200,
      data: {
        id: "crd_1",
        name: "Ariel",
        version: "On Human Legs",
        collector_number: "1",
        tcgplayer_id: 494102,
        set: { code: "1" },
        prices: { usd: "0.14", usd_foil: "0.32" },
      },
    });
    const offers = await lorcastModule.refreshBarcodePriceOffers!({
      shelfType: "tcg",
      shelfName: "Lorcana",
      primaryTitle: "Ariel - Sur des jambes humaines",
      titles: ["Ariel - Sur des jambes humaines"],
      acceptanceTitles: ["Ariel - Sur des jambes humaines"],
      barcodes: [],
      cleanedBarcode: "",
      primaryName: "Ariel - Sur des jambes humaines",
      fallbackNames: [],
      leDenicheurQueries: [],
      isPal: true,
      isClassics: false,
      printKey: "lorcana:1-1",
    });
    expect(offers).toEqual([
      expect.objectContaining({
        source: "Lorcast",
        condition: "new",
        priceCents: 14,
        currency: "USD",
        metadataScoped: true,
      }),
      expect.objectContaining({
        source: "Lorcast",
        condition: "foil",
        priceCents: 32,
        currency: "USD",
        metadataScoped: true,
      }),
    ]);
  });

  it("emits foil-only Enchanted prices as market foil", async () => {
    httpGet.mockResolvedValue({
      status: 200,
      data: {
        id: "crd_enchanted",
        name: "Belle & Beast",
        version: "Certain as the Sun",
        collector_number: "245",
        set: { code: "13" },
        prices: { usd: null, usd_foil: "2349.53" },
      },
    });
    const offers = await lorcastModule.refreshBarcodePriceOffers!({
      shelfType: "tcg",
      shelfName: "Lorcana",
      primaryTitle: "Belle & La Bête - Tout comme les étoiles",
      titles: ["Belle & La Bête - Tout comme les étoiles"],
      acceptanceTitles: ["Belle & La Bête - Tout comme les étoiles"],
      barcodes: [],
      cleanedBarcode: "",
      primaryName: "Belle & La Bête - Tout comme les étoiles",
      fallbackNames: [],
      leDenicheurQueries: [],
      isPal: true,
      isClassics: false,
      printKey: "lorcana:13-245",
    });
    expect(offers).toEqual([
      expect.objectContaining({
        source: "Lorcast",
        condition: "foil",
        priceCents: 234953,
        currency: "USD",
        metadataScoped: true,
      }),
    ]);
  });

  it("prefers an ASCII alias as the Lorcast title hint", async () => {
    httpGet.mockResolvedValue({ status: 404, data: null });
    await lorcastModule.refreshBarcodePriceOffers!({
      shelfType: "tcg",
      shelfName: "Lorcana",
      primaryTitle: "Hiro Hamada - Concepteur d'armures",
      titles: [
        "Hiro Hamada - Concepteur d'armures",
        "Hiro Hamada - Armor Designer",
      ],
      acceptanceTitles: [
        "Hiro Hamada - Concepteur d'armures",
        "Hiro Hamada - Armor Designer",
      ],
      barcodes: [],
      cleanedBarcode: "",
      primaryName: "Hiro Hamada - Concepteur d'armures",
      fallbackNames: [],
      leDenicheurQueries: [],
      isPal: true,
      isClassics: false,
      printKey: "lorcana:7-24b-p2",
    });
    const searchCalls = httpGet.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("/cards/search?"));
    expect(
      searchCalls.some((url) => {
        const decoded = decodeURIComponent(url.replace(/\+/g, " "));
        return decoded.includes("Armor Designer");
      }),
    ).toBe(true);
  });

  it("skips non-tcg shelves", async () => {
    const offers = await lorcastModule.refreshBarcodePriceOffers!({
      shelfType: "game",
      primaryTitle: "Zelda",
      titles: ["Zelda"],
      acceptanceTitles: ["Zelda"],
      barcodes: ["0045496362409"],
      cleanedBarcode: "0045496362409",
      primaryName: "Zelda",
      fallbackNames: [],
      leDenicheurQueries: [],
      isPal: true,
      isClassics: false,
      printKey: "lorcana:1-1",
    });
    expect(offers).toEqual([]);
    expect(httpGet).not.toHaveBeenCalled();
  });
});
