import { describe, expect, it } from "vitest";

import {
  convexHull,
  detectCardQuadFromGray,
  MAX_SUBJECT_FRAME_SPAN,
  MIN_FILLED_EDGE_SUPPORT,
  extremePointQuad,
  hullToQuad,
  insetQuad,
  orderQuadCorners,
  quadEdgeSupport,
  rgbaToGray,
  type Point2,
} from "./cardQuadClassical";

describe("insetQuad", () => {
  it("moves corners toward the center", () => {
    const inset = insetQuad(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 200 },
        { x: 0, y: 200 },
      ],
      0.1,
    );
    expect(inset[0]!.x).toBeGreaterThan(0);
    expect(inset[0]!.y).toBeGreaterThan(0);
    expect(inset[2]!.x).toBeLessThan(100);
    expect(inset[2]!.y).toBeLessThan(200);
  });
});

describe("extremePointQuad", () => {
  it("recovers corners of a filled axis-aligned rectangle", () => {
    const width = 40;
    const pixels: number[] = [];
    for (let y = 10; y <= 50; y++) {
      for (let x = 8; x <= 28; x++) {
        pixels.push(y * width + x);
      }
    }
    const quad = extremePointQuad(pixels, width);
    expect(quad).not.toBeNull();
    const [tl, tr, br, bl] = quad!;
    expect(tl).toEqual({ x: 8, y: 10 });
    expect(tr).toEqual({ x: 28, y: 10 });
    expect(br).toEqual({ x: 28, y: 50 });
    expect(bl).toEqual({ x: 8, y: 50 });
  });
});

describe("detectCardQuadFromGray", () => {
  it("finds a bright card-shaped rectangle on a dark field", () => {
    const fullW = 400;
    const fullH = 300;
    const dw = 200;
    const dh = 150;
    const gray = new Uint8Array(dw * dh);
    gray.fill(28);
    // Portrait card ≈ 63/88 centered in downscale space.
    const cardW = 63;
    const cardH = 88;
    const left = Math.round((dw - cardW) / 2);
    const top = Math.round((dh - cardH) / 2);
    for (let y = top; y < top + cardH; y++) {
      for (let x = left; x < left + cardW; x++) {
        gray[y * dw + x] = 220;
      }
    }
    const found = detectCardQuadFromGray(gray, dw, dh, fullW, fullH);
    expect(found).not.toBeNull();
    expect(found!.coverage).toBeGreaterThan(0.1);
    expect(found!.aabb.width).toBeGreaterThan(fullW * 0.2);
    expect(found!.aabb.height).toBeGreaterThan(fullH * 0.3);
  });

  it("finds a dark-bordered card on a bright desk (live phone case)", () => {
    const fullW = 400;
    const fullH = 700;
    const dw = 200;
    const dh = 350;
    const gray = new Uint8Array(dw * dh);
    gray.fill(210); // bright table
    const cardW = 90;
    const cardH = 126; // ~63/88
    const left = Math.round((dw - cardW) / 2);
    const top = Math.round((dh - cardH) / 2);
    for (let y = top; y < top + cardH; y++) {
      for (let x = left; x < left + cardW; x++) {
        const border =
          x <= left + 2 ||
          x >= left + cardW - 3 ||
          y <= top + 2 ||
          y >= top + cardH - 3;
        gray[y * dw + x] = border ? 20 : 160;
      }
    }
    const found = detectCardQuadFromGray(gray, dw, dh, fullW, fullH);
    expect(found).not.toBeNull();
    expect(found!.coverage).toBeGreaterThan(0.08);
    expect(found!.coverage).toBeLessThan(0.78);
    expect(found!.aabb.height).toBeGreaterThan(found!.aabb.width);
  });
});

/**
 * Synthetic gray scene builder: bright table, cards drawn as dark-bordered
 * rectangles rotated by `angleDeg` around their centre, with busy "art"
 * stripes inside (so interiors are full of edges, like real cards).
 */
