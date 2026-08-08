import { describe, expect, it, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  cleanupLegacyPrintRootAssets,
  stripLegacyFlatIndexKeys,
} from "./scrapeCards";

describe("lorcana legacy root cleanup", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length) {
      rmSync(dirs.pop()!, { recursive: true, force: true });
    }
  });

  it("removes flat root assets when lang folders exist", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "lorcana-clean-"));
    dirs.push(root);
    const printDir = path.join(root, "lorcana:1-1");
    mkdirSync(path.join(printDir, "fr"), { recursive: true });
    mkdirSync(path.join(printDir, "de"), { recursive: true });
    writeFileSync(path.join(printDir, "art.jpg"), "root");
    writeFileSync(path.join(printDir, "fr", "art.jpg"), "fr");
    writeFileSync(path.join(printDir, "de", "art.jpg"), "de");

    const result = cleanupLegacyPrintRootAssets(root);
    expect(result.removed).toBe(1);
    expect(existsSync(path.join(printDir, "art.jpg"))).toBe(false);
    expect(existsSync(path.join(printDir, "fr", "art.jpg"))).toBe(true);
    expect(existsSync(path.join(printDir, "de", "art.jpg"))).toBe(true);
  });

  it("keeps root assets when no lang folder exists", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "lorcana-clean-"));
    dirs.push(root);
    const printDir = path.join(root, "lorcana:legacy");
    mkdirSync(printDir, { recursive: true });
    writeFileSync(path.join(printDir, "art.jpg"), "only-root");

    const result = cleanupLegacyPrintRootAssets(root);
    expect(result.removed).toBe(0);
    expect(existsSync(path.join(printDir, "art.jpg"))).toBe(true);
  });

  it("strips flat index keys when lang entries exist", () => {
    const cards = {
      "lorcana:1-1": {
        art: "art.jpg",
        foilMask: "foil_mask.jpg",
        fr: { art: "art.jpg" },
        en: { art: "art.jpg" },
      },
    };
    expect(stripLegacyFlatIndexKeys(cards)).toBe(2);
    expect(cards["lorcana:1-1"]).toEqual({
      fr: { art: "art.jpg" },
      en: { art: "art.jpg" },
    });
  });
});
