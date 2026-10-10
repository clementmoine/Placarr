import { describe, expect, it } from "vitest";

import {
  hasDetailMetadataAttachments,
  hasGameMediaGalleryAttachment,
  hasMusicGalleryAttachment,
  isMissingGameMediaGallery,
  isMissingMusicGallery,
  isMissingBookGallery,
} from "./galleries";

describe("metadataGameGallery", () => {
  it("detects stamped game media gallery attachments", () => {
    expect(
      hasGameMediaGalleryAttachment([
        { type: "screenshot", isGameMediaGallerySource: true },
      ]),
    ).toBe(true);
  });

  it("flags games with only a lone cover for refresh", () => {
    expect(
      isMissingGameMediaGallery("games", "0045496420355", [
        { type: "cover", isGameMediaGallerySource: false },
      ]),
    ).toBe(true);
    expect(
      isMissingGameMediaGallery("games", "0045496420355", [
        { type: "screenshot", isGameMediaGallerySource: true },
      ]),
    ).toBe(false);
  });

  it("flags barcode-less games with an empty gallery for refresh", () => {
    expect(isMissingGameMediaGallery("games", null, [])).toBe(true);
    expect(
      isMissingGameMediaGallery("games", "", [
        { type: "screenshot", isGameMediaGallerySource: true },
      ]),
    ).toBe(false);
  });
});

describe("hasMusicGalleryAttachment", () => {
  it("returns true when a stamped music-gallery attachment is present", () => {
    expect(
      hasMusicGalleryAttachment([
        { type: "cover", isMusicGallerySource: true },
      ]),
    ).toBe(true);
  });

  it("returns false without the stamped flag", () => {
    expect(
      hasMusicGalleryAttachment([
        { type: "cover", isMusicGallerySource: false },
      ]),
    ).toBe(false);
  });
});

describe("isMissingMusicGallery", () => {
  it("returns false when a stamped music-gallery attachment is present", () => {
    expect(
      isMissingMusicGallery("musics", "4988601467124", [
        { type: "cover", isMusicGallerySource: true },
      ]),
    ).toBe(false);
  });

  it("returns true when only a single non-gallery cover exists", () => {
    expect(
      isMissingMusicGallery("musics", "4988601467124", [
        { type: "cover", isMusicGallerySource: false },
      ]),
    ).toBe(true);
  });

  it("ignores non-music types", () => {
    expect(
      isMissingMusicGallery("games", "4988601467124", [
        { type: "cover", isMusicGallerySource: false },
      ]),
    ).toBe(false);
  });

  it("flags barcode-less music items with a sparse gallery for refresh", () => {
    expect(
      isMissingMusicGallery("musics", null, [
        { type: "cover", isMusicGallerySource: false },
      ]),
    ).toBe(true);
  });
});

describe("hasDetailMetadataAttachments", () => {
  it("detects shelf snapshots that omit attachment galleries", () => {
    const shelfSnapshot: { attachments?: unknown; facts?: unknown } = {
      facts: [],
    };
    expect(hasDetailMetadataAttachments(shelfSnapshot)).toBe(false);
    expect(hasDetailMetadataAttachments({ attachments: [] })).toBe(true);
    expect(
      hasDetailMetadataAttachments({ attachments: [{ type: "cover" }] }),
    ).toBe(true);
  });
});

describe("isMissingBookGallery", () => {
  it("returns false when a stamped retailer gallery attachment is present", () => {
    expect(
      isMissingBookGallery("books", "9791035505677", [
        { type: "screenshot", isGameMediaGallerySource: true },
      ]),
    ).toBe(false);
    expect(
      isMissingBookGallery("books", "9791035505677", [
        { type: "image", isBookGallerySource: true },
      ]),
    ).toBe(false);
  });

  it("returns true when only catalog covers exist", () => {
    expect(
      isMissingBookGallery("books", "9791035505677", [
        { type: "cover", isBookGallerySource: false },
        { type: "cover", isGameMediaGallerySource: false },
      ]),
    ).toBe(true);
  });

  it("treats stamped bedetheque/booknode gallery attachments as sufficient", () => {
    expect(
      isMissingBookGallery("books", "9791035505677", [
        { type: "cover", source: "bedetheque", isBookGallerySource: true },
        { type: "image", source: "booknode", isBookGallerySource: true },
      ]),
    ).toBe(false);
  });

  it("ignores non-book types", () => {
    expect(
      isMissingBookGallery("games", "9791035505677", [
        { type: "cover", isBookGallerySource: false },
      ]),
    ).toBe(false);
  });
});
