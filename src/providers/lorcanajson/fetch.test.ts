import { beforeEach, describe, expect, it, vi } from "vitest";

const httpGet = vi.fn();

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: (...args: unknown[]) => httpGet(...args),
}));

import {
  fetchLorcanaCardByPrintKey,
  fetchLorcanaCardByProviderId,
  fetchLorcanaCardsByPrintKey,
  loadLorcanaIndex,
  lorcanaPrintLabel,
  normalizeLorcanaSearchText,
  resetLorcanaIndexCache,
  scoreLorcanaCard,
  searchLorcanaCards,
} from "./fetch";

/**
 * Shapes copied from the real French payload, keeping the traps: a variant
 * letter, a promo reusing a base number, and a card missing its identity.
 */
function payload() {
  return {
    metadata: { generatedOn: "2026-07-24T17:37:25", language: "fr" },
    sets: {
      "1": { name: "Premier Chapitre" },
      "3": { name: "Les Terres d'Encre" },
      "9": { name: "Fabuleux" },
    },
    cards: [
      {
        id: 20,
        setCode: "1",
        number: 20,
        variant: null,
        promoGrouping: null,
        fullName: "Simba - Lionceau protecteur",
        name: "Simba",
        version: "Lionceau protecteur",
        rarity: "Commune",
        type: "Personnage",
        color: "Ambre",
        cost: 2,
        artists: ["Matthew Robert Davies"],
        story: "Le Roi Lion",
        foilTypes: ["None", "Silver"],
        varnishType: null,
        images: {
          full: "https://api.lorcana.ravensburger.com/images/fr/set1/20_full.jpg",
          thumbnail:
            "https://api.lorcana.ravensburger.com/images/fr/set1/20_thumb.jpg",
          foilMask:
            "https://api.lorcana.ravensburger.com/images/fr/set1/20_mask.jpg",
        },
        externalLinks: {
          cardmarketUrl: "https://www.cardmarket.com/fr/Lorcana/Products/1",
        },
      },
      {
        // Same set, same number as Simba above — only the promo grouping differs.
        id: 678,
        setCode: "1",
        number: 20,
        variant: null,
        promoGrouping: "P1",
        fullName: "Génie - Déchaîne ses pouvoirs",
        name: "Génie",
        version: "Déchaîne ses pouvoirs",
        rarity: "Spécial",
        type: "Personnage",
        foilTypes: ["Satin"],
        images: { full: "https://example.test/genie.jpg" },
      },
      {
        id: 436,
        setCode: "3",
        number: 4,
        variant: "a",
        promoGrouping: null,
        fullName: "Chiot dalmatien - Frétille de joie",
        name: "Chiot dalmatien",
        version: "Frétille de joie",
        rarity: "Commune",
        foilTypes: ["None", "Silver"],
        images: { full: "https://example.test/puppy-a.jpg" },
      },
      {
        id: 437,
        setCode: "3",
        number: 4,
        variant: "b",
        promoGrouping: null,
        fullName: "Chiot dalmatien - Frétille de joie",
        name: "Chiot dalmatien",
        version: "Frétille de joie",
        rarity: "Commune",
        foilTypes: ["None", "Silver"],
        images: { full: "https://example.test/puppy-b.jpg" },
      },
      {
        id: 1937,
        setCode: "9",
        number: 1,
        fullName: "La Reine - Souveraine vaniteuse",
        name: "La Reine",
        version: "Souveraine vaniteuse",
        rarity: "Rare",
        foilTypes: ["None", "Silver"],
        varnishType: "HighGloss",
        images: { full: "https://example.test/queen.jpg" },
      },
      {
        // Identity is unusable — must be dropped, never keyed on a guess.
        id: 9999,
        setCode: null,
        number: 42,
        fullName: "Carte sans set",
      },
    ],
  };
}

