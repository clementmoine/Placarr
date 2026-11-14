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
