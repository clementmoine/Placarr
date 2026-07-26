import { describe, expect, it } from "vitest";

import {
  findAttachmentForUrl,
  isCoverEligibleAttachmentType,
  isUrlEligibleDefaultCover,
  stripCropSuffixFromUrl,
  urlsReferToSameLocalizedImage,
} from "./coverUrl";

describe("stripCropSuffixFromUrl", () => {
  it("finds the original a crop was derived from", () => {
    expect(stripCropSuffixFromUrl("/uploads/abc_crop.jpg")).toBe(
      "/uploads/abc.jpg",
    );
  });

  it("drops the cache-busting query the gallery adds after a re-crop", () => {
    // Regression: a crop rewrites the same filename, so the thumbnail URL
    // carries `?v=`. The suffix regex is anchored at the end, so leaving the
    // query on resolved to a file named `abc_crop.jpg?v=1` — every second crop
    // of the same image answered 404.
    expect(stripCropSuffixFromUrl("/uploads/abc_crop.jpg?v=1")).toBe(
      "/uploads/abc.jpg",
    );
    expect(stripCropSuffixFromUrl("/uploads/abc_crop.jpg#frag")).toBe(
      "/uploads/abc.jpg",
    );
  });

  it("leaves an uncropped url alone, query included", () => {
    expect(stripCropSuffixFromUrl("/uploads/abc.jpg")).toBe("/uploads/abc.jpg");
    expect(stripCropSuffixFromUrl("/uploads/abc.jpg?v=2")).toBe(
      "/uploads/abc.jpg",
    );
  });

  it("does not mistake a name merely containing crop for a derivative", () => {
    expect(stripCropSuffixFromUrl("/uploads/cropped.jpg")).toBe(
      "/uploads/cropped.jpg",
    );
  });
});

describe("urlsReferToSameLocalizedImage", () => {
  it("matches a crop, its original, and its cache-busted twin", () => {
    expect(
      urlsReferToSameLocalizedImage("/uploads/a_crop.jpg", "/uploads/a.jpg"),
    ).toBe(true);
    expect(
      urlsReferToSameLocalizedImage(
        "/uploads/a_crop.jpg?v=3",
        "/uploads/a_crop.jpg",
      ),
    ).toBe(true);
  });

  it("keeps different images apart", () => {
    expect(
      urlsReferToSameLocalizedImage("/uploads/a_crop.jpg", "/uploads/b.jpg"),
    ).toBe(false);
  });
});

describe("coverUrl eligibility", () => {
  it("accepts cover-like attachment types for the default cover", () => {
    expect(isCoverEligibleAttachmentType("cover")).toBe(true);
    expect(isCoverEligibleAttachmentType("artwork")).toBe(true);
    expect(isCoverEligibleAttachmentType("background")).toBe(false);
    expect(isCoverEligibleAttachmentType("logo")).toBe(false);
  });

  it("rejects backgrounds and logos as default cover URLs", () => {
    const attachments = [
      {
        type: "background",
        url: "/uploads/banner.jpg",
      },
      {
        type: "logo",
        url: "/uploads/logo.jpg",
      },
    ];
    expect(isUrlEligibleDefaultCover("/uploads/banner.jpg", attachments)).toBe(
      false,
    );
    expect(isUrlEligibleDefaultCover("/uploads/logo.jpg", attachments)).toBe(
      false,
    );
    expect(isUrlEligibleDefaultCover("/uploads/unknown.jpg", attachments)).toBe(
      true,
    );
  });
});

describe("findAttachmentForUrl", () => {
  it("prefers catalog provenance over a synthetic user honor pin", () => {
    const match = findAttachmentForUrl(
      [
        { type: "image", source: "user", url: "/uploads/cover.png" },
        {
          type: "cover",
          source: "screenscraper",
          url: "/uploads/cover.png",
          providerLabel: "ScreenScraper",
        },
      ],
      "/uploads/cover.png",
    );
    expect(match?.source).toBe("screenscraper");
  });
});
