import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import driveLedger from "../curated/sources/naruto-ccg-drive.json";
import {
  DRIVE_HUB_POPULATED_MIN_FILES,
  driveStagingHubFileCount,
  driveStagingHubPopulated,
  NARUTO_STAGING_DRIVE,
} from "./harvestNarutoCcgDriveStaging";
import { driveHubHarvestRoots } from "../parse/parseNarutoCcgDrive";

describe("harvestNarutoCcgDriveStaging ledger", () => {
  it("archives every top-level hub folder", () => {
    expect(driveLedger.ingest).toBe("staging+faces");
    expect(driveLedger.download).toBe(true);
    expect(driveHubHarvestRoots()).toHaveLength(driveLedger.folders.length);
  });
});

describe("driveStagingHubPopulated", () => {
  it("detects localExport manifest without walking hub", () => {
    const packRoot = mkdtempSync(path.join(tmpdir(), "drive-hub-"));
    const staging = path.join(packRoot, NARUTO_STAGING_DRIVE);
    mkdirSync(path.join(staging, "hub"), { recursive: true });
    writeFileSync(
      path.join(staging, "manifest.json"),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        hubUrl: driveLedger.url,
        localExport: true,
        fileCount: 5450,
        roots: [],
      }),
    );
    expect(driveStagingHubPopulated(packRoot)).toBe(true);
    expect(driveStagingHubFileCount(packRoot)).toBe(5450);
  });

  it("detects populated hub by file count when manifest is absent", () => {
    const packRoot = mkdtempSync(path.join(tmpdir(), "drive-hub-"));
    const hub = path.join(packRoot, NARUTO_STAGING_DRIVE, "hub", "nested");
    mkdirSync(hub, { recursive: true });
    for (let i = 0; i < DRIVE_HUB_POPULATED_MIN_FILES; i += 1) {
      writeFileSync(path.join(hub, `f${i}.png`), "x");
    }
    expect(driveStagingHubPopulated(packRoot)).toBe(true);
    expect(driveStagingHubFileCount(packRoot)).toBe(
      DRIVE_HUB_POPULATED_MIN_FILES,
    );
  });

  it("returns false for empty staging", () => {
    const packRoot = mkdtempSync(path.join(tmpdir(), "drive-hub-"));
    expect(driveStagingHubPopulated(packRoot)).toBe(false);
  });
});
