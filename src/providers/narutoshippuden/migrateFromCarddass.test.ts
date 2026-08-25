import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { promoteShippudenDiskAssetsFromCarddass } from "./migrateFromCarddass";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function tmpRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "shippuden-promote-"));
  roots.push(root);
  return root;
}

describe("promoteShippudenDiskAssetsFromCarddass", () => {
  it("copies face families and nikita staging slices", () => {
    const root = tmpRoot();
    const srcFace = path.join(
      root,
      "naruto",
      "carddass",
      "cards",
      "shi",
      "shi0001",
      "ja",
    );
    mkdirSync(srcFace, { recursive: true });
    writeFileSync(path.join(srcFace, "art.jpg"), "face");

    const srcStaging = path.join(
      root,
      "naruto",
      "carddass",
      "staging",
      "nikita-nrt",
    );
    mkdirSync(srcStaging, { recursive: true });
    writeFileSync(path.join(srcStaging, "cards.json"), "{}");

    const report = promoteShippudenDiskAssetsFromCarddass({ dataDir: root });
    expect(report.faceFamilies).toEqual(["shi"]);
    expect(report.faceFiles).toBe(1);
    expect(report.stagingSlices).toEqual(["nikita-nrt"]);
    expect(report.stagingFiles).toBe(1);

    const destFace = path.join(
      root,
      "naruto",
      "shippuden",
      "cards",
      "shi",
      "shi0001",
      "ja",
      "art.jpg",
    );
    expect(existsSync(destFace)).toBe(true);
    expect(readFileSync(destFace, "utf8")).toBe("face");
    expect(
      existsSync(
        path.join(root, "naruto", "shippuden", "staging", "nikita-nrt", "cards.json"),
      ),
    ).toBe(true);
  });

  it("dry-run reports without writing", () => {
    const root = tmpRoot();
    const srcFace = path.join(root, "naruto", "carddass", "cards", "mju");
    mkdirSync(srcFace, { recursive: true });
    writeFileSync(path.join(srcFace, "x.jpg"), "x");

    const report = promoteShippudenDiskAssetsFromCarddass({
      dataDir: root,
      dryRun: true,
    });
    expect(report.faceFamilies).toEqual(["mju"]);
    expect(
      existsSync(path.join(root, "naruto", "shippuden", "cards", "mju")),
    ).toBe(false);
  });
});
