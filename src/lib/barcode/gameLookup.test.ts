import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetchFromScreenScraper: vi.fn(),
  fetchFromTMDB: vi.fn(),
  fetchMetadataFromPriceCharting: vi.fn(),
}));

vi.mock("@/services/metadataResolvers", () => ({
  fetchFromScreenScraper: h.fetchFromScreenScraper,
  fetchFromTMDB: h.fetchFromTMDB,
}));

vi.mock("@/services/providers/pricecharting", () => ({
  fetchMetadataFromPriceCharting: h.fetchMetadataFromPriceCharting,
}));

import {
  enrichGameBarcodeLookups,
  type GameLookupInputs,
} from "@/lib/barcode/gameLookup";

const BARCODE = "0045496365226";

function makeInputs(
  overrides: Partial<GameLookupInputs> = {},
): GameLookupInputs {
  return {
    pc: null,
    sd: null,
    calListings: [],
    amc: [],
    freakxy: [],
    aprilo: [],
    picclick: [],
    contextPlatformKey: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.fetchFromScreenScraper.mockReset();
  h.fetchFromTMDB.mockReset();
  h.fetchMetadataFromPriceCharting.mockReset();
  h.fetchFromScreenScraper.mockResolvedValue(null);
  h.fetchFromTMDB.mockResolvedValue(null);
  h.fetchMetadataFromPriceCharting.mockResolvedValue(null);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enrichGameBarcodeLookups", () => {
  it("skips expensive game databases when no platform signal exists", async () => {
    const result = await enrichGameBarcodeLookups({
      cleanedBarcode: BARCODE,
      contextPlatformKey: null,
      pc: null,
      searchLabel: "generic",
      inputs: makeInputs({
        amc: [{ name: "Mille Sabords Gigamic" }],
      }),
    });

    expect(result).toEqual({ pc: null, ss: null });
    expect(h.fetchMetadataFromPriceCharting).not.toHaveBeenCalled();
    expect(h.fetchFromScreenScraper).not.toHaveBeenCalled();
  });

  it("queries game databases when listings expose a platform signal", async () => {
    await enrichGameBarcodeLookups({
      cleanedBarcode: BARCODE,
      contextPlatformKey: null,
      pc: null,
      searchLabel: "generic",
      inputs: makeInputs({
        amc: [{ name: "Mario Kart Wii" }],
      }),
    });

    expect(h.fetchMetadataFromPriceCharting).toHaveBeenCalledWith(
      BARCODE,
      "Mario Kart Wii",
      "wii",
      true,
      false,
    );
    expect(h.fetchFromScreenScraper).toHaveBeenCalledWith(
      "Mario Kart Wii",
      BARCODE,
      "wii",
    );
  });
});
