import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CARD_EMBED_MODEL,
  CARD_EMBED_PREPROCESS,
  cardArtBandRect,
  cardEmbedResizeTarget,
} from "@/core/identify/embedMath";

/**
 * Same arithmetic as transformers.js `get_resize_output_image_size` for a
 * `{ shortest_edge }` size (what the self-hosted preprocessor config asks
 * for). Kept verbatim here so a drift in our helper is caught.
 */
function transformersReference(
  w: number,
  h: number,
  shortest: number,
): [number, number] {
  const f = Math.max(shortest / w, shortest / h);
  return [
    Math.floor(Number((w * f).toFixed(2))),
    Math.floor(Number((h * f).toFixed(2))),
  ];
}

describe("CARD_EMBED_PREPROCESS ↔ self-hosted preprocessor_config.json", () => {
  const cfg = JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "public/models",
        CARD_EMBED_MODEL,
        "preprocessor_config.json",
      ),
      "utf8",
    ),
  ) as {
    size: { shortest_edge: number };
    crop_size: { width: number; height: number };
    do_resize: boolean;
    do_center_crop: boolean;
  };

  it("matches the model's resize / crop contract", () => {
    expect(cfg.do_resize).toBe(true);
    expect(cfg.do_center_crop).toBe(true);
    expect(cfg.size.shortest_edge).toBe(CARD_EMBED_PREPROCESS.shortestEdge);
    expect(cfg.crop_size).toEqual({
      width: CARD_EMBED_PREPROCESS.cropSize,
      height: CARD_EMBED_PREPROCESS.cropSize,
    });
  });
});

describe("cardEmbedResizeTarget", () => {
  it.each([
    // Art band of a 1468×2048 Lorcana face (wider than tall → height = 256).
    [1233, 983],
    // Band of a small rectified face.
    [504, 403],
    // Square, portrait, and odd sizes.
    [300, 300],
    [200, 600],
    [333, 257],
    [16, 16],
  ])("%i×%i → transformers.js reference size", (w, h) => {
    const [rw, rh] = transformersReference(
      w,
      h,
      CARD_EMBED_PREPROCESS.shortestEdge,
    );
    expect(cardEmbedResizeTarget(w, h)).toEqual({ width: rw, height: rh });
  });

  it("the short side lands exactly on shortest_edge, never below the crop", () => {
    for (const [w, h] of [
      [1233, 983],
      [640, 480],
      [480, 640],
      [1000, 1000],
    ]) {
      const t = cardEmbedResizeTarget(w!, h!)!;
      expect(Math.min(t.width, t.height)).toBe(
        CARD_EMBED_PREPROCESS.shortestEdge,
      );
      expect(Math.min(t.width, t.height)).toBeGreaterThanOrEqual(
        CARD_EMBED_PREPROCESS.cropSize,
      );
    }
  });

  it("composes with the art band crop of a real face size", () => {
    const rect = cardArtBandRect(1468, 2048)!;
    const t = cardEmbedResizeTarget(rect.width, rect.height)!;
    expect(t.height).toBe(256);
    expect(t.width).toBeGreaterThan(256);
  });

  it("rejects empty sizes", () => {
    expect(cardEmbedResizeTarget(0, 100)).toBeNull();
    expect(cardEmbedResizeTarget(100, -1)).toBeNull();
  });
});
