import { beforeEach, describe, expect, it, vi } from "vitest";

const httpGet = vi.fn();

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: (...args: unknown[]) => httpGet(...args),
}));

import {
  cardmarketPricesFromPayload,
  fetchTcgdexCardByPrintKey,
  mapTcgdexBrief,
  mapTcgdexCard,
  printKeyFromTcgdexIds,
  resolveTcgdexLanguage,
  searchTcgdexCards,
  tcgdexIdCandidatesFromPrintKey,
  tcgdexIdFromPrintKey,
  printKeySetSegment,
  tcgdexImageUrl,
  tcgdexLanguageFromLiveOrDex,
  tcgdexPrintLabel,
  tcgdexQueryHints,
} from "./fetch";
import {
  __resetDigitalOnlyCacheForTests,
  __seedDigitalOnlyCacheForTests,
  digitalOnlySetIds,
} from "./digitalOnly";
import {
  __resetTcgdexSetSerieCacheForTests,
  __seedTcgdexSetSerieCacheForTests,
} from "./setMeta";

function detailPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "sv03.5-006",
    localId: "006",
    name: "Dracaufeu-ex",
    category: "Pokémon",
    illustrator: "5ban Graphics",
    rarity: "Double rare",
    image: "https://assets.tcgdex.net/fr/sv/sv03.5/006",
    set: {
      id: "sv03.5",
      name: "151",
      cardCount: { official: 165, total: 207 },
    },
    hp: 330,
    types: ["Feu"],
    stage: "Niveau 2",
    evolveFrom: "Reptincel",
    regulationMark: "G",
    variants: {
      firstEdition: false,
      holo: true,
      normal: false,
      reverse: false,
      wPromo: false,
    },
    pricing: {
      cardmarket: {
        unit: "EUR",
        idProduct: 733601,
        avg: 8.85,
        low: 1.99,
        trend: 9.01,
        "avg-holo": null,
        "low-holo": null,
        "trend-holo": 0,
      },
    },
    ...overrides,
  };
}

function normalReversePayload() {
  return detailPayload({
    id: "sv03.5-001",
    localId: "001",
    name: "Bulbizarre",
    rarity: "Commune",
    image: "https://assets.tcgdex.net/fr/sv/sv03.5/001",
    set: { id: "sv03.5", name: "151" },
    variants: {
      firstEdition: false,
      holo: false,
      normal: true,
      reverse: true,
      wPromo: false,
    },
    pricing: {
      cardmarket: {
        unit: "EUR",
        idProduct: 733596,
        avg: 0.12,
        low: 0.02,
        trend: 0.1,
        "avg-holo": 0.36,
        "low-holo": 0.02,
        "trend-holo": 0.28,
      },
    },
  });
}

beforeEach(() => {
  httpGet.mockReset();
  // Pocket set ids, without spending one of the queued HTTP answers on the
  // serie lookup. The lookup itself has its own test below.
  __seedDigitalOnlyCacheForTests(["a1", "a1a", "a2"]);
  // Same idea for expansion → serie: seed so hydrate tests stay on card HTTP.
  __resetTcgdexSetSerieCacheForTests();
  __seedTcgdexSetSerieCacheForTests("sv03.5", "fr", {
    serieId: "sv",
    serieName: "Écarlate et Violet",
  });
  __seedTcgdexSetSerieCacheForTests("sm9", "fr", {
    serieId: "sm",
    serieName: "Soleil et Lune",
  });
});

describe("tcgdexImageUrl", () => {
  it("appends the high PNG quality suffix", () => {
    expect(
      tcgdexImageUrl("https://assets.tcgdex.net/fr/sv/sv03.5/006", "high"),
    ).toBe("https://assets.tcgdex.net/fr/sv/sv03.5/006/high.png");
  });
});

describe("printKeyFromTcgdexIds / tcgdexIdFromPrintKey", () => {
  it("round-trips dotted set codes", () => {
    expect(printKeyFromTcgdexIds("sv03.5", "006")).toBe("pokemon:sv03.5-006");
    expect(tcgdexIdFromPrintKey("pokemon:sv03.5-006")).toBe("sv03.5-006");
    expect(tcgdexIdFromPrintKey("pokemon:swsh10.5-010")).toBe("swsh10.5-010");
  });

  it("rejects non-pokemon keys", () => {
    expect(tcgdexIdFromPrintKey("lorcana:1-1")).toBeNull();
  });
});

