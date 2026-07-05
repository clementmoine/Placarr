import { describe, expect, it } from "vitest";

import {
  pickPriceChartingPrimaryCoverUrl,
  priceChartingAttachmentRole,
  priceChartingGalleryLabelIsRecognized,
  priceChartingImageKindFromLabel,
} from "./imageLabels";

describe("priceCharting imageLabels", () => {
  it("classifies gallery labels", () => {
    expect(priceChartingImageKindFromLabel("Main Image")).toBe("cover");
    expect(priceChartingImageKindFromLabel("Cover (Back) [GER]")).toBe("back");
    expect(priceChartingImageKindFromLabel("Spine/Sides")).toBe("spine");
    expect(priceChartingImageKindFromLabel("Disc")).toBe("disc");
    expect(priceChartingImageKindFromLabel("Foxigami")).toBeNull();
  });

  it("maps labels to attachment roles", () => {
    expect(priceChartingAttachmentRole("Spine/Sides", true)).toBe("spine-eu");
    expect(priceChartingAttachmentRole("Cover (Back) [GER]", true)).toBe(
      "back-eu",
    );
  });

  it("ignores community fan-art labels when picking a cover", () => {
    expect(priceChartingGalleryLabelIsRecognized("Foxigami")).toBe(false);
    expect(priceChartingGalleryLabelIsRecognized("Cart")).toBe(false);

    const images = [
      {
        url: "https://example.com/foxigami.jpg",
        label: "Foxigami",
      },
      {
        url: "https://example.com/main.jpg",
        label: "Main Image",
      },
    ];

    expect(pickPriceChartingPrimaryCoverUrl(images)).toBe(
      "https://example.com/main.jpg",
    );
  });

  it("prefers Main Image over back/spine covers", () => {
    const images = [
      {
        url: "https://example.com/back.jpg",
        label: "Cover (Back) [GER]",
      },
      {
        url: "https://example.com/main.jpg",
        label: "Main Image",
      },
      {
        url: "https://example.com/spine.jpg",
        label: "Spine/Sides",
      },
    ];

    expect(pickPriceChartingPrimaryCoverUrl(images)).toBe(
      "https://example.com/main.jpg",
    );
  });
});
