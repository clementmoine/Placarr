import { describe, expect, it } from "vitest";

import {
  CARD_FACE_RADIUS,
  cardFaceClipPath,
  containOrientedBox,
} from "./OrientedMediaFrame";

describe("cardFaceClipPath", () => {
  it("clips with upright radii when the frame is not turned", () => {
    expect(cardFaceClipPath(0)).toContain("--card-face-radius");
    expect(cardFaceClipPath(0)).toContain("4% / 3%");
  });

  it("swaps radii for odd quarter-turns (landscape Location/BREAK frame)", () => {
    // 90° / 270°: the frame is landscape, so 4% of its width is 4% of the
    // card's *long* side. Swapping keeps the corner round instead of flattened.
    expect(cardFaceClipPath(1)).toContain("3% / 4%");
    expect(cardFaceClipPath(3)).toContain("3% / 4%");
    expect(cardFaceClipPath(2)).toContain("4% / 3%");
  });

  it("keeps the upright radius for the pre-rotate face box", () => {
    // What OrientedMediaRotator rounds its inner box with: a face laid out
    // before the rotate is still an upright card.
    expect(CARD_FACE_RADIUS).toContain("4% / 3%");
  });
});

describe("containOrientedBox", () => {
  it("height-limits a 7:5 face in a wide short box (focus stage)", () => {
    // Same shape as the buggy playroom measure: 807×445.5, want 7:5.
    const box = containOrientedBox(807, 445.5, 7, 5);
    expect(box.height).toBeCloseTo(445.5, 5);
    expect(box.width).toBeCloseTo((445.5 * 7) / 5, 5);
    expect(box.width / box.height).toBeCloseTo(7 / 5, 5);
    expect(box.width).toBeLessThan(807);
  });

  it("width-limits a 7:5 face in a tall narrow box", () => {
    const box = containOrientedBox(400, 900, 7, 5);
    expect(box.width).toBeCloseTo(400, 5);
    expect(box.height).toBeCloseTo((400 * 5) / 7, 5);
    expect(box.width / box.height).toBeCloseTo(7 / 5, 5);
  });

  it("fills exactly when the box already matches", () => {
    const box = containOrientedBox(700, 500, 7, 5);
    expect(box.width).toBeCloseTo(700, 5);
    expect(box.height).toBeCloseTo(500, 5);
  });

  it("keeps portrait 5:7 inside a square", () => {
    const box = containOrientedBox(500, 500, 5, 7);
    expect(box.width).toBeCloseTo((500 * 5) / 7, 5);
    expect(box.height).toBeCloseTo(500, 5);
  });
});