function paintScene(
  dw: number,
  dh: number,
  cards: Array<{
    cx: number;
    cy: number;
    w: number;
    h: number;
    angleDeg: number;
    /** Flat interior (no art edges). */
    plain?: boolean;
  }>,
  table = 215,
): Uint8Array {
  const gray = new Uint8Array(dw * dh).fill(table);
  for (const card of cards) {
    const a = (card.angleDeg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        // Inverse-rotate pixel into card space.
        const dx = x - card.cx;
        const dy = y - card.cy;
        const u = dx * cos + dy * sin + card.w / 2;
        const v = -dx * sin + dy * cos + card.h / 2;
        if (u < 0 || v < 0 || u >= card.w || v >= card.h) continue;
        const border = u < 3 || v < 3 || u >= card.w - 3 || v >= card.h - 3;
        const art = card.plain ? 150 : ((u / 6) | 0) % 2 === 0 ? 90 : 170;
        gray[y * dw + x] = border ? 18 : art;
      }
    }
  }
  return gray;
}

function cornerSet(points: ReadonlyArray<{ x: number; y: number }>) {
  return points.map((p) => [Math.round(p.x), Math.round(p.y)] as const);
}

function nearestDistance(
  pt: readonly [number, number],
  pool: ReadonlyArray<readonly [number, number]>,
): number {
  return Math.min(...pool.map((q) => Math.hypot(q[0] - pt[0], q[1] - pt[1])));
}

describe("convexHull / hullToQuad / orderQuadCorners", () => {
  it("reduces a rasterised rotated rectangle to its 4 true corners", () => {
    const w = 60;
    const h = 90;
    const a = Math.PI / 6; // 30°
    const pts: Point2[] = [];
    for (let v = 0; v < h; v++) {
      for (let u = 0; u < w; u++) {
        pts.push({
          x: 100 + u * Math.cos(a) - v * Math.sin(a),
          y: 100 + u * Math.sin(a) + v * Math.cos(a),
        });
      }
    }
    const hull = convexHull(pts);
    expect(hull.length).toBeGreaterThanOrEqual(4);
    const quad = hullToQuad(hull);
    expect(quad).not.toBeNull();
    const expected = cornerSet([
      { x: 100, y: 100 },
      { x: 100 + (w - 1) * Math.cos(a), y: 100 + (w - 1) * Math.sin(a) },
      {
        x: 100 + (w - 1) * Math.cos(a) - (h - 1) * Math.sin(a),
        y: 100 + (w - 1) * Math.sin(a) + (h - 1) * Math.cos(a),
      },
      { x: 100 - (h - 1) * Math.sin(a), y: 100 + (h - 1) * Math.cos(a) },
    ]);
    for (const c of cornerSet(quad!)) {
      expect(nearestDistance(c, expected)).toBeLessThan(2);
    }
  });

  it("orders TL→TR→BR→BL clockwise from the top-left-most corner", () => {
    const ordered = orderQuadCorners([
      { x: 10, y: 90 },
      { x: 90, y: 10 },
      { x: 10, y: 10 },
      { x: 90, y: 90 },
    ]);
    expect(ordered).toEqual([
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ]);
  });
});

