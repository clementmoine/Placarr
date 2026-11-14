import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPricesFromPriceChartingGameUrl = vi.fn();
const searchPriceChartingRows = vi.fn();
const resolvePriceChartingGamePath = vi.fn(
  async (gamePath: string) => gamePath,
);

vi.mock("./fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetch")>();
  return {
    ...actual,
    fetchPricesFromPriceChartingGameUrl: (...args: unknown[]) =>
      fetchPricesFromPriceChartingGameUrl(...args),
    searchPriceChartingRows: (...args: unknown[]) =>
      searchPriceChartingRows(...args),
    resolvePriceChartingGamePath: (...args: unknown[]) =>
      resolvePriceChartingGamePath(...args),
  };
});

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import type { BarcodePriceRefreshContext } from "@/types/providerModule";
import type { PriceChartingSearchRow } from "./durableEvidence";
import {
  cardNameFromPriceChartingTitle,
  pickPriceChartingPokemonCardRow,
  priceChartingRowHasCollectorNumber,
  priceChartingRowLooksPokemon,
  refreshPriceChartingPokemonOffers,
} from "./pokemonCardPrice";
import { parsePriceChartingPricesFromHtml } from "./fetch";

const pricechartingModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "pricecharting",
)!;

function row(
  partial: Partial<PriceChartingSearchRow> &
    Pick<PriceChartingSearchRow, "title" | "platform" | "gamePath">,
): PriceChartingSearchRow {
  return {
    id: partial.id ?? "1",
    title: partial.title,
    platform: partial.platform,
    gamePath: partial.gamePath,
  };
}

function refreshCtx(
  overrides: Partial<BarcodePriceRefreshContext> = {},
): BarcodePriceRefreshContext {
  return {
    barcodes: [],
    primaryTitle: "Charizard",
    titles: ["Charizard"],
    acceptanceTitles: ["Charizard"],
    shelfType: "tcg",
    shelfName: "Base Set",
    printKey: "pokemon:base1-4",
    cleanedBarcode: "",
    primaryName: "Charizard",
    fallbackNames: [],
    leDenicheurQueries: [],
    isPal: true,
    isClassics: false,
    ...overrides,
  };
}

