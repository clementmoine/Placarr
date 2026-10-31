import { describe, expect, it } from "vitest";

import {
  collectorBandRect,
  collectorBandRectInRegion,
  collectorBandUpscale,
  isPlausibleCollectorWord,
  looksLikeCollectorToken,
  OCR_BAND_MAX_UPSCALE,
  OCR_BAND_TARGET_WIDTH,
} from "./collectorOcr";

describe("collectorBandRectInRegion", () => {
  it("offsets the card band into frame pixels (live AABB)", () => {
    // 1080×1920 portrait frame, card AABB 480×680 at (300, 600).
    const region = { left: 300, top: 600, width: 480, height: 680 };
    const r = collectorBandRectInRegion(region, { width: 1080, height: 1920 });
    const local = collectorBandRect(480, 680);
    expect(r).toEqual({
      sx: 300 + local.sx,
      sy: 600 + local.sy,
      sw: local.sw,
      sh: local.sh,
    });
  });

  it("clamps to the frame and abstains on degenerate regions", () => {
    const r = collectorBandRectInRegion(
      { left: 900, top: 1700, width: 480, height: 680 },
      { width: 1080, height: 1920 },
    );
    expect(r).not.toBeNull();
    expect(r!.sx + r!.sw).toBeLessThanOrEqual(1080);
    expect(r!.sy + r!.sh).toBeLessThanOrEqual(1920);
    expect(
      collectorBandRectInRegion(
        { left: 0, top: 0, width: 20, height: 20 },
        { width: 1080, height: 1920 },
      ),
    ).toBeNull();
  });
});

describe("collectorBandUpscale", () => {
  it.each([
    [400, OCR_BAND_MAX_UPSCALE],
    [800, 2],
    [OCR_BAND_TARGET_WIDTH, 1],
    [3000, 1],
  ])("band width %i → ×%s", (width, expected) => {
    expect(collectorBandUpscale(width)).toBeCloseTo(expected, 5);
  });
});

describe("collectorBandRect", () => {
  it("takes the bottom band with side inset", () => {
    const r = collectorBandRect(1000, 1400);
    expect(r.sx).toBe(40); // 4%
    expect(r.sw).toBe(920);
    expect(r.sh).toBe(168); // 12% of 1400
    expect(r.sy).toBe(1400 - 168);
  });

  it("never returns empty geometry", () => {
    const r = collectorBandRect(1, 1);
    expect(r.sw).toBeGreaterThanOrEqual(1);
    expect(r.sh).toBeGreaterThanOrEqual(1);
  });
});

describe("looksLikeCollectorToken", () => {
  it("accepts slash and set-number forms", () => {
    expect(looksLikeCollectorToken("8/204")).toBe(true);
    expect(looksLikeCollectorToken("8/204 • FR • 2")).toBe(true);
    expect(looksLikeCollectorToken("TB2-045 SR")).toBe(true);
  });

  it("rejects foil digit noise", () => {
    expect(looksLikeCollectorToken("4-12-7")).toBe(false);
    expect(looksLikeCollectorToken("12-7")).toBe(false);
    expect(looksLikeCollectorToken("hh")).toBe(false);
  });
});

describe("isPlausibleCollectorWord", () => {
  const band = { sw: 200, sh: 40 };

  it("accepts collector-like tokens", () => {
    expect(
      isPlausibleCollectorWord("66/204", { width: 60, height: 14 }, band, 80),
    ).toBe(true);
  });

  it("rejects letter noise without digits", () => {
    expect(
      isPlausibleCollectorWord("hh", { width: 40, height: 20 }, band, 90),
    ).toBe(false);
  });

  it("rejects hyphenated digit hallucinations", () => {
    expect(
      isPlausibleCollectorWord("4-12-7", { width: 60, height: 14 }, band, 90),
    ).toBe(false);
  });

  it("rejects huge boxes that fill the band", () => {
    expect(
      isPlausibleCollectorWord("66/204", { width: 190, height: 36 }, band, 90),
    ).toBe(false);
  });
});