describe("detectCardQuadFromGray — scenes that are not 'one card on white'", () => {
  it("isolates a 30° card while neighbours are cut by the frame edges", () => {
    const dw = 200;
    const dh = 360;
    const gray = paintScene(dw, dh, [
      { cx: 100, cy: 180, w: 76, h: 106, angleDeg: 30 },
      // Neighbours partly outside the frame (like the Lorcana screenshot).
      { cx: 205, cy: 60, w: 76, h: 106, angleDeg: 30 },
      { cx: -5, cy: 320, w: 76, h: 106, angleDeg: 30 },
    ]);
    const found = detectCardQuadFromGray(gray, dw, dh, dw, dh);
    expect(found).not.toBeNull();
    // Centre card, not the whole table / merged neighbours.
    expect(found!.coverage).toBeLessThan(0.3);
    const a = Math.PI / 6;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const hw = 38;
    const hh = 53;
    const expected = cornerSet(
      [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ].map(([u, v]) => ({
        x: 100 + u! * cos - v! * sin,
        y: 180 + u! * sin + v! * cos,
      })),
    );
    for (const c of cornerSet(found!.corners)) {
      expect(nearestDistance(c, expected)).toBeLessThan(6);
    }
    expect(found!.precision).toBe("high");
    // Corners come out upright-ordered (TL has the smallest x+y).
    const sums = found!.corners.map((p) => p.x + p.y);
    expect(sums[0]).toBe(Math.min(...sums));
  });

  it("finds a sleeved card on a grey table (second closed loop inside)", () => {
    const dw = 200;
    const dh = 360;
    const gray = new Uint8Array(dw * dh).fill(128); // grey table
    const sleeve = { left: 50, top: 100, w: 100, h: 160 };
    for (let y = sleeve.top; y < sleeve.top + sleeve.h; y++) {
      for (let x = sleeve.left; x < sleeve.left + sleeve.w; x++) {
        const edge =
          x === sleeve.left ||
          x === sleeve.left + sleeve.w - 1 ||
          y === sleeve.top ||
          y === sleeve.top + sleeve.h - 1;
        gray[y * dw + x] = edge ? 150 : 128; // faint sleeve outline
      }
    }
    // Card inside the sleeve with a dark border and striped art.
    const inner = paintScene(dw, dh, [
      { cx: 100, cy: 180, w: 86, h: 140, angleDeg: 0 },
    ]);
    for (let i = 0; i < gray.length; i++) {
      if (inner[i] !== 215) gray[i] = inner[i]!;
    }
    const found = detectCardQuadFromGray(gray, dw, dh, dw, dh);
    expect(found).not.toBeNull();
    expect(found!.aabb.width).toBeGreaterThanOrEqual(80);
    expect(found!.aabb.width).toBeLessThanOrEqual(110);
    expect(found!.aabb.height).toBeGreaterThan(found!.aabb.width);
  });

  it("still falls back to the scanline fill when the card touches the frame", () => {
    const dw = 200;
    const dh = 300;
    // Card running off the bottom of the frame: no closed loop, the interior
    // leaks to the border → pass 2 (scanline fill between the side borders).
    const gray = paintScene(dw, dh, [
      { cx: 100, cy: 200, w: 150, h: 260, angleDeg: 0, plain: true },
    ]);
    const found = detectCardQuadFromGray(gray, dw, dh, dw, dh);
    expect(found).not.toBeNull();
    expect(found!.coverage).toBeGreaterThan(0.5);
    expect(found!.precision).toBe("low");
  });

  it("refuses a candidate spanning the whole frame (table / mat, not a card)", () => {
    const dw = 200;
    const dh = 300;
    // A 96 % × 96 % plain rectangle is the surface behind the card: the real
    // busy-table failure handed exactly this frame-wide quad to the rectifier.
    const gray = paintScene(dw, dh, [
      {
        cx: 100,
        cy: 150,
        w: Math.round(dw * 0.96),
        h: Math.round(dh * 0.96),
        angleDeg: 0,
        plain: true,
      },
    ]);
    expect(detectCardQuadFromGray(gray, dw, dh, dw, dh)).toBeNull();
  });

  it("keeps a close-up card that only fills the frame vertically", () => {
    const dw = 200;
    const dh = 300;
    const gray = paintScene(dw, dh, [
      { cx: 100, cy: 150, w: 150, h: 320, angleDeg: 0, plain: true },
    ]);
    const found = detectCardQuadFromGray(gray, dw, dh, dw, dh);
    expect(found).not.toBeNull();
    expect(found!.aabb.width).toBeLessThan(dw * MAX_SUBJECT_FRAME_SPAN);
  });
});

