import { describe, expect, it } from "vitest";

import {
  hasGameMediaGalleryAttachment,
  hasMusicGalleryAttachment,
  isMissingGameMediaGallery,
  isMissingMusicGallery,
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
});

describe("hasMusicGalleryAttachment", () => {
  it("returns true when a stamped music-gallery attachment is present", () => {
    expect(
      hasMusicGalleryAttachment([{ type: "cover", isMusicGallerySource: true }]),
    ).toBe(true);
  });

  it("returns false without the stamped flag", () => {
    expect(
      hasMusicGalleryAttachment([{ type: "cover", isMusicGallerySource: false }]),
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

  it("ignores non-music types and items without a barcode", () => {
    expect(
      isMissingMusicGallery("games", "4988601467124", [
        { type: "cover", isMusicGallerySource: false },
      ]),
    ).toBe(false);
    expect(
      isMissingMusicGallery("musics", null, [
        { type: "cover", isMusicGallerySource: false },
      ]),
    ).toBe(false);
  });
});
