import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  CARD_FACE_RATIO,
  buildCardIdentifyViews,
  cardAspectRect,
  finalizeIdentifyConfidence,
  mergeCardIdentifyMatches,
  pickHybridIdentifyMatches,
  planCardIdentifyRects,
} from "./cardIdentifyViews";

describe("cardAspectRect", () => {
  it("inscribes a 63/88 window in a landscape frame", () => {
    const rect = cardAspectRect(1280, 720, { cover: 1, id: "max" });
    expect(rect.height).toBe(720);
    expect(rect.width).toBe(Math.round(720 * CARD_FACE_RATIO));
    expect(rect.top).toBe(0);
    expect(rect.left).toBeGreaterThan(0);
  });

  it("shifts left within slack when offsetX is negative", () => {
    const center = cardAspectRect(1000, 800, { cover: 0.6, offsetX: 0 });
    const left = cardAspectRect(1000, 800, { cover: 0.6, offsetX: -1 });
    expect(left.left).toBeLessThan(center.left);
    expect(left.left).toBe(0);
  });
});

describe("planCardIdentifyRects", () => {
  it("includes full frame plus a couple of card windows", () => {
    const rects = planCardIdentifyRects(640, 480);
    expect(rects[0]?.id).toBe("full");
    expect(rects.length).toBeGreaterThanOrEqual(2);
    expect(rects.some((r) => r.id === "card_max")).toBe(true);
    expect(new Set(rects.map((r) => r.id)).size).toBe(rects.length);
  });

  it("stays empty on tiny images", () => {
    expect(planCardIdentifyRects(8, 8)).toEqual([]);
  });
});

describe("mergeCardIdentifyMatches", () => {
  it("keeps the lowest distance per printKey across views", () => {
    const merged = mergeCardIdentifyMatches(
      [
        [
          { printKey: "lorcana:1-1", distance: 120 },
          { printKey: "lorcana:1-2", distance: 80 },
        ],
        [
          { printKey: "lorcana:1-1", distance: 20 },
          { printKey: "lorcana:1-3", distance: 90 },
        ],
      ],
      { limit: 5, minMargin: 30 },
    );
    expect(merged[0]).toMatchObject({
      printKey: "lorcana:1-1",
      distance: 20,
    });
    expect(merged.map((m) => m.printKey)).toEqual([
      "lorcana:1-1",
      "lorcana:1-2",
      "lorcana:1-3",
    ]);
  });

  it("marks ambiguous when top-2 are within minMargin", () => {
    const merged = mergeCardIdentifyMatches(
      [
        [
          { printKey: "a", distance: 10 },
          { printKey: "b", distance: 15 },
        ],
      ],
      { minMargin: 20 },
    );
    expect(merged.every((m) => m.ambiguous)).toBe(true);
  });
});

describe("buildCardIdentifyViews abstain", () => {
  it("refuses a solid black frame (no invented matches)", async () => {
    const black = await sharp({
      create: {
        width: 320,
        height: 480,
        channels: 3,
        background: { r: 4, g: 4, b: 4 },
      },
    })
      .jpeg()
      .toBuffer();
    const built = await buildCardIdentifyViews(black);
    expect(built.views).toEqual([]);
    expect(built.abstain).toBe("too_dark");
  });
});

