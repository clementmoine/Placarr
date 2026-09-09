import { describe, expect, it } from "vitest";

import {
  cropFractionsOf,
  cropFractionsTag,
  mirrorCropBox,
  type CropFractions,
} from "./cropMirror";

describe("cropFractionsOf", () => {
  it("expresses a stored rectangle as shares of its own image", () => {
    expect(
      cropFractionsOf({
        left: 100,
        top: 50,
        width: 400,
        height: 200,
        imageWidth: 800,
        imageHeight: 400,
      }),
    ).toEqual({ left: 0.125, top: 0.125, width: 0.5, height: 0.5 });
  });

  it("refuses a box whose image dimensions are missing", () => {
    expect(
      cropFractionsOf({
        left: 0,
        top: 0,
        width: 10,
        height: 10,
        imageWidth: 0,
        imageHeight: 400,
      }),
    ).toBeNull();
  });

  it("refuses an empty rectangle", () => {
    expect(
      cropFractionsOf({
        left: 0,
        top: 0,
        width: 0,
        height: 10,
        imageWidth: 800,
        imageHeight: 400,
      }),
    ).toBeNull();
  });
});

describe("mirrorCropBox", () => {
  it("replays the framing at the target's own resolution", () => {
    const fractions: CropFractions = {
      left: 0.125,
      top: 0.125,
      width: 0.5,
      height: 0.5,
    };

    // A mask published at twice the artwork's size must be cut in the same
    // place, or the shimmer lands off the foil areas.
    expect(mirrorCropBox(fractions, 1600, 800)).toEqual({
      left: 200,
      top: 100,
      width: 800,
      height: 400,
      imageWidth: 1600,
      imageHeight: 800,
    });
  });

  it("keeps the rectangle inside the target when rounding pushes it out", () => {
    // 0.999 of 100 rounds to 100, one past the last row: sharp throws on that.
    const box = mirrorCropBox(
      { left: 0.999, top: 0.999, width: 1, height: 1 },
      100,
      100,
    )!;

    expect(box.left + box.width).toBeLessThanOrEqual(100);
    expect(box.top + box.height).toBeLessThanOrEqual(100);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  it("never returns a zero-sized crop for a sliver of a small image", () => {
    const box = mirrorCropBox(
      { left: 0, top: 0, width: 0.001, height: 0.001 },
      50,
      50,
    )!;

    expect(box.width).toBe(1);
    expect(box.height).toBe(1);
  });

  it("gives up on a target with no dimensions", () => {
    expect(
      mirrorCropBox({ left: 0, top: 0, width: 1, height: 1 }, 0, 100),
    ).toBeNull();
  });
});

describe("cropFractionsTag", () => {
  it("stays within the alphabetic marker grammar the crop names use", () => {
    expect(
      cropFractionsTag({ left: 0.1, top: 0.2, width: 0.5, height: 0.6 }),
    ).toMatch(/^[a-z]+$/);
  });

  it("is stable for the same framing", () => {
    const fractions = { left: 0.1, top: 0.2, width: 0.5, height: 0.6 };
    expect(cropFractionsTag(fractions)).toBe(
      cropFractionsTag({ ...fractions }),
    );
  });

  it("changes when the framing does, so a re-crop is a new file", () => {
    const a = cropFractionsTag({
      left: 0.1,
      top: 0.2,
      width: 0.5,
      height: 0.6,
    });
    const b = cropFractionsTag({
      left: 0.1,
      top: 0.2,
      width: 0.5,
      height: 0.7,
    });
    const c = cropFractionsTag({
      left: 0.2,
      top: 0.1,
      width: 0.5,
      height: 0.6,
    });

    expect(a).not.toBe(b);
    // Swapped offsets must not collide either — a sum-based hash would.
    expect(a).not.toBe(c);
  });
});
