import { describe, expect, it } from "vitest";

import { showsBack, turnAfterPush } from "./FlippableCard";
import { opticalDiscBackRecipe } from "@/core/enrich/media/opticalDisc";

describe("Disc3D flip contract", () => {
  it("reuses card half-turn semantics so Face/Dos tabs stay in sync", () => {
    expect(showsBack(turnAfterPush(0, true))).toBe(true);
    expect(showsBack(turnAfterPush(turnAfterPush(0, true), true))).toBe(false);
  });
});

describe("Disc3D back recipes", () => {
  it("exposes CSS-ready tokens for every optical kind", () => {
    for (const kind of [
      "ps1-cd",
      "ps2-cd",
      "dvd",
      "bluray",
      "audio-cd",
      "generic",
    ] as const) {
      const recipe = opticalDiscBackRecipe(kind);
      expect(recipe.base.length).toBeGreaterThan(0);
      expect(recipe.rainbow).toBeGreaterThan(0);
      expect(recipe.rainbow).toBeLessThanOrEqual(1);
    }
  });
});