/** The Moana / Vaiana pair: two real cards sharing one printed identifier. */
function ambiguousPayload() {
  return {
    metadata: { generatedOn: "2026-07-24T17:37:25", language: "en" },
    sets: { "7": { name: "Archazia's Island" } },
    cards: [
      {
        id: 1433,
        setCode: "7",
        number: 26,
        promoGrouping: "P2",
        fullName: "Vaiana - Adventurer of Land and Sea",
        name: "Vaiana",
      },
      {
        id: 1663,
        setCode: "7",
        number: 26,
        promoGrouping: "P2",
        fullName: "Moana - Adventurer of Land and Sea",
        name: "Moana",
      },
    ],
  };
}

function mockDataset(data: unknown, md5 = "checksum-1") {
  httpGet.mockImplementation(async (url: string) => {
    if (url.endsWith(".md5")) return { data: md5, status: 200 };
    return { data, status: 200 };
  });
}

function allCardsCallCount(): number {
  return httpGet.mock.calls.filter((call) => !String(call[0]).endsWith(".md5"))
    .length;
}

beforeEach(() => {
  httpGet.mockReset();
  resetLorcanaIndexCache();
});

describe("print keys", () => {
  it("keeps a promo apart from the base card sharing its number", async () => {
    mockDataset(payload());
    const index = await loadLorcanaIndex("fr");

    const simba = index.byProviderId.get("20");
    const genie = index.byProviderId.get("678");
    expect(simba?.printKey).toBe("lorcana:1-20");
    expect(genie?.printKey).toBe("lorcana:1-20-p1");
  });

  it("folds the variant letter into the collector number", async () => {
    mockDataset(payload());
    const index = await loadLorcanaIndex("fr");

    expect(index.byProviderId.get("436")?.printKey).toBe("lorcana:3-4a");
    expect(index.byProviderId.get("437")?.printKey).toBe("lorcana:3-4b");
  });

  it("drops a record whose identity is unusable instead of guessing a key", async () => {
    mockDataset(payload());
    const index = await loadLorcanaIndex("fr");

    expect(index.byProviderId.has("9999")).toBe(false);
    expect(index.cards).toHaveLength(5);
  });
});

describe("card mapping", () => {
  it("carries the finishes, the artwork and the foil mask", async () => {
    mockDataset(payload());
    const card = await fetchLorcanaCardByPrintKey("lorcana:1-20", {
      language: "fr",
    });

    expect(card).toMatchObject({
      providerId: "20",
      setCode: "1",
      setName: "Premier Chapitre",
      number: 20,
      rarity: "Commune",
      foilTypes: ["None", "Silver"],
      language: "fr",
      imageUrl:
        "https://api.lorcana.ravensburger.com/images/fr/set1/20_full.jpg",
      foilMaskUrl:
        "https://api.lorcana.ravensburger.com/images/fr/set1/20_mask.jpg",
      cardmarketUrl: "https://www.cardmarket.com/fr/Lorcana/Products/1",
    });
  });

  it("leaves a missing mask null rather than falling back to the artwork", async () => {
    mockDataset(payload());
    const card = await fetchLorcanaCardByPrintKey("lorcana:9-1", {
      language: "fr",
    });

    expect(card?.imageUrl).toBe("https://example.test/queen.jpg");
    expect(card?.foilMaskUrl).toBeNull();
    expect(card?.varnishType).toBe("HighGloss");
  });

  it("labels a print the way a collector reads it", async () => {
    mockDataset(payload());
    const puppy = await fetchLorcanaCardByPrintKey("lorcana:3-4a", {
      language: "fr",
    });
    const genie = await fetchLorcanaCardByPrintKey("lorcana:1-20-p1", {
      language: "fr",
    });

    expect(lorcanaPrintLabel(puppy!)).toBe("Les Terres d'Encre · 4a");
    expect(lorcanaPrintLabel(genie!)).toBe("Premier Chapitre · 20 P1");
  });
});

