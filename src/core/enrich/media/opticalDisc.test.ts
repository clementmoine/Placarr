import { describe, expect, it } from "vitest";

import {
  OPTICAL_CD_MAX_BYTES,
  isLooseDiscShelfPresentation,
  opticalDiscBackRecipe,
  opticalMediaFormatFromRomBytes,
  resolveOpticalDiscKind,
} from "./opticalDisc";

describe("opticalMediaFormatFromRomBytes", () => {
  it.each([
    // Ace Combat Belkan War EUR ISO ~4.57 GiB (redump DVD-5).
    [4_571_201_536, "DVD-ROM"],
    [600_000_000, "CD-ROM"],
    [50_000_000_000, "Blu-ray"],
    [0, null],
    [null, null],
  ] as const)("maps %s → %s", (bytes, expected) => {
    expect(opticalMediaFormatFromRomBytes(bytes)).toBe(expected);
  });
});

describe("resolveOpticalDiscKind", () => {
  it("classifies Ace Combat Belkan War as DVD from dump size", () => {
    expect(
      resolveOpticalDiscKind({
        platformKey: "ps2",
        romBytes: 4_571_201_536,
      }),
    ).toBe("dvd");
  });

  it("classifies a PS2 CD-sized dump as ps2-cd", () => {
    expect(
      resolveOpticalDiscKind({
        platformKey: "ps2",
        romBytes: 600_000_000,
      }),
    ).toBe("ps2-cd");
    expect(600_000_000).toBeLessThan(OPTICAL_CD_MAX_BYTES);
  });

  it("does not invent PS2 blue without size or CD-ROM format", () => {
    expect(resolveOpticalDiscKind({ platformKey: "ps2" })).toBe("generic");
  });

  it("maps PS1 to black CD from platform alone", () => {
    expect(resolveOpticalDiscKind({ platformKey: "ps1" })).toBe("ps1-cd");
  });

  it("honours media-format facts over platform guesses", () => {
    expect(
      resolveOpticalDiscKind({
        platformKey: "ps2",
        mediaFormatFact: "Blu-ray",
      }),
    ).toBe("bluray");
    expect(
      resolveOpticalDiscKind({
        platformKey: "ps3",
        mediaFormatFact: "DVD",
      }),
    ).toBe("dvd");
    expect(
      resolveOpticalDiscKind({
        platformKey: "ps2",
        mediaFormatFact: "CD-ROM",
      }),
    ).toBe("ps2-cd");
  });

  it("defaults music shelves to audio-cd", () => {
    expect(resolveOpticalDiscKind({ shelfType: "musics" })).toBe("audio-cd");
  });

  it("stays generic when nothing is known", () => {
    expect(resolveOpticalDiscKind({})).toBe("generic");
  });
});

describe("opticalDiscBackRecipe", () => {
  it("gives PS2 CD a blue base and DVD a silver base", () => {
    expect(opticalDiscBackRecipe("ps2-cd").base).toContain("268");
    expect(opticalDiscBackRecipe("dvd").rainbow).toBeGreaterThan(0.4);
    expect(opticalDiscBackRecipe("ps1-cd").base).toContain("0.18");
  });
});

describe("isLooseDiscShelfPresentation", () => {
  it("is square disc tiles for loose optical games / movies / music only", () => {
    expect(isLooseDiscShelfPresentation("loose", "games", "ps2")).toBe(true);
    expect(isLooseDiscShelfPresentation("loose", "movies")).toBe(true);
    expect(isLooseDiscShelfPresentation("loose", "musics")).toBe(true);
    expect(isLooseDiscShelfPresentation("loose", "hardware")).toBe(false);
    expect(isLooseDiscShelfPresentation("used", "games", "ps2")).toBe(false);
  });

  it("never invents a disc tile for cartridge or game-card platforms", () => {
    expect(isLooseDiscShelfPresentation("loose", "games", "gb")).toBe(false);
    expect(isLooseDiscShelfPresentation("loose", "games", "gba")).toBe(false);
    expect(isLooseDiscShelfPresentation("loose", "games", "n64")).toBe(false);
    expect(isLooseDiscShelfPresentation("loose", "games", "switch")).toBe(false);
    expect(isLooseDiscShelfPresentation("loose", "games", "ds")).toBe(false);
    expect(isLooseDiscShelfPresentation("loose", "games", null)).toBe(false);
  });
});
