import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMetadataFromPriceCharting = vi.fn();
const fetchMetadataFromPriceChartingByName = vi.fn();
const fetchMetadataFromPriceChartingGameUrl = vi.fn();

vi.mock("./fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetch")>();
  return {
    ...actual,
    fetchMetadataFromPriceCharting: (...args: unknown[]) =>
      fetchMetadataFromPriceCharting(...args),
    fetchMetadataFromPriceChartingByName: (...args: unknown[]) =>
      fetchMetadataFromPriceChartingByName(...args),
    fetchMetadataFromPriceChartingGameUrl: (...args: unknown[]) =>
      fetchMetadataFromPriceChartingGameUrl(...args),
  };
});

import { PROVIDER_MODULES } from "@/core/catalog/catalog";
import { providerRecordUrlsFromStoredSources } from "@/core/enrich/scrapePassGate";
import { parsePriceChartingRecordIdFromUrl } from "./index";

const pricechartingModule = PROVIDER_MODULES.find(
  (module) => module.info.id === "pricecharting",
)!;

describe("parsePriceChartingRecordIdFromUrl", () => {
  it("extracts platform/slug from a /game/ fiche", () => {
    expect(
      parsePriceChartingRecordIdFromUrl(
        "https://www.pricecharting.com/game/pal-playstation-2/slim-playstation-2-system-pink",
      ),
    ).toBe("pal-playstation-2/slim-playstation-2-system-pink");
  });

  it("rejects search URLs", () => {
    expect(
      parsePriceChartingRecordIdFromUrl(
        "https://www.pricecharting.com/fr/search-products?q=ps2",
      ),
    ).toBeNull();
  });
});

describe("providerRecordUrlsFromStoredSources + PriceCharting", () => {
  it("pins PriceCharting /game/ facts via parseMetadataRecordIdFromUrl", () => {
    expect(
      providerRecordUrlsFromStoredSources({
        facts: [
          {
            kind: "external-link",
            source: "pricecharting",
            url: "https://www.pricecharting.com/game/pal-playstation-2/slim-playstation-2-system-pink",
          },
        ],
      }),
    ).toEqual({
      pricecharting:
        "https://www.pricecharting.com/game/pal-playstation-2/slim-playstation-2-system-pink",
    });
  });
});

describe("pricecharting metadata adapter pinned fiche", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes the memorized /game/ URL before barcode/name seek", async () => {
    fetchMetadataFromPriceChartingGameUrl.mockResolvedValue({
      title: "Slim Playstation 2 System [Pink]",
      url: "https://www.pricecharting.com/game/pal-playstation-2/slim-playstation-2-system-pink",
      coverUrl:
        "https://storage.googleapis.com/images.pricecharting.com/pink/1600.jpg",
      images: [
        {
          url: "https://storage.googleapis.com/images.pricecharting.com/pink/1600.jpg",
          label: "Main Image",
          isPal: true,
        },
      ],
      platform: "PAL Playstation 2",
    });

    const adapter = pricechartingModule.createMetadataAdapter!()!;
    const result = await adapter.resolve({
      name: "PlayStation 2 Slim Rose",
      barcode: "4948872411271",
      type: "hardware",
      providerRecordUrls: {
        pricecharting:
          "https://www.pricecharting.com/game/pal-playstation-2/slim-playstation-2-system-pink",
      },
    });

    expect(fetchMetadataFromPriceChartingGameUrl).toHaveBeenCalledWith(
      "https://www.pricecharting.com/game/pal-playstation-2/slim-playstation-2-system-pink",
      expect.objectContaining({ mediaType: "hardware" }),
    );
    expect(fetchMetadataFromPriceCharting).not.toHaveBeenCalled();
    expect(fetchMetadataFromPriceChartingByName).not.toHaveBeenCalled();
    expect(result?.title).toBe("Slim Playstation 2 System [Pink]");
    expect(result?.attachments?.[0]?.url).toContain("pink/1600.jpg");
    expect(result?.facts?.some((fact) => fact.url?.includes("pink"))).toBe(
      true,
    );
  });

  it("falls back to barcode seek when no pin is present", async () => {
    fetchMetadataFromPriceCharting.mockResolvedValue({
      title: "Nintendo 64 System",
      url: "https://www.pricecharting.com/game/pal-nintendo-64/nintendo-64-system",
      coverUrl:
        "https://storage.googleapis.com/images.pricecharting.com/n64/1600.jpg",
    });

    const adapter = pricechartingModule.createMetadataAdapter!()!;
    await adapter.resolve({
      name: "Nintendo 64",
      barcode: "045496870423",
      type: "hardware",
    });

    expect(fetchMetadataFromPriceChartingGameUrl).not.toHaveBeenCalled();
    expect(fetchMetadataFromPriceCharting).toHaveBeenCalled();
  });

  it("ignores a finish-mismatched pin after rename and re-seeks by name", async () => {
    fetchMetadataFromPriceChartingGameUrl.mockResolvedValue({
      title: "New Nintendo 3DS XL Pink + White",
      url: "https://www.pricecharting.com/game/pal-nintendo-3ds/new-nintendo-3ds-xl-pink-+-white",
      coverUrl:
        "https://storage.googleapis.com/images.pricecharting.com/pink/1600.jpg",
    });
    fetchMetadataFromPriceChartingByName.mockResolvedValue({
      title: "New Nintendo 3DS XL Metallic Blue",
      url: "https://www.pricecharting.com/game/pal-nintendo-3ds/new-nintendo-3ds-xl-metallic-blue",
      coverUrl:
        "https://storage.googleapis.com/images.pricecharting.com/blue/1600.jpg",
    });

    const adapter = pricechartingModule.createMetadataAdapter!()!;
    const result = await adapter.resolve({
      name: "New Nintendo 3DS XL Metallic Blue",
      type: "hardware",
      providerRecordUrls: {
        pricecharting:
          "https://www.pricecharting.com/game/pal-nintendo-3ds/new-nintendo-3ds-xl-pink-+-white",
      },
    });

    expect(fetchMetadataFromPriceChartingGameUrl).toHaveBeenCalled();
    expect(fetchMetadataFromPriceChartingByName).toHaveBeenCalledWith(
      "New Nintendo 3DS XL Metallic Blue",
      undefined,
      expect.anything(),
      undefined,
      expect.objectContaining({ mediaType: "hardware" }),
    );
    expect(result?.title).toBe("New Nintendo 3DS XL Metallic Blue");
    expect(
      result?.facts?.some((fact) => fact.url?.includes("metallic-blue")),
    ).toBe(true);
  });
});

