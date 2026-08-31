import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  GOOGLE_DRIVE_MULTI_ZIP_RE,
  googleDriveExportLabel,
  listGoogleDriveExportZips,
} from "./ingestNarutoCcgDriveLocalExport";

describe("ingestNarutoCcgDriveLocalExport", () => {
  it("matches Google Drive multi-part zip names", () => {
    expect(
      GOOGLE_DRIVE_MULTI_ZIP_RE.test("Naruto CCG-20260817T223052Z-1-001.zip"),
    ).toBe(true);
    expect(
      GOOGLE_DRIVE_MULTI_ZIP_RE.exec("foo-20260101T120000Z-1-002.zip"),
    ).toMatchObject({
      1: "foo",
      3: "002",
    });
  });

  it("lists and sorts multi-part zips by part number", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "drive-export-"));
    writeFileSync(path.join(dir, "Naruto CCG-20260817T223052Z-1-003.zip"), "");
    writeFileSync(path.join(dir, "Naruto CCG-20260817T223052Z-1-001.zip"), "");
    writeFileSync(path.join(dir, "Naruto CCG-20260817T223052Z-1-002.zip"), "");
    writeFileSync(path.join(dir, "readme.txt"), "skip");

    const listed = listGoogleDriveExportZips(dir).map((p) => path.basename(p));
    expect(listed).toEqual([
      "Naruto CCG-20260817T223052Z-1-001.zip",
      "Naruto CCG-20260817T223052Z-1-002.zip",
      "Naruto CCG-20260817T223052Z-1-003.zip",
    ]);
    expect(googleDriveExportLabel(dir)).toBe("Naruto CCG");
  });
});
