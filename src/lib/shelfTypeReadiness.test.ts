import { describe, expect, it } from "vitest";

import {
  isShelfTypeComingSoon,
  isShelfTypeReady,
  shelfTypeReadiness,
} from "@/lib/shelfTypeReadiness";

describe("shelfTypeReadiness", () => {
  it("marks existing media types and hardware as ready", () => {
    for (const type of [
      "games",
      "movies",
      "musics",
      "books",
      "boardgames",
      "hardware",
    ]) {
      expect(shelfTypeReadiness(type)).toBe("ready");
      expect(isShelfTypeReady(type)).toBe(true);
      expect(isShelfTypeComingSoon(type)).toBe(false);
    }
  });

  it("blocks tcg and toys until identify is wired", () => {
    expect(shelfTypeReadiness("tcg")).toBe("comingSoon");
    expect(shelfTypeReadiness("toys")).toBe("comingSoon");
    expect(isShelfTypeReady("tcg")).toBe(false);
    expect(isShelfTypeReady("toys")).toBe(false);
    expect(isShelfTypeComingSoon("tcg")).toBe(true);
    expect(isShelfTypeComingSoon("toys")).toBe(true);
  });
});
