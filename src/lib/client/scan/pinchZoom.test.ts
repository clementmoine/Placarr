import { describe, expect, it } from "vitest";

import {
  nextZoomFromPinch,
  nextZoomFromWheel,
  resolveZoomRange,
  touchDistance,
} from "./pinchZoom";

describe("pinchZoom", () => {
  it("measures touch distance", () => {
    expect(touchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(
      5,
    );
  });

  it("zooms in on wheel up", () => {
    expect(
      nextZoomFromWheel(1, -100, { min: 1, max: 5, step: 0.1 }),
    ).toBeCloseTo(1.2);
  });

  it("scales pinch from start distance", () => {
    expect(
      nextZoomFromPinch(1, 100, 200, { min: 1, max: 5 }),
    ).toBe(2);
  });

  it("falls back to digital zoom when the track has no zoom", () => {
    expect(
      resolveZoomRange({
        zoom: false,
        zoomMin: 1,
        zoomMax: 1,
        zoomStep: 0.1,
      }).mode,
    ).toBe("digital");
  });
});
