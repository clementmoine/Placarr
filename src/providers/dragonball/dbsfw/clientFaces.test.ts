import { describe, expect, it } from "vitest";

import {
  clientBattleFrameName,
  clientCostFillName,
  clientCostRingAnchor,
  clientCostRingOffset,
  clientFacePixels,
  blendPlateMips,
  boxFilterRgba,
  clientPlateMipBlend,
  resolvePlateChromeMips,
  compositeCostFill,
  COST_FILL_DRAW_SIZE,
  isolateCostRingDisc,
  clientFrameArrayCandidates,
  fusionWorldFaceLayer,
  premultiplyStraight,
  solidifyPlateInk,
  unpremultiplyStraight,
} from "./clientFaces";

describe("clientFacePixels", () => {
  it("shrinks the 1:2 client texture onto a 63×88 card without enlarging", () => {
    expect(clientFacePixels(512, 1024)).toEqual({ width: 512, height: 715 });
    expect(clientFacePixels(733, 1024)).toEqual({ width: 733, height: 1024 });
    expect(clientFacePixels(800, 1024)).toEqual({ width: 800, height: 1024 });
  });
});

describe("fusionWorldFaceLayer", () => {
  it("pairs the illustration with the language plate, and the reverse face of a double-sided print", () => {
    expect(fusionWorldFaceLayer("SB02-024_Card")).toEqual({
      kind: "picture",
      side: "front",
    });
    expect(fusionWorldFaceLayer("SB02-024_Text_En")).toEqual({
      kind: "text",
      side: "front",
      lang: "en",
    });
    expect(fusionWorldFaceLayer("SB02-024_Text_Ja")?.lang).toBe("ja");
    expect(fusionWorldFaceLayer("ST01-004_front")).toEqual({
      kind: "picture",
      side: "front",
    });
    expect(fusionWorldFaceLayer("FB01-001_Front_Card")?.side).toBe("front");
    expect(fusionWorldFaceLayer("FB01-001_Back_Card")).toEqual({
      kind: "picture",
      side: "back",
    });
    expect(fusionWorldFaceLayer("FB01-001_Back_Text_Ja")).toEqual({
      kind: "text",
      side: "back",
      lang: "ja",
    });
    expect(fusionWorldFaceLayer("FB01-001_Front_Text_En")?.side).toBe("front");
  });

  it("picks the printed chrome array for the card", () => {
    expect(
      clientFrameArrayCandidates({
        cardType: "BATTLE",
        color: "Blue",
        rarity: "C",
        setCode: "fb01",
        parallel: false,
        side: "front",
      }),
    ).toEqual(["Card_Battle_Blue_Frame"]);
    expect(
      clientFrameArrayCandidates({
        cardType: "BATTLE",
        color: "Red",
        rarity: "SR",
        setCode: "st01",
        parallel: false,
        side: "front",
      })[0],
    ).toBe("Card_ST_Battle_Red_Frame");
    expect(
      clientFrameArrayCandidates({
        cardType: "LEADER",
        color: "Red",
        rarity: "L",
        setCode: "fb01",
        parallel: false,
        side: "front",
      }),
    ).toEqual(["Card_LeaderF_Red_Frame"]);
    expect(
      clientFrameArrayCandidates({
        cardType: "LEADER",
        color: "Red",
        rarity: "L",
        setCode: "fb01",
        parallel: false,
        side: "back",
      }),
    ).toEqual(["Card_LeaderB_Red_Frame"]);
  });

  it("fills a gray DXT hole in white text and leaves the dark panel and a coloured badge", () => {
    const rgba = Buffer.alloc(8 * 4);
    // gray hole, then white ink, then a gap, then a dark panel and a blue badge
    rgba.set([140, 140, 140, 250, 255, 255, 255, 255], 0);
    rgba.set([16, 12, 8, 200], 4 * 4);
    rgba.set([40, 90, 210, 255], 5 * 4);
    const solid = solidifyPlateInk(rgba, 8, 1);
    expect([...solid.subarray(0, 4)]).toEqual([255, 255, 255, 250]);
    expect([...solid.subarray(4 * 4, 5 * 4)]).toEqual([16, 12, 8, 200]);
    expect([...solid.subarray(5 * 4, 6 * 4)]).toEqual([40, 90, 210, 255]);
  });

  it("fills a black nick in a silver rim and leaves a lone dark pixel", () => {
    const rgba = Buffer.alloc(3 * 3 * 4);
    const metal = [120, 118, 122, 255];
    rgba.set(metal, 0);
    rgba.set(metal, 4);
    rgba.set([8, 8, 8, 250], 8);
    rgba.set(metal, 12);
    const solid = solidifyPlateInk(rgba, 3, 3);
    expect([...solid.subarray(8, 12)]).toEqual([120, 118, 122, 250]);
    const alone = Buffer.alloc(3 * 4);
    alone.set([8, 8, 8, 250, 120, 118, 122, 255], 0);
    const kept = solidifyPlateInk(alone, 3, 1);
    expect([...kept.subarray(0, 4)]).toEqual([8, 8, 8, 250]);
  });

  it("fills a black DXT endpoint on the stroke and leaves the dark panel", () => {
    const rgba = Buffer.alloc(6 * 4);
    rgba.set([0, 0, 0, 250, 255, 255, 255, 255], 0);
    rgba.set([16, 12, 8, 240], 5 * 4);
    const solid = solidifyPlateInk(rgba, 6, 1);
    expect([...solid.subarray(0, 4)]).toEqual([255, 255, 255, 250]);
    expect([...solid.subarray(5 * 4, 6 * 4)]).toEqual([16, 12, 8, 240]);
  });

  it("blends Unity mip levels for the catalogue plate width", () => {
    expect(clientPlateMipBlend(1024, 1024)).toBe(0);
    expect(clientPlateMipBlend(1024, 512)).toBe(1);
    expect(clientPlateMipBlend(1024, 733)).toBe(1);
    const mixed = blendPlateMips(
      Buffer.from([0, 0, 0, 255]),
      Buffer.from([100, 100, 100, 255]),
      0.5,
    );
    expect([...mixed]).toEqual([50, 50, 50, 255]);
  });

  it("box-filters opaque texels to the catalogue size", () => {
    const src = Buffer.alloc(4 * 4 * 4, 0);
    for (let i = 0; i < 16; i += 1) {
      src[i * 4] = 255;
      src[i * 4 + 3] = 255;
    }
    const out = boxFilterRgba(src, 4, 4, 2, 2);
    expect(out.length).toBe(2 * 2 * 4);
    expect([...out.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it("resolves DXT chrome / alpha stairs toward mip1, keeps flat gem fill", () => {
    const w = 3;
    const h = 3;
    const mip0 = Buffer.alloc(w * h * 4, 0);
    const mip1 = Buffer.alloc(w * h * 4, 0);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const v = (x + y) % 2 === 0 ? 40 : 200;
        mip0[i] = v;
        mip0[i + 1] = v;
        mip0[i + 2] = v;
        mip0[i + 3] = 255;
        mip1[i] = 120;
        mip1[i + 1] = 120;
        mip1[i + 2] = 120;
        mip1[i + 3] = 255;
      }
    }
    // Flat saturated blue fill — must stay on mip0.
    const c = (1 * w + 1) * 4;
    mip0[c] = 30;
    mip0[c + 1] = 80;
    mip0[c + 2] = 200;
    mip0[c + 3] = 255;
    mip1[c] = 0;
    mip1[c + 1] = 0;
    mip1[c + 2] = 0;
    mip1[c + 3] = 255;
    // Neighbours of centre also solid blue so alpha/luma variance is low.
    for (const [x, y] of [
      [0, 1],
      [2, 1],
      [1, 0],
      [1, 2],
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
    ] as const) {
      const i = (y * w + x) * 4;
      mip0[i] = 30;
      mip0[i + 1] = 80;
      mip0[i + 2] = 200;
      mip0[i + 3] = 255;
    }
    const flat = resolvePlateChromeMips(mip0, mip1, w, h);
    expect([...flat.subarray(c, c + 4)]).toEqual([30, 80, 200, 255]);

    // Silhouette: opaque blue next to clear — alpha variance pulls mip1.
    const edge = Buffer.from(mip0);
    const clear = (0 * w + 0) * 4;
    edge[clear + 3] = 0;
    const soft = Buffer.alloc(w * h * 4, 0);
    for (let i = 0; i < soft.length; i += 4) {
      soft[i] = 40;
      soft[i + 1] = 90;
      soft[i + 2] = 180;
      soft[i + 3] = 128;
    }
    const resolved = resolvePlateChromeMips(edge, soft, w, h);
    const neighbour = (0 * w + 1) * 4;
    expect(resolved[neighbour + 3]).toBe(128);
  });

  it("weights colour by coverage and restores it", () => {
    const covered = premultiplyStraight(Buffer.from([255, 255, 255, 128]));
    expect([...covered]).toEqual([128, 128, 128, 128]);
    expect([...unpremultiplyStraight(covered)]).toEqual([255, 255, 255, 128]);
  });

  it("places the cost ring on the printed card", () => {
    const placed = clientCostRingOffset(733, 1024);
    const anchor = clientCostRingAnchor();
    const applied = Math.round(220 * placed.scale) / 220;
    const centerX = placed.left + anchor.x * applied;
    const centerY = placed.top + anchor.y * applied;
    expect(Math.abs(centerX - 733 * (0.5 - 0.328700006))).toBeLessThan(0.5);
    expect(Math.abs(centerY - 1024 * (0.5 - 0.459199995))).toBeLessThan(0.5);
    // Fill slot (32 px) matches Frost disc; chrome (~44) scales with it.
    expect(32 * placed.scale).toBeCloseTo(733 / 25.5998878, 6);
    expect(1024 / 35.714283).toBeCloseTo(733 / 25.5998878, 0);
    // Outer chrome on-card ≈ frostDiam * (44/32) ≈ 27.5 @ 512.
    expect(44 * placed.scale).toBeCloseTo((733 / 25.5998878) * (44 / 32), 5);
    expect(clientCostFillName("Blue")).toBe("CostFrame_Blue");
    expect(clientCostFillName("ALL")).toBeNull();
    const ring = Buffer.alloc(4);
    ring.set([8, 8, 8, 255]);
    const filled = compositeCostFill(
      ring,
      1,
      1,
      Buffer.from([10, 20, 200, 255]),
      1,
      1,
      0.5,
      0.5,
    );
    expect([...filled]).toEqual([10, 20, 200, 255]);
  });

  it("clears Cost_01 atlas fluff outside the Frost disc", () => {
    const w = 8;
    const h = 8;
    const rgba = Buffer.alloc(w * h * 4, 0);
    // Disc centre pixel.
    rgba.set([20, 20, 20, 255], (3 * w + 3) * 4);
    // Atlas junk far from centre.
    rgba.set([80, 80, 80, 200], (0 * w + 7) * 4);
    const cleared = isolateCostRingDisc(rgba, w, h, 3.5, 3.5, 2, 0.5);
    expect([...cleared.subarray((3 * w + 3) * 4, (3 * w + 3) * 4 + 4)]).toEqual([
      20, 20, 20, 255,
    ]);
    expect([...cleared.subarray((0 * w + 7) * 4, (0 * w + 7) * 4 + 4)]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("keeps cost fill draw size below the Frost slot and CostFrame disc", () => {
    expect(COST_FILL_DRAW_SIZE).toBeLessThan(32);
    expect(COST_FILL_DRAW_SIZE).toBeGreaterThan(16);
  });

  it("feathers the Cost_01 disc edge instead of a hard cut", () => {
    const w = 8;
    const h = 8;
    const rgba = Buffer.alloc(w * h * 4, 0);
    // Pixel just outside radius 2 from (3.5,3.5) → dist≈2.12 with feather 1.
    rgba.set([40, 40, 40, 255], (5 * w + 3) * 4);
    const cleared = isolateCostRingDisc(rgba, w, h, 3.5, 3.5, 2, 1);
    const a = cleared[(5 * w + 3) * 4 + 3]!;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(255);
  });

  it("names the printed header from the card colour and cost", () => {
    expect(clientBattleFrameName("BATTLE", "Blue", "1")).toBe("Blue_01_cost1");
    expect(clientBattleFrameName("EXTRA", "Yellow", "2")).toBe(
      "Yellow_01_cost2",
    );
    expect(clientBattleFrameName("LEADER", "Red", null)).toBeNull();
    expect(clientBattleFrameName("BATTLE", "ALL", "1")).toBeNull();
    expect(clientBattleFrameName("ENERGY MARKER", null, null)).toBeNull();
  });

  it("drops holo washes, masks and thumbnails", () => {
    expect(fusionWorldFaceLayer("ST01-004_Back")).toBeNull();
    expect(fusionWorldFaceLayer("E-111_PARA_Back")).toBeNull();
    expect(fusionWorldFaceLayer("ST01-004_Holo")).toBeNull();
    expect(fusionWorldFaceLayer("ST01-004_Foil_En")).toBeNull();
    expect(fusionWorldFaceLayer("ef_mask01")).toBeNull();
    expect(fusionWorldFaceLayer("ST01-004_Thumbnail")).toBeNull();
    expect(fusionWorldFaceLayer("ST01-004_Front_010_alp_mi")).toBeNull();
  });
});
