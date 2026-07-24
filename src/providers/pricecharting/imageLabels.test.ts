import { describe, expect, it } from "vitest";

import {
  pickPriceChartingPrimaryCoverUrl,
  priceChartingAttachmentRole,
  priceChartingAttachmentType,
  priceChartingGalleryLabelIsRecognized,
  priceChartingImageKindFromLabel,
} from "./imageLabels";

describe("priceCharting imageLabels", () => {
  it("classifies gallery labels", () => {
    expect(priceChartingImageKindFromLabel("Main Image")).toBe("cover");
    expect(priceChartingImageKindFromLabel("Box View")).toBe("cover");
    expect(priceChartingImageKindFromLabel("Box Front Art")).toBe("cover");
    expect(priceChartingImageKindFromLabel("Box Art")).toBe("cover");
    expect(priceChartingImageKindFromLabel("Cover (Back) [GER]")).toBe("back");
    expect(priceChartingImageKindFromLabel("Box Back Art")).toBe("back");
    expect(priceChartingImageKindFromLabel("Back")).toBe("back");
    expect(priceChartingImageKindFromLabel("Backside Console")).toBe("back");
    expect(priceChartingImageKindFromLabel("Spine/Sides")).toBe("spine");
    expect(priceChartingImageKindFromLabel("Disc")).toBe("disc");
    expect(priceChartingImageKindFromLabel("Console")).toBe("product");
    expect(priceChartingImageKindFromLabel("Dock And Console")).toBe("product");
    expect(priceChartingImageKindFromLabel("System Only")).toBe("product");
    expect(priceChartingImageKindFromLabel("Loose")).toBe("product");
    expect(priceChartingImageKindFromLabel("Cart")).toBe("product");
    expect(priceChartingImageKindFromLabel("Foxigami")).toBeNull();
  });

  it("maps labels to attachment roles and types", () => {
    expect(priceChartingAttachmentRole("Spine/Sides", true)).toBe("spine-eu");
    expect(priceChartingAttachmentRole("Cover (Back) [GER]", true)).toBe(
      "back-eu",
    );
    expect(priceChartingAttachmentRole("Back", true)).toBe("back-eu");
    expect(priceChartingAttachmentRole("Box View", false)).toBe("us");
    expect(priceChartingAttachmentRole("Console", true)).toBe("eu");
    expect(priceChartingAttachmentType("Console")).toBe("image");
    expect(priceChartingAttachmentType("Box View")).toBe("cover");
    expect(priceChartingAttachmentType("Foxigami")).toBe("image");
    expect(priceChartingAttachmentType("Forza Motorsport Bundle")).toBe(
      "image",
    );
  });

  it("ignores community fan-art labels when picking a cover", () => {
    expect(priceChartingGalleryLabelIsRecognized("Foxigami")).toBe(false);
    expect(priceChartingGalleryLabelIsRecognized("Box View")).toBe(true);
    expect(priceChartingGalleryLabelIsRecognized("Cart")).toBe(true);

    const images = [
      {
        url: "https://example.com/foxigami.jpg",
        label: "Foxigami",
      },
      {
        url: "https://example.com/main.jpg",
        label: "Main Image",
      },
      {
        url: "https://example.com/box.jpg",
        label: "Box View",
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
