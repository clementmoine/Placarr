import { describe, expect, it } from "vitest";

import {
  aggregatePlatformScores,
  pickPlatformKeyFromSignals,
  type PlatformSignal,
} from "./platformPick";

const w = (
  value: string,
  weight: number,
  providerKey: string,
  overrides: Partial<
    Pick<PlatformSignal, "ambiguityWeight" | "pickWeight">
  > = {},
): PlatformSignal => ({
  value,
  weight,
  providerKey,
  ...overrides,
});

describe("pickPlatformKeyFromSignals — distinct providers", () => {
  it("does not stack repeated marketplace rows from the same source", () => {
    const signals = [
      w("Ghost Recon Xbox", 0.9, "ebay"),
      w("Ghost Recon Classics Xbox", 0.9, "ebay"),
      w("Ghost Recon Xbox PAL", 0.9, "ebay"),
      w("Ghost Recon PC Big Box", 0.9, "ebay"),
    ];

    const scores = aggregatePlatformScores(signals);
    expect(scores.get("xbox")).toBe(0.9);
    expect(scores.get("pc")).toBe(0.9);
    expect(pickPlatformKeyFromSignals(signals)).toBeNull();
  });

  it("3307210117168 — marketplace PC consensus wins once contradicted xbox is excluded", () => {
    const signals = [
      w("pc", 0.25, "eBay"),
      w("pc", 0.25, "AchatMoinsCher"),
      w("pc", 0.25, "Freakxy"),
    ];

    expect(pickPlatformKeyFromSignals(signals)).toBe("pc");
  });

  it("3307210117168 — Classics stays ambiguous when two platforms tie on the same source", () => {
    const signals = [w("pc", 0.25, "eBay"), w("xbox", 0.25, "eBay")];

    expect(pickPlatformKeyFromSignals(signals)).toBeNull();
  });

  it("3307210117168 — close scores between any two platforms stay ambiguous", () => {
    const signals = [w("wii", 0.3, "eBay"), w("xbox", 0.28, "AchatMoinsCher")];

    expect(pickPlatformKeyFromSignals(signals)).toBeNull();
  });

  it("3307210117168 — Island Thunder keeps xbox despite one stray PC listing", () => {
    const signals = [
      w("xbox", 0.25, "eBay"),
      w("xbox", 0.25, "eBay"),
      w("xbox", 0.25, "eBay"),
      w("xbox", 0.25, "eBay"),
      w("pc", 0.25, "eBay"),
      w("xbox", 0.45, "AchatMoinsCher"),
    ];

    expect(pickPlatformKeyFromSignals(signals)).toBe("xbox");
  });
});

describe("pickPlatformKeyFromSignals — decide-late tier pass", () => {
  it("does not let tier weights override a pass-1 ambiguity null", () => {
    const signals = [
      w("pc", 0.25, "eBay", { pickWeight: 2.1 }),
      w("xbox", 0.25, "eBay", { pickWeight: 4.2 }),
    ];

    expect(pickPlatformKeyFromSignals(signals)).toBeNull();
  });

  it("lets tier break a tie within one platform family after pass 1 clears", () => {
    const signals = [
      w("xbox", 0.28, "ScreenScraper", {
        ambiguityWeight: 0.58,
        pickWeight: 0.73,
      }),
      w("xbox", 0.25, "eBay", { pickWeight: 0.3 }),
    ];

    expect(pickPlatformKeyFromSignals(signals)).toBe("xbox");
  });
});
