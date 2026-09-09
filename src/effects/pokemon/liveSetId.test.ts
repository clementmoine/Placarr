import { describe, expect, it } from "vitest";

import {
  liveSetCandidatesForResolve,
  liveSetCandidatesFromTcgdexSet,
  liveSetIdFromTcgdexSet,
  mechanicalReprintFallbackStems,
} from "./liveSetId";

describe("liveSetIdFromTcgdexSet", () => {
  it.each([
    ["sv03.5", "sv3-5"],
    ["sv03", "sv3"],
    ["sv01", "sv1"],
    ["swsh10", "swsh10"],
    ["swsh10.5", "swsh10-5"],
    ["xy2", "xy2"],
    ["me1", "me1"],
    ["SV03.5", "sv3-5"],
    ["bw10", "bw10"],
    // Explicit aliases (config-cache longFormID + TCGdex names)
    ["sm115", "sm11-5"],
    ["sma", "sm11-5"],
    ["cel25", "swsh7-5"],
    ["cel25cc", "swsh7-5r"],
    ["dc1", "xy5-5"],
    ["g1", "xy9-5"],
    ["dv1", "bw6-5"],
    ["det1", "gum"],
    ["sv10.5w", "rsv10-5"],
    ["sv10.5b", "zsv10-5"],
    ["swsh12.5gg", "swsh12-5a"],
    ["mep", "mebsp"],
    ["svp", "svbsp"],
    ["swshp", "swshbsp"],
    ["smp", "smbsp"],
    ["swsh10.5tg", "swsh10a"],
  ] as const)("%s → %s", (input, expected) => {
    expect(liveSetIdFromTcgdexSet(input)).toBe(expected);
  });

  it("returns sibling Live slices for Generations / Legendary Treasures", () => {
    expect(liveSetCandidatesFromTcgdexSet("g1")).toEqual(["xy9-5", "xy9-5r"]);
    expect(liveSetCandidatesFromTcgdexSet("bw11")).toEqual(["bw11", "bw11r"]);
  });

  it("returns null for empty input", () => {
    expect(liveSetIdFromTcgdexSet("")).toBeNull();
    expect(liveSetIdFromTcgdexSet(null)).toBeNull();
  });
});

describe("mechanicalReprintFallbackStems", () => {
  it("derives parent Live stem from TCGdex *sv vault splits", () => {
    expect(mechanicalReprintFallbackStems("swsh4.5sv")).toEqual(["swsh4-5"]);
  });

  it("ignores McDonald's year collections", () => {
    expect(mechanicalReprintFallbackStems("2023sv")).toEqual([]);
    expect(mechanicalReprintFallbackStems("2024sv")).toEqual([]);
  });
});

describe("liveSetCandidatesForResolve", () => {
  it("appends mechanical *sv fallback when primary stem is absent from dump", () => {
    const dump = new Set(["swsh4-5"]);
    expect(
      liveSetCandidatesForResolve("swsh4.5sv", (s) => dump.has(s)),
    ).toEqual({
      primary: ["swsh4-5sv"],
      candidates: ["swsh4-5sv", "swsh4-5"],
    });
  });

  it("drops reprint fallback once the dedicated Live stem exists", () => {
    const dump = new Set(["swsh4-5sv", "swsh4-5"]);
    expect(
      liveSetCandidatesForResolve("swsh4.5sv", (s) => dump.has(s)),
    ).toEqual({
      primary: ["swsh4-5sv"],
      candidates: ["swsh4-5sv"],
    });
  });

  it("does not invent fallbacks for ordinary mapped sets", () => {
    expect(liveSetCandidatesForResolve("swsh4.5", () => false)).toEqual({
      primary: ["swsh4-5"],
      candidates: ["swsh4-5"],
    });
  });
});
