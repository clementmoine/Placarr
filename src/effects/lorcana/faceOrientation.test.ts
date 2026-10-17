import { describe, expect, it } from "vitest";

import { faceQuarterTurnsForLorcanaPrint } from "./faceOrientation";

describe("faceQuarterTurnsForLorcanaPrint", () => {
  it.each([
    [{ cardType: "Location" }, 1],
    [{ cardType: "Lieu" }, 1],
    [{ cardType: "Ort" }, 1],
    [{ cardType: "Luogo" }, 1],
    [{ cardType: "lieu" }, 1],
    [{ cardType: "Character" }, 0],
    [{ cardType: "Personnage" }, 0],
    [{ cardType: "Action" }, 0],
    [{ cardType: "Item" }, 0],
    [{}, 0],
    [{ cardType: null }, 0],
    [{ cardType: "  " }, 0],
  ] as const)("%j → %s", (signals, expected) => {
    expect(faceQuarterTurnsForLorcanaPrint(signals)).toBe(expected);
  });
});
