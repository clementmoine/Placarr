import { describe, expect, it } from "vitest";

import {
  heatmapCardCorners,
  heatmapCentroids,
  quadLooksLikeCard,
} from "./cardQuadOnnx";

const H = 32;
const W = 32;

/** Planar [1,4,H,W] heat map with Gaussian-ish blobs per channel. */
function heat(
  blobs: Array<Array<{ x: number; y: number; peak: number; r: number }>>,
): Float32Array {
  const out = new Float32Array(4 * H * W);
  blobs.forEach((list, c) => {
    for (const b of list) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const d2 = (x - b.x) ** 2 + (y - b.y) ** 2;
          const v = b.peak * Math.exp(-d2 / (2 * b.r * b.r));
          const i = c * H * W + y * W + x;
          out[i] = Math.max(out[i]!, v);
        }
      }
    }
  });
  return out;
}

describe("heatmapCentroids", () => {
  it("returns the blob centre for a clean single-card map", () => {
    const h = heat([
      [{ x: 5, y: 5, peak: 0.9, r: 1.5 }],
      [{ x: 26, y: 5, peak: 0.9, r: 1.5 }],
      [{ x: 26, y: 27, peak: 0.9, r: 1.5 }],
      [{ x: 5, y: 27, peak: 0.9, r: 1.5 }],
    ]);
    const c = heatmapCentroids(h, [1, 4, H, W]);
    expect(c).not.toBeNull();
    expect(c![0]!.x * W).toBeCloseTo(5, 0);
    expect(c![0]!.y * H).toBeCloseTo(5, 0);
    expect(c![2]!.x * W).toBeCloseTo(26, 0);
    expect(c![2]!.y * H).toBeCloseTo(27, 0);
  });

  it("picks the largest blob instead of averaging two cards into the void", () => {
    // TL channel: big blob for the aimed card at (8,8), a faint small one
    // for a neighbour at (28,28). A global centroid would land mid-way.
    const h = heat([
      [
        { x: 8, y: 8, peak: 0.9, r: 2 },
        { x: 28, y: 28, peak: 0.6, r: 0.9 },
      ],
      [{ x: 26, y: 5, peak: 0.9, r: 1.5 }],
      [{ x: 26, y: 27, peak: 0.9, r: 1.5 }],
      [{ x: 5, y: 27, peak: 0.9, r: 1.5 }],
    ]);
    const c = heatmapCentroids(h, [1, 4, H, W]);
    expect(c).not.toBeNull();
    expect(c![0]!.x * W).toBeCloseTo(8, 0);
    expect(c![0]!.y * H).toBeCloseTo(8, 0);
  });

  it("is an honest miss when one corner channel is silent", () => {
    const h = heat([
      [],
      [{ x: 26, y: 5, peak: 0.9, r: 1.5 }],
      [{ x: 26, y: 27, peak: 0.9, r: 1.5 }],
      [{ x: 5, y: 27, peak: 0.9, r: 1.5 }],
    ]);
    expect(heatmapCentroids(h, [1, 4, H, W])).toBeNull();
  });
});

describe("heatmapCardCorners", () => {
  // 32×32 map rendered for a 320×480 frame: card ≈ 210×330 px, upright.
  const FW = 320;
  const FH = 480;
  const tr = { x: 26, y: 5, peak: 0.9, r: 1.5 };
  const br = { x: 26, y: 27, peak: 0.9, r: 1.5 };
  const bl = { x: 5, y: 27, peak: 0.9, r: 1.5 };

  it("keeps the official largest-blob pick when it is card-shaped", () => {
    const h = heat([[{ x: 5, y: 5, peak: 0.9, r: 1.5 }], [tr], [br], [bl]]);
    const c = heatmapCardCorners(h, [1, 4, H, W], FW, FH);
    expect(c).not.toBeNull();
    expect(c![0].x / (FW / W)).toBeCloseTo(5, 0);
    expect(c![0].y / (FH / H)).toBeCloseTo(5, 0);
  });

  it("completes a faint corner from the other three (dark edge on dark table)", () => {
    // TL channel: a decoy above threshold far from the card, the real
    // corner only a faint bump (the busy-poster client failure).
    const h = heat([
      [
        { x: 12, y: 16, peak: 0.5, r: 1.5 },
        { x: 5, y: 5, peak: 0.2, r: 1.5 },
      ],
      [tr],
      [br],
      [bl],
    ]);
    // Official pick alone is a wedge → rejected.
    const official = heatmapCentroids(h, [1, 4, H, W])!;
    expect(
      quadLooksLikeCard(
        official.map((p) => ({ x: p.x * FW, y: p.y * FH })) as [
          { x: number; y: number },
          { x: number; y: number },
          { x: number; y: number },
          { x: number; y: number },
        ],
        FW,
        FH,
      ),
    ).toBe(false);
    const c = heatmapCardCorners(h, [1, 4, H, W], FW, FH);
    expect(c).not.toBeNull();
    expect(c![0].x / (FW / W)).toBeCloseTo(5, 0);
    expect(c![0].y / (FH / H)).toBeCloseTo(5, 0);
  });

  it("completes a fully silent channel only when a faint bump confirms it", () => {
    const silent = heat([[], [tr], [br], [bl]]);
    expect(heatmapCardCorners(silent, [1, 4, H, W], FW, FH)).toBeNull();
    const faint = heat([
      [{ x: 5, y: 5, peak: 0.18, r: 1.5 }],
      [tr],
      [br],
      [bl],
    ]);
    const c = heatmapCardCorners(faint, [1, 4, H, W], FW, FH);
    expect(c).not.toBeNull();
    expect(c![0].x / (FW / W)).toBeCloseTo(5, 0);
  });

  it("does not invent a corner from a faint bump far from the prediction", () => {
    const h = heat([[{ x: 20, y: 14, peak: 0.2, r: 1.5 }], [tr], [br], [bl]]);
    expect(heatmapCardCorners(h, [1, 4, H, W], FW, FH)).toBeNull();
  });

  it("stays an honest miss when two channels are silent", () => {
    const h = heat([[], [], [br], [bl]]);
    expect(heatmapCardCorners(h, [1, 4, H, W], FW, FH)).toBeNull();
  });
});

describe("quadLooksLikeCard", () => {
  const rotated = (deg: number, w = 300, h = 420) => {
    const a = (deg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const pt = (u: number, v: number) => ({
      x: 400 + u * cos - v * sin,
      y: 600 + u * sin + v * cos,
    });
    return [
      pt(-w / 2, -h / 2),
      pt(w / 2, -h / 2),
      pt(w / 2, h / 2),
      pt(-w / 2, h / 2),
    ] as [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ];
  };

  it.each([0, 20, 40, 45])(
    "accepts a 63:88 card tilted %i° (square AABB ok)",
    (deg) => {
      expect(quadLooksLikeCard(rotated(deg), 800, 1200)).toBe(true);
    },
  );

  it("rejects a square and a triangle-ish quad", () => {
    expect(quadLooksLikeCard(rotated(0, 400, 400), 800, 1200)).toBe(false);
    const wedge = rotated(0);
    wedge[1] = { x: wedge[0].x + 40, y: wedge[0].y };
    expect(quadLooksLikeCard(wedge, 800, 1200)).toBe(false);
  });

  it("rejects quads that are too small or fill the frame", () => {
    expect(quadLooksLikeCard(rotated(0, 60, 84), 800, 1200)).toBe(false);
    expect(quadLooksLikeCard(rotated(0, 790, 1190), 800, 1200)).toBe(false);
  });
});
