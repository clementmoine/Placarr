import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { relocateFansetCollectors } from "./relocateFansetCollectors";

describe("relocateFansetCollectors", () => {
  it("moves ledger fanset collectors out of Bandai set folders", () => {
    const root = mkdtempSync(path.join(tmpdir(), "fanset-reloc-"));
    const cards = path.join(root, "cards");
    const from = path.join(cards, "en", "s1", "c5000");
    mkdirSync(from, { recursive: true });
    writeFileSync(path.join(from, "art.fanset.webp"), "x");
    const official = path.join(cards, "en", "s1", "n0001");
    mkdirSync(official, { recursive: true });
    writeFileSync(path.join(official, "art.drive.webp"), "y");

    const { moved, skipped } = relocateFansetCollectors(cards);
    expect(skipped).toEqual([]);
    expect(moved).toEqual(["en/s1/c5000→fanset/c5000"]);
    expect(existsSync(path.join(cards, "en", "fanset", "c5000", "art.fanset.webp"))).toBe(
      true,
    );
    expect(existsSync(from)).toBe(false);
    expect(existsSync(path.join(official, "art.drive.webp"))).toBe(true);
  });
});
