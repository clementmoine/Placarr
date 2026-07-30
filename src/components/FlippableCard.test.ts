import { describe, expect, it } from "vitest";

import { showsBack, turnAfterPush } from "./FlippableCard";

describe("turnAfterPush", () => {
  it("turns the way the card was pushed", () => {
    // Positive `rotateY` carries the right edge away, so pushing the right half
    // is positive and the left half negative.
    expect(turnAfterPush(0, true)).toBe(180);
    expect(turnAfterPush(0, false)).toBe(-180);
  });

  it("keeps spinning the same way when pushed twice from one side", () => {
    // Toggling would send it back the way it came, which reads as the card
    // refusing the push.
    expect(turnAfterPush(turnAfterPush(0, true), true)).toBe(360);
    expect(turnAfterPush(turnAfterPush(0, false), false)).toBe(-360);
  });

  it("comes back when pushed from the other side", () => {
    expect(turnAfterPush(turnAfterPush(0, true), false)).toBe(0);
  });
});

describe("showsBack", () => {
  it("shows the back on an odd number of half-turns, either way round", () => {
    expect(showsBack(0)).toBe(false);
    expect(showsBack(180)).toBe(true);
    expect(showsBack(-180)).toBe(true);
    expect(showsBack(360)).toBe(false);
    expect(showsBack(-540)).toBe(true);
  });

  it("agrees with the turns the pushes actually produce", () => {
    // The two have to stay in step: the face announced to a screen reader is
    // this one, while the face shown is the transform's.
    let turn = 0;
    for (const right of [true, true, false, true, false, false]) {
      turn = turnAfterPush(turn, right);
      expect(showsBack(turn)).toBe(Math.abs(turn) % 360 === 180);
    }
  });
});