/*
  23 sets — tous des Kits du dresseur, 641 cartes — n'avaient aucune clé : leur
  id porte des tirets, et le tiret sépare le set du numéro. Le point le traduit,
  et il était déjà légal dans un segment.
*/
describe("sets dont l'id porte un tiret", () => {
  it("leaves every existing id untouched — no key already written moves", () => {
    expect(printKeySetSegment("sv03.5")).toBe("sv03.5");
    expect(printKeySetSegment("swsh10.5")).toBe("swsh10.5");
    expect(printKeySetSegment("base1")).toBe("base1");
    expect(printKeyFromTcgdexIds("sv03.5", "006")).toBe("pokemon:sv03.5-006");
  });

  it("mints the Trainer Kits that had no key at all", () => {
    expect(printKeyFromTcgdexIds("tk-xy-latia", "1")).toBe(
      "pokemon:tk.xy.latia-1",
    );
    expect(printKeyFromTcgdexIds("p-a", "12")).toBe("pokemon:p.a-12");
    expect(printKeyFromTcgdexIds("2018sm-fr", "3")).toBe("pokemon:2018sm.fr-3");
  });

  /*
    Un segment à point est ambigu en théorie : `sv03.5` en porte un pour de
    vrai, `tk.xy.latia` l'a reçu du tiret. On rend les deux lectures, la
    littérale d'abord — sur le catalogue réel elles ne se croisent jamais.
  */
  it("reads a dotted segment both ways, the literal one first", () => {
    expect(tcgdexIdCandidatesFromPrintKey("pokemon:sv03.5-006")).toEqual([
      "sv03.5-006",
      "sv03-5-006",
    ]);
    expect(tcgdexIdCandidatesFromPrintKey("pokemon:tk.xy.latia-1")).toEqual([
      "tk.xy.latia-1",
      "tk-xy-latia-1",
    ]);
  });

  it("has nothing to disambiguate when the segment carries no dot", () => {
    expect(tcgdexIdCandidatesFromPrintKey("pokemon:base1-4")).toEqual([
      "base1-4",
    ]);
    expect(tcgdexIdCandidatesFromPrintKey("lorcana:1-1")).toEqual([]);
  });
});

describe("cardmarketPricesFromPayload", () => {
  it("splits normal and holo averages when both finishes exist", () => {
    const prices = cardmarketPricesFromPayload(
      {
        cardmarket: {
          avg: 0.12,
          "avg-holo": 0.36,
          idProduct: 1,
        },
      },
      {
        normal: true,
        reverse: true,
        holo: false,
        firstEdition: false,
        wPromo: false,
      },
    );
    expect(prices.cmPriceCents).toBe(12);
    expect(prices.cmFoilPriceCents).toBe(36);
  });

  it("puts a holo-only avg into the foil bucket", () => {
    const prices = cardmarketPricesFromPayload(
      { cardmarket: { avg: 8.85, "avg-holo": null } },
      {
        normal: false,
        holo: true,
        reverse: false,
        firstEdition: false,
        wPromo: false,
      },
    );
    expect(prices.cmPriceCents).toBeNull();
    expect(prices.cmFoilPriceCents).toBe(885);
  });

  it("keeps a normal-only avg in the new bucket", () => {
    const prices = cardmarketPricesFromPayload(
      { cardmarket: { avg: 1.5, "avg-holo": null } },
      {
        normal: true,
        holo: false,
        reverse: false,
        firstEdition: false,
        wPromo: false,
      },
    );
    expect(prices.cmPriceCents).toBe(150);
    expect(prices.cmFoilPriceCents).toBeNull();
  });

  it("still surfaces avg-holo when TCGdex only flags normal", () => {
    const prices = cardmarketPricesFromPayload(
      { cardmarket: { avg: 95.88, "avg-holo": 74.13, idProduct: 293368 } },
      {
        normal: true,
        holo: false,
        reverse: false,
        firstEdition: false,
        wPromo: false,
      },
    );
    expect(prices.cmPriceCents).toBe(9588);
    expect(prices.cmFoilPriceCents).toBe(7413);
  });
});

