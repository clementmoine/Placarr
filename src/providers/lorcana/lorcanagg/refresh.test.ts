import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  mapDotggCard,
  priceIndexFromDotggCards,
  lookupDotggCard,
  resetDotggPriceIndexCache,
  fetchDotggCardForPrintKey,
} from "./fetch";
import { lorcanaggModule } from "./index";

vi.mock("@/core/enrich/providerEvidenceStore", () => ({
  getFreshProviderEvidence: vi.fn(),
  putProviderEvidence: vi.fn(),
}));

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: vi.fn(),
}));

import {
  getFreshProviderEvidence,
  putProviderEvidence,
} from "@/core/enrich/providerEvidenceStore";
import { httpGet } from "@/lib/http/httpClient";

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/sample.json"), "utf8"),
) as { cards: unknown[] };

describe("mapDotggCard", () => {
  it("parses EUR Cardmarket amounts to cents", () => {
    const card = mapDotggCard(fixture.cards[0] as never);
    expect(card).toMatchObject({
      setId: "001",
      number: "1",
      cmPriceCents: 2,
      cmFoilPriceCents: 50,
    });
  });

  it("drops zero foil as absent", () => {
    const card = mapDotggCard(fixture.cards[1] as never);
    expect(card?.cmPriceCents).toBe(154);
    expect(card?.cmFoilPriceCents).toBeNull();
  });
});

describe("priceIndexFromDotggCards", () => {
  it("indexes by setId|number and skips empty prices", () => {
    const index = priceIndexFromDotggCards(fixture.cards);
    expect(lookupDotggCard(index, { setId: "001", number: "1" })?.id).toBe(
      "001-001",
    );
    expect(
      lookupDotggCard(index, { setId: "P3", number: "34" })?.cmPriceCents,
    ).toBe(1050);
    expect(lookupDotggCard(index, { setId: "013", number: "1" })).toBeNull();
  });
});

describe("fetchDotggCardForPrintKey", () => {
  beforeEach(() => {
    resetDotggPriceIndexCache();
    vi.mocked(getFreshProviderEvidence).mockReset();
    vi.mocked(putProviderEvidence).mockReset();
    vi.mocked(httpGet).mockReset();
  });

  afterEach(() => {
    resetDotggPriceIndexCache();
  });

  it("reuses a fresh evidence index without HTTP", async () => {
    vi.mocked(getFreshProviderEvidence).mockResolvedValue({
      yieldJson: priceIndexFromDotggCards(fixture.cards),
    } as never);

    const card = await fetchDotggCardForPrintKey("lorcana:11-34-p3");
    expect(card?.cmPriceCents).toBe(1050);
    expect(card?.cmFoilPriceCents).toBe(1725);
    expect(httpGet).not.toHaveBeenCalled();
  });
});

describe("lorcanaggModule.refreshBarcodePriceOffers", () => {
  beforeEach(() => {
    resetDotggPriceIndexCache();
    vi.mocked(getFreshProviderEvidence).mockResolvedValue({
      yieldJson: priceIndexFromDotggCards(fixture.cards),
    } as never);
  });

  afterEach(() => {
    resetDotggPriceIndexCache();
  });

  it("emits EUR new/foil offers for a promo printKey", async () => {
    const offers = await lorcanaggModule.refreshBarcodePriceOffers!({
      shelfType: "tcg",
      shelfName: "Lorcana",
      primaryTitle: "La Fée Clochette",
      titles: ["La Fée Clochette"],
      acceptanceTitles: ["La Fée Clochette"],
      barcodes: [],
      cleanedBarcode: "",
      primaryName: "La Fée Clochette",
      fallbackNames: [],
      leDenicheurQueries: [],
      isPal: true,
      isClassics: false,
      printKey: "lorcana:11-34-p3",
    });

    expect(offers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "Lorcana.gg",
          condition: "new",
          priceCents: 1050,
          currency: "EUR",
          metadataScoped: true,
        }),
        expect.objectContaining({
          source: "Lorcana.gg",
          condition: "foil",
          priceCents: 1725,
          currency: "EUR",
          metadataScoped: true,
        }),
      ]),
    );
  });

  it("skips without a Lorcana printKey", async () => {
    const offers = await lorcanaggModule.refreshBarcodePriceOffers!({
      shelfType: "tcg",
      shelfName: "Lorcana",
      primaryTitle: "Ariel",
      titles: ["Ariel"],
      acceptanceTitles: ["Ariel"],
      barcodes: [],
      cleanedBarcode: "",
      primaryName: "Ariel",
      fallbackNames: [],
      leDenicheurQueries: [],
      isPal: true,
      isClassics: false,
    });
    expect(offers).toEqual([]);
  });
});

describe("lorcanaggModule info", () => {
  it("declares tcg price capability", () => {
    expect(lorcanaggModule.info.types).toContain("tcg");
    expect(lorcanaggModule.info.capabilities).toContain("price");
    expect(lorcanaggModule.info.referencePriceSource).toBe(true);
  });
});
