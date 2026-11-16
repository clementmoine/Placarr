import { describe, expect, it } from "vitest";

import {
  DEFAULT_COST_RING_GEOMETRY,
  deriveCostRingGeometry,
  deriveCostRingHoleCenters,
} from "./costRingGeometry";
import {
  FROST_COST_DISC_1,
  frostCostDiscDiameter,
  parseFrostCostDiscTable,
} from "./frostCostDisc";
import { COST_FILL_DRAW_SIZE, FW_PRINT_ASPECT } from "./clientFacePolicy";

describe("costRingGeometry", () => {
  it("derives outer diam from opaque bbox and fill centre from inner rim", () => {
    const w = 16;
    const h = 16;
    const rgba = Buffer.alloc(w * h * 4, 0);
    // 5×5 opaque block centred near (10, 6)
    for (let y = 4; y <= 8; y += 1) {
      for (let x = 8; x <= 12; x += 1) {
        rgba[(y * w + x) * 4 + 3] = 255;
      }
    }
    const geom = deriveCostRingGeometry(rgba, w, h, 32);
    expect(geom.outerDiam).toBe(5);
    expect(geom.outerCenter.x).toBe(10);
    expect(geom.outerCenter.y).toBe(6);
    // Flat block has no dark→bright rim → fill centre falls back to outer.
    expect(geom.center).toEqual(geom.outerCenter);
    expect(geom.fillSize).toBe(32);
    expect(geom.atlasSize).toBe(16);
  });

  it("prefers the inner chrome rim over soft opaque bbox for fill centre", () => {
    const w = 64;
    const h = 64;
    const rgba = Buffer.alloc(w * h * 4, 0);
    const ox = 32;
    const oy = 34; // opaque bbox pulled down by soft fluff
    // Soft opaque fluff below the visual disc.
    for (let y = 18; y <= 50; y += 1) {
      for (let x = 16; x <= 48; x += 1) {
        const d = Math.hypot(x - ox, y - oy);
        if (d > 16) continue;
        const i = (y * w + x) * 4;
        rgba[i] = 20;
        rgba[i + 1] = 20;
        rgba[i + 2] = 20;
        rgba[i + 3] = 40;
      }
    }
    // Hard chrome ring centred higher (oy-2).
    const rimY = oy - 2;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const d = Math.hypot(x - ox, y - rimY);
        if (d < 8 || d > 12) continue;
        const i = (y * w + x) * 4;
        rgba[i] = 180;
        rgba[i + 1] = 180;
        rgba[i + 2] = 180;
        rgba[i + 3] = 255;
      }
    }
    // Dark well inside the rim.
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const d = Math.hypot(x - ox, y - rimY);
        if (d >= 8) continue;
        const i = (y * w + x) * 4;
        rgba[i] = 20;
        rgba[i + 1] = 20;
        rgba[i + 2] = 20;
        rgba[i + 3] = 255;
      }
    }
    const geom = deriveCostRingGeometry(rgba, w, h, 32);
    expect(geom.center.y).toBeLessThan(geom.outerCenter.y);
    expect(Math.abs(geom.center.y - rimY)).toBeLessThan(
      Math.abs(geom.outerCenter.y - rimY),
    );
  });

  it("falls back to StandaloneOSX defaults when empty", () => {
    const empty = Buffer.alloc(8 * 8 * 4, 0);
    expect(deriveCostRingGeometry(empty, 8, 8, 32)).toEqual({
      ...DEFAULT_COST_RING_GEOMETRY,
      atlasSize: 8,
      fillSize: 32,
    });
  });

  it("splits Cost_02-style dark wells into two Y-banded centres", () => {
    const w = 40;
    const h = 80;
    const rgba = Buffer.alloc(w * h * 4, 0);
    const paint = (cx: number, cy: number, r: number) => {
      for (let y = cy - r; y <= cy + r; y += 1) {
        for (let x = cx - r; x <= cx + r; x += 1) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          const i = (y * w + x) * 4;
          rgba[i] = 25;
          rgba[i + 1] = 25;
          rgba[i + 2] = 25;
          rgba[i + 3] = 255;
        }
      }
    };
    paint(20, 20, 8);
    paint(20, 55, 8);
    const holes = deriveCostRingHoleCenters(rgba, w, h, 2);
    expect(holes).toHaveLength(2);
    expect(holes[0]!.y).toBeLessThan(holes[1]!.y);
    expect(Math.abs(holes[0]!.x - 20)).toBeLessThan(2);
    expect(Math.abs(holes[1]!.x - 20)).toBeLessThan(2);
  });

  it("refines Cost_02 centres off the waist so fills sit in each well", () => {
    const w = 64;
    const h = 96;
    const rgba = Buffer.alloc(w * h * 4, 0);
    const paintRing = (cx: number, cy: number, inner: number, outer: number) => {
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const d = Math.hypot(x - cx, y - cy);
          const i = (y * w + x) * 4;
          if (d <= inner) {
            rgba[i] = 20;
            rgba[i + 1] = 20;
            rgba[i + 2] = 20;
            rgba[i + 3] = 255;
          } else if (d <= outer) {
            rgba[i] = 180;
            rgba[i + 1] = 180;
            rgba[i + 2] = 180;
            rgba[i + 3] = 255;
          }
        }
      }
    };
    const top = { x: 28, y: 28 };
    const bot = { x: 36, y: 68 };
    paintRing(top.x, top.y, 10, 14);
    paintRing(bot.x, bot.y, 10, 14);
    // Dark waist between wells — pulls a raw Y-band mean toward the junction.
    for (let y = 38; y <= 58; y += 1) {
      for (let x = 30; x <= 34; x += 1) {
        const i = (y * w + x) * 4;
        rgba[i] = 25;
        rgba[i + 1] = 25;
        rgba[i + 2] = 25;
        rgba[i + 3] = 255;
      }
    }
    const holes = deriveCostRingHoleCenters(rgba, w, h, 2);
    expect(holes).toHaveLength(2);
    expect(Math.abs(holes[0]!.x - top.x)).toBeLessThan(1.5);
    expect(Math.abs(holes[0]!.y - top.y)).toBeLessThan(1.5);
    expect(Math.abs(holes[1]!.x - bot.x)).toBeLessThan(1.5);
    expect(Math.abs(holes[1]!.y - bot.y)).toBeLessThan(1.5);
  });
});

describe("frostCostDisc", () => {
  it("reads cost-1 disc diameter from Frost scaleX", () => {
    expect(frostCostDiscDiameter(512, FROST_COST_DISC_1)).toBeCloseTo(20, 3);
  });

  it("parses offset/scale pairs from FrostCard.frag text", () => {
    const frag = `
      vs_INTERP0.xyxy + vec4(0.328700006, -0.459199995, 0.1, 0.2);
      * vec4(25.5998878, 35.714283, 1.0, 1.0);
      vs_INTERP0.xyxy + vec4(0.321800023, -0.434799999, 0.1, 0.2);
      * vec4(25.5998878, 35.714283, 1.0, 1.0);
    `;
    const discs = parseFrostCostDiscTable(frag);
    expect(discs.length).toBeGreaterThanOrEqual(2);
    expect(discs[0]!.offsetX).toBeCloseTo(0.328700006, 6);
    expect(discs[0]!.scaleX).toBeCloseTo(25.5998878, 4);
  });
});

describe("clientFacePolicy", () => {
  it("keeps Placarr decisions explicit", () => {
    expect(COST_FILL_DRAW_SIZE).toBe(24);
    expect(FW_PRINT_ASPECT).toBeCloseTo(63 / 88, 10);
  });
});
