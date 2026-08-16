import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: vi.fn(),
}));

import { httpGet } from "@/lib/http/httpClient";
import { mapTcgdexMetadata, tcgdexModule, toPrintCandidate } from "./index";
import { mapTcgdexCard } from "./fetch";
import { pickTcgdexPlayroomSamples } from "./playroomSamples";

function detailPayload() {
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
        "avg-holo": null,
      },
    },
  };
}

describe("toPrintCandidate / mapTcgdexMetadata", () => {
  it("exposes the print key, high cover, and pokemon pack", () => {
    const card = mapTcgdexCard(detailPayload(), "fr");
    expect(card).not.toBeNull();
    const candidate = toPrintCandidate(card!);
    expect(candidate.printKey).toBe("pokemon:sv03.5-006");
    expect(candidate.imageUrl).toBe(
      "/assets/pokemon/cards/sv3-5/fr/006/art.webp",
    );
    expect(candidate.thumbnailUrl).toBe(candidate.imageUrl);
    expect(candidate.cardBackUrl).toBeUndefined();
    expect(candidate.effectPack).toBe("pokemon");
    // Pack default is EffectPack.cardBackUrl, not print scope.
    expect(candidate.variantImageUrls?.holo).toBe(
      "/assets/pokemon/cards/sv3-5/fr/006/art.webp",
    );
    expect(candidate.effectPack).toBe("pokemon");
    expect(candidate.finishes).toEqual(["holo"]);
    expect(candidate.plainFinishes).toEqual([]);
    // Live set id sv3-5 ← TCGdex sv03.5 (stub + full dump both carry 006)
    expect(candidate.finishShaders?.holo).toBe("SunPillar");
    expect(candidate.finishFoilMaskUrls?.holo).toBe(
      "/assets/pokemon/cards/sv3-5/fr/006/mask.webp",
    );
    expect(candidate.foilMaskUrl).toBe(
      "/assets/pokemon/cards/sv3-5/fr/006/mask.webp",
    );
    expect(candidate.externalIds?.pokemonLiveBundle).toBe("sv3-5_fr_006");
    expect(candidate.externalIds?.tcgdexImage).toContain("tcgdex.net");
    expect(candidate.faceQuarterTurns).toBeUndefined();

    const metadata = mapTcgdexMetadata({
      ...card!,
      serieName: "Écarlate et Violet",
      serieId: "sv",
    });
    expect(metadata?.title).toBe("Dracaufeu-ex");
    expect(metadata?.facts?.some((f) => f.label === "Série")).toBe(true);
    expect(metadata?.facts?.find((f) => f.label === "Série")?.value).toBe(
      "Écarlate et Violet",
    );
    expect(metadata?.facts?.find((f) => f.label === "Extension")?.value).toBe(
      "151",
    );
    expect(metadata?.facts?.find((f) => f.label === "Numéro")?.value).toBe(
      "006/165",
    );
    expect(metadata?.facts?.find((f) => f.label === "Type")?.value).toBe("Feu");
    expect(metadata?.facts?.find((f) => f.label === "Catégorie")?.value).toBe(
      "Pokémon",
    );
    expect(metadata?.facts?.find((f) => f.label === "PV")?.value).toBe("330");
    expect(metadata?.externalIds?.tcgdex).toBe("sv03.5-006");
    expect(metadata?.externalIds?.printKey).toBe("pokemon:sv03.5-006");
    expect(metadata?.attachments?.some((a) => a.role === "tcgdex-scan")).toBe(
      true,
    );
    expect(metadata?.attachments?.some((a) => a.role === "tcglive-front")).toBe(
      false,
    );
    expect(metadata?.attachments?.every((a) => a.source === "tcgdex")).toBe(
      true,
    );
  });

  it("keeps TCGdex low.webp as picker thumb when Live art is absent", () => {
    const card = mapTcgdexCard(
      {
        ...detailPayload(),
        id: "base1-4",
        localId: "4",
        name: "Dracaufeu",
        image: "https://assets.tcgdex.net/fr/base/base1/4",
        set: { id: "base1", name: "Set de Base" },
        variants: {
          firstEdition: false,
          holo: true,
          normal: false,
          reverse: false,
          wPromo: false,
        },
      },
      "fr",
    );
    expect(card).not.toBeNull();
    // Force no Live join by using a print the dump does not carry as primary.
    const orphan = { ...card!, printKey: "pokemon:zz99-999", setId: "zz99" };
    const candidate = toPrintCandidate(orphan);
    expect(candidate.thumbnailUrl).toBe(
      "https://assets.tcgdex.net/fr/base/base1/4/low.webp",
    );
    expect(candidate.imageUrl).toBe(
      "https://assets.tcgdex.net/fr/base/base1/4/high.png",
    );
  });

  it("exposes live-ph when dual-foil dump is unreachable via holo alone", () => {
    const card = mapTcgdexCard(
      {
        ...detailPayload(),
        id: "bw10-16",
        localId: "16",
        name: "Démo Dual",
        image: "https://assets.tcgdex.net/fr/bw/bw10/16",
        set: { id: "bw10", name: "Glaciation Plasma" },
        variants: {
          firstEdition: false,
          holo: true,
          normal: false,
          reverse: false,
          wPromo: false,
        },
      },
      "fr",
    );
    expect(card).not.toBeNull();
    const candidate = toPrintCandidate(card!);
    expect(candidate.finishes).toEqual(["holo", "live-ph"]);
    expect(candidate.finishShaders?.holo).toBe("Tinsel");
    expect(candidate.finishShaders?.["live-ph"]).toBe("Rainbow");
    expect(candidate.finishFoilMaskUrls?.["live-ph"]).toContain(
      "/assets/pokemon/cards/bw10/fr/016/mask-ph.webp",
    );
  });

  it("marks BREAK / TURBO prints as one quarter turn", () => {
    const card = mapTcgdexCard(
      {
        ...detailPayload(),
        id: "xy10-14",
        localId: "14",
        name: "Goupelin TURBO",
        stage: "TURBO",
        image: "https://assets.tcgdex.net/fr/xy/xy10/14",
        set: { id: "xy10", name: "Impact des Destins" },
        variants: {
          firstEdition: false,
          holo: true,
          normal: false,
          reverse: false,
          wPromo: false,
        },
      },
      "fr",
    );
    expect(card?.stage).toBe("TURBO");
    const candidate = toPrintCandidate(card!);
    expect(candidate.faceQuarterTurns).toBe(1);
  });
});

