import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runAuditApkCoverage } from "./auditApkCoverage";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop()!;
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function tmpRoot(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "apk-audit-"));
  tmpDirs.push(d);
  return d;
}

function writeCompendium(
  cache: string,
  stem: string,
  content: Record<string, string>,
) {
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(
    path.join(cache, `${stem}-compendium_0.0.json`),
    JSON.stringify({
      keys: {
        compendium: {
          contentString: JSON.stringify(content),
        },
      },
    }),
    "utf8",
  );
}

describe("auditApkCoverage", () => {
  it("passes when catalogue matches APK inventory", () => {
    const root = tmpRoot();
    const cache = path.join(root, "config-cache");
    writeCompendium(cache, "bw10", { bw10_1: "u" });
    const cataloguePath = path.join(root, "cdn-catalogue-setnum.txt");
    fs.writeFileSync(cataloguePath, "bw10_001\n", "utf8");
    const cardsPath = path.join(root, "cards.json");
    fs.writeFileSync(cardsPath, JSON.stringify({ bw10_fr_001: {} }), "utf8");
    const bundlesDir = path.join(root, "cdn-bundles");
    fs.mkdirSync(bundlesDir);
    const reportPath = path.join(root, "apk-coverage.json");

    expect(
      runAuditApkCoverage({
        paths: {
          root,
          configCache: cache,
          cataloguePath,
          cardsPath,
          bundlesDir,
          reportPath,
        },
      }),
    ).toBe(0);
  });

  it("fails when catalogue is stale", () => {
    const root = tmpRoot();
    const cache = path.join(root, "config-cache");
    writeCompendium(cache, "svalt", { svalt_1: "u" });
    const cataloguePath = path.join(root, "cdn-catalogue-setnum.txt");
    fs.writeFileSync(cataloguePath, "bw10_001\n", "utf8");
    const reportPath = path.join(root, "apk-coverage.json");

    expect(
      runAuditApkCoverage({
        paths: {
          root,
          configCache: cache,
          cataloguePath,
          cardsPath: path.join(root, "missing-cards.json"),
          bundlesDir: path.join(root, "missing-bundles"),
          reportPath,
        },
      }),
    ).toBe(2);
  });
});
