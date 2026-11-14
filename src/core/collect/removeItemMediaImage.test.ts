import { describe, expect, it } from "vitest";

import {
  filterAttachmentsRemovingUrl,
  mediaUrlMatchesTarget,
  nextCoverUrlAfterRemoval,
} from "./removeItemMediaImage.shared";
import type { Attachment } from "@/generated/prisma/browser";

function attachment(
  partial: Partial<Attachment> & { url: string; type: Attachment["type"] },
): Attachment {
  return {
    id: partial.id ?? "a1",
    type: partial.type,
    title: null,
    duration: null,
    url: partial.url,
    metadataId: "m1",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    role: partial.role ?? null,
    source: partial.source ?? null,
    coverProvenance: null,
    platformKey: null,
    width: null,
    height: null,
    meanLuminance: null,
    darkPixelRatio: null,
  };
}

describe("mediaUrlMatchesTarget", () => {
  it("matches identical URLs and crop twins", () => {
    expect(
      mediaUrlMatchesTarget("/uploads/a.webp", "/uploads/a.webp"),
    ).toBe(true);
    expect(
      mediaUrlMatchesTarget(
        "/uploads/a_edited.webp",
        "/uploads/a.webp",
      ),
    ).toBe(true);
    expect(
      mediaUrlMatchesTarget("/uploads/a.webp", "/uploads/b.webp"),
    ).toBe(false);
  });
});

describe("filterAttachmentsRemovingUrl", () => {
  it("drops matching rows including crop twins", () => {
    const kept = filterAttachmentsRemovingUrl(
      [
        { url: "/uploads/keep.webp" },
        { url: "/uploads/gone.webp" },
        { url: "/uploads/gone_edited.webp" },
      ],
      "/uploads/gone.webp",
    );
    expect(kept.map((row) => row.url)).toEqual(["/uploads/keep.webp"]);
  });
});

describe("nextCoverUrlAfterRemoval", () => {
  it("returns null when no cover-like attachments remain", () => {
    expect(
      nextCoverUrlAfterRemoval([
        attachment({
          url: "/uploads/shot.webp",
          type: "screenshot",
        }),
      ]),
    ).toBeNull();
  });

  it("picks a remaining cover", () => {
    const next = nextCoverUrlAfterRemoval([
      attachment({
        id: "face",
        url: "/assets/naruto/mythos/prints/ks1promo-0133-vv2-fr/face",
        type: "cover",
        source: "narutomythos",
        coverProvenance: "catalog",
      }),
      attachment({
        id: "proof",
        url: "/assets/naruto/mythos/cards/fr/ks1promo/0133-vv2/proof.english.twitter.webp",
        type: "cover",
        source: "narutomythos",
      }),
    ]);
    expect(next).toBeTruthy();
  });
});
