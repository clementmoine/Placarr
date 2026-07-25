import { describe, expect, it } from "vitest";

import { createEmptyBarcodeLookupPayload } from "@/core/identify/lookup/payload";
import { pricechartingModule } from "@/providers/pricecharting";

describe("pricecharting hardware barcode sources", () => {
  it("routes PriceCharting hits to hardware when the shelf type is hardware", () => {
    const payload = createEmptyBarcodeLookupPayload();
    payload.pc = {
      title: "Playstation 3 System 60GB",
      platform: "Playstation 3",
      coverUrl: "https://example.com/ps3.jpg",
      barcode: "711719699651",
    };

    const sources = pricechartingModule.buildBarcodeSources?.(payload, {
      type: "hardware",
      isBook: false,
      cleanedBarcode: "711719699651",
    });

    expect(sources).toEqual([
      expect.objectContaining({
        mediaType: "hardware",
        label: "PriceCharting",
      }),
    ]);
    expect(sources?.[0]?.products[0]?.name).toBe("Playstation 3 System 60GB");
    expect(sources?.[0]?.products[0]?.coverUrl).toBe(
      "https://example.com/ps3.jpg",
    );
  });

  it("leads hardware Game & Watch SKUs with the device name", () => {
    const payload = createEmptyBarcodeLookupPayload();
    payload.pc = {
      title: "Super Mario Bros",
      platform: "Game & Watch",
      coverUrl: "https://example.com/gw.jpg",
      barcode: "045496883041",
    };

    const sources = pricechartingModule.buildBarcodeSources?.(payload, {
      type: "hardware",
      isBook: false,
      cleanedBarcode: "045496883041",
    });

    expect(sources?.[0]?.products[0]).toEqual(
      expect.objectContaining({
        name: "Game & Watch Super Mario Bros",
        platformKey: "gameandwatch",
      }),
    );
  });

  it("keeps games routing when the shelf type is games", () => {
    const payload = createEmptyBarcodeLookupPayload();
    payload.pc = {
      title: "Mario Kart Wii",
      platform: "Wii",
      coverUrl: "https://example.com/mkw.jpg",
      barcode: "0045496365226",
    };

    const sources = pricechartingModule.buildBarcodeSources?.(payload, {
      type: "games",
      isBook: false,
      cleanedBarcode: "0045496365226",
    });

    expect(sources?.[0]?.mediaType).toBe("games");
  });
});
