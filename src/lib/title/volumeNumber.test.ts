import { describe, expect, it } from "vitest";

import {
  explicitVolumeNumbers,
  hasExplicitVolumeMarker,
  padVolumeNumbersInTitle,
  stripVolumeMarkersFromTitle,
  stripVolumeMarkersKeepingNumber,
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

describe("stripVolumeMarkersKeepingNumber", () => {
  it.each([
    ["Naruto n°01", "Naruto 1"],
    ["Death Note Vol. 007", "Death Note 7"],
    ["Attack on Titan #12", "Attack on Titan 12"],
    ["Super Picsou Géant n°036", "Super Picsou Géant 36"],
    ["Astérix Numéro 38", "Astérix 38"],
    ["Naruto Tome 1", "Naruto 1"],
    ["One Piece Volume 01", "One Piece 1"],
    ["01", "1"],
  ])("collapses %s to %s", (input, expected) => {
    expect(stripVolumeMarkersKeepingNumber(input)).toBe(expected);
  });

  it("keeps accents and proper-name numbers that are not volume markers", () => {
    expect(stripVolumeMarkersKeepingNumber("Pokémon Rouge")).toBe(
      "Pokémon Rouge",
    );
    expect(stripVolumeMarkersKeepingNumber("Mighty No. 9")).toBe("Mighty 9");
    expect(stripVolumeMarkersKeepingNumber("Final Fantasy VII")).toBe(
      "Final Fantasy VII",
    );
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

describe("padVolumeNumbersInTitle", () => {
  it("re-pads a marker to the requested width, normalising source padding", () => {
    expect(padVolumeNumbersInTitle("Super Picsou Géant n°36", 3)).toBe(
      "Super Picsou Géant n°036",
    );
    expect(padVolumeNumbersInTitle("Super Picsou Géant n°036", 2)).toBe(
      "Super Picsou Géant n°36",
    );
    expect(padVolumeNumbersInTitle("Naruto Tome 1", 2)).toBe("Naruto Tome 01");
    expect(padVolumeNumbersInTitle("Death Note Vol. 7", 3)).toBe(
      "Death Note Vol. 007",
    );
    expect(padVolumeNumbersInTitle("Attack on Titan #5", 2)).toBe(
      "Attack on Titan #05",
    );
  });

  it("leaves titles without a volume marker untouched", () => {
    expect(padVolumeNumbersInTitle("Resident Evil 2", 3)).toBe(
      "Resident Evil 2",
    );
    expect(padVolumeNumbersInTitle("Catan", 3)).toBe("Catan");
  });

  it("is a no-op for a width below 1", () => {
    expect(padVolumeNumbersInTitle("Naruto Tome 1", 0)).toBe("Naruto Tome 1");
  });
});
