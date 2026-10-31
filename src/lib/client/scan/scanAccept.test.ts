import { describe, expect, it } from "vitest";

import {
  alignedFrameWeight,
  createAcceptState,
  DEFAULT_ACCEPT_OPTIONS,
  DEFAULT_ALIGNED_OPTIONS,
  observeWinner,
  pickAlignedWinner,
} from "@/lib/client/scan/scanAccept";

const artOf = (key: string) => key.split("#")[0] ?? key;

describe("pickAlignedWinner", () => {
  it("abstains below minScore", () => {
    const d = pickAlignedWinner(
      [{ key: "a#1", score: 0.4 }],
      artOf,
      DEFAULT_ALIGNED_OPTIONS,
    );
    expect(d.winner).toBeNull();
    expect(d.refused).toBe(false);
  });

  it("refuses thin margin vs rival art", () => {
    const d = pickAlignedWinner(
      [
        { key: "alpha#en", score: 0.8 },
        { key: "beta#en", score: 0.75 },
      ],
      artOf,
      { minScore: 0.55, minMargin: 0.12 },
    );
    expect(d.winner).toBeNull();
    expect(d.refused).toBe(true);
  });

  it("accepts clear margin", () => {
    const d = pickAlignedWinner(
      [
        { key: "alpha#en", score: 0.9 },
        { key: "beta#en", score: 0.5 },
      ],
      artOf,
    );
    expect(d.refused).toBe(false);
    expect(d.winner?.key).toBe("alpha#en");
    expect(d.winner?.artKey).toBe("alpha");
    expect(d.winner?.rivalScore).toBeCloseTo(0.5);
  });

  it("ignores same-art rivals for margin", () => {
    const d = pickAlignedWinner(
      [
        { key: "alpha#en", score: 0.88 },
        { key: "alpha#fr", score: 0.86 },
        { key: "beta#en", score: 0.4 },
      ],
      artOf,
      { minScore: 0.55, minMargin: 0.12 },
    );
    expect(d.winner?.artKey).toBe("alpha");
    expect(d.refused).toBe(false);
  });
});

describe("observeWinner / lock run", () => {
  it("does not lock on a single medium frame", () => {
    const state = createAcceptState();
    const winner = {
      key: "a#1",
      artKey: "a",
      score: 0.7,
      rivalScore: 0.2,
    };
    const w = alignedFrameWeight(winner);
    const locked = observeWinner(state, 1, 0.1, winner, DEFAULT_ACCEPT_OPTIONS, {
      weight: w,
    });
    expect(locked).toBeNull();
  });

  it("locks after enough weighted run", () => {
    const state = createAcceptState();
    const winner = {
      key: "a#1",
      artKey: "a",
      score: 0.7,
      rivalScore: 0.2,
    };
    const w = alignedFrameWeight(winner);
    expect(w).toBeLessThan(2);
    expect(
      observeWinner(state, 1, 0.1, winner, DEFAULT_ACCEPT_OPTIONS, { weight: w }),
    ).toBeNull();
    const locked = observeWinner(
      state,
      2,
      0.2,
      winner,
      DEFAULT_ACCEPT_OPTIONS,
      { weight: w },
    );
    expect(locked?.key).toBe("a#1");
    expect(locked?.lockedThisRun).toBe(true);
  });

  it("resets run after maxGapFrames", () => {
    const state = createAcceptState();
    const winner = {
      key: "a#1",
      artKey: "a",
      score: 0.7,
      rivalScore: 0,
    };
    observeWinner(state, 1, 0.1, winner, { lockRun: 2, maxGapFrames: 2 }, {
      weight: 1,
    });
    // Gap of 5 > maxGap 2 → reset
    const locked = observeWinner(
      state,
      7,
      0.5,
      winner,
      { lockRun: 2, maxGapFrames: 2 },
      { weight: 1 },
    );
    expect(locked).toBeNull();
    expect(state.get("a")?.runLength).toBe(1);
  });
});
