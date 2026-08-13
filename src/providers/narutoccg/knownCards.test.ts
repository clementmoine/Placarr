import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  collectPhotoFallbackArt,
  isCollectorPhotoFallbackFace,
  isUnpublishedHtmlRef,
  PHYSICAL_KNOWN_SOURCES,
  type KnownSource,
} from "./knownCards";

describe("isUnpublishedHtmlRef", () => {
  it("flags lone carddass-html as unpublished (ta090-class)", () => {
    expect(isUnpublishedHtmlRef(["carddass-html"])).toBe(true);
  });

  it("does not flag empty or multi-source rows", () => {
    expect(isUnpublishedHtmlRef([])).toBe(false);
    expect(
      isUnpublishedHtmlRef(["carddass-html", "carddass-fr-checklist"]),
    ).toBe(false);
    expect(isUnpublishedHtmlRef(["manga-news"])).toBe(false);
  });

  it("physical sources alone are not unpublished-html", () => {
    for (const source of PHYSICAL_KNOWN_SOURCES) {
      expect(isUnpublishedHtmlRef([source as KnownSource])).toBe(false);
    }
  });
});

describe("collector photo fallback", () => {
  it("flags plain oversized art, not corrected/reconstructed", () => {
    expect(
      isCollectorPhotoFallbackFace({
        preferredArtFile: "art.jpg",
        bytes: 700_000,
      }),
    ).toBe(true);
    expect(
      isCollectorPhotoFallbackFace({
        preferredArtFile: "art.corrected.jpg",
        bytes: 700_000,
      }),
    ).toBe(false);
    expect(
      isCollectorPhotoFallbackFace({
        preferredArtFile: "art.reconstructed.webp",
        bytes: 700_000,
      }),
    ).toBe(false);
    expect(
      isCollectorPhotoFallbackFace({
        preferredArtFile: "art.jpg",
        bytes: 60_000,
      }),
    ).toBe(false);
  });

  it("skips dirs that prefer corrected even if art.jpg is huge", () => {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-photo-fb-"));
    const card = path.join(root, "s4", "fr", "ni165");
    mkdirSync(card, { recursive: true });
    writeFileSync(path.join(card, "art.jpg"), Buffer.alloc(400_000));
    writeFileSync(path.join(card, "art.corrected.jpg"), Buffer.alloc(80_000));
    const gap = path.join(root, "s4", "fr", "ni194");
    mkdirSync(gap, { recursive: true });
    writeFileSync(path.join(gap, "art.jpg"), Buffer.alloc(400_000));
    const rows = collectPhotoFallbackArt(root);
    expect(rows.map((r) => r.printKey)).toEqual(["naruto:s4-ni194"]);
    expect(rows[0]?.priority).toBe("high");
  });
});
