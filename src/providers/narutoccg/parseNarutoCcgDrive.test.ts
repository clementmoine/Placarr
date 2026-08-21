import { describe, expect, it } from "vitest";

import { narutoDiskCardId } from "./collectorIdentity";
import {
  driveFaceAppearanceSet,
  driveFaceDiskId,
  driveFolderSetCode,
  driveHubHarvestRoots,
  driveOfficialSetCodeInPath,
  drivePathIsFanset,
  driveStagingSegment,
  parseDriveEmbeddedFolderHtml,
  parseDriveNarutoFaceFilename,
  pickDriveFaceWinner,
} from "./parseNarutoCcgDrive";

describe("parseDriveNarutoFaceFilename", () => {
  it("reads Enhanced collector filenames", () => {
    expect(parseDriveNarutoFaceFilename("j001.png")).toMatchObject({
      diskHint: "j001",
      tag: null,
    });
    expect(parseDriveNarutoFaceFilename("j020 [Errata].png")).toMatchObject({
      diskHint: "j020",
      tag: "errata",
    });
    expect(parseDriveNarutoFaceFilename("m621 [Foil Print].png")).toMatchObject(
      {
        diskHint: "m621",
        tag: "foil",
      },
    );
    expect(parseDriveNarutoFaceFilename("nUS020.png")?.diskHint).toBe("nus020");
    expect(parseDriveNarutoFaceFilename("prUS010 [Errata].png")?.diskHint).toBe(
      "prus010",
    );
    expect(parseDriveNarutoFaceFilename("n1646.png")?.diskHint).toBe("n1646");
    expect(parseDriveNarutoFaceFilename("pr068.png")?.diskHint).toBe("pr068");
    expect(narutoDiskCardId("j001")).toBe("j0001");
    expect(narutoDiskCardId("n1646")).toBe("n1646");
    expect(parseDriveNarutoFaceFilename("PTHN-001.png")).toBeNull();
    expect(parseDriveNarutoFaceFilename("ni001.png")).toBeNull();
    expect(parseDriveNarutoFaceFilename("ex001.png")).toBeNull();
  });
});

describe("driveFolderSetCode", () => {
  it("maps Enhanced folder titles onto pack set codes", () => {
    expect(driveFolderSetCode("Set 1 - Path of the Hokage")).toBe("s1");
    expect(driveFolderSetCode("Set 28 - Ultimate Ninja Storm 3")).toBe("s28");
    expect(driveFolderSetCode("Set 17.5 - Tournament  Pack  1")).toBe("tp1");
    expect(driveFolderSetCode("Set 23.5 - Tournament Pack 4")).toBe("tp4");
    expect(driveFolderSetCode("Promos")).toBe("promo");
    expect(driveFolderSetCode("Set 31 - Silent Humming (Fan Made)")).toBeNull();
    expect(
      driveFolderSetCode("Set 29 - Shinobi's Dreams (Fan Made - Mardo)"),
    ).toBeNull();
  });
});

describe("driveFaceAppearanceSet", () => {
  it("keeps retail N/J/M promo reprints off the booster id", () => {
    expect(driveFaceAppearanceSet("n145", "promo")).toBe("promo");
    expect(driveFaceDiskId("n145", "promo")).toBe("n0145-promo");
    expect(driveFaceDiskId("pr077", "promo")).toBe("pr0077");
    expect(driveFaceDiskId("n001", "s1")).toBe("n0001");
  });
});

describe("pickDriveFaceWinner", () => {
  it("prefers errata over base and base over foil", () => {
    const winner = pickDriveFaceWinner([
      { tag: "foil" },
      { tag: null },
      { tag: "errata" },
    ]);
    expect(winner?.tag).toBe("errata");
    expect(
      pickDriveFaceWinner([{ tag: "foil" }, { tag: null }])?.tag,
    ).toBeNull();
  });
});

describe("driveOfficialSetCodeInPath", () => {
  it("reads set codes from hub folder titles or legacy s1 paths", () => {
    expect(
      driveOfficialSetCodeInPath([
        "Card Database",
        "[Enhanced] Naruto CCG Sets Database",
        "Set 1 - Path of the Hokage",
        "j001.png",
      ]),
    ).toBe("s1");
    expect(driveOfficialSetCodeInPath(["s1", "j001.png"])).toBe("s1");
    expect(
      driveOfficialSetCodeInPath([
        "Card Database",
        "[Fansets] Naruto CCG Sets Database",
        "Set 29 - Shinobi's Dreams (Fan Made - Mardo)",
        "n001.png",
      ]),
    ).toBeNull();
  });
});

describe("drivePathIsFanset", () => {
  it("detects the Fansets hub without treating Enhanced as fan-made", () => {
    expect(
      drivePathIsFanset([
        "Card Database",
        "[Fansets] Naruto CCG Sets Database",
        "Set 30 - Naruto CCG (Fan Made - Henrich)",
        "n001.png",
      ]),
    ).toBe(true);
    expect(
      drivePathIsFanset([
        "Card Database",
        "[Enhanced] Naruto CCG Sets Database",
        "Set 1 - Path of the Hokage",
        "n001.png",
      ]),
    ).toBe(false);
  });
});

describe("driveHubHarvestRoots", () => {
  it("lists every top-level hub folder for staging", () => {
    const roots = driveHubHarvestRoots();
    expect(roots.map((row) => row.label)).toEqual(
      expect.arrayContaining([
        "_Deck Lists",
        "Card Database",
        "Custom Card Creator",
        "Print Template",
        "Rules",
      ]),
    );
    expect(roots.every((row) => row.stagingRel.startsWith("hub/"))).toBe(true);
  });
});

describe("driveStagingSegment", () => {
  it("sanitizes Drive titles for disk segments", () => {
    expect(driveStagingSegment("Set 1 - Path of the Hokage")).toBe(
      "Set 1 - Path of the Hokage",
    );
    expect(driveStagingSegment("foo/bar:baz")).toBe("foo-bar-baz");
  });
});

describe("parseDriveEmbeddedFolderHtml", () => {
  it("pairs entry ids with flip-entry titles", () => {
    const html = `
      <div class="flip-entry" id="entry-abc123" tabindex="0">
        <div class="flip-entry-title">j001.png</div>
      </div>
      <div class="flip-entry" id="entry-def456" tabindex="0">
        <div class="flip-entry-title">Fierce Ambitions Tin Promos</div>
      </div>
    `;
    expect(parseDriveEmbeddedFolderHtml(html)).toEqual([
      { id: "abc123", name: "j001.png", kind: "file" },
      {
        id: "def456",
        name: "Fierce Ambitions Tin Promos",
        kind: "folder",
      },
    ]);
  });
});
