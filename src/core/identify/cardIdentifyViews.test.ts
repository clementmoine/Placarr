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

/** Shortlist row as the hybrid / finalize helpers see it. */
type M = { printKey: string; distance: number; ambiguous?: boolean };
const m = (printKey: string, distance: number, ambiguous?: boolean): M =>
  ambiguous ? { printKey, distance, ambiguous } : { printKey, distance };

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
    const merged = mergeCardIdentifyMatches([[m("a", 10), m("b", 15)]], {
      minMargin: 20,
    });
    expect(merged.every((row) => row.ambiguous)).toBe(true);
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
  // Distances: dHash = Hamming bits; embed = DINOv2 milli-cosine (see
  // identifyConfidence.ts header for the Lorcana FR calibration).
  it("marks hybrid doubt when embed and dHash both sharp but disagree", () => {
    const picked = pickHybridIdentifyMatches(
      [m("lorcana:1-1", 150)],
      [m("lorcana:1-9", 3)],
    );
    expect(picked.method).toBe("hybrid");
    expect(picked.matches.every((row) => row.ambiguous)).toBe(true);
    expect(picked.matches.map((row) => row.printKey).sort()).toEqual([
      "lorcana:1-1",
      "lorcana:1-9",
    ]);
  });

  it("abstains when embed and sharp dHash disagree across games", () => {
    // Live Pendard / Shikamaru: mixing Lorcana+YGO or Naruto+DBS in one
    // carousel is worse than an honest miss.
    const picked = pickHybridIdentifyMatches(
      [m("lorcana:3-126", 200), m("lorcana:3-100", 260)],
      [m("yugioh:mzmu-fr004", 5)],
    );
    expect(picked.method).toBe("hybrid");
    expect(picked.matches).toEqual([]);
  });

  it("abstains on Naruto photo ranked as soft DBS neighbors", () => {
    const picked = pickHybridIdentifyMatches(
      [m("dbscg:bt20-129", 250), m("dbscg:ex03-16", 260)],
      [m("dbslamincards:1-10", 11)],
      { embedSoftDistance: 240, dhashSharpDistance: 6 },
    );
    // Soft embed + soft dHash, different printKey → no clear signal → miss.
    expect(picked.matches).toEqual([]);
  });

  it("does not let a soft dHash veto a clear embed (Eudora 2-7 live)", () => {
    // Screenshot case: embed #1 = correct card @213, dHash 19 bits on a
    // different card. The soft dHash is noise, not a counter-signal.
    const picked = pickHybridIdentifyMatches(
      [m("lorcana:2-7", 213), m("lorcana:11-36", 329)],
      [m("lorcana:1-77", 19)],
    );
    expect(picked.method).toBe("embed");
    expect(picked.matches[0]?.printKey).toBe("lorcana:2-7");
    expect(picked.matches.some((row) => row.ambiguous)).toBe(false);
  });

  it("soft dHash from another game still cannot veto a clear embed", () => {
    const picked = pickHybridIdentifyMatches(
      [m("lorcana:2-7", 213)],
      [m("dbsjcc:part1-d0001", 14)],
    );
    expect(picked.method).toBe("embed");
    expect(picked.matches[0]?.printKey).toBe("lorcana:2-7");
  });

  it("keeps a soft-but-real Lorcana hit when sharp dHash agrees", () => {
    const picked = pickHybridIdentifyMatches(
      [m("lorcana:2-66", 300), m("lorcana:11-95", 390)],
      [m("lorcana:2-66", 9)],
      { embedSoftDistance: 240, dhashSharpDistance: 6 },
    );
    expect(picked.matches[0]?.printKey).toBe("lorcana:2-66");
  });

  it("still trusts sharp dHash when soft embed agrees on the same printKey", () => {
    const picked = pickHybridIdentifyMatches(
      [m("lorcana:1-51", 420), m("lorcana:1-50", 440)],
      [m("lorcana:1-51", 5)],
    );
    expect(picked.method).toBe("dhash");
    expect(picked.matches[0]?.printKey).toBe("lorcana:1-51");
  });

  it("abstains on soft embed-only (no dHash) — cross-game neighbors", () => {
    // DBS live frame while only Lorcana has embeddings: soft nearest
    // neighbors must not become a "plusieurs possibilités" carousel.
    const picked = pickHybridIdentifyMatches(
      [m("lorcana:1-10", 400), m("lorcana:2-20", 410), m("lorcana:3-30", 420)],
      null,
    );
    expect(picked.matches).toEqual([]);
    expect(picked.method).toBe("embed");
  });

  it("keeps a clear embed-only shortlist", () => {
    const picked = pickHybridIdentifyMatches(
      [m("lorcana:1-177", 150), m("lorcana:1-178", 240)],
      null,
    );
    expect(picked.method).toBe("embed");
    expect(picked.matches.map((row) => row.printKey)).toEqual([
      "lorcana:1-177",
      "lorcana:1-178",
    ]);
  });

  it("keeps p90-class live hits (~300) as embed shortlist, not miss", () => {
    const picked = pickHybridIdentifyMatches(
      [m("lorcana:2-184", 301), m("lorcana:2-185", 360)],
      null,
    );
    expect(picked.method).toBe("embed");
    expect(picked.matches[0]?.printKey).toBe("lorcana:2-184");
  });

  it("abstains when soft embed and soft dHash disagree (no clear signal)", () => {
    const picked = pickHybridIdentifyMatches(
      [m("lorcana:1-10", 400)],
      [m("dbsjcc:part1-d0001", 12)],
    );
    expect(picked.matches).toEqual([]);
  });
});

