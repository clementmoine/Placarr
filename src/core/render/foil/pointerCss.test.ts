import { describe, expect, it } from "vitest";

import {
  BACKGROUND_X_RANGE,
  BACKGROUND_Y_RANGE,
  adjust,
  compressBackgroundX,
  compressBackgroundY,
  foilPointerVars,
} from "./pointerCss";

describe("adjust", () => {
  it("maps endpoints and midpoint", () => {
    expect(adjust(0, 0, 100, 37, 63)).toBe(37);
    expect(adjust(100, 0, 100, 37, 63)).toBe(63);
    expect(adjust(50, 0, 100, 37, 63)).toBe(50);
  });
});

describe("compressBackground", () => {
  it("keeps motif travel inside simey-style compressed ranges", () => {
    expect(compressBackgroundX(0)).toBe(BACKGROUND_X_RANGE[0]);
    expect(compressBackgroundX(100)).toBe(BACKGROUND_X_RANGE[1]);
    expect(compressBackgroundY(0)).toBe(BACKGROUND_Y_RANGE[0]);
    expect(compressBackgroundY(100)).toBe(BACKGROUND_Y_RANGE[1]);
  });
});

describe("foilPointerVars", () => {
  it("splits glare pointer from compressed motif scroll", () => {
    const v = foilPointerVars(
      { tiltX: 9, tiltY: -4, lightX: 100, lightY: 100 },
      0.66,
    );
    expect(v.colorX).toBe(100);
    expect(v.colorY).toBe(100);
    expect(v.backgroundX).toBe(BACKGROUND_X_RANGE[1]);
    expect(v.backgroundY).toBe(BACKGROUND_Y_RANGE[1]);
    expect(v.combined).toBe(200);
    expect(v.pointerFromTop).toBe(1);
    expect(v.pointerFromLeft).toBe(1);
    expect(v.pointerFromCenter).toBe(1);
  });

  it("honours an idle --combined that is not lightX+lightY", () => {
    const v = foilPointerVars(
      { tiltX: 0, tiltY: 0, lightX: 50, lightY: 50 },
      0.2,
      40,
    );
    expect(v.combined).toBe(40);
    expect(v.backgroundX).toBe(50);
    expect(v.backgroundY).toBe(50);
  });

  it("keeps idle glare soft but travelling with the lean (same stack as hover)", () => {
    const v = foilPointerVars(
      { tiltX: 3, tiltY: -2, lightX: 78, lightY: 28 },
      0.3,
      40,
      "idle",
    );
    expect(v.colorX).toBe(78);
    expect(v.colorY).toBe(28);
    expect(v.opacity).toBe(0.3);
    expect(v.pointerFromCenter).toBeGreaterThan(0);
    expect(v.backgroundX).toBe(compressBackgroundX(78));
    expect(v.backgroundY).toBe(compressBackgroundY(28));
    expect(v.combined).toBe(40);
    expect(v.rotateX).toBe(-2);
    expect(v.rotateY).toBe(3);
  });
});
