import { describe, expect, it } from "vitest";

import {
  explicitVolumeNumbers,
  hasExplicitVolumeMarker,
  stripVolumeMarkersFromTitle,
  unpaddedVolumeNumbersInTitle,
  volumeNumberFromTitle,
} from "@/lib/title/volumeNumber";

describe("volumeNumberFromTitle", () => {
  it.each([
    ["Naruto Tome 01", "1"],
    ["Naruto Tome 52", "52"],
    ["Naruto n°01", "1"],
    ["Naruto n° 52", "52"],
    ["Death Note Vol. 1", "1"],
    ["Death Note - Volume 12", "12"],
    ["One Piece Chapitre 1000", "1000"],
    ["Attack on Titan #25", "25"],
    ["Super Picsou Géant n°10", "10"],
    ["Astérix Numéro 38", "38"],
    ["Fullmetal Alchemist - Tome 17", "17"],
    ["Saga Part 3", "3"],
    ["Bleach Pt 74", "74"],
  ])("reads %s as volume %s", (title, expected) => {
    expect(volumeNumberFromTitle(title)).toBe(expected);
  });

  it.each([
    "Resident Evil 2",
    "Final Fantasy VII",
    "Pokemon Rouge",
    "L'art et la création de Arcane",
  ])("ignores non-volume numbering in %s", (title) => {
    expect(volumeNumberFromTitle(title)).toBeNull();
  });
});

describe("explicitVolumeNumbers", () => {
  it("collects every marked volume in a title", () => {
    expect(explicitVolumeNumbers("Collection Tome 1 Tome 2")).toEqual([
      "1",
      "2",
    ]);
  });
});

describe("hasExplicitVolumeMarker", () => {
  it("detects marked volumes only", () => {
    expect(hasExplicitVolumeMarker("Naruto Tome 12")).toBe(true);
    expect(hasExplicitVolumeMarker("Naruto")).toBe(false);
  });
});

describe("stripVolumeMarkersFromTitle", () => {
  it("removes volume markers for series search", () => {
    expect(stripVolumeMarkersFromTitle("Naruto Tome 52")).toBe("naruto");
    expect(stripVolumeMarkersFromTitle("Death Note Vol. 1")).toBe("death note");
  });
});

describe("unpaddedVolumeNumbersInTitle", () => {
  it("keeps display wording but removes decorative zeros", () => {
    expect(unpaddedVolumeNumbersInTitle("Super Picsou Géant n°036")).toBe(
      "Super Picsou Géant n°36",
    );
    expect(unpaddedVolumeNumbersInTitle("Naruto Tome 001")).toBe(
      "Naruto Tome 1",
    );
    expect(unpaddedVolumeNumbersInTitle("Astérix Numéro 038")).toBe(
      "Astérix Numéro 38",
    );
  });
});