describe("tcgdexModule.refreshBarcodePriceOffers", () => {
  beforeEach(() => {
    vi.mocked(httpGet).mockReset();
  });

  it("emits EUR new/foil buckets for a printKey", async () => {
    vi.mocked(httpGet).mockResolvedValue({
      data: {
        ...detailPayload(),
        id: "sv03.5-001",
        localId: "001",
        name: "Bulbizarre",
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
            "avg-holo": 0.36,
          },
        },
      },
    } as never);

    const offers = await tcgdexModule.refreshBarcodePriceOffers!({
      shelfType: "tcg",
      shelfName: "Pokémon",
      primaryTitle: "Bulbizarre",
      titles: ["Bulbizarre"],
      acceptanceTitles: ["Bulbizarre"],
      barcodes: [],
      cleanedBarcode: "",
      primaryName: "Bulbizarre",
      fallbackNames: [],
      leDenicheurQueries: [],
      isPal: true,
      isClassics: false,
      printKey: "pokemon:sv03.5-001",
    });

    expect(offers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          condition: "new",
          priceCents: 12,
          currency: "EUR",
        }),
        expect.objectContaining({
          condition: "foil",
          priceCents: 36,
          currency: "EUR",
        }),
      ]),
    );
  });

  it("ignores non-pokemon print keys", async () => {
    const offers = await tcgdexModule.refreshBarcodePriceOffers!({
      shelfType: "tcg",
      shelfName: "Lorcana",
      primaryTitle: "Elsa",
      titles: ["Elsa"],
      acceptanceTitles: ["Elsa"],
      barcodes: [],
      cleanedBarcode: "",
      primaryName: "Elsa",
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

describe("pickTcgdexPlayroomSamples", () => {
  it("returns a seeded holo sample when asked", () => {
    const card = mapTcgdexCard(detailPayload(), "fr")!;
    const samples = pickTcgdexPlayroomSamples(
      new Map([[card.providerId, card]]),
      [{ finish: "holo", varnish: null }],
    );
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      printKey: "pokemon:sv03.5-006",
      variant: "holo",
      shelfType: "tcg",
      imageUrl: "/assets/pokemon/cards/sv3-5/fr/006/art.webp",
      foilMaskUrl: "/assets/pokemon/cards/sv3-5/fr/006/mask.webp",
    });
  });

  it("skips Lorcana varnish needs", () => {
    const card = mapTcgdexCard(detailPayload(), "fr")!;
    expect(
      pickTcgdexPlayroomSamples(new Map([[card.providerId, card]]), [
        { finish: "Silver", varnish: "HighGloss" },
      ]),
    ).toEqual([]);
  });
});

describe("tcgdexModule info", () => {
  it("declares Pokémon catalogue traits", () => {
    expect(tcgdexModule.info.id).toBe("tcgdex");
    expect(tcgdexModule.info.types).toContain("tcg");
    expect(tcgdexModule.info.nameDatabase).toBe(true);
    expect(tcgdexModule.info.defaultLanguage).toBe("fr");
    expect(tcgdexModule.info.coverUrlHost).toBe("assets.tcgdex.net");
    expect(tcgdexModule.info.capabilities).toEqual(
      expect.arrayContaining(["identify", "cover", "price"]),
    );
  });
});