describe("pokemon card PriceCharting match helpers", () => {
  it("detects pokemon rows and collector numbers", () => {
    const base = row({
      title: "Charizard #4 Pokemon Base Set",
      platform: "Pokemon Base Set",
      gamePath: "/game/pokemon-base-set/charizard-4",
    });
    expect(priceChartingRowLooksPokemon(base)).toBe(true);
    expect(priceChartingRowHasCollectorNumber(base, "4")).toBe(true);
    expect(priceChartingRowHasCollectorNumber(base, "004")).toBe(true);
    expect(priceChartingRowHasCollectorNumber(base, "40")).toBe(false);
    expect(
      priceChartingRowLooksPokemon(
        row({
          title: "Mario Kart Wii",
          platform: "Wii",
          gamePath: "/game/wii/mario-kart-wii",
        }),
      ),
    ).toBe(false);
  });

  it("strips collector number and bracket variants from PC titles", () => {
    expect(
      cardNameFromPriceChartingTitle(
        "Charizard [1st Edition] #4 Pokemon Base Set",
      ),
    ).toBe("Charizard");
    expect(
      cardNameFromPriceChartingTitle("Dark Charizard #4 Pokemon Team Rocket"),
    ).toBe("Dark Charizard");
  });

  it("picks the unlimited Base Set row among Charizard #4 variants", () => {
    const picked = pickPriceChartingPokemonCardRow(
      [
        row({
          id: "cel",
          title: "Charizard #4 Pokemon Celebrations",
          platform: "Pokemon Celebrations",
          gamePath: "/game/pokemon-celebrations/charizard-4",
        }),
        row({
          id: "base",
          title: "Charizard #4 Pokemon Base Set",
          platform: "Pokemon Base Set",
          gamePath: "/game/pokemon-base-set/charizard-4",
        }),
        row({
          id: "first",
          title: "Charizard [1st Edition] #4 Pokemon Base Set",
          platform: "Pokemon Base Set",
          gamePath: "/game/pokemon-base-set/charizard-4-1st-edition",
        }),
        row({
          id: "wii",
          title: "Mario Kart",
          platform: "Wii",
          gamePath: "/game/wii/mario-kart",
        }),
      ],
      {
        collectorNumber: "4",
        acceptanceTitles: ["Charizard"],
        shelfName: "Base Set",
      },
    );
    expect(picked?.id).toBe("base");
  });

  it("returns null when several non-bracket rows still match", () => {
    const picked = pickPriceChartingPokemonCardRow(
      [
        row({
          id: "a",
          title: "Charizard #4 Pokemon Base Set",
          platform: "Pokemon Base Set",
          gamePath: "/game/pokemon-base-set/charizard-4",
        }),
        row({
          id: "b",
          title: "Charizard #4 Pokemon Base Set 2",
          platform: "Pokemon Base Set 2",
          gamePath: "/game/pokemon-base-set-2/charizard-4",
        }),
      ],
      {
        collectorNumber: "4",
        acceptanceTitles: ["Charizard"],
        // No shelf — both remain plausible.
      },
    );
    expect(picked).toBeNull();
  });

  it("uses shelf sequel conflict to drop Base Set 2 when shelf is Base Set", () => {
    const picked = pickPriceChartingPokemonCardRow(
      [
        row({
          id: "base",
          title: "Charizard #4 Pokemon Base Set",
          platform: "Pokemon Base Set",
          gamePath: "/game/pokemon-base-set/charizard-4",
        }),
        row({
          id: "base2",
          title: "Charizard #4 Pokemon Base Set 2",
          platform: "Pokemon Base Set 2",
          gamePath: "/game/pokemon-base-set-2/charizard-4",
        }),
      ],
      {
        collectorNumber: "4",
        acceptanceTitles: ["Charizard"],
        shelfName: "Base Set",
      },
    );
    expect(picked?.id).toBe("base");
  });

  it("rejects unsupported print games at refresh", async () => {
    const offers = await refreshPriceChartingPokemonOffers(
      refreshCtx({ printKey: "mtg:lea-232", shelfName: "Alpha" }),
    );
    expect(offers).toEqual([]);
    expect(searchPriceChartingRows).not.toHaveBeenCalled();
  });

  it("accepts a unique Lorcana row by path token", () => {
    const picked = pickPriceChartingPokemonCardRow(
      [
        row({
          id: "elsa",
          title: "Elsa - Spirit of Winter #207 Lorcana First Chapter",
          platform: "Lorcana First Chapter",
          gamePath: "/game/lorcana-first-chapter/elsa-spirit-of-winter-207",
        }),
        row({
          id: "poke",
          title: "Charizard #4 Pokemon Base Set",
          platform: "Pokemon Base Set",
          gamePath: "/game/pokemon-base-set/charizard-4",
        }),
      ],
      {
        collectorNumber: "207",
        acceptanceTitles: ["Elsa - Spirit of Winter"],
        shelfName: "First Chapter",
        printGame: "lorcana",
      },
    );
    expect(picked?.id).toBe("elsa");
  });
});

describe("parsePriceChartingPricesFromHtml ungraded", () => {
  it("maps ungraded_price onto priceUsed when used_price is absent", () => {
    const html = `
      <html><body>
        <h1>Charizard #4 <a>Pokemon Base Set</a></h1>
        <script>VGPC.forex_rates = {"EUR": 0.9}</script>
        <td id="ungraded_price"><span class="price js-price">$100.00</span></td>
      </body></html>
    `;
    const prices = parsePriceChartingPricesFromHtml(
      html,
      "https://www.pricecharting.com/game/pokemon-base-set/charizard-4",
    );
    expect(prices?.priceUsed).toBe(9000);
    expect(prices?.sourceUrl).toContain("pokemon-base-set/charizard-4");
  });

  it("prefers used_price (card Ungraded / Loose) when both ids exist", () => {
    const html = `
      <html><body>
        <h1>Charizard #4 <a>Pokemon Base Set</a></h1>
        <script>VGPC.forex_rates = {"EUR": 1}</script>
        <td id="used_price"><span class="price js-price">$278.19</span></td>
        <td id="ungraded_price"><span class="price js-price">$999.00</span></td>
      </body></html>
    `;
    const prices = parsePriceChartingPricesFromHtml(html);
    expect(prices?.priceUsed).toBe(27819);
  });
});

