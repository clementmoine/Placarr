import { describe, expect, it } from "vitest";

import {
  applyHomography,
  computeHomographyDestToSource,
  defaultQuadOutputSize,
  isCropQuad,
} from "./imageHomography";

describe("imageHomography", () => {
  it("maps a rectangle quad to itself via identity-like dest", () => {
    const src = [
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 220 },
      { x: 10, y: 220 },
    ] as const;
    const dest = [
      { x: 0, y: 0 },
      { x: 99, y: 0 },
      { x: 99, y: 199 },
      { x: 0, y: 199 },
    ] as const;
    const H = computeHomographyDestToSource(src, dest);
    const tl = applyHomography(H, 0, 0);
    expect(tl.x).toBeCloseTo(10, 5);
    expect(tl.y).toBeCloseTo(20, 5);
    const br = applyHomography(H, 99, 199);
    expect(br.x).toBeCloseTo(110, 5);
    expect(br.y).toBeCloseTo(220, 5);
  });

  it("sizes output from average edge lengths", () => {
    const size = defaultQuadOutputSize([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ]);
    expect(size).toEqual({ width: 100, height: 200 });
  });

  it("recognises CropQuad sidecars", () => {
    expect(
      isCropQuad({
        kind: "quad",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        imageWidth: 10,
        imageHeight: 10,
      }),
    ).toBe(true);
    expect(isCropQuad({ left: 0, top: 0, width: 1, height: 1 })).toBe(false);
  });
});
