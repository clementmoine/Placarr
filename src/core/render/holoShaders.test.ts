import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOLO_SHADER_ID,
  HOLO_SHADER_IDS,
  holoShader,
  isHoloShaderId,
} from "./holoShaders";

describe("holoShader", () => {
  it("returns the look asked for", () => {
    expect(holoShader("aurora").id).toBe("aurora");
    expect(holoShader("sparkle").id).toBe("sparkle");
  });

  it("falls back to the everyday foil rather than nothing", () => {
    // A finish this build has no look for still has to render as some foil —
    // the copy really is one, and drawing it plain would state the opposite.
    expect(holoShader("Lava").id).toBe(DEFAULT_HOLO_SHADER_ID);
    expect(holoShader(null).id).toBe(DEFAULT_HOLO_SHADER_ID);
    expect(holoShader(undefined).id).toBe(DEFAULT_HOLO_SHADER_ID);
  });
});

describe("isHoloShaderId", () => {
  it("accepts only the ids the library defines", () => {
    expect(isHoloShaderId("aurora")).toBe(true);
    expect(isHoloShaderId("Aurora")).toBe(false);
    expect(isHoloShaderId("")).toBe(false);
    expect(isHoloShaderId(null)).toBe(false);
    expect(isHoloShaderId(42)).toBe(false);
  });
});

describe("the library itself", () => {
  it("gives every id a look, and every look its own id back", () => {
    for (const id of HOLO_SHADER_IDS) {
      expect(holoShader(id).id).toBe(id);
    }
  });

  it("never leaves a foil invisible at rest", () => {
    // The whole point is that a foil copy reads as special before anyone
    // touches it, so no look may rest at zero on both axes.
    for (const id of HOLO_SHADER_IDS) {
      const shader = holoShader(id);
      expect(
        shader.sweepOpacity.idle + shader.grainOpacity.idle,
      ).toBeGreaterThan(0);
    }
  });

  it("never rests louder than it reacts", () => {
    // Hovering has to add something, or the pointer feels dead.
    for (const id of HOLO_SHADER_IDS) {
      const shader = holoShader(id);
      expect(shader.sweepOpacity.active).toBeGreaterThanOrEqual(
        shader.sweepOpacity.idle,
      );
      expect(shader.grainOpacity.active).toBeGreaterThanOrEqual(
        shader.grainOpacity.idle,
      );
    }
  });

  it("darkens every sweep before it is dodged", () => {
    // `color-dodge` on an undarkened gradient blows light artwork to flat
    // white and the colour vanishes; each look has to bring its own brake.
    for (const id of HOLO_SHADER_IDS) {
      expect(holoShader(id).sweepFilter).toMatch(/brightness\(0?\.\d+\)/);
    }
  });

  it("gives the broad wash wider bands than the everyday foil", () => {
    // Measured off the publisher's own app: the top rarities move one wide
    // light across the card, not a stack of stripes.
    const scale = (id: string) =>
      Number.parseInt(holoShader(id).sweep.match(/\d+%/g)!.at(-2)!, 10);
    expect(scale("aurora")).toBeGreaterThan(scale("rainbowBands"));
  });
});
