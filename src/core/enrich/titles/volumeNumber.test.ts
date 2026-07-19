import { describe, expect, it } from "vitest";

import {
  explicitVolumeNumbers,
  hasExplicitVolumeMarker,
  padVolumeNumbersInTitle,
  stripVolumeMarkersFromTitle,
  stripVolumeMarkersKeepingNumber,
  unpaddedVolumeNumbersInTitle,
  volumeNumberFromPriceListing,
  volumeNumberFromTitle,
} from "@/core/enrich/titles/volumeNumber";

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
    ["Super Picsou Géant n°100bis", "100bis"],
    ["Super Picsou Géant n°100 Bis", "100bis"],
    ["Picsou Magazine Numéro 65 bis", "65bis"],
    ["Gaston Tome 5ter", "5ter"],
    ["SUPER PICSOU GEANT 65 BIS - VRAI N° 1", "65bis"],
  ])("reads %s as volume %s", (title, expected) => {
    expect(volumeNumberFromTitle(title)).toBe(expected);
  });

  it("does not read an unrelated word after the number as a suffix", () => {
    expect(volumeNumberFromTitle("Chapitre 3 Bison Ravi")).toBe("3");
    expect(volumeNumberFromTitle("Tome 2 Terminus")).toBe("2");
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

describe("volumeNumberFromPriceListing", () => {
  it("matches a bare trailing issue to the item's marked volume", () => {
    expect(
      volumeNumberFromPriceListing(
        "Super Picsou Géant n°081",
        "Super Picsou Géant 81",
      ),
    ).toBe("81");
    expect(
      volumeNumberFromPriceListing(
        "Super Picsou Géant n°062",
        "PETIT FORMAT BD SUPER PICSOU GEANT 62 1994 disney",
      ),
    ).toBe("62");
  });

  it("does not invent a volume when the listing digit disagrees", () => {
    expect(
      volumeNumberFromPriceListing(
        "Super Picsou Géant n°081",
        "Super Picsou Géant 82",
      ),
    ).toBeNull();
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

  it("removes French suffixed issue markers (bis/ter)", () => {
    expect(stripVolumeMarkersFromTitle("Super Picsou Géant n°100bis")).toBe(
      "super picsou geant",
    );
    expect(stripVolumeMarkersFromTitle("Picsou Magazine Numéro 65 bis")).toBe(
      "picsou magazine",
    );
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
    ["Super Picsou Géant n°100bis", "Super Picsou Géant 100bis"],
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

  it("keeps French issue suffixes while removing zeros", () => {
    expect(unpaddedVolumeNumbersInTitle("Super Picsou Géant n°0100bis")).toBe(
      "Super Picsou Géant n°100bis",
    );
    expect(unpaddedVolumeNumbersInTitle("Picsou Numéro 065 Bis")).toBe(
      "Picsou Numéro 65 Bis",
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
    expect(padVolumeNumbersInTitle("Super Picsou Géant n°100bis", 3)).toBe(
      "Super Picsou Géant n°100bis",
    );
    expect(padVolumeNumbersInTitle("Picsou n°65bis", 3)).toBe(
      "Picsou n°065bis",
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
