import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import driveLedger from "../curated/sources/naruto-ccg-drive.json";
import { NARUTO_FACE_DECISION_FILE } from "../faceChoice";
import { NARUTO_STAGING_DRIVE } from "../harvest/harvestNarutoCcgDriveStaging";
import { installNarutoCcgDriveFansetFallbacks } from "./installNarutoCcgDriveFaces";
import { driveEnhancedFolders } from "../parse/parseNarutoCcgDrive";

const dirs: string[] = [];

function tmp(): string {
  const dir = path.join(
    os.tmpdir(),
    `naruto-drive-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 40, b: 80 },
    },
  })
    .png()
    .toBuffer();
}

describe("installNarutoCcgDriveFaces ledger", () => {
  it("lists 33 Enhanced folders (s1–s28 + TP + promos)", () => {
    expect(driveLedger.ingest).toBe("staging+faces");
    expect(driveLedger.download).toBe(true);
    expect(driveLedger.cardDatabase.enhanced.ingest).toBe("faces");
    expect(driveEnhancedFolders()).toHaveLength(33);
    expect(driveEnhancedFolders().map((row) => row.setCode)).toContain("s28");
    expect(driveEnhancedFolders().map((row) => row.setCode)).toContain("tp4");
    expect(driveEnhancedFolders().map((row) => row.setCode)).toContain("promo");
  });
});

describe("installNarutoCcgDriveFansetFallbacks", () => {
  it("copies onto an existing card and does not mint a fanset-only number", async () => {
    const packRoot = tmp();
    const fansetDir = path.join(
      packRoot,
      NARUTO_STAGING_DRIVE,
      "hub",
      "Card Database",
      "[Fansets] Naruto CCG Sets Database",
      "Set 30 - Naruto CCG (Fan Made - Henrich)",
    );
    mkdirSync(fansetDir, { recursive: true });
    writeFileSync(path.join(fansetDir, "n001.png"), await png(40, 56));
    writeFileSync(path.join(fansetDir, "n1715.png"), await png(40, 56));

    const existing = path.join(packRoot, "cards", "ninja", "n0001", "en");
    mkdirSync(existing, { recursive: true });
    writeFileSync(
      path.join(existing, "art.vintage.jpg"),
      await sharp({
        create: {
          width: 20,
          height: 28,
          channels: 3,
          background: { r: 80, g: 20, b: 20 },
        },
      })
        .jpeg()
        .toBuffer(),
    );

    const stats = await installNarutoCcgDriveFansetFallbacks({ packRoot });
    expect(stats.written).toContain("n0001/en");
    expect(existsSync(path.join(existing, "art.fanset.webp"))).toBe(true);
    const decision = JSON.parse(
      readFileSync(path.join(existing, NARUTO_FACE_DECISION_FILE), "utf8"),
    ) as { art?: string };
    expect(decision.art).toBe("art.vintage.jpg");
    expect(existsSync(path.join(packRoot, "cards", "ninja", "n1715"))).toBe(
      false,
    );
  });
});
