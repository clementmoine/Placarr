import { describe, expect, it } from "vitest";

import {
  USABLE_SUBJECT,
  isUsableSubject,
} from "@/lib/client/scan/isUsableSubject";

/** Axis-aligned w × h quad centred at (cx, cy), rotated by `deg`. */
function quad(w: number, h: number, deg = 0, cx = 500, cy = 500) {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([u, v]) => ({
    x: cx + u! * cos - v! * sin,
    y: cy + u! * sin + v! * cos,
  }));
}

function aabbOf(corners: ReturnType<typeof quad>) {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

describe("isUsableSubject", () => {
  it("accepts a portrait card window in the live coverage band", () => {
    expect(
      isUsableSubject({
        coverage: 0.4,
        aabb: { width: 200, height: 280 },
      }),
    ).toBe(true);
  });

  it.each([
    { name: "upright", deg: 0 },
    { name: "tilted 30°", deg: 30 },
    // AABB is square here, the quad is still a card.
    { name: "tilted 45°", deg: 45 },
    { name: "lying on its side (landscape card)", deg: 90 },
  ])("accepts a card quad $name", ({ deg }) => {
    const corners = quad(200, 280, deg);
    expect(
      isUsableSubject({ coverage: 0.4, aabb: aabbOf(corners), corners }),
    ).toBe(true);
  });

  it.each([
    {
      name: "too small coverage",
      m: { coverage: 0.05, aabb: { width: 200, height: 280 } },
    },
    {
      name: "desk-swallowing coverage",
      m: { coverage: 0.9, aabb: { width: 200, height: 280 } },
    },
    {
      name: "tiny aabb",
      m: { coverage: 0.4, aabb: { width: 20, height: 40 } },
    },
    {
      name: "square window (no card is square)",
      m: { coverage: 0.4, aabb: { width: 240, height: 240 } },
    },
    {
      name: "band far wider than a card (welded neighbours, desk edge)",
      m: { coverage: 0.4, aabb: { width: 700, height: 200 } },
    },
  ])("rejects $name", ({ m }) => {
    expect(isUsableSubject(m)).toBe(false);
  });

  it("rejects a quad band even when its bounding box looks card-shaped", () => {
    // 700 × 200 strip rotated 45°: AABB ≈ 636 × 636 → the sides tell the truth.
    const corners = quad(700, 200, 45);
    expect(
      isUsableSubject({ coverage: 0.4, aabb: aabbOf(corners), corners }),
    ).toBe(false);
  });

  it("exposes shared thresholds for overlay + crop", () => {
    expect(USABLE_SUBJECT.minCoverage).toBe(0.08);
    expect(USABLE_SUBJECT.maxCoverage).toBe(0.78);
  });
});
