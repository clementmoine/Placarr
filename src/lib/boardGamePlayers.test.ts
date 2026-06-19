import { describe, expect, it } from "vitest";

import {
  formatBoardGamePlayerCount,
  normalizeBoardGamePlayerCount,
} from "@/lib/boardGamePlayers";

describe("boardGamePlayers", () => {
  it("formate un intervalle de joueurs en français", () => {
    expect(formatBoardGamePlayerCount("3", "5")).toBe("3 à 5");
    expect(formatBoardGamePlayerCount("2", "2")).toBe("2");
  });

  it("normalise les tirets vers un intervalle français", () => {
    expect(normalizeBoardGamePlayerCount("3-5")).toBe("3 à 5");
    expect(normalizeBoardGamePlayerCount("3 à 4")).toBe("3 à 4");
  });
});
