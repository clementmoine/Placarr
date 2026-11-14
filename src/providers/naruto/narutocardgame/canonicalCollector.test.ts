import { describe, expect, it } from "vitest";

import {
  NARUTO_CARDGAME_MISREAD_KAKASHI_PRINT_KEY,
  canonicalNarutoCardgameCollector,
} from "./canonicalCollector";

describe("canonicalNarutoCardgameCollector", () => {
  it.each([
    ["n001", "n001"],
    ["k039", "n009"],
    ["K039", "n009"],
    ["n009", "n009"],
    ["cp001", "cp001"],
    ["", null],
    [null, null],
  ] as const)("%s → %s", (input, expected) => {
    expect(canonicalNarutoCardgameCollector(input)).toBe(expected);
  });

  it("names the misread Kakashi printKey to drop", () => {
    expect(NARUTO_CARDGAME_MISREAD_KAKASHI_PRINT_KEY).toBe(
      "narutocardgame:demo-k039",
    );
  });
});