describe("pickHybridIdentifyMatches", () => {
  it("marks hybrid doubt when CLIP and dHash both sharp but disagree", () => {
    const picked = pickHybridIdentifyMatches(
      [{ printKey: "lorcana:1-1", distance: 40 }],
      [{ printKey: "lorcana:1-9", distance: 3 }],
    );
    expect(picked.method).toBe("hybrid");
    expect(picked.matches.every((m) => m.ambiguous)).toBe(true);
    expect(picked.matches.map((m) => m.printKey).sort()).toEqual([
      "lorcana:1-1",
      "lorcana:1-9",
    ]);
  });

  it("abstains when CLIP and dHash disagree across games", () => {
    // Live Pendard / Shikamaru: mixing Lorcana+YGO or Naruto+DBS in one
    // carousel is worse than an honest miss.
    const picked = pickHybridIdentifyMatches(
      [
        { printKey: "lorcana:3-126", distance: 160 },
        { printKey: "lorcana:3-100", distance: 170 },
      ],
      [{ printKey: "yugioh:mzmu-fr004", distance: 5 }],
    );
    expect(picked.method).toBe("hybrid");
    expect(picked.matches).toEqual([]);
  });

  it("abstains on Naruto photo ranked as soft DBS neighbors", () => {
    const picked = pickHybridIdentifyMatches(
      [
        { printKey: "dbscg:bt20-129", distance: 150 },
        { printKey: "dbscg:ex03-16", distance: 160 },
      ],
      [{ printKey: "dbslamincards:1-10", distance: 11 }],
      { embedSoftDistance: 200, dhashSharpDistance: 6 },
    );
    // Clear CLIP + soft dHash, different printGame → cross-game miss.
    expect(picked.matches).toEqual([]);
  });

  it("keeps a soft-but-real Lorcana hit around milli 200", () => {
    const picked = pickHybridIdentifyMatches(
      [
        { printKey: "lorcana:2-66", distance: 200 },
        { printKey: "lorcana:11-95", distance: 313 },
      ],
      [{ printKey: "lorcana:2-66", distance: 9 }],
      { embedSoftDistance: 200, dhashSharpDistance: 6 },
    );
    expect(picked.matches[0]?.printKey).toBe("lorcana:2-66");
  });

  it("still trusts sharp dHash when soft CLIP agrees on the same printKey", () => {
    const picked = pickHybridIdentifyMatches(
      [
        { printKey: "lorcana:1-51", distance: 300 },
        { printKey: "lorcana:1-50", distance: 320 },
      ],
      [{ printKey: "lorcana:1-51", distance: 5 }],
    );
    expect(picked.method).toBe("dhash");
    expect(picked.matches[0]?.printKey).toBe("lorcana:1-51");
  });

  it("abstains on soft embed-only (no dHash) — cross-game CLIP neighbors", () => {
    // DBS live frame while only Lorcana has embeddings: soft nearest
    // neighbors must not become a "plusieurs possibilités" carousel.
    const picked = pickHybridIdentifyMatches(
      [
        { printKey: "lorcana:1-10", distance: 300 },
        { printKey: "lorcana:2-20", distance: 310 },
        { printKey: "lorcana:3-30", distance: 320 },
      ],
      null,
    );
    expect(picked.matches).toEqual([]);
    expect(picked.method).toBe("embed");
  });

  it("keeps a clear embed-only shortlist when CLIP is sharp enough", () => {
    const picked = pickHybridIdentifyMatches(
      [
        { printKey: "lorcana:1-177", distance: 120 },
        { printKey: "lorcana:1-178", distance: 160 },
      ],
      null,
    );
    expect(picked.method).toBe("embed");
    expect(picked.matches.map((m) => m.printKey)).toEqual([
      "lorcana:1-177",
      "lorcana:1-178",
    ]);
  });

  it("keeps soft-but-real live Lorcana hits around milli 250 (Jafar-class)", () => {
    const picked = pickHybridIdentifyMatches(
      [
        { printKey: "lorcana:2-184", distance: 250 },
        { printKey: "lorcana:2-185", distance: 290 },
      ],
      null,
    );
    expect(picked.method).toBe("embed");
    expect(picked.matches[0]?.printKey).toBe("lorcana:2-184");
  });

  it("abstains when soft CLIP and soft dHash disagree (no clear signal)", () => {
    const picked = pickHybridIdentifyMatches(
      [{ printKey: "lorcana:1-10", distance: 250 }],
      [{ printKey: "dbsjcc:part1-d0001", distance: 12 }],
    );
    expect(picked.matches).toEqual([]);
  });
});

