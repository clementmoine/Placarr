import { describe, expect, it } from "vitest";

import {
  CARD_GUIDE_WIDTH_FRAC,
  OCR_BAND_HEIGHT,
  OCR_BAND_INSET_X,
  mapRoiCornersToObjectCover,
  mapVideoRectToObjectCover,
  ocrBandNorm,
  ocrBandWithinCard,
} from "./scanVisionOverlay";

describe("ocrBandNorm", () => {
  it("matches collectorBandRect fractions inside a unit card", () => {
    const r = ocrBandNorm({ x: 0, y: 0, w: 1, h: 1 });
    expect(r.x).toBeCloseTo(OCR_BAND_INSET_X);
    expect(r.w).toBeCloseTo(1 - OCR_BAND_INSET_X * 2);
    expect(r.h).toBeCloseTo(OCR_BAND_HEIGHT);
    expect(r.y).toBeCloseTo(1 - OCR_BAND_HEIGHT);
  });

  it("scales within an offset card rect", () => {
    const r = ocrBandNorm({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
    expect(r.x).toBeCloseTo(0.1 + 0.5 * OCR_BAND_INSET_X);
    expect(r.y + r.h).toBeCloseTo(0.2 + 0.6);
  });
});

describe("ocrBandWithinCard", () => {
  it("exposes CSS percentages for the guide child", () => {
    const css = ocrBandWithinCard();
    expect(css.left).toBe("4%");
    expect(css.right).toBe("4%");
    expect(css.height).toBe("12%");
    expect(css.bottom).toBe("0%");
  });
});

describe("mapVideoRectToObjectCover", () => {
  it("identity when element matches video and no crop", () => {
    const r = mapVideoRectToObjectCover(
      {
        videoWidth: 100,
        videoHeight: 100,
        clientWidth: 100,
        clientHeight: 100,
      },
      { x: 10, y: 20, width: 30, height: 40 },
    );
    expect(r).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  });

  it("accounts for horizontal letterbox crop under cover", () => {
    // video 200×100, element 100×100 → scale=1, drawn 200×100, offsetX=-50
    const r = mapVideoRectToObjectCover(
      {
        videoWidth: 200,
        videoHeight: 100,
        clientWidth: 100,
        clientHeight: 100,
      },
      { x: 50, y: 0, width: 100, height: 100 },
    );
    expect(r).not.toBeNull();
    expect(r!.x).toBeCloseTo(0);
    expect(r!.w).toBeCloseTo(1);
  });

  it("returns null when video not ready", () => {
    expect(
      mapVideoRectToObjectCover(
        {
          videoWidth: 0,
          videoHeight: 0,
          clientWidth: 100,
          clientHeight: 100,
        },
        { x: 0, y: 0, width: 10, height: 10 },
      ),
    ).toBeNull();
  });
});

describe("mapRoiCornersToObjectCover", () => {
  it("maps ROI corners through the 78% card guide", () => {
    const video = {
      videoWidth: 1000,
      videoHeight: 1000,
      clientWidth: 1000,
      clientHeight: 1000,
    };
    const corners = [
      { x: 0, y: 0 },
      { x: 96, y: 0 },
      { x: 96, y: 96 },
      { x: 0, y: 96 },
    ];
    const mapped = mapRoiCornersToObjectCover(video, corners, 96);
    expect(mapped).not.toBeNull();
    const guideW = CARD_GUIDE_WIDTH_FRAC;
    expect(mapped![0]!.x).toBeCloseTo((1 - guideW) / 2, 2);
    expect(mapped![1]!.x).toBeCloseTo((1 - guideW) / 2 + guideW, 2);
  });
});