describe("detectCardQuadFromGray — several cards in the frame", () => {
  const card = { w: 76, h: 106, angleDeg: 0 };

  it.each([
    {
      name: "two cards side by side, a 6 px gap",
      dw: 270,
      dh: 360,
      cards: [
        { ...card, cx: 94, cy: 180 },
        { ...card, cx: 176, cy: 180 },
      ],
    },
    {
      name: "2×2 grid, 6 px gaps",
      dw: 270,
      dh: 400,
      cards: [
        { ...card, cx: 94, cy: 144 },
        { ...card, cx: 176, cy: 144 },
        { ...card, cx: 94, cy: 256 },
        { ...card, cx: 176, cy: 256 },
      ],
    },
    {
      name: "row of three, 6 px gaps",
      dw: 300,
      dh: 360,
      cards: [
        { ...card, cx: 68, cy: 180 },
        { ...card, cx: 150, cy: 180 },
        { ...card, cx: 232, cy: 180 },
      ],
    },
  ])("returns exactly one card for $name", ({ dw, dh, cards }) => {
    const found = detectCardQuadFromGray(
      paintScene(dw, dh, cards),
      dw,
      dh,
      dw,
      dh,
    );
    expect(found).not.toBeNull();
    // One card's box (± the dilation margin), never two cards plus the gap.
    expect(found!.aabb.width).toBeGreaterThan(card.w - 8);
    expect(found!.aabb.width).toBeLessThan(card.w + 14);
    expect(found!.aabb.height).toBeGreaterThan(card.h - 8);
    expect(found!.aabb.height).toBeLessThan(card.h + 14);
    expect(found!.precision).toBe("high");
    // And its centre coincides with one of the painted cards.
    const cx = found!.aabb.left + found!.aabb.width / 2;
    const cy = found!.aabb.top + found!.aabb.height / 2;
    expect(
      Math.min(...cards.map((c) => Math.hypot(c.cx - cx, c.cy - cy))),
    ).toBeLessThan(6);
  });

  it("answers nothing when a textured table welds the cards into one blob", () => {
    const dw = 270;
    const dh = 360;
    const gray = paintScene(dw, dh, [
      { ...card, cx: 94, cy: 180 },
      { ...card, cx: 176, cy: 180 },
    ]);
    // Noisy table: dense texture edges everywhere between / around the cards
    // (the real "busy mat" case) — the closed loops break and the scanline
    // fill produces one frame-wide blob whose sides rest on nothing.
    let seed = 7;
    for (let i = 0; i < gray.length; i++) {
      if (gray[i] !== 215) continue;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      gray[i] = 120 + (seed % 120);
    }
    const found = detectCardQuadFromGray(gray, dw, dh, dw, dh);
    if (found) {
      // Whatever survives must be a single card, never the merged pair.
      expect(found.aabb.width).toBeLessThan(card.w + 12);
    }
  });

  it("quadEdgeSupport: 1 on a drawn outline, low on a quad crossing blank space", () => {
    const dw = 100;
    const dh = 100;
    const closed = new Uint8Array(dw * dh);
    for (let x = 20; x <= 60; x++) {
      closed[20 * dw + x] = 1;
      closed[80 * dw + x] = 1;
    }
    for (let y = 20; y <= 80; y++) {
      closed[y * dw + 20] = 1;
      closed[y * dw + 60] = 1;
    }
    const onOutline: [Point2, Point2, Point2, Point2] = [
      { x: 20, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: 80 },
      { x: 20, y: 80 },
    ];
    expect(quadEdgeSupport(onOutline, closed, dw, dh)).toBeGreaterThan(0.95);
    const merged: [Point2, Point2, Point2, Point2] = [
      { x: 20, y: 20 },
      { x: 95, y: 20 },
      { x: 95, y: 80 },
      { x: 20, y: 80 },
    ];
    const sup = quadEdgeSupport(merged, closed, dw, dh);
    expect(sup).toBeLessThan(MIN_FILLED_EDGE_SUPPORT);
    expect(sup).toBeGreaterThan(0.3);
  });
});

describe("rgbaToGray", () => {
  it("packs luminance", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const g = rgbaToGray(rgba, 2, 1);
    expect(g.length).toBe(2);
    expect(g[0]).toBeGreaterThan(50);
    expect(g[1]).toBeGreaterThan(100);
  });
});