describe("finalizeIdentifyConfidence", () => {
  it("returns a single sure card when distance and margin are clear", () => {
    const out = finalizeIdentifyConfidence(
      [
        { printKey: "lorcana:1-1", distance: 2 },
        { printKey: "lorcana:1-2", distance: 8 },
      ],
      "dhash",
    );
    expect(out.confidence).toBe("sure");
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]?.printKey).toBe("lorcana:1-1");
  });

  it("keeps a doubt carousel when the margin is thin", () => {
    const out = finalizeIdentifyConfidence(
      [
        { printKey: "a", distance: 3 },
        { printKey: "b", distance: 4 },
      ],
      "dhash",
    );
    expect(out.confidence).toBe("doubt");
    expect(out.matches).toHaveLength(2);
    expect(out.matches.every((m) => m.ambiguous)).toBe(true);
  });

  it("drops far FP neighbors from a doubt carousel", () => {
    // Shikamaru twins close; Tenten far — trim, don't ask the user about Tenten.
    const out = finalizeIdentifyConfidence(
      [
        { printKey: "naruto:uc-0022", distance: 40, ambiguous: true },
        { printKey: "naruto:uc-0021", distance: 55, ambiguous: true },
        { printKey: "naruto:uc-0082", distance: 180, ambiguous: true },
      ],
      "embed",
    );
    expect(out.confidence).toBe("doubt");
    expect(out.matches.map((m) => m.printKey)).toEqual([
      "naruto:uc-0022",
      "naruto:uc-0021",
    ]);
  });

  it("can still sure when a prior ambiguous flag had a wide margin", () => {
    const out = finalizeIdentifyConfidence(
      [
        { printKey: "naruto:uc-0022", distance: 30, ambiguous: true },
        { printKey: "naruto:uc-0082", distance: 120, ambiguous: true },
      ],
      "embed",
    );
    expect(out.confidence).toBe("sure");
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]?.printKey).toBe("naruto:uc-0022");
  });

  it("misses soft embed-only shortlists instead of cross-game doubt", () => {
    const out = finalizeIdentifyConfidence(
      [
        { printKey: "lorcana:1-10", distance: 300 },
        { printKey: "lorcana:2-20", distance: 310 },
      ],
      "embed",
    );
    expect(out.confidence).toBe("miss");
    expect(out.matches).toEqual([]);
  });

  it("keeps soft live Lorcana (~250) as doubt, not miss", () => {
    const out = finalizeIdentifyConfidence(
      [
        { printKey: "lorcana:2-184", distance: 250 },
        { printKey: "lorcana:2-185", distance: 290 },
      ],
      "embed",
    );
    expect(out.confidence).toBe("doubt");
    expect(out.matches[0]?.printKey).toBe("lorcana:2-184");
  });

  it("OCR-reinforced sure allows live milli distances under 160", () => {
    const out = finalizeIdentifyConfidence(
      [
        { printKey: "lorcana:2-107", distance: 120 },
        { printKey: "lorcana:2-108", distance: 200 },
      ],
      "embed",
      { ocrReinforced: true },
    );
    expect(out.confidence).toBe("sure");
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]?.printKey).toBe("lorcana:2-107");
  });

  it("without OCR reinforce, milli 120 stays doubt", () => {
    const out = finalizeIdentifyConfidence(
      [
        { printKey: "lorcana:2-107", distance: 120 },
        { printKey: "lorcana:2-108", distance: 200 },
      ],
      "embed",
    );
    expect(out.confidence).toBe("doubt");
  });

  it("misses when a foreign game sits close to #1", () => {
    const out = finalizeIdentifyConfidence(
      [
        { printKey: "dbscg:bt20-129", distance: 100 },
        { printKey: "naruto:uc-0022", distance: 110 },
      ],
      "embed",
    );
    expect(out.confidence).toBe("miss");
    expect(out.matches).toEqual([]);
  });
});
