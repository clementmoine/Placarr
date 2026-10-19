import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  matchNarutoPrintsAssetRest,
  resolveNarutoPrintFace,
} from "./printFaceResolve";

function seedFace(
  cards: string,
  lang: string,
  set: string,
  card: string,
  file = "art.carddass.jpg",
): void {
  const dir = path.join(cards, lang, set, card);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, file), `bytes-${card}`);
  writeFileSync(
    path.join(dir, "face.json"),
    JSON.stringify({ art: file }),
  );
}

describe("matchNarutoPrintsAssetRest", () => {
  it("parses prints/{set}-{id}-{lang}/role (shelf stem)", () => {
    expect(
      matchNarutoPrintsAssetRest(["prints", "s1-cl0001-fr", "thumb"]),
    ).toEqual({
      printKey: "naruto:s1-cl0001",
      lang: "fr",
      role: "thumb",
    });
    expect(
      matchNarutoPrintsAssetRest(["prints", "s5-ni0229-fr", "face"]),
    ).toEqual({
      printKey: "naruto:s5-ni0229",
      lang: "fr",
      role: "face",
    });
  });

  it("reverses grouping-first stems (cdf / prerelease) onto set-scoped keys", () => {
    expect(
      matchNarutoPrintsAssetRest(["prints", "cdf-te0030-fr", "thumb"]),
    ).toEqual({
      printKey: "naruto:promo-te0030-cdf",
      lang: "fr",
      role: "thumb",
    });
    expect(
      matchNarutoPrintsAssetRest([
        "prints",
        "prerelease-ni0019-fr",
        "face",
      ]),
    ).toEqual({
      printKey: "naruto:s1-ni0019-prerelease",
      lang: "fr",
      role: "face",
    });
    expect(
      matchNarutoPrintsAssetRest(["prints", "promo-ni0023-fr", "face"]),
    ).toEqual({
      printKey: "naruto:promo-ni0023",
      lang: "fr",
      role: "face",
    });
  });

  it("still accepts legacy path shapes", () => {
    expect(
      matchNarutoPrintsAssetRest(["prints", "fr", "s5", "ni0229", "thumb"]),
    ).toEqual({
      printKey: "naruto:s5-ni0229",
      lang: "fr",
      role: "thumb",
    });
    expect(
      matchNarutoPrintsAssetRest([
        "prints",
        encodeURIComponent("naruto:s1-ni0019-prerelease"),
        "fr",
        "face",
      ]),
    ).toEqual({
      printKey: "naruto:s1-ni0019-prerelease",
      lang: "fr",
      role: "face",
    });
  });

  it("rejects paths that smuggle a foreign game prefix", () => {
    expect(
      matchNarutoPrintsAssetRest([
        "prints",
        "fr",
        "sv1",
        "pokemon:001",
        "face",
      ]),
    ).toBeNull();
    expect(
      matchNarutoPrintsAssetRest(["prints", "pokemon:sv1-001", "fr", "face"]),
    ).toBeNull();
  });
});

describe("resolveNarutoPrintFace", () => {
  it("marks owned when bytes live under the print folder", () => {
    const root = mkdtempSync(path.join(tmpdir(), "print-face-own-"));
    const cards = path.join(root, "cards");
    seedFace(cards, "fr", "s1", "ni0019-prerelease");
    const hit = resolveNarutoPrintFace({
      printKey: "naruto:s1-ni0019-prerelease",
      lang: "fr",
      cardsRoot: cards,
    });
    expect(hit?.source).toBe("owned");
    expect(hit?.donorPrintKey).toBeUndefined();
    expect(hit?.disk).toEqual({
      lang: "fr",
      set: "s1",
      card: "ni0019-prerelease",
    });
    expect(existsSync(hit!.filePath)).toBe(true);
  });

  it("marks borrowed when only the retail sibling has art", () => {
    const root = mkdtempSync(path.join(tmpdir(), "print-face-borrow-"));
    const cards = path.join(root, "cards");
    seedFace(cards, "fr", "s1", "ni0019");
    const hit = resolveNarutoPrintFace({
      printKey: "naruto:s1-ni0019-prerelease",
      lang: "fr",
      cardsRoot: cards,
    });
    expect(hit?.source).toBe("borrowed");
    expect(hit?.donorPrintKey).toMatch(/s1-ni0*19/);
    expect(hit?.disk.card).toBe("ni0019");
  });

  it("does not invent FR art for JA-only tourney promos off the checklist", () => {
    const root = mkdtempSync(path.join(tmpdir(), "print-face-ja-only-"));
    const cards = path.join(root, "cards");
    seedFace(cards, "fr", "s3", "te0107");
    seedFace(cards, "ja", "promo", "te0107-promo", "art.ebay.webp");
    expect(
      resolveNarutoPrintFace({
        printKey: "naruto:promo-te0107",
        lang: "fr",
        cardsRoot: cards,
      }),
    ).toBeNull();
    expect(
      resolveNarutoPrintFace({
        printKey: "naruto:promo-te0107",
        lang: "ja",
        cardsRoot: cards,
      })?.source,
    ).toBe("owned");
  });

  it("巻ノ (maki) borrows JA retail sN when the volume folder has no face", () => {
    const root = mkdtempSync(path.join(tmpdir(), "print-face-maki-"));
    const cards = path.join(root, "cards");
    seedFace(cards, "ja", "s1", "ta0090", "art.suruga.jpg");
    const hit = resolveNarutoPrintFace({
      printKey: "naruto:maki5-ta0090",
      lang: "ja",
      cardsRoot: cards,
    });
    expect(hit?.source).toBe("borrowed");
    expect(hit?.disk).toEqual({ lang: "ja", set: "s1", card: "ta0090" });
    expect(hit?.donorPrintKey).toMatch(/s1-ta0*90/);
  });

  it("S6 FR borrows S5 until its own folder exists, then marks owned", () => {
    const root = mkdtempSync(path.join(tmpdir(), "print-face-s6-"));
    const cards = path.join(root, "cards");
    seedFace(cards, "fr", "s5", "ni0206");
    const borrowed = resolveNarutoPrintFace({
      printKey: "naruto:s6-ni0206",
      lang: "fr",
      cardsRoot: cards,
    });
    expect(borrowed?.source).toBe("borrowed");
    expect(borrowed?.donorPrintKey).toMatch(/s5-ni0*206/);
    expect(borrowed?.disk).toEqual({ lang: "fr", set: "s5", card: "ni0206" });

    seedFace(cards, "fr", "s6", "ni0206", "art.carddass.jpg");
    const owned = resolveNarutoPrintFace({
      printKey: "naruto:s6-ni0206",
      lang: "fr",
      cardsRoot: cards,
    });
    expect(owned?.source).toBe("owned");
    expect(owned?.donorPrintKey).toBeUndefined();
    expect(owned?.disk.set).toBe("s6");
  });

  it("EN CCG reprint membership borrows the first-print set via sameNumberArtFallback", () => {
    const root = mkdtempSync(path.join(tmpdir(), "print-face-en-reprint-"));
    const cards = path.join(root, "cards");
    seedFace(cards, "en", "s24", "m0882", "art.drive.webp");
    const hit = resolveNarutoPrintFace({
      printKey: "naruto:s27-m0882",
      lang: "en",
      cardsRoot: cards,
    });
    expect(hit?.source).toBe("borrowed");
    expect(hit?.disk).toEqual({ lang: "en", set: "s24", card: "m0882" });
    expect(hit?.donorPrintKey).toMatch(/s24-m0*882/);
  });
});
