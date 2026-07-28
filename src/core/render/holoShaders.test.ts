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
    expect(DEFAULT_HOLO_SHADER_ID).toBe("silver");
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

  it("keeps the everyday foil colourless", () => {
    // Silver is a metal, not a spectrum: every stop has to be a pure grey, or
    // a common card starts looking like a rare one.
    for (const stop of holoShader("silver").sweep.match(/#[0-9a-f]{6}/gi)!) {
      const [r, g, b] = [1, 3, 5].map((i) =>
        Number.parseInt(stop.slice(i, i + 2), 16),
      );
      expect(r).toBe(g);
      expect(g).toBe(b);
    }
  });

  it("rests darker than it reacts, so the light arrives with the pointer", () => {
    // Real foil is nearly the plain card until something lights it.
    for (const id of HOLO_SHADER_IDS) {
      const shader = holoShader(id);
      expect(shader.sweepOpacity.active).toBeGreaterThan(
        shader.sweepOpacity.idle,
      );
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
    const stops = (id: string) => holoShader(id).sweep.match(/#[0-9a-f]{6}/gi)!;
    expect(new Set(stops("aurora")).size).toBeGreaterThan(
      new Set(stops("rainbow")).size,
    );
  });
});
