import { describe, expect, it } from "vitest";

import { CLIENT_FACE_BAKE_ID } from "./clientFacePolicy";

import {
  clientBattleFrameName,
  clientCostNumberSpriteName,
  clientCostFillName,
  clientCostRingAnchor,
  clientCostRingName,
  clientCostRingOffset,
  specifiedCostPipCount,
  clientFacePixels,
  compositeCostFill,
  COST_FILL_DRAW_SIZE,
  isolateCostRingDisc,
  isClientFaceExtractCurrent,
  clientFrameArrayCandidates,
  fusionWorldFaceLayer,
} from "./clientFaces";

describe("clientFacePixels", () => {
  it("widens the 1:2 client texture onto a 63×88 card (733×1024)", () => {
    expect(clientFacePixels(512, 1024)).toEqual({ width: 733, height: 1024 });
    expect(clientFacePixels(733, 1024)).toEqual({ width: 733, height: 1024 });
    expect(clientFacePixels(800, 1024)).toEqual({ width: 800, height: 1024 });
  });
});

describe("isClientFaceExtractCurrent", () => {
  it("rejects pre-split art.client without Frost layers", () => {
    expect(
      isClientFaceExtractCurrent(new Set(["art.client.webp"]), "front", true),
    ).toBe(false);
  });

  it("requires costRing and badge when the card has a cost gem", () => {
    const base = new Set([
      "art.client.webp",
      "layer.picture.webp",
      "layer.text.webp",
      "layer.picture.dxt5",
      "layers.s3tc.json",
      "layers.compose.json",
    ]);
    expect(isClientFaceExtractCurrent(base, "front", false)).toBe(true);
    expect(isClientFaceExtractCurrent(base, "front", true)).toBe(false);
    base.add("layer.costRing.webp");
    expect(isClientFaceExtractCurrent(base, "front", true)).toBe(false);
    base.add("layer.badge.webp");
    expect(isClientFaceExtractCurrent(base, "front", true)).toBe(true);
  });

  it("requires layer.middle when Material Card shows MiddleTex", () => {
    const base = new Set([
      "art.client.webp",
      "layer.picture.webp",
      "layer.text.webp",
      "layer.picture.dxt5",
      "layers.s3tc.json",
      "layers.compose.json",
    ]);
    expect(isClientFaceExtractCurrent(base, "front", false, true)).toBe(false);
    base.add("layer.middle.webp");
    expect(isClientFaceExtractCurrent(base, "front", false, true)).toBe(true);
  });

  it("requires frameTop.dxt5 when frameTop.webp is present", () => {
    const base = new Set([
      "art.client.webp",
      "layer.picture.webp",
      "layer.text.webp",
      "layer.picture.dxt5",
      "layers.s3tc.json",
      "layers.compose.json",
      "layer.frameTop.webp",
    ]);
    expect(isClientFaceExtractCurrent(base, "front", false)).toBe(false);
    base.add("layer.frameTop.dxt5");
    expect(isClientFaceExtractCurrent(base, "front", false)).toBe(true);
  });

  it("requires picture DXT + layers.s3tc.json + layers.compose.json for front", () => {
    const base = new Set([
      "art.client.webp",
      "layer.picture.webp",
      "layer.text.webp",
    ]);
    expect(isClientFaceExtractCurrent(base, "front", false)).toBe(false);
    base.add("layer.picture.dxt5");
    expect(isClientFaceExtractCurrent(base, "front", false)).toBe(false);
    base.add("layers.s3tc.json");
    expect(isClientFaceExtractCurrent(base, "front", false)).toBe(false);
    base.add("layers.compose.json");
    expect(isClientFaceExtractCurrent(base, "front", false)).toBe(true);
  });

  it("n'accepte que le bake CPU conforme (décodeur bcn + Lanczos) sur le chemin extract", () => {
    const base = new Set([
      "art.client.webp",
      "layer.picture.webp",
      "layer.text.webp",
      "layer.picture.dxt5",
      "layers.s3tc.json",
      "layers.compose.json",
    ]);
    expect(
      isClientFaceExtractCurrent(base, "front", false, false, undefined, null),
    ).toBe(false);
    expect(
      isClientFaceExtractCurrent(base, "front", false, false, undefined, "cpu"),
    ).toBe(false);
    // Anciens bakes : WebGL (Chrome) et CPU au décodeur unity-js-tools (tramé).
    expect(
      isClientFaceExtractCurrent(base, "front", false, false, undefined, "gpu"),
    ).toBe(false);
    expect(
      isClientFaceExtractCurrent(
        base,
        "front",
        false,
        false,
        undefined,
        CLIENT_FACE_BAKE_ID,
      ),
    ).toBe(true);
  });

  it("rejects pre-widen layout (512×715 shrink)", () => {
    const base = new Set([
      "art.client.webp",
      "layer.picture.webp",
      "layer.text.webp",
      "layer.picture.dxt5",
      "layers.s3tc.json",
      "layers.compose.json",
    ]);
    expect(
      isClientFaceExtractCurrent(
        base,
        "front",
        false,
        false,
        undefined,
        CLIENT_FACE_BAKE_ID,
        "print-shrink",
      ),
    ).toBe(false);
    expect(
      isClientFaceExtractCurrent(
        base,
        "front",
        false,
        false,
        undefined,
        CLIENT_FACE_BAKE_ID,
        "print-widen",
      ),
    ).toBe(true);
  });

  it("rejects pre-display-bytes tone (mixed DXT sRGB + raw RGBA)", () => {
    const base = new Set([
      "art.client.webp",
      "layer.picture.webp",
      "layer.text.webp",
      "layer.picture.dxt5",
      "layers.s3tc.json",
      "layers.compose.json",
    ]);
    expect(
      isClientFaceExtractCurrent(
        base,
        "front",
        false,
        false,
        undefined,
        CLIENT_FACE_BAKE_ID,
        "print-widen",
        null,
      ),
    ).toBe(false);
    expect(
      isClientFaceExtractCurrent(
        base,
        "front",
        false,
        false,
        undefined,
        CLIENT_FACE_BAKE_ID,
        "print-widen",
        "display-bytes",
      ),
    ).toBe(false);
    expect(
      isClientFaceExtractCurrent(
        base,
        "front",
        false,
        false,
        undefined,
        CLIENT_FACE_BAKE_ID,
        "print-widen",
        "display-bytes-v2",
      ),
    ).toBe(true);
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
    expect(fusionWorldFaceLayer("SB02-024_Text_Ja")).toMatchObject({
      lang: "ja",
    });
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
    expect([...cleared.subarray((3 * w + 3) * 4, (3 * w + 3) * 4 + 4)]).toEqual(
      [20, 20, 20, 255],
    );
    expect([...cleared.subarray((0 * w + 7) * 4, (0 * w + 7) * 4 + 4)]).toEqual(
      [0, 0, 0, 0],
    );
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

  it("names the BC7 layout atlas from colour, cost and specified-cost pips", () => {
    expect(clientBattleFrameName("BATTLE", "Blue", "1")).toBe("Blue_01_cost1");
    expect(clientBattleFrameName("EXTRA", "Yellow", "2")).toBe(
      "Yellow_01_cost2",
    );
    expect(clientBattleFrameName("BATTLE", "Yellow", "5", "YY")).toBe(
      "Yellow_02_cost5",
    );
    expect(clientBattleFrameName("BATTLE", "Red", "3", "RRR")).toBe(
      "Red_03_cost3",
    );
    expect(clientBattleFrameName("LEADER", "Red", null)).toBeNull();
    expect(clientBattleFrameName("BATTLE", "ALL", "1")).toBeNull();
    expect(clientBattleFrameName("ENERGY MARKER", null, null)).toBeNull();
  });

  it("names the Bandai-flat BattleCard CostNumber sprite (not BC7 bevel atlas)", () => {
    expect(clientCostNumberSpriteName("BATTLE", "Yellow", "5")).toBe(
      "BattleCard_Yellow_01_cost5",
    );
    expect(clientCostNumberSpriteName("EXTRA", "Blue", "2")).toBe(
      "BattleCard_Blue_01_cost2",
    );
    expect(clientCostNumberSpriteName("LEADER", "Red", "1")).toBeNull();
  });

  it("maps specified-cost length to Cost_0N chrome", () => {
    expect(specifiedCostPipCount("Y")).toBe(1);
    expect(specifiedCostPipCount("YY")).toBe(2);
    expect(specifiedCostPipCount("RRR")).toBe(3);
    expect(specifiedCostPipCount(null)).toBe(1);
    expect(clientCostRingName("YY")).toBe("Cost_02");
    expect(clientCostRingName("Y")).toBe("Cost_01");
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
