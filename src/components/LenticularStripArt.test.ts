import { describe, expect, it } from "vitest";

import {
  lenticularPanelImgLayout,
  lenticularPairImgLayouts,
  lenticularViewportContentSize,
} from "@/core/render/kayouLenticularArt";

describe("lenticularPanelImgLayout", () => {
  const natural = { w: 320, h: 450 };
  const grid2x2 = { cols: 2, rows: 2 };
  const grid1x2 = { cols: 1, rows: 2 };

  it("covers the box with cropped 2×2 panel art", () => {
    const boxW = 142;
    const boxH = 101;
    const tl = lenticularPanelImgLayout(natural, grid2x2, 0, boxW, boxH)!;
    expect(tl.width).toBeCloseTo(320 * (boxW / 142), 0);
    expect(tl.top).toBeCloseTo(-62 * (boxW / 142), 0);
  });

  it("covers a landscape box with cropped 1×2 panel (hr-2x1)", () => {
    const boxW = 280;
    const boxH = 193;
    const top = lenticularPanelImgLayout(natural, grid1x2, 0, boxW, boxH)!;
    const scale = boxW / 280;
    expect(top.width).toBeCloseTo(320 * scale, 0);
    expect(top.height).toBeCloseTo(450 * scale, 0);
    expect(top.left).toBeCloseTo(-20 * scale, 0);
    expect(top.top).toBeCloseTo(-20 * scale, 0);
  });
});

describe("lenticularPairImgLayouts", () => {
  const natural = { w: 320, h: 450 };
  const grid1x2 = { cols: 1, rows: 2 };
  const crops = [
    { left: 16, top: 16, right: 16, bottom: 0 },
    { left: 16, top: 0, right: 16, bottom: 18 },
  ];

  it("uses one scale so both panels share the same viewport", () => {
    const boxW = 280;
    const boxH = 200;
    const pair = lenticularPairImgLayouts(
      natural,
      grid1x2,
      0,
      1,
      boxW,
      boxH,
      crops,
    )!;
    expect(pair.a.width).toBe(pair.b.width);
    expect(pair.a.height).toBe(pair.b.height);
    expect(pair.a.left).toBe(pair.b.left);
    expect(pair.b.top).toBeLessThan(pair.a.top);
  });

  it("centers shorter panels inside the shared viewport (hr-3x1 middle row)", () => {
    const grid1x3 = { cols: 1, rows: 3 };
    const crops = [
      { left: 70, top: 20, right: 70, bottom: 4 },
      { left: 70, top: 11, right: 70, bottom: 14 },
      { left: 70, top: 1, right: 70, bottom: 23 },
    ];
    const viewport = lenticularViewportContentSize(320, 450, grid1x3, crops);
    expect(viewport).toEqual({ w: 180, h: 126 });

    const boxW = viewport.w;
    const boxH = viewport.h;
    const top = lenticularPanelImgLayout(
      natural,
      grid1x3,
      0,
      boxW,
      boxH,
      crops,
    )!;
    const middle = lenticularPanelImgLayout(
      natural,
      grid1x3,
      1,
      boxW,
      boxH,
      crops,
    )!;
    expect(top.left).toBe(middle.left);
    expect(middle.top).toBeLessThan(top.top);
  });
});
