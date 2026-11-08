/**
 * Lean helpers live in `@/core/render/foil/leanPolicy` — covered there.
 * This file kept only so path history / imports stay greppable if needed.
 */
import { describe, expect, it } from "vitest";

describe("FoilCardImage surface", () => {
  it("does not re-export lean helpers (import from @/core/render/foil)", async () => {
    const mod = await import("@/components/FoilCardImage");
    expect("foilLeanAmplitude" in mod).toBe(false);
    expect("tiltFromLightPercent" in mod).toBe(false);
  });
});