describe("ambiguous printed identifiers", () => {
  it("returns both cards that really share the identifier", async () => {
    mockDataset(ambiguousPayload());
    const matches = await fetchLorcanaCardsByPrintKey("lorcana:7-26-p2", {
      language: "en",
    });

    expect(matches.map((card) => card.name).sort()).toEqual([
      "Moana",
      "Vaiana",
    ]);
  });

  it("refuses to pick one at random when no name disambiguates", async () => {
    mockDataset(ambiguousPayload());
    const card = await fetchLorcanaCardByPrintKey("lorcana:7-26-p2", {
      language: "en",
    });

    expect(card).toBeNull();
  });

  it("resolves the pair once the name is known", async () => {
    mockDataset(ambiguousPayload());
    const card = await fetchLorcanaCardByPrintKey("lorcana:7-26-p2", {
      language: "en",
      name: "Moana - Adventurer of Land and Sea",
    });

    expect(card?.providerId).toBe("1663");
  });
});

describe("index caching", () => {
  it("skips the 9 MB payload when the published checksum has not moved", async () => {
    mockDataset(payload(), "checksum-1");
    await loadLorcanaIndex("fr");
    expect(allCardsCallCount()).toBe(1);

    // Force the revalidation window open without re-downloading.
    vi.setSystemTime(Date.now() + 31 * 60_000);
    await loadLorcanaIndex("fr");

    expect(allCardsCallCount()).toBe(1);
    vi.useRealTimers();
  });

  it("rebuilds once the checksum moves", async () => {
    mockDataset(payload(), "checksum-1");
    const before = await loadLorcanaIndex("fr");

    mockDataset(payload(), "checksum-2");
    vi.setSystemTime(Date.now() + 31 * 60_000);
    const after = await loadLorcanaIndex("fr");

    expect(allCardsCallCount()).toBe(2);
    expect(after).not.toBe(before);
    expect(after.md5).toBe("checksum-2");
    vi.useRealTimers();
  });

  it("collapses concurrent loads into a single download", async () => {
    mockDataset(payload());
    const [first, second, third] = await Promise.all([
      loadLorcanaIndex("fr"),
      loadLorcanaIndex("fr"),
      loadLorcanaIndex("fr"),
    ]);

    expect(allCardsCallCount()).toBe(1);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("keeps languages apart", async () => {
    mockDataset(payload());
    const fr = await loadLorcanaIndex("fr");
    const en = await loadLorcanaIndex("en");

    expect(fr).not.toBe(en);
    expect(fr.cards[0]?.language).toBe("fr");
    expect(en.cards[0]?.language).toBe("en");
  });

  it("still serves cards when the checksum file is unreachable", async () => {
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith(".md5")) throw new Error("404");
      return { data: payload(), status: 200 };
    });

    const card = await fetchLorcanaCardByProviderId("20", { language: "fr" });
    expect(card?.fullName).toBe("Simba - Lionceau protecteur");
  });
});

describe("search", () => {
  it("ranks the bare character name above a longer title containing it", async () => {
    mockDataset(payload());
    const results = await searchLorcanaCards("simba", { language: "fr" });

    expect(results[0]?.fullName).toBe("Simba - Lionceau protecteur");
  });

  it("matches accents and punctuation loosely", async () => {
    mockDataset(payload());
    const results = await searchLorcanaCards("genie dechaine", {
      language: "fr",
    });

    expect(results.map((card) => card.providerId)).toContain("678");
  });

  it("returns every print of a card that exists in several variants", async () => {
    mockDataset(payload());
    const results = await searchLorcanaCards("chiot dalmatien", {
      language: "fr",
    });

    expect(results.map((card) => card.printKey)).toEqual([
      "lorcana:3-4a",
      "lorcana:3-4b",
    ]);
  });

  it("orders results by set then card number", async () => {
    mockDataset(payload());
    const results = await searchLorcanaCards("e", { language: "fr" });
    const keys = results.map((card) => `${card.setCode}/${card.number}`);

    expect(keys).toEqual([...keys].sort(sortAsCollectorWould));
  });

  it("returns nothing for an empty query rather than the whole catalogue", async () => {
    mockDataset(payload());

    expect(await searchLorcanaCards("", { language: "fr" })).toEqual([]);
    expect(await searchLorcanaCards("   ", { language: "fr" })).toEqual([]);
  });

  it("honours the limit", async () => {
    mockDataset(payload());
    const results = await searchLorcanaCards("e", { language: "fr", limit: 2 });

    expect(results).toHaveLength(2);
  });
});

