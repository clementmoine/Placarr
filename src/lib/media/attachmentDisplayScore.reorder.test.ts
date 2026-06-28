import { describe, expect, it } from "vitest";

import { reorderAttachmentsCoverFirst } from "./attachmentDisplayScore";

describe("reorderAttachmentsCoverFirst", () => {
  it("places quality-ranked covers before other attachment kinds", () => {
    const attachments = [
      { type: "screenshot" as const, url: "/uploads/shot.jpg", source: "rawg" },
      {
        type: "cover" as const,
        url: "/uploads/low.jpg",
        source: "pricecharting",
        isRealBoxCoverSource: true,
        providerImageScoreAdjustment: 160,
      },
      {
        type: "cover" as const,
        url: "/uploads/high.jpg",
        source: "steamgriddb",
        isRealBoxCoverSource: true,
      },
    ];

    const metrics = new Map([
      [
        "/uploads/low.jpg",
        {
          width: 260,
          height: 366,
          shortestEdge: 260,
          isListingPhoto: false,
          meanLuminance: 120,
          darkPixelRatio: 0.1,
        },
      ],
      [
        "/uploads/high.jpg",
        {
          width: 920,
          height: 1200,
          shortestEdge: 920,
          isListingPhoto: false,
          meanLuminance: 140,
          darkPixelRatio: 0.05,
        },
      ],
    ]);

    expect(
      reorderAttachmentsCoverFirst(attachments, metrics).map(
        (attachment) => attachment.url,
      ),
    ).toEqual([
      "/uploads/high.jpg",
      "/uploads/low.jpg",
      "/uploads/shot.jpg",
    ]);
  });
});
