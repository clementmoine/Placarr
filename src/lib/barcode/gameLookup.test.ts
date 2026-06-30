import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enrichGameBarcodeLookups,
  type GameLookupInputs,
} from "@/lib/barcode/gameLookup";
import type { GameBarcodeEnrichmentDeps } from "@/types/providerModule";

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
    ebay: [],
    contextPlatformKey: null,
    ...overrides,
  };
}

function makeDeps(): GameBarcodeEnrichmentDeps & {
  fetchReferencePriceByBarcode: ReturnType<typeof vi.fn>;
  fetchGameMediaByBarcode: ReturnType<typeof vi.fn>;
} {
  return {
    fetchReferencePriceByBarcode: vi.fn(async () => null),
    fetchGameMediaByBarcode: vi.fn(async () => null),
  };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enrichGameBarcodeLookups", () => {
  it("skips expensive game databases when no platform signal exists", async () => {
    const enrichmentDeps = makeDeps();
    const result = await enrichGameBarcodeLookups({
      cleanedBarcode: BARCODE,
      contextPlatformKey: null,
      pc: null,
      searchLabel: "generic",
      enrichmentDeps,
      inputs: makeInputs({
        amc: [{ name: "Mille Sabords Gigamic" }],
      }),
    });

    expect(result).toEqual({ pc: null, ss: null });
    expect(enrichmentDeps.fetchReferencePriceByBarcode).not.toHaveBeenCalled();
    expect(enrichmentDeps.fetchGameMediaByBarcode).not.toHaveBeenCalled();
  });

  it("queries game databases when listings expose a platform signal", async () => {
    const enrichmentDeps = makeDeps();
    await enrichGameBarcodeLookups({
      cleanedBarcode: BARCODE,
      contextPlatformKey: null,
      pc: null,
      searchLabel: "generic",
      enrichmentDeps,
      inputs: makeInputs({
        amc: [{ name: "Mario Kart Wii" }],
      }),
    });

    expect(enrichmentDeps.fetchReferencePriceByBarcode).toHaveBeenCalledWith(
      BARCODE,
      "Mario Kart Wii",
      "wii",
      true,
      false,
    );
    expect(enrichmentDeps.fetchGameMediaByBarcode).toHaveBeenCalledWith(
      "Mario Kart Wii",
      BARCODE,
      "wii",
    );
  });

  it("uses the shelf platform hint only when barcode sources expose no platform", async () => {
    const enrichmentDeps = makeDeps();
    await enrichGameBarcodeLookups({
      cleanedBarcode: BARCODE,
      contextPlatformKey: "xbox",
      pc: null,
      searchLabel: "games",
      enrichmentDeps,
      inputs: makeInputs({
        amc: [{ name: "Halo Combat Evolved" }],
        contextPlatformKey: "xbox",
      }),
    });

    expect(enrichmentDeps.fetchGameMediaByBarcode).toHaveBeenCalledWith(
      "Halo Combat Evolved",
      BARCODE,
      "xbox",
    );
  });

  it("lets barcode platform evidence beat the shelf platform hint", async () => {
    const enrichmentDeps = makeDeps();
    await enrichGameBarcodeLookups({
      cleanedBarcode: "3307210117168",
      contextPlatformKey: "xbox",
      pc: null,
      searchLabel: "games",
      enrichmentDeps,
      inputs: makeInputs({
        amc: [{ name: "Tom Clancy's Ghost Recon - Big Box - PC" }],
        contextPlatformKey: "xbox",
      }),
    });

    expect(enrichmentDeps.fetchGameMediaByBarcode).toHaveBeenCalledWith(
      "Tom Clancy's Ghost Recon - Big Box - PC",
      "3307210117168",
      "pc",
    );
  });
});
