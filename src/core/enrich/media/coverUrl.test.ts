import { describe, expect, it } from "vitest";

import {
  cropDerivativeBaseName,
  DEFAULT_CROP_ROLE,
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

  it("strips the role marker so a background crop maps to the same source", () => {
    // Regression: the cover and the background can be the same artwork. Named on
    // the file alone, cropping one rewrote the other's image. The marker goes
    // after `_crop` because a source name may itself end in `-something`.
    expect(stripCropSuffixFromUrl("/uploads/abc_crop-background.jpg")).toBe(
      "/uploads/abc.jpg",
    );
    expect(stripCropSuffixFromUrl("/uploads/abc_crop-background.jpg?v=2")).toBe(
      "/uploads/abc.jpg",
    );
  });

  it("keeps a cover crop and a background crop as one image", () => {
    expect(
      urlsReferToSameLocalizedImage(
        "/uploads/abc_crop.jpg",
        "/uploads/abc_crop-background.jpg",
      ),
    ).toBe(true);
  });

  it("leaves a source name that itself ends in a dash segment alone", () => {
    // The trap that caught the first attempt: with the marker placed *before*
    // `_crop`, this stripped to `/uploads/cover.jpg` and two different provider
    // covers collapsed onto one row.
    expect(stripCropSuffixFromUrl("/uploads/cover-a_crop.jpg")).toBe(
      "/uploads/cover-a.jpg",
    );
    expect(stripCropSuffixFromUrl("/uploads/cover-b_crop.jpg")).toBe(
      "/uploads/cover-b.jpg",
    );
  });

  it("does not mistake a name merely containing crop for a derivative", () => {
    expect(stripCropSuffixFromUrl("/uploads/cropped.jpg")).toBe(
      "/uploads/cropped.jpg",
    );
  });
});

describe("cropDerivativeBaseName", () => {
  it("leaves the default role unmarked so files written before scoping stay valid", () => {
    expect(cropDerivativeBaseName("abc", DEFAULT_CROP_ROLE)).toBe("abc_crop");
  });

  it("marks any other role so two uses of one image do not share a file", () => {
    expect(cropDerivativeBaseName("abc", "background")).toBe(
      "abc_crop-background",
    );
  });

  it("round-trips: stripping a derived name gives the source back", () => {
    // The invariant the whole scheme rests on — without it the app cannot find
    // the original a crop came from, and re-cropping degrades the image.
    for (const role of [DEFAULT_CROP_ROLE, "background", "hero"]) {
      const derived = cropDerivativeBaseName("abc", role);
      expect(stripCropSuffixFromUrl(`/uploads/${derived}.jpg`)).toBe(
        "/uploads/abc.jpg",
      );
    }
  });

  it("ignores a role it could not take back off a filename", () => {
    expect(cropDerivativeBaseName("abc", "back-ground")).toBe("abc_crop");
    expect(cropDerivativeBaseName("abc", "bg2")).toBe("abc_crop");
    expect(cropDerivativeBaseName("abc", "")).toBe("abc_crop");
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
