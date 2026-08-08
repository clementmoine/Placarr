import { describe, expect, it } from "vitest";

import {
  formatPlayroomFaceCaption,
  liveSetDisplayName,
  parseLiveBundleId,
} from "./liveSetDisplay";

describe("parseLiveBundleId", () => {
  it.each([
    ["bw10_fr_001", { liveSet: "bw10", lang: "fr", num: 1 }],
    ["xy12_fr_011", { liveSet: "xy12", lang: "fr", num: 11 }],
    ["sv4-5_fr_240", { liveSet: "sv4-5", lang: "fr", num: 240 }],
    ["swsh7-5r_fr_001", { liveSet: "swsh7-5r", lang: "fr", num: 1 }],
  ] as const)("%s", (bundle, expected) => {
    expect(parseLiveBundleId(bundle)).toEqual(expected);
  });
});

describe("liveSetDisplayName", () => {
  it("decodes known expansions in FR", () => {
    expect(liveSetDisplayName("bw10", "fr")).toBe("Glaciation Plasma");
    expect(liveSetDisplayName("xy12", "fr")).toBe("Évolutions");
    expect(liveSetDisplayName("me5", "fr")).toBe("Nuit Noire");
  });

  it("falls back to era family", () => {
    expect(liveSetDisplayName("bw99", "fr")).toBe("Noir & Blanc");
    expect(liveSetDisplayName("sm99", "en")).toBe("Sun & Moon");
  });
});

describe("formatPlayroomFaceCaption", () => {
  it("hides opaque bundle codes and prefixes the era when useful", () => {
    expect(formatPlayroomFaceCaption("Arakdo", "bw10_fr_001", "fr")).toBe(
      "Arakdo · Noir & Blanc · Glaciation Plasma n°1",
    );
    // Alt already names the era — don't double it.
    expect(formatPlayroomFaceCaption("Raichu", "bwalt_fr_038", "fr")).toBe(
      "Raichu · Noir & Blanc (alt) n°38",
    );
    expect(
      formatPlayroomFaceCaption("Florizarre Radieux", "swsh10-5_fr_004", "fr"),
    ).toBe("Florizarre Radieux · Épée & Bouclier · Pokémon GO n°4");
  });
});
