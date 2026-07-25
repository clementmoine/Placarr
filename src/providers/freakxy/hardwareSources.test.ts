import { describe, expect, it } from "vitest";

import { createEmptyBarcodeLookupPayload } from "@/core/identify/lookup/payload";
import { barcodeLookupSlotDefaults } from "@/core/catalog/barcodeLookupSlots";
import { freakxyModule } from "@/providers/freakxy";

describe("freakxy hardware barcode sources", () => {
  it("routes Freakxy hits to hardware when the shelf type is hardware", () => {
    const payload = createEmptyBarcodeLookupPayload(
      barcodeLookupSlotDefaults(),
    );
    payload.freakxy = [
      {
        name: "Manette DualSense Midnight Black",
        coverUrl: "https://example.com/dualsense.jpg",
      },
    ];

    const hardware = freakxyModule.buildBarcodeSources?.(payload, {
      type: "hardware",
      isBook: false,
      cleanedBarcode: "711719541226",
    });
    expect(hardware?.some((entry) => entry.mediaType === "hardware")).toBe(
      true,
    );

    const games = freakxyModule.buildBarcodeSources?.(payload, {
      type: "games",
      isBook: false,
      cleanedBarcode: "711719541226",
    });
    expect(games).toEqual([
      expect.objectContaining({
        mediaType: "games",
        label: "Freakxy",
      }),
    ]);

    // No hardware fan-out when type is unknown — DualSense must not
    // compete with cartridges during auto type-pick.
    const unknown = freakxyModule.buildBarcodeSources?.(payload, {
      type: null,
      isBook: false,
      cleanedBarcode: "711719541226",
    });
    expect(unknown?.some((entry) => entry.mediaType === "hardware")).toBe(
      false,
    );
  });
});
