import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  cardBackCandidateFiles,
  cardBackRgbaFromDataDir,
  isCardBackName,
} from "./cardBack";

describe("cardBack names", () => {
  it.each(["cardBack", "card_back", "CARDBACK"])(
    "recognizes %s",
    (name) => {
      expect(isCardBackName(name)).toBe(true);
    },
  );

  it("rejects unrelated texture names", () => {
    expect(isCardBackName("Card")).toBe(false);
  });
});

describe("cardBackRgbaFromDataDir", () => {
  it("returns null when the hashed asset is absent", async () => {
    await expect(cardBackRgbaFromDataDir("/tmp/does-not-exist-placarr", null)).resolves.toBeNull();
  });
});

describe("cardBackCandidateFiles", () => {
  it("scans hashed Android files and named desktop serialized files", () => {
    // Desktop client: `cardBack` lives in resources.assets (pixels in .resS).
    const dir = mkdtempSync(path.join(tmpdir(), "card-back-"));
    mkdirSync(path.join(dir, "Managed"));
    for (const name of [
      "b097d2eccfaea449e8ba9563d364d8d4",
      "resources.assets",
      "resources.assets.resS",
      "sharedassets1.assets",
      "level0",
      "boot.config",
    ]) {
      writeFileSync(path.join(dir, name), "x");
    }
    expect(cardBackCandidateFiles(dir)).toEqual([
      "b097d2eccfaea449e8ba9563d364d8d4",
      "level0",
      "resources.assets",
      "sharedassets1.assets",
    ]);
  });
});
