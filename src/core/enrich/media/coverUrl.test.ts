import { describe, expect, it } from "vitest";

import {
  editDerivativeBaseName,
  DEFAULT_EDIT_ROLE,
  findAttachmentForUrl,
  isCoverEligibleAttachmentType,
  isEditDerivativeUrl,
  isUrlEligibleDefaultCover,
  stripEditSuffixFromUrl,
  urlsReferToSameLocalizedImage,
} from "./coverUrl";

describe("stripEditSuffixFromUrl", () => {
  it("finds the original a crop was derived from", () => {
    expect(stripEditSuffixFromUrl("/uploads/abc_edited.jpg")).toBe(
      "/uploads/abc.jpg",
    );
  });

  it("drops the cache-busting query the gallery adds after a re-crop", () => {
    // Regression: a crop rewrites the same filename, so the thumbnail URL
    // carries `?v=`. The suffix regex is anchored at the end, so leaving the
    // query on resolved to a file named `abc_edited.jpg?v=1` — every second crop
    // of the same image answered 404.
    expect(stripEditSuffixFromUrl("/uploads/abc_edited.jpg?v=1")).toBe(
      "/uploads/abc.jpg",
    );
    expect(stripEditSuffixFromUrl("/uploads/abc_edited.jpg#frag")).toBe(
      "/uploads/abc.jpg",
    );
  });

  it("leaves an uncropped url alone, query included", () => {
    expect(stripEditSuffixFromUrl("/uploads/abc.jpg")).toBe("/uploads/abc.jpg");
    expect(stripEditSuffixFromUrl("/uploads/abc.jpg?v=2")).toBe(
      "/uploads/abc.jpg",
    );
  });

  it("strips the role marker so a background crop maps to the same source", () => {
    // Regression: the cover and the background can be the same artwork. Named on
    // the file alone, cropping one rewrote the other's image. The marker goes
    // after `_edited` because a source name may itself end in `-something`.
    expect(stripEditSuffixFromUrl("/uploads/abc_edited-background.jpg")).toBe(
      "/uploads/abc.jpg",
    );
    expect(
      stripEditSuffixFromUrl("/uploads/abc_edited-background.jpg?v=2"),
    ).toBe("/uploads/abc.jpg");
  });

  it("keeps a cover crop and a background crop as one image", () => {
    expect(
      urlsReferToSameLocalizedImage(
        "/uploads/abc_edited.jpg",
        "/uploads/abc_edited-background.jpg",
      ),
    ).toBe(true);
  });

  it("keeps a WebP crop and its non-WebP source as one image", () => {
    // Derivatives are always written as WebP, whatever the source arrived as.
    // Comparing the full name put the crop in the gallery as a second,
    // unlabelled tile beside the original it had just re-framed.
    expect(
      urlsReferToSameLocalizedImage(
        "/uploads/abc_edited.webp",
        "/uploads/abc.png",
      ),
    ).toBe(true);
    expect(
      urlsReferToSameLocalizedImage("/uploads/abc.webp", "/uploads/abc.png"),
    ).toBe(true);
  });

  it("still separates different uploads", () => {
    expect(
      urlsReferToSameLocalizedImage("/uploads/abc.png", "/uploads/abd.png"),
    ).toBe(false);
    expect(
      urlsReferToSameLocalizedImage(
        "/uploads/cover-a_edited.webp",
        "/uploads/cover-b.png",
      ),
    ).toBe(false);
  });

  it("leaves remote urls extension-sensitive", () => {
    // Two files on a provider CDN that differ only by extension are not ours
    // to declare identical — only what this app writes is.
    expect(
      urlsReferToSameLocalizedImage(
        "https://cdn.example/img/foo.png",
        "https://cdn.example/img/foo.jpg",
      ),
    ).toBe(false);
  });

  it("leaves a source name that itself ends in a dash segment alone", () => {
    // The trap that caught the first attempt: with the marker placed *before*
    // `_edited`, this stripped to `/uploads/cover.jpg` and two different provider
    // covers collapsed onto one row.
    expect(stripEditSuffixFromUrl("/uploads/cover-a_edited.jpg")).toBe(
      "/uploads/cover-a.jpg",
    );
    expect(stripEditSuffixFromUrl("/uploads/cover-b_edited.jpg")).toBe(
      "/uploads/cover-b.jpg",
    );
  });

  it("does not mistake a name merely containing crop for a derivative", () => {
    expect(stripEditSuffixFromUrl("/uploads/cropped.jpg")).toBe(
      "/uploads/cropped.jpg",
    );
  });
});

describe("isEditDerivativeUrl", () => {
  it("recognizes a crop whatever role it was cropped for", () => {
    expect(isEditDerivativeUrl("/uploads/abc_edited.jpg")).toBe(true);
    // The background derivative is the one the bare `_edited` test missed, so
    // its thumbnail kept showing the previous framing after a re-crop.
    expect(isEditDerivativeUrl("/uploads/abc_edited-background.jpg")).toBe(
      true,
    );
    expect(isEditDerivativeUrl("/uploads/abc_edited-background.jpg?v=3")).toBe(
      true,
    );
  });

  it("leaves originals alone, including names that merely mention cropping", () => {
    expect(isEditDerivativeUrl("/uploads/abc.jpg")).toBe(false);
    expect(isEditDerivativeUrl("/uploads/cropped.jpg")).toBe(false);
    expect(isEditDerivativeUrl("/uploads/cover-background.jpg")).toBe(false);
  });
});

describe("editDerivativeBaseName", () => {
  it("leaves the default role unmarked so files written before scoping stay valid", () => {
    expect(editDerivativeBaseName("abc", DEFAULT_EDIT_ROLE)).toBe("abc_edited");
  });

  it("marks any other role so two uses of one image do not share a file", () => {
    expect(editDerivativeBaseName("abc", "background")).toBe(
      "abc_edited-background",
    );
  });

  it("round-trips: stripping a derived name gives the source back", () => {
    // The invariant the whole scheme rests on — without it the app cannot find
    // the original a crop came from, and re-cropping degrades the image.
    for (const role of [DEFAULT_EDIT_ROLE, "background", "hero"]) {
      const derived = editDerivativeBaseName("abc", role);
      expect(stripEditSuffixFromUrl(`/uploads/${derived}.jpg`)).toBe(
        "/uploads/abc.jpg",
      );
    }
  });

  it("ignores a role it could not take back off a filename", () => {
    expect(editDerivativeBaseName("abc", "back-ground")).toBe("abc_edited");
    expect(editDerivativeBaseName("abc", "bg2")).toBe("abc_edited");
    expect(editDerivativeBaseName("abc", "")).toBe("abc_edited");
  });
});

describe("urlsReferToSameLocalizedImage", () => {
  it("matches a crop, its original, and its cache-busted twin", () => {
    expect(
      urlsReferToSameLocalizedImage("/uploads/a_edited.jpg", "/uploads/a.jpg"),
    ).toBe(true);
    expect(
      urlsReferToSameLocalizedImage(
        "/uploads/a_edited.jpg?v=3",
        "/uploads/a_edited.jpg",
      ),
    ).toBe(true);
  });

  it("keeps different images apart", () => {
    expect(
      urlsReferToSameLocalizedImage("/uploads/a_edited.jpg", "/uploads/b.jpg"),
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
