import { describe, expect, it } from "vitest";

import "@/effects";
import { listEffectPacks } from "@/core/render/foil/registry";

describe("effect pack card-back contract", () => {
  it("requires every registered pack to declare a non-empty cardBackUrl under /foil/<id>/", () => {
    const packs = listEffectPacks();
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      expect(pack.cardBackUrl.trim().length).toBeGreaterThan(0);
      expect(pack.cardBackUrl.startsWith(`${pack.assetBase}/`)).toBe(true);
      expect(pack.cardBackUrl).toMatch(/card_back\.[a-z0-9]+$/i);
    }
  });
});
