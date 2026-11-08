import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { migrateOnepieceCardLayout } from "./migrateCardLayout";

describe("migrateOnepieceCardLayout", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("moves set/lang/card → lang/set/card (DON + Bandai legacy)", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "op-layout-"));
    dirs.push(root);
    const legacy = path.join(root, "don", "fr", "001");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(path.join(legacy, "art.don-cardlist.webp"), "x");

    const stats = migrateOnepieceCardLayout(root);
    expect(stats.moved).toBe(1);
    expect(
      existsSync(path.join(root, "fr", "don", "001", "art.don-cardlist.webp")),
    ).toBe(true);
    expect(existsSync(path.join(root, "don", "fr", "001"))).toBe(false);
  });

  it("does not clobber an existing canonical folder", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "op-layout-"));
    dirs.push(root);
    const legacy = path.join(root, "op01", "en", "001");
    const canon = path.join(root, "en", "op01", "001");
    mkdirSync(legacy, { recursive: true });
    mkdirSync(canon, { recursive: true });
    writeFileSync(path.join(legacy, "art.bandai.webp"), "legacy");
    writeFileSync(path.join(canon, "art.bandai.webp"), "canon");

    const stats = migrateOnepieceCardLayout(root);
    expect(stats.moved).toBe(0);
    expect(stats.skippedExisting).toBe(1);
    expect(readFileSync(path.join(canon, "art.bandai.webp"), "utf8")).toBe(
      "canon",
    );
  });
});
