import { describe, expect, it } from "vitest";

import {
  lenticularBackStripPath,
  lenticularBackStripPathHorizontal,
  lenticularFrontStripPath,
  lenticularFrontStripPathHorizontal,
  lenticularSliceOffset,
  lenticularSliceSplit,
  lenticularTravelOffset,
} from "./lenticularStripPaths";

/** Every horizontal slice must be fully owned by front or back after collapse. */
function horizontalBandsCoverHeight(
  offset: number,
  slices: number,
  height: number,
  sweep = 0,
): boolean {
  const sliceHeight = height / slices;
  const covered = new Array<boolean>(slices).fill(false);

  for (let i = 0; i < slices; i += 1) {
    const o = lenticularSliceOffset(offset, i, slices, sweep);
    const { front, back } = lenticularSliceSplit(o, sliceHeight);
    if (front >= 0.5 || back >= 0.5) covered[i] = true;
  }

  return covered.every(Boolean);
}

describe("lenticularSliceSplit", () => {
  it("gives the full slice to back when the front sliver is sub-pixel", () => {
    expect(lenticularSliceSplit(0.99, 10)).toEqual({ front: 0, back: 10 });
  });

  it("gives the full slice to front when the back sliver is sub-pixel", () => {
    expect(lenticularSliceSplit(0.01, 10)).toEqual({ front: 10, back: 0 });
  });

  it("splits evenly at mid offset", () => {
    expect(lenticularSliceSplit(0.5, 10)).toEqual({ front: 5, back: 5 });
  });
});

describe("lenticularStripPaths", () => {
  it("shows all of A at offset 0 and all of B at offset 1", () => {
    expect(lenticularFrontStripPath(0, 8, 200, 280)).toContain("M0 0L200 0");
    expect(lenticularBackStripPath(0, 8, 200, 280)).toBe("");
    expect(lenticularFrontStripPath(1, 8, 200, 280)).toBe("");
    expect(lenticularBackStripPath(1, 8, 200, 280)).toContain("M0 0L200 0");
  });

  it("interleaves strips at mid offset", () => {
    const front = lenticularFrontStripPath(0.5, 4, 100, 140);
    const back = lenticularBackStripPath(0.5, 4, 100, 140);
    expect(front).toContain("M0 0");
    expect(back).toContain("M");
    expect(front).not.toBe(back);
  });

  it("rakes the wipe with sweep", () => {
    const flat = lenticularFrontStripPath(0.5, 4, 100, 140, 0);
    const raked = lenticularFrontStripPath(0.5, 4, 100, 140, 0.6);
    expect(raked).not.toBe(flat);
    expect(lenticularSliceOffset(0.5, 0, 4, 0.6)).toBeLessThan(0.5);
    expect(lenticularSliceOffset(0.5, 3, 4, 0.6)).toBeGreaterThan(0.5);
  });

  it("maps travel window for pointer scrub", () => {
    expect(lenticularTravelOffset(0, 0.64)).toBe(0);
    expect(lenticularTravelOffset(1, 0.64)).toBe(1);
    expect(lenticularTravelOffset(0.5, 0.64)).toBeCloseTo(0.5, 2);
  });

  it("covers every horizontal band at mid blend (no white gaps)", () => {
    const slices = 40;
    const height = 274;
    expect(horizontalBandsCoverHeight(0.5, slices, height)).toBe(true);
  });

  it("covers horizontal bands for playroom-sized hr-3x1 frames", () => {
    const slices = 40;
    const height = 274;
    for (const offset of [0, 0.12, 0.5, 0.88, 1]) {
      expect(horizontalBandsCoverHeight(offset, slices, height)).toBe(true);
      expect(horizontalBandsCoverHeight(offset, slices, height, 0.35)).toBe(
        true,
      );
    }
  });

  it("interleaves horizontal bands for 1×N vertical scrub", () => {
    const front = lenticularFrontStripPathHorizontal(0.5, 4, 100, 140);
    const back = lenticularBackStripPathHorizontal(0.5, 4, 100, 140);
    expect(front).toContain("M0 0");
    expect(back).toContain("M0");
    expect(front).not.toBe(back);
    expect(lenticularFrontStripPathHorizontal(0, 4, 100, 140)).toContain(
      "L100 0",
    );
  });

  it("hides the thin layer at rest extremes (lenticular-fx)", () => {
    expect(lenticularFrontStripPath(1, 8, 200, 280)).toBe("");
    expect(lenticularBackStripPath(0, 8, 200, 280)).toBe("");
    expect(lenticularFrontStripPathHorizontal(1, 8, 200, 280)).toBe("");
    expect(lenticularBackStripPathHorizontal(0, 8, 200, 280)).toBe("");
  });

  it("interleaves both layers at mid blend with sweep", () => {
    const slices = 40;
    const height = 270;
    const width = 384;
    const front = lenticularFrontStripPathHorizontal(
      0.5,
      slices,
      width,
      height,
      0.35,
    );
    const back = lenticularBackStripPathHorizontal(
      0.5,
      slices,
      width,
      height,
      0.35,
    );
    expect(front).toContain("M0 ");
    expect(back).toContain("M0 ");
    expect(front).not.toBe(back);
  });

  it("overlaps neighbouring strips so AA hairlines stay covered", () => {
    const front = lenticularFrontStripPath(0.5, 4, 100, 140);
    const back = lenticularBackStripPath(0.5, 4, 100, 140);
    // Front stripe width 12.5 + 0.75 overlap → ends at 13.25; back starts at 11.75.
    expect(front).toContain("M0 0L13.25 0");
    expect(back).toContain("M11.75 0");
  });
});
