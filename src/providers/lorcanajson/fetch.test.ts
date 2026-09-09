import { beforeEach, describe, expect, it, vi } from "vitest";

const httpGet = vi.fn();

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: (...args: unknown[]) => httpGet(...args),
}));

import {
  fetchLorcanaCardByPrintKey,
  fetchLorcanaCardByProviderId,
  fetchLorcanaCardsByPrintKey,
  fetchLorcanaLanguageVariants,
  loadLorcanaIndex,
  lorcanaCollectorNumberLabel,
  lorcanaPrintLabel,
  normalizeLorcanaSearchText,
  resetLorcanaIndexCache,
  scoreLorcanaCard,
  searchLorcanaCards,
  setCardCountFromFullIdentifier,
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
        id: 1,
        setCode: "1",
        number: 1,
        variant: null,
        promoGrouping: null,
        fullName: "Ariel - Sur une mission",
        name: "Ariel",
        version: "Sur une mission",
        rarity: "Commune",
        foilTypes: ["None", "Silver"],
        images: { full: "https://example.test/ariel-1.jpg" },
      },
      {
        id: 20,
        setCode: "1",
        number: 20,
        variant: null,
        promoGrouping: null,
        fullIdentifier: "20/204 • FR • 1",
        fullName: "Simba - Lionceau protecteur",
        name: "Simba",
        version: "Lionceau protecteur",
        rarity: "Commune",
        type: "Personnage",
        color: "Ambre",
        cost: 2,
        lore: 1,
        strength: 2,
        willpower: 3,
        subtypes: ["Storyborn", "Héros"],
        inkwell: true,
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
        // Promo group P3 — collectors type PR3#34 / P3 34.
        id: 11034,
        setCode: "11",
        number: 34,
        variant: null,
        promoGrouping: "P3",
        fullName: "Fée Clochette - Promo P3",
        name: "Fée Clochette",
        foilTypes: ["Magma"],
        images: { full: "https://example.test/tink-p3.jpg" },
      },
      {
        id: 3215,
        setCode: "13",
        number: 244,
        fullName: "Lilo & Stitch - Amis qui aiment s'amuser",
        name: "Lilo & Stitch",
        foilTypes: ["Lore"],
        varnishType: "MetallicHotFoil",
        foilEffectColors: ["#FFB348", "#B2B2B2"],
        images: {
          full: "https://example.test/lilo.jpg",
          varnishMask: "https://example.test/lilo-v.jpg",
          varnishMask2: "https://example.test/lilo-v2.jpg",
        },
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
    expect(index.cards).toHaveLength(8);
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

  it("carries foilEffectColors and varnishMask2 from upstream", async () => {
    mockDataset(payload());
    const card = await fetchLorcanaCardByPrintKey("lorcana:13-244", {
      language: "fr",
    });
    expect(card).toMatchObject({
      foilEffectColors: ["#FFB348", "#B2B2B2"],
      secondVarnishMaskUrl: "https://example.test/lilo-v2.jpg",
      varnishMaskUrl: "https://example.test/lilo-v.jpg",
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
    const simba = await fetchLorcanaCardByPrintKey("lorcana:1-20", {
      language: "fr",
    });

    expect(lorcanaCollectorNumberLabel(puppy!)).toBe("4a");
    expect(lorcanaCollectorNumberLabel(genie!)).toBe("20/P1");
    expect(lorcanaCollectorNumberLabel(simba!)).toBe("20/204");
    expect(lorcanaPrintLabel(puppy!)).toBe("Les Terres d'Encre · 4a");
    expect(lorcanaPrintLabel(genie!)).toBe("Premier Chapitre · 20/P1");
    expect(lorcanaPrintLabel(simba!)).toBe("Premier Chapitre · 20/204");
  });

  it("parses set size from fullIdentifier and ignores promo tails", () => {
    expect(setCardCountFromFullIdentifier("1/204 • FR • 1")).toBe(204);
    expect(setCardCountFromFullIdentifier("20/P1 • FR • 9")).toBeNull();
    expect(setCardCountFromFullIdentifier(null)).toBeNull();
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

  it("lists a set from its French name", async () => {
    mockDataset(payload());
    const results = await searchLorcanaCards("premier chapitre", {
      language: "fr",
    });

    expect(results.map((card) => card.printKey)).toEqual([
      "lorcana:1-1",
      "lorcana:1-20",
      "lorcana:1-20-p1",
    ]);
  });

  it("resolves set + collector number (name, letter code, or #)", async () => {
    mockDataset(payload());

    const byName = await searchLorcanaCards("premier chapitre 1", {
      language: "fr",
    });
    const byCode = await searchLorcanaCards("TFC#1", { language: "fr" });
    const bySpaced = await searchLorcanaCards("tfc 1", { language: "fr" });

    expect(byName.map((card) => card.printKey)).toEqual(["lorcana:1-1"]);
    expect(byCode.map((card) => card.printKey)).toEqual(["lorcana:1-1"]);
    expect(bySpaced.map((card) => card.printKey)).toEqual(["lorcana:1-1"]);
  });

  it("resolves promo group + number (P3 / PR3)", async () => {
    mockDataset(payload());

    const byP = await searchLorcanaCards("P3#34", { language: "fr" });
    const byPr = await searchLorcanaCards("PR3 34", { language: "fr" });

    expect(byP.map((card) => card.printKey)).toEqual(["lorcana:11-34-p3"]);
    expect(byPr.map((card) => card.printKey)).toEqual(["lorcana:11-34-p3"]);
  });

  it("still finds cards by character name alongside collector search", async () => {
    mockDataset(payload());
    const results = await searchLorcanaCards("simba", { language: "fr" });

    expect(results[0]?.printKey).toBe("lorcana:1-20");
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
      const language = url.includes("/en/")
        ? "en"
        : url.includes("/de/")
          ? "de"
          : url.includes("/it/")
            ? "it"
            : "fr";
      if (language === "de" || language === "it") {
        return {
          data: {
            metadata: {
              generatedOn: "2026-07-24T17:37:25",
              language,
            },
            sets: { "1": { name: "Set 1" } },
            cards: [],
          },
          status: 200,
        };
      }
      const isEnglish = language === "en";
      return {
        data: {
          metadata: {
            generatedOn: "2026-07-24T17:37:25",
            language,
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

  it("searches every language and prefers the asked-for title", async () => {
    serveTwoLanguages();
    const preferred = await searchLorcanaCards("ariel", { language: "fr" });
    expect(preferred.map((card) => card.fullName)).toContain(
      "Ariel - Sur des jambes humaines",
    );
    // Same provider id must not appear twice (FR + EN).
    expect(preferred.filter((card) => card.providerId === "1")).toHaveLength(1);

    const onlyEnglish = await searchLorcanaCards("tempest print", {
      language: "fr",
    });
    expect(onlyEnglish.map((card) => card.printKey)).toContain(
      "lorcana:1-1-c1",
    );
    expect(onlyEnglish[0]?.foilTypes).toContain("Tempest");
  });

  it("returns one row per language for the same provider id", async () => {
    serveTwoLanguages();
    const variants = await fetchLorcanaLanguageVariants("1", {
      language: "fr",
    });
    expect(variants.map((card) => card.language)).toEqual(["fr", "en"]);
    expect(variants.map((card) => card.fullName)).toEqual([
      "Ariel - Sur des jambes humaines",
      "Ariel - On Human Legs",
    ]);
  });

  it("returns only the languages that published an English-only print", async () => {
    serveTwoLanguages();
    const variants = await fetchLorcanaLanguageVariants("2", {
      language: "fr",
    });
    expect(variants.map((card) => card.language)).toEqual(["en"]);
    expect(variants[0]?.foilTypes).toContain("Tempest");
  });
});
