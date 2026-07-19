import { describe, expect, it } from "vitest";

import {
  findAttachmentForUrl,
  isCoverEligibleAttachmentType,
  isUrlEligibleDefaultCover,
} from "./coverUrl";

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