/*
  Une carte ne se reconnaît pas à son nom : cinq cartes s'appellent « Naruto
  Uzumaki ». PriceCharting rangeait sous la N-406 « Naruto Uzumaki & Clone »
  la fiche `naruto-uzumaki-clone-wofwn-1234` (autre série, autre numéro), sous
  la NI-018 un Zabuza n°40, et sous une carte Disney la jaquette MSX « Hit
  Bit ». Une fiche de carte doit être sous le chemin du jeu, porter le numéro
  imprimé du printKey et le nom de la carte.
*/
describe("pricecharting metadata adapter on trading cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const resolveCard = async (
    input: { name: string; printKey: string },
    fiche: { title: string; url: string },
  ) => {
    fetchMetadataFromPriceChartingByName.mockResolvedValue({
      ...fiche,
      coverUrl:
        "https://storage.googleapis.com/images.pricecharting.com/x/1600.jpg",
    });
    const adapter = pricechartingModule.createMetadataAdapter!()!;
    return adapter.resolve({ ...input, type: "tcg" });
  };

  it("never seeks anything for a card line PriceCharting does not carry", async () => {
    const adapter = pricechartingModule.createMetadataAdapter!()!;
    const result = await adapter.resolve({
      name: "Bing Bong",
      type: "tcg",
      printKey: "leclerc:disney25-108",
      providerRecordUrls: {
        pricecharting: "https://www.pricecharting.com/game/pal-msx/hit-bit",
      },
    });

    expect(result).toBeNull();
    expect(fetchMetadataFromPriceChartingByName).not.toHaveBeenCalled();
    expect(fetchMetadataFromPriceCharting).not.toHaveBeenCalled();
    expect(fetchMetadataFromPriceChartingGameUrl).not.toHaveBeenCalled();
  });

  it("keeps the fiche bearing the card's own number and name", async () => {
    const result = await resolveCard(
      { name: "Sakura Haruno", printKey: "naruto:s1-ni0003" },
      {
        title: "Sakura Haruno #3",
        url: "https://www.pricecharting.com/game/naruto-bandai-the-path-to-hokage/sakura-haruno-3",
      },
    );
    expect(result?.title).toBe("Sakura Haruno #3");

    const stitch = await resolveCard(
      { name: "Stitch - Rock Star", printKey: "lorcana:1-23" },
      {
        title: "Stitch - Rock Star #23",
        url: "https://www.pricecharting.com/game/lorcana-first-chapter/stitch-rock-star-23",
      },
    );
    expect(stitch?.title).toBe("Stitch - Rock Star #23");
  });

  it("drops a same-game fiche with another number", async () => {
    expect(
      await resolveCard(
        { name: "Naruto Uzumaki & Clone", printKey: "naruto:s11-n0406" },
        {
          title: "Naruto Uzumaki (Clone)",
          url: "https://www.pricecharting.com/game/naruto-bandai-weapons-of-war/naruto-uzumaki-clone-wofwn-1234",
        },
      ),
    ).toBeNull();
    expect(
      await resolveCard(
        { name: "Zabuza Momochi", printKey: "naruto:s1-ni0018" },
        {
          title: "Zabuza Momochi #40",
          url: "https://www.pricecharting.com/game/naruto-bandai-the-path-to-hokage/zabuza-momochi-40",
        },
      ),
    ).toBeNull();
  });

  it("drops a same-number fiche naming another card", async () => {
    expect(
      await resolveCard(
        { name: "Iruka", printKey: "naruto:nr-0008" },
        {
          title: "Kakashi Hatake #8",
          url: "https://www.pricecharting.com/game/naruto-bandai-the-path-to-hokage/kakashi-hatake-8",
        },
      ),
    ).toBeNull();
  });

  it("drops figures and video games found under the card's name", async () => {
    expect(
      await resolveCard(
        { name: "Gaara", printKey: "naruto:s3-ni0094" },
        {
          title: "Gaara #94",
          url: "https://www.pricecharting.com/game/funko-pop-animation/gaara-94",
        },
      ),
    ).toBeNull();
    expect(
      await resolveCard(
        {
          name: "Mickey Mouse - Brave Little Tailor",
          printKey: "lorcana:1-115",
        },
        {
          title: "Mickey Mousecapade",
          url: "https://www.pricecharting.com/game/nes/mickey-mousecapade",
        },
      ),
    ).toBeNull();
  });
});
