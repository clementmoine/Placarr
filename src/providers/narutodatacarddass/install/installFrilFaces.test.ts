import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { installDataCarddassFrilFaces } from "./installFrilFaces";

describe("installDataCarddassFrilFaces", () => {
  it("installe art.fril même si art.ebay est déjà là", async () => {
    const packRoot = mkdtempSync(path.join(tmpdir(), "fril-pack-"));
    const curatedRoot = mkdtempSync(path.join(tmpdir(), "fril-curated-"));
    for (const number of ["005", "007"]) {
      const curatedDir = path.join(curatedRoot, "cards", "nf", "ja", number);
      mkdirSync(curatedDir, { recursive: true });
      writeFileSync(path.join(curatedDir, "source.fril.jpg"), `fril-${number}`);
      const cardDir = path.join(packRoot, "cards", "nf", "ja", number);
      mkdirSync(cardDir, { recursive: true });
      writeFileSync(path.join(cardDir, "art.ebay.webp"), "ebay-already");
    }

    const report = await installDataCarddassFrilFaces({
      packRoot,
      curatedRoot,
    });
    expect(report.written.sort()).toEqual(["nf/ja/005", "nf/ja/007"]);
    expect(report.failed).toEqual([]);

    for (const number of ["005", "007"]) {
      const cardDir = path.join(packRoot, "cards", "nf", "ja", number);
      expect(existsSync(path.join(cardDir, "art.ebay.webp"))).toBe(true);
      expect(readFileSync(path.join(cardDir, "art.fril.jpg"), "utf8")).toBe(
        `fril-${number}`,
      );
    }
  });
});
