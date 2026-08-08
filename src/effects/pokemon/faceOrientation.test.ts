import { describe, expect, it } from "vitest";

import { faceQuarterTurnsForPokemonPrint } from "./faceOrientation";

describe("faceQuarterTurnsForPokemonPrint", () => {
  it.each([
    [{ rarityCode: "BreakRare" }, 1],
    [{ stage: "BREAK" }, 1],
    [{ stage: "TURBO" }, 1],
    [{ stage: "turbo" }, 1],
    [{ stage: "Stage 2" }, 0],
    [{ rarityCode: "RareHolo" }, 0],
    [{}, 0],
  ] as const)("%j → %s", (signals, expected) => {
    expect(faceQuarterTurnsForPokemonPrint(signals)).toBe(expected);
  });
});