describe("mapTcgdexCard", () => {
  it("maps a holo print with high cover and foil price", () => {
    const card = mapTcgdexCard(detailPayload(), "fr");
    expect(card).toMatchObject({
      providerId: "sv03.5-006",
      printKey: "pokemon:sv03.5-006",
      setId: "sv03.5",
      finishes: ["holo"],
      imageUrl: "https://assets.tcgdex.net/fr/sv/sv03.5/006/high.png",
      cmPriceCents: null,
      cmFoilPriceCents: 885,
    });
  });

  it("maps normal + reverse finishes and both EUR buckets", () => {
    const card = mapTcgdexCard(normalReversePayload(), "fr");
    expect(card?.finishes).toEqual(["normal", "reverse"]);
    expect(card?.cmPriceCents).toBe(12);
    expect(card?.cmFoilPriceCents).toBe(36);
  });
});

describe("mapTcgdexBrief", () => {
  it("builds a print key from the brief id", () => {
    const card = mapTcgdexBrief(
      {
        id: "swsh10.5-010",
        localId: "010",
        name: "Dracaufeu",
        image: "https://assets.tcgdex.net/fr/swsh/swsh10.5/010",
      },
      "fr",
    );
    expect(card?.printKey).toBe("pokemon:swsh10.5-010");
    expect(card?.imageUrl).toBe(
      "https://assets.tcgdex.net/fr/swsh/swsh10.5/010/high.png",
    );
  });
});

describe("tcgdexPrintLabel", () => {
  it("prefixes the serie when it differs from the expansion", () => {
    const card = mapTcgdexCard(
      {
        id: "sm9-14",
        localId: "14",
        name: "Dracaufeu",
        rarity: "Rare",
        image: "https://assets.tcgdex.net/fr/sm/sm9/14",
        set: { id: "sm9", name: "Duo de Choc" },
        variants: {
          firstEdition: false,
          holo: true,
          normal: false,
          reverse: false,
          wPromo: false,
        },
      },
      "fr",
    )!;
    expect(
      tcgdexPrintLabel({
        ...card,
        serieName: "Soleil et Lune",
        serieId: "sm",
      }),
    ).toBe("Soleil et Lune · Duo de Choc · 14");
  });

  it("falls back to set id when the expansion name is missing", () => {
    const brief = mapTcgdexBrief(
      { id: "sm9-14", localId: "14", name: "Dracaufeu" },
      "fr",
    )!;
    expect(tcgdexPrintLabel(brief)).toBe("sm9 · 14");
  });
});