describe("pricecharting refreshBarcodePriceOffers tcg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePriceChartingGamePath.mockImplementation(
      async (gamePath: string) => gamePath,
    );
  });

  it("declares tcg on the module", () => {
    expect(pricechartingModule.info.types).toContain("tcg");
  });

  it("returns a used Ungraded offer from a pinned pokemon fiche", async () => {
    fetchPricesFromPriceChartingGameUrl.mockResolvedValue({
      priceUsed: 25000,
      priceUsedCIB: 70000,
      priceNew: 200000,
      sourceUrl:
        "https://www.pricecharting.com/game/pokemon-base-set/charizard-4",
      productName: "Charizard #4 Pokemon Base Set",
    });

    const offers = await pricechartingModule.refreshBarcodePriceOffers!(
      refreshCtx({
        providerProductUrls: [
          {
            providerKey: "pricecharting",
            url: "https://www.pricecharting.com/game/pokemon-base-set/charizard-4",
          },
        ],
      }),
    );

    expect(searchPriceChartingRows).not.toHaveBeenCalled();
    expect(offers).toHaveLength(1);
    expect(offers[0]?.condition).toBe("used");
    expect(offers[0]?.priceCents).toBe(25000);
    expect(offers[0]?.metadataScoped).toBe(true);
    expect(offers[0]?.sourceUrl).toContain("pokemon-base-set/charizard-4");
  });

  it("searches by name + number when no pin, then fetches the fiche", async () => {
    searchPriceChartingRows.mockResolvedValue([
      row({
        id: "base",
        title: "Charizard #4 Pokemon Base Set",
        platform: "Pokemon Base Set",
        gamePath: "/game/pokemon-base-set/charizard-4",
      }),
      row({
        id: "first",
        title: "Charizard [1st Edition] #4 Pokemon Base Set",
        platform: "Pokemon Base Set",
        gamePath: "/game/pokemon-base-set/charizard-4-1st",
      }),
    ]);
    fetchPricesFromPriceChartingGameUrl.mockResolvedValue({
      priceUsed: 27819,
      sourceUrl:
        "https://www.pricecharting.com/game/pokemon-base-set/charizard-4",
      productName: "Charizard #4 Pokemon Base Set",
    });

    const offers =
      await pricechartingModule.refreshBarcodePriceOffers!(refreshCtx());

    expect(searchPriceChartingRows).toHaveBeenCalled();
    expect(fetchPricesFromPriceChartingGameUrl).toHaveBeenCalledWith(
      "https://www.pricecharting.com/game/pokemon-base-set/charizard-4",
      expect.anything(),
    );
    expect(offers[0]?.priceCents).toBe(27819);
    expect(offers[0]?.condition).toBe("used");
  });

  it("returns [] for evidenceOnly without a pin", async () => {
    const offers = await pricechartingModule.refreshBarcodePriceOffers!(
      refreshCtx({ evidenceOnly: true }),
    );
    expect(offers).toEqual([]);
    expect(searchPriceChartingRows).not.toHaveBeenCalled();
  });

  it("returns [] for unsupported tcg printKeys (e.g. mtg)", async () => {
    const offers = await pricechartingModule.refreshBarcodePriceOffers!(
      refreshCtx({
        printKey: "mtg:mh3-1",
        primaryName: "Ajani",
        primaryTitle: "Ajani",
        acceptanceTitles: ["Ajani"],
        shelfName: "Modern Horizons 3",
      }),
    );
    expect(offers).toEqual([]);
  });

  it("searches Lorcana printKeys on the allowlist", async () => {
    searchPriceChartingRows.mockResolvedValue([
      row({
        id: "elsa",
        title: "Elsa - Spirit of Winter #207 Lorcana First Chapter",
        platform: "Lorcana First Chapter",
        gamePath: "/game/lorcana-first-chapter/elsa-spirit-of-winter-207",
      }),
    ]);
    fetchPricesFromPriceChartingGameUrl.mockResolvedValue({
      priceUsed: 4500,
      sourceUrl:
        "https://www.pricecharting.com/game/lorcana-first-chapter/elsa-spirit-of-winter-207",
      productName: "Elsa - Spirit of Winter #207 Lorcana First Chapter",
    });

    const offers = await pricechartingModule.refreshBarcodePriceOffers!(
      refreshCtx({
        printKey: "lorcana:1-207",
        primaryName: "Elsa - Spirit of Winter",
        primaryTitle: "Elsa - Spirit of Winter",
        acceptanceTitles: ["Elsa - Spirit of Winter"],
        shelfName: "First Chapter",
      }),
    );

    expect(offers[0]?.priceCents).toBe(4500);
    expect(offers[0]?.condition).toBe("used");
  });
});
