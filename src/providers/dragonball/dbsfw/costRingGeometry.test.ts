import { describe, expect, it } from "vitest";

import {
  DEFAULT_COST_RING_GEOMETRY,
  deriveCostRingGeometry,
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
    expect(COST_FILL_DRAW_SIZE).toBe(20);
    expect(FW_PRINT_ASPECT).toBeCloseTo(63 / 88, 10);
  });
});