function sortAsCollectorWould(left: string, right: string): number {
  const [leftSet, leftNumber] = left.split("/").map(Number);
  const [rightSet, rightNumber] = right.split("/").map(Number);
  if (leftSet !== rightSet) return leftSet - rightSet;
  return leftNumber - rightNumber;
}

describe("scoreLorcanaCard", () => {
  it("scores an exact full name above a prefix, and a prefix above a substring", async () => {
    mockDataset(payload());
    const index = await loadLorcanaIndex("fr");
    const simba = index.byProviderId.get("20")!;

    const exact = scoreLorcanaCard(
      simba,
      normalizeLorcanaSearchText("Simba - Lionceau protecteur"),
    );
    const prefix = scoreLorcanaCard(simba, "simba");
    const substring = scoreLorcanaCard(simba, "protecteur");

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  it("scores an unrelated query at zero", async () => {
    mockDataset(payload());
    const index = await loadLorcanaIndex("fr");
    const simba = index.byProviderId.get("20")!;

    expect(scoreLorcanaCard(simba, "mickey")).toBe(0);
    expect(scoreLorcanaCard(simba, "")).toBe(0);
  });
});

describe("normalizeLorcanaSearchText", () => {
  it("folds accents, case and punctuation", () => {
    expect(normalizeLorcanaSearchText("Génie - Déchaîne ses pouvoirs")).toBe(
      "genie dechaine ses pouvoirs",
    );
  });
});

describe("looking a print up across languages", () => {
  /** FR knows one printing, EN knows both — the real asymmetry, in miniature. */
  function serveTwoLanguages() {
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith(".md5")) return { data: `md5-${url}`, status: 200 };
      const isEnglish = url.includes("/en/");
      return {
        data: {
          metadata: {
            generatedOn: "2026-07-24T17:37:25",
            language: isEnglish ? "en" : "fr",
          },
          sets: { "1": { name: "Premier Chapitre" } },
          cards: [
            {
              id: 1,
              setCode: "1",
              number: 1,
              variant: null,
              promoGrouping: null,
              fullName: isEnglish
                ? "Ariel - On Human Legs"
                : "Ariel - Sur des jambes humaines",
              name: "Ariel",
              rarity: "Rare",
              foilTypes: ["None", "Silver"],
            },
            ...(isEnglish
              ? [
                  {
                    id: 2,
                    setCode: "1",
                    number: 1,
                    variant: null,
                    promoGrouping: "c1",
                    fullName: "Ariel - Tempest Print",
                    name: "Ariel",
                    rarity: "Rare",
                    foilTypes: ["None", "Tempest"],
                  },
                ]
              : []),
          ],
        },
        status: 200,
      };
    });
  }

  it("prefers the language asked for", async () => {
    serveTwoLanguages();
    const card = await fetchLorcanaCardByPrintKey("lorcana:1-1", {
      language: "fr",
    });
    expect(card?.fullName).toBe("Ariel - Sur des jambes humaines");
  });

  it("finds a printing that exists in no French card", async () => {
    // Tempest, FreeForm2 and CalendarWave appear on no FR printing at all. A
    // lookup that stopped at the preferred language reported them as unknown
    // prints and drew them plain, which is the wrong answer to "not published
    // in French" — the finish belongs to the printing, not to the text on it.
    serveTwoLanguages();
    const card = await fetchLorcanaCardByPrintKey("lorcana:1-1-c1", {
      language: "fr",
    });
    expect(card?.foilTypes).toContain("Tempest");
  });

  it("still returns nothing for a print key no language has", async () => {
    serveTwoLanguages();
    expect(
      await fetchLorcanaCardByPrintKey("lorcana:9-99", { language: "fr" }),
    ).toBeNull();
  });
});