describe("finalizeIdentifyConfidence", () => {
  it("returns a single sure card when distance and margin are clear", () => {
    const out = finalizeIdentifyConfidence(
      [m("lorcana:1-1", 2), m("lorcana:1-2", 8)],
      "dhash",
    );
    expect(out.confidence).toBe("sure");
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]?.printKey).toBe("lorcana:1-1");
  });

  it("keeps a doubt carousel when the margin is thin", () => {
    const out = finalizeIdentifyConfidence([m("a", 3), m("b", 4)], "dhash");
    expect(out.confidence).toBe("doubt");
    expect(out.matches).toHaveLength(2);
    expect(out.matches.every((row) => row.ambiguous)).toBe(true);
  });

  it("sure on a median live embed hit with a clear margin", () => {
    // Bench: correct p50 = 178, margin p50 = 124.
    const out = finalizeIdentifyConfidence(
      [m("lorcana:2-7", 178), m("lorcana:11-36", 302)],
      "embed",
    );
    expect(out.confidence).toBe("sure");
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]?.printKey).toBe("lorcana:2-7");
  });

  it("never sure on the benchmark's true errors (wrong #1 ≥ 279, lead ≤ 52)", () => {
    const fails: Array<[M, M]> = [
      [m("lorcana:9-170", 470), m("lorcana:11-68", 501)],
      [m("lorcana:q3-8", 279), m("lorcana:4-118", 331)],
      [m("lorcana:11-171", 310), m("lorcana:8-118", 317)],
      [m("lorcana:1-62", 332), m("lorcana:6-14", 362)],
    ];
    for (const rows of fails) {
      const out = finalizeIdentifyConfidence(rows, "embed");
      expect(out.confidence).not.toBe("sure");
      if (out.confidence === "doubt") {
        // The correct card must survive in the carousel.
        expect(out.matches.map((row) => row.printKey)).toContain(
          rows[1].printKey,
        );
      }
    }
  });

  it("reprint twins (thin margin) stay a doubt carousel, both kept", () => {
    const out = finalizeIdentifyConfidence(
      [m("lorcana:1-10", 160), m("lorcana:5-10", 178)],
      "embed",
    );
    expect(out.confidence).toBe("doubt");
    expect(out.matches.map((row) => row.printKey)).toEqual([
      "lorcana:1-10",
      "lorcana:5-10",
    ]);
  });

  it("drops far FP neighbors from a doubt carousel", () => {
    // Shikamaru twins close; Tenten far — trim, don't ask the user about Tenten.
    const out = finalizeIdentifyConfidence(
      [
        m("naruto:uc-0022", 240, true),
        m("naruto:uc-0021", 280, true),
        m("naruto:uc-0082", 370, true),
      ],
      "embed",
    );
    expect(out.confidence).toBe("doubt");
    expect(out.matches.map((row) => row.printKey)).toEqual([
      "naruto:uc-0022",
      "naruto:uc-0021",
    ]);
  });

  it("can still sure when a prior ambiguous flag had a wide margin", () => {
    const out = finalizeIdentifyConfidence(
      [m("naruto:uc-0022", 150, true), m("naruto:uc-0082", 300, true)],
      "embed",
    );
    expect(out.confidence).toBe("sure");
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]?.printKey).toBe("naruto:uc-0022");
  });

  it("misses soft embed-only shortlists instead of cross-game doubt", () => {
    const out = finalizeIdentifyConfidence(
      [m("lorcana:1-10", 400), m("lorcana:2-20", 410)],
      "embed",
    );
    expect(out.confidence).toBe("miss");
    expect(out.matches).toEqual([]);
  });

  it("keeps p90-class live hits (~300) as doubt, not miss", () => {
    const out = finalizeIdentifyConfidence(
      [m("lorcana:2-184", 301), m("lorcana:2-185", 360)],
      "embed",
    );
    expect(out.confidence).toBe("doubt");
    expect(out.matches[0]?.printKey).toBe("lorcana:2-184");
  });

  it("OCR-reinforced sure waives the margin for reprint twins", () => {
    // Same art reprinted in two sets: embed margin ≈ 0 by construction; the
    // OCR footer (set/number) is the disambiguator.
    const out = finalizeIdentifyConfidence(
      [m("lorcana:2-107", 250), m("lorcana:6-107", 262)],
      "embed",
      { ocrReinforced: true },
    );
    expect(out.confidence).toBe("sure");
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]?.printKey).toBe("lorcana:2-107");
  });

  it("OCR reinforce still cannot sure a shortlist-max-class hit", () => {
    const out = finalizeIdentifyConfidence(
      [m("lorcana:2-107", 370), m("lorcana:2-108", 380)],
      "embed",
      { ocrReinforced: true },
    );
    expect(out.confidence).toBe("doubt");
  });

  it("without OCR reinforce, a thin-margin 250 stays doubt", () => {
    const out = finalizeIdentifyConfidence(
      [m("lorcana:2-107", 250), m("lorcana:6-107", 262)],
      "embed",
    );
    expect(out.confidence).toBe("doubt");
  });

  it("misses when a foreign game sits close to a sure-band #1", () => {
    const out = finalizeIdentifyConfidence(
      [m("dbscg:bt20-129", 200), m("naruto:uc-0022", 230)],
      "embed",
    );
    expect(out.confidence).toBe("miss");
    expect(out.matches).toEqual([]);
  });

  it("keeps a soft foil hit when a foreign FP is close (Gaï / Ninja Sensei)", () => {
    // Live dewarp ~251 vs Coleka; Pokémon glare neighbor ~267 must not wipe
    // the correct Naruto shortlist into an honest-looking miss.
    const out = finalizeIdentifyConfidence(
      [
        m("naruto:ns-0003", 251),
        m("pokemon:sm8-8a", 267),
        m("naruto:nr-0014", 310),
      ],
      "embed",
    );
    expect(out.confidence).toBe("doubt");
    expect(out.matches.map((row) => row.printKey)).toEqual([
      "naruto:ns-0003",
      "naruto:nr-0014",
    ]);
  });
});