describe("searchTcgdexCards / fetchTcgdexCardByPrintKey", () => {
  it("searches then hydrates detail rows with serie", async () => {
    httpGet
      .mockResolvedValueOnce({
        data: [
          {
            id: "sv03.5-006",
            localId: "006",
            name: "Dracaufeu-ex",
            image: "https://assets.tcgdex.net/fr/sv/sv03.5/006",
          },
        ],
      })
      .mockResolvedValueOnce({ data: detailPayload() });

    const results = await searchTcgdexCards("Dracaufeu", { limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]?.printKey).toBe("pokemon:sv03.5-006");
    expect(results[0]?.finishes).toEqual(["holo"]);
    expect(results[0]?.serieName).toBe("Écarlate et Violet");
    expect(tcgdexPrintLabel(results[0]!)).toBe(
      "Écarlate et Violet · 151 · 006/165",
    );
    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it("falls back to EN when FR name search is empty (Charizard)", async () => {
    httpGet.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({
      data: [
        {
          id: "sv03.5-006",
          localId: "006",
          name: "Charizard ex",
          image: "https://assets.tcgdex.net/en/sv/sv03.5/006",
        },
      ],
    });

    const results = await searchTcgdexCards("Charizard", {
      limit: 1,
      hydrate: false,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Charizard ex");
    expect(results[0]?.language).toBe("en");
    expect(httpGet.mock.calls[0]?.[0]).toContain("/fr/cards");
    expect(httpGet.mock.calls[1]?.[0]).toContain("/en/cards");
  });

  it("hydrates EN search hits in the preferred FR locale", async () => {
    httpGet
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: "sv03.5-006",
            localId: "006",
            name: "Charizard ex",
            image: "https://assets.tcgdex.net/en/sv/sv03.5/006",
          },
        ],
      })
      .mockResolvedValueOnce({
        data: {
          ...detailPayload(),
          name: "Dracaufeu-ex",
        },
      });

    const results = await searchTcgdexCards("Charizard", { limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Dracaufeu-ex");
    expect(results[0]?.language).toBe("fr");
    expect(httpGet.mock.calls[2]?.[0]).toContain("/fr/cards/sv03.5-006");
  });

  it("looks up a print by dotted set key", async () => {
    httpGet.mockResolvedValueOnce({ data: detailPayload() });

    const card = await fetchTcgdexCardByPrintKey("pokemon:sv03.5-006");
    expect(card?.name).toBe("Dracaufeu-ex");
    expect(httpGet.mock.calls[0]?.[0]).toContain("/fr/cards/sv03.5-006");
  });

  it("keeps the secret prints the catalogue order buries", async () => {
    // TCGdex answers in catalogue order, so a Pokémon's highest-numbered
    // prints come last. Cutting to `limit` before ranking dropped them:
    // `Bulbizarre` returned 30 rows with the secret at 27, cut at 24.
    const briefs = Array.from({ length: 30 }, (_, index) => ({
      id: `sv03.5-${String(index + 1).padStart(3, "0")}`,
      localId: String(index + 1).padStart(3, "0"),
      name: "Bulbizarre",
      image: `https://assets.tcgdex.net/fr/sv/sv03.5/${index + 1}`,
    }));
    httpGet.mockResolvedValueOnce({ data: briefs });

    const results = await searchTcgdexCards("Bulbizarre 027", {
      limit: 5,
      hydrate: false,
    });
    expect(results[0]?.printKey).toBe("pokemon:sv03.5-027");
    // The number is a ranking key, not something to send TCGdex as a name.
    expect(httpGet.mock.calls[0]?.[1]).toMatchObject({
      params: { name: "Bulbizarre" },
    });
  });

  it("never offers a print that was only ever digital", async () => {
    httpGet.mockResolvedValueOnce({
      data: [
        {
          id: "A1-227",
          localId: "227",
          name: "Bulbizarre",
          image: "https://assets.tcgdex.net/fr/tcgp/A1/227",
        },
        {
          id: "sv03.5-001",
          localId: "001",
          name: "Bulbizarre",
          image: "https://assets.tcgdex.net/fr/sv/sv03.5/001",
        },
      ],
    });

    const results = await searchTcgdexCards("Bulbizarre", { hydrate: false });
    expect(results.map((card) => card.printKey)).toEqual([
      "pokemon:sv03.5-001",
    ]);
  });
});

describe("tcgdexQueryHints", () => {
  it("splits the collector number off the name", () => {
    expect(tcgdexQueryHints("Bulbizarre 227/226")).toEqual({
      name: "Bulbizarre",
      number: "227",
      setId: null,
    });
    expect(tcgdexQueryHints("Ossatueur ex A1-153")).toEqual({
      name: "Ossatueur ex",
      number: "153",
      setId: "A1",
    });
    expect(tcgdexQueryHints("Carapuce A1 232")).toEqual({
      name: "Carapuce",
      number: "232",
      setId: "A1",
    });
  });

  it("leaves a plain name alone", () => {
    expect(tcgdexQueryHints("Dracaufeu")).toEqual({
      name: "Dracaufeu",
      number: null,
      setId: null,
    });
  });

  it("keeps the query when it is nothing but a number", () => {
    // Better to search TCGdex for "227" and find nothing than to send it an
    // empty name and get the whole catalogue back.
    expect(tcgdexQueryHints("227").name).toBe("227");
  });
});

describe("digitalOnlySetIds", () => {
  it("reads the Pocket sets off TCGdex instead of listing them here", async () => {
    __resetDigitalOnlyCacheForTests();
    httpGet.mockResolvedValueOnce({
      data: { sets: [{ id: "A1" }, { id: "A1a" }, { id: "P-A" }] },
    });

    const ids = await digitalOnlySetIds();
    expect([...ids].sort()).toEqual(["a1", "a1a", "p-a"]);
    expect(httpGet.mock.calls[0]?.[0]).toContain("/series/tcgp");

    // Cached: a second search must not pay for the serie again.
    await digitalOnlySetIds();
    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it("filters nothing when TCGdex is unreachable", async () => {
    __resetDigitalOnlyCacheForTests();
    httpGet.mockRejectedValueOnce(new Error("offline"));

    expect([...(await digitalOnlySetIds())]).toEqual([]);
    __seedDigitalOnlyCacheForTests([]);
  });
});

describe("tcgdex language mapping", () => {
  it("maps Live ptbr onto pt-br and accepts pt-br in the allowlist", () => {
    expect(tcgdexLanguageFromLiveOrDex("ptbr")).toBe("pt-br");
    expect(resolveTcgdexLanguage("ptbr")).toBe("pt-br");
    expect(tcgdexLanguageFromLiveOrDex("ja")).toBe("ja");
    expect(tcgdexLanguageFromLiveOrDex("xx")).toBeNull();
  });
});
