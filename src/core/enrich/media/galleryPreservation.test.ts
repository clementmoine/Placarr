import { describe, expect, it } from "vitest";
import type { Attachment, AttachmentType } from "@/generated/prisma/browser";

import { preserveGalleryAttachmentsOnRegression } from "./galleryPreservation";

function storedAttachment(
  type: AttachmentType,
  url: string,
  overrides: Partial<Attachment> = {},
): Attachment {
  return {
    id: `att-${url}`,
    metadataId: "meta-1",
    type,
    url,
    source: "screenscraper",
    title: null,
    duration: null,
    role: null,
    coverProvenance: null,
    platformKey: type === "cover" && url.includes("vita") ? "psvita" : null,
    width: null,
    height: null,
    meanLuminance: null,
    darkPixelRatio: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("preserveGalleryAttachmentsOnRegression", () => {
  it("revives local gallery attachments when a refresh collapses to a lone cover", () => {
    const previous = [
      storedAttachment("cover", "/uploads/vita-cover.jpg", {
        platformKey: "psvita",
      }),
      storedAttachment("screenshot", "/uploads/shot-1.jpg"),
      storedAttachment("screenshot", "/uploads/shot-2.jpg"),
      storedAttachment("logo", "/uploads/logo.jpg"),
    ];
    const next = [
      {
        type: "cover" as const,
        url: "/uploads/vita-cover.jpg",
        source: "screenscraper",
      },
    ];

    const preserved = preserveGalleryAttachmentsOnRegression(
      previous,
      next,
      "psvita",
    );

    expect(preserved.map((attachment) => attachment.url)).toEqual([
      "/uploads/vita-cover.jpg",
      "/uploads/shot-1.jpg",
      "/uploads/shot-2.jpg",
      "/uploads/logo.jpg",
    ]);
  });

  it("does not revive wrong-platform covers on a platform shelf", () => {
    const previous = [
      storedAttachment("cover", "/uploads/ps3-cover.jpg", {
        platformKey: "ps3",
      }),
      storedAttachment("screenshot", "/uploads/shot-1.jpg"),
    ];
    const next = [
      {
        type: "cover" as const,
        url: "/uploads/vita-cover.jpg",
        source: "screenscraper",
        platformKey: "psvita",
      },
    ];

    const preserved = preserveGalleryAttachmentsOnRegression(
      previous,
      next,
      "psvita",
    );

    expect(preserved.map((attachment) => attachment.url)).toEqual([
      "/uploads/vita-cover.jpg",
      "/uploads/shot-1.jpg",
    ]);
  });

  it("leaves a healthy refreshed gallery untouched", () => {
    const previous = [
      storedAttachment("cover", "/uploads/old-cover.jpg"),
      storedAttachment("screenshot", "/uploads/old-shot.jpg"),
    ];
    const next = [
      {
        type: "cover" as const,
        url: "/uploads/new-cover.jpg",
        source: "screenscraper",
      },
      {
        type: "screenshot" as const,
        url: "/uploads/new-shot.jpg",
        source: "screenscraper",
      },
    ];

    expect(
      preserveGalleryAttachmentsOnRegression(previous, next, "psvita"),
    ).toEqual(next);
  });

  it("always keeps source=user uploads even when the refresh gallery is healthy", () => {
    const previous = [
      storedAttachment("image", "/uploads/my-disc.jpg", { source: "user" }),
      storedAttachment("cover", "/uploads/old-grid.jpg", {
        source: "steamgriddb",
      }),
    ];
    const next = [
      {
        type: "cover" as const,
        url: "/uploads/grid-a.jpg",
        source: "steamgriddb",
      },
      {
        type: "cover" as const,
        url: "/uploads/grid-b.jpg",
        source: "steamgriddb",
      },
    ];

    expect(
      preserveGalleryAttachmentsOnRegression(previous, next).map(
        (attachment) => [attachment.source, attachment.url],
      ),
    ).toEqual([
      ["steamgriddb", "/uploads/grid-a.jpg"],
      ["steamgriddb", "/uploads/grid-b.jpg"],
      ["user", "/uploads/my-disc.jpg"],
    ]);
  });

  it("keeps PriceCharting covers when a marketplace-only refresh answers", () => {
    const previous = [
      storedAttachment(
        "cover",
        "https://storage.googleapis.com/images.pricecharting.com/ds-lite.jpg",
        { source: "pricecharting" },
      ),
    ];
    const next = [
      {
        type: "cover" as const,
        url: "https://d2e6ccujb3mkqf.cloudfront.net/bm.jpg",
        source: "backmarket",
      },
    ];

    expect(
      preserveGalleryAttachmentsOnRegression(previous, next).map(
        (attachment) => [attachment.source, attachment.url],
      ),
    ).toEqual([
      ["backmarket", "https://d2e6ccujb3mkqf.cloudfront.net/bm.jpg"],
      [
        "pricecharting",
        "https://storage.googleapis.com/images.pricecharting.com/ds-lite.jpg",
      ],
    ]);
  });
});
