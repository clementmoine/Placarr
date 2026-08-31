import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, utimesSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  curatedDestStale,
  listCuratedReconstructedFaces,
  opaqueBounds,
} from "./installReconstructed";

/** Alpha plane with a `bleed`-wide fully transparent frame. */
function framed(width: number, height: number, bleed: number): Uint8Array {
  const a = new Uint8Array(width * height).fill(255);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge =
        x < bleed || y < bleed || x >= width - bleed || y >= height - bleed;
      if (edge) a[y * width + x] = 0;
    }
  }
  return a;
}

describe("curatedDestStale", () => {
  it("is stale when dest is missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-curated-"));
    const src = path.join(root, "src.png");
    writeFileSync(src, "x");
    expect(curatedDestStale(src, path.join(root, "missing.webp"))).toBe(true);
  });

  it("is stale when curated source is newer than dest", () => {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-curated-"));
    const src = path.join(root, "src.png");
    const dest = path.join(root, "dest.webp");
    writeFileSync(src, "src");
    writeFileSync(dest, "dest");
    const older = new Date("2020-01-01T00:00:00Z");
    const newer = new Date("2024-06-01T00:00:00Z");
    utimesSync(dest, older, older);
    utimesSync(src, newer, newer);
    expect(curatedDestStale(src, dest)).toBe(true);
  });

  it("is fresh when dest is as new as the source", () => {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-curated-"));
    mkdirSync(root, { recursive: true });
    const src = path.join(root, "src.png");
    const dest = path.join(root, "dest.webp");
    writeFileSync(src, "src");
    writeFileSync(dest, "dest");
    const t = new Date("2024-06-01T00:00:00Z");
    utimesSync(src, t, t);
    utimesSync(dest, t, t);
    expect(curatedDestStale(src, dest)).toBe(false);
  });
});

describe("listCuratedReconstructedFaces", () => {
  it("reads lang from the folder, not a hardcoded locale", () => {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-curated-faces-"));
    const cards = path.join(root, "cards");
    mkdirSync(path.join(cards, "ninja", "n0001", "en"), { recursive: true });
    mkdirSync(path.join(cards, "ninja", "ni0001", "fr"), { recursive: true });
    writeFileSync(
      path.join(cards, "ninja", "n0001", "en", "art.reconstructed.png"),
      "en",
    );
    writeFileSync(
      path.join(cards, "ninja", "ni0001", "fr", "art.reconstructed.png"),
      "fr",
    );
    writeFileSync(
      path.join(cards, "ninja", "ni0001", "fr", "source.jpg"),
      "pic",
    );
    writeFileSync(path.join(cards, "back.fr.png"), "back");

    expect(
      listCuratedReconstructedFaces(cards).map((f) => `${f.cardId}/${f.lang}`),
    ).toEqual(["n0001/en", "ni0001/fr"]);
  });
});

describe("opaqueBounds", () => {
  it("leaves a fully opaque image untouched", () => {
    const a = new Uint8Array(10 * 20).fill(255);
    expect(opaqueBounds(a, 10, 20)).toEqual({
      left: 0,
      top: 0,
      width: 10,
      height: 20,
    });
  });

  it("trims a 1px transparent frame on all four sides", () => {
    // Regression: requiring a *fully* opaque row collapsed this to 1x1,
    // because the left and right bleed puts a transparent pixel in every row.
    expect(opaqueBounds(framed(30, 40, 1), 30, 40)).toEqual({
      left: 1,
      top: 1,
      width: 28,
      height: 38,
    });
  });

  it("trims an asymmetric bleed", () => {
    const w = 12;
    const h = 8;
    const a = new Uint8Array(w * h).fill(255);
    for (let x = 0; x < w; x += 1) a[x] = 0; // top row
    for (let y = 0; y < h; y += 1) a[y * w] = 0; // left column
    expect(opaqueBounds(a, w, h)).toEqual({
      left: 1,
      top: 1,
      width: 11,
      height: 7,
    });
  });

  it("does not run past the far edge when everything is transparent", () => {
    const a = new Uint8Array(6 * 6).fill(0);
    const box = opaqueBounds(a, 6, 6);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});
