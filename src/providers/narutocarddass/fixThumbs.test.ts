import { describe, expect, it } from "vitest";

import {
  THUMB_RATIO_TOLERANCE,
  correctedThumbSize,
  thumbRatioDeviation,
} from "./fixThumbs";

describe("thumbRatioDeviation", () => {
  it("is zero when the thumb keeps its face ratio", () => {
    expect(thumbRatioDeviation(350, 495, 350, 495)).toBe(0);
    expect(thumbRatioDeviation(175, 248, 350, 496)).toBeLessThan(0.005);
  });

  it("catches the squashed ta091 thumb", () => {
    // 400x458 thumb over a 350x495 face — the card flattened by a quarter.
    const d = thumbRatioDeviation(400, 458, 350, 495);
    expect(d).toBeGreaterThan(0.2);
    expect(d).toBeGreaterThan(THUMB_RATIO_TOLERANCE);
  });

  it("compares against the card's own face, not a corpus average", () => {
    // ni217: a 280x406 thumb is off a 350x495 norm but fine for its 843x1206
    // face, so a global median would flag it wrongly.
    expect(thumbRatioDeviation(280, 406, 843, 1206)).toBeLessThan(
      THUMB_RATIO_TOLERANCE,
    );
    expect(thumbRatioDeviation(280, 406, 350, 495)).toBeGreaterThan(
      THUMB_RATIO_TOLERANCE,
    );
  });

  it("returns 0 rather than NaN on degenerate sizes", () => {
    expect(thumbRatioDeviation(0, 0, 0, 0)).toBe(0);
    expect(thumbRatioDeviation(100, 0, 350, 495)).toBe(0);
  });
});

describe("correctedThumbSize", () => {
  it("keeps the height and rebuilds the width from the face ratio", () => {
    expect(correctedThumbSize(458, 350, 495)).toEqual({
      width: 324,
      height: 458,
    });
    expect(correctedThumbSize(391, 350, 495)).toEqual({
      width: 276,
      height: 391,
    });
  });

  it("produces a size that passes the check", () => {
    const { width, height } = correctedThumbSize(458, 350, 495);
    expect(thumbRatioDeviation(width, height, 350, 495)).toBeLessThan(
      THUMB_RATIO_TOLERANCE,
    );
  });
});
