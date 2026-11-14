import { describe, expect, it } from "vitest";

import {
  averageStrip,
  edgeAxisFor,
  edgeColorsFromStrips,
  edgeGradient,
} from "./useImageEdgeColors";

const OPAQUE = 255;

/** RGBA strip painted by a per-pixel function. */
function strip(
  length: number,
  paint: (index: number) => [number, number, number, number],
) {
  const data = new Uint8ClampedArray(length * 4);
  for (let index = 0; index < length; index += 1) {
    data.set(paint(index), index * 4);
  }
  return data;
}

const solid = (r: number, g: number, b: number) =>
  strip(4, () => [r, g, b, OPAQUE]);

describe("edgeAxisFor", () => {
  it("puts the gap above and below when the artwork is wider than its frame", () => {
    // 1600x853 (1.876) in a square tile: contained by width, so it comes up
    // short vertically — the bands are on top and bottom, not on the sides.
    expect(edgeAxisFor(1600 / 853, 1)).toBe("vertical");
    // And the near-miss: 1243x1600 (0.777) inside a 5/7 frame (0.714).
    expect(edgeAxisFor(1243 / 1600, 5 / 7)).toBe("vertical");
  });

  it("puts the gap on the sides when the artwork is taller than its frame", () => {
    expect(edgeAxisFor(0.6, 5 / 7)).toBe("horizontal");
  });

  it("treats an exact fit as horizontal, where the bands are zero-wide anyway", () => {
    expect(edgeAxisFor(5 / 7, 5 / 7)).toBe("horizontal");
  });
});

describe("averageStrip", () => {
  it("averages along the edge rather than trusting one point", () => {
    const data = strip(4, (index) =>
      index < 2 ? [200, 200, 200, OPAQUE] : [100, 100, 100, OPAQUE],
    );

    expect(averageStrip(data)).toBe("rgb(150 150 150)");
  });

  it("ignores transparent pixels instead of averaging black into the edge", () => {
    const data = strip(4, (index) =>
      index === 0 ? [40, 80, 120, OPAQUE] : [255, 255, 255, 0],
    );

    expect(averageStrip(data)).toBe("rgb(40 80 120)");
  });

  it("has nothing to report when the whole line is see-through", () => {
    expect(averageStrip(strip(4, () => [255, 255, 255, 0]))).toBeNull();
  });

  it("survives an empty buffer", () => {
    expect(averageStrip(new Uint8ClampedArray())).toBeNull();
  });
});

describe("edgeColorsFromStrips", () => {
  it("keeps each strip on its own end of the gradient", () => {
    expect(
      edgeColorsFromStrips(solid(0, 128, 0), solid(0, 100, 0), "horizontal"),
    ).toEqual({
      from: "rgb(0 128 0)",
      to: "rgb(0 100 0)",
      axis: "horizontal",
    });
  });

  it("gives up rather than bleed a single readable edge across both ends", () => {
    const seeThrough = strip(4, () => [255, 255, 255, 0]);

    expect(
      edgeColorsFromStrips(solid(10, 20, 30), seeThrough, "vertical"),
    ).toBeNull();
    expect(
      edgeColorsFromStrips(seeThrough, solid(10, 20, 30), "vertical"),
    ).toBeNull();
  });
});

describe("edgeGradient", () => {
  it("runs along the axis the gap is on", () => {
    expect(
      edgeGradient({ from: "rgb(1 1 1)", to: "rgb(2 2 2)", axis: "vertical" }),
    ).toBe("linear-gradient(to bottom, rgb(1 1 1), rgb(2 2 2))");
    expect(
      edgeGradient({
        from: "rgb(1 1 1)",
        to: "rgb(2 2 2)",
        axis: "horizontal",
      }),
    ).toBe("linear-gradient(to right, rgb(1 1 1), rgb(2 2 2))");
  });
});
