import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  lorcastSetDisplayName,
  readLorcastSetNameMap,
  writeLorcastSetsLedger,
} from "./setsLedger";

describe("lorcast sets ledger", () => {
  it("persists code → name and reads them back uppercased", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lorcast-sets-"));
    const ledgerPath = path.join(dir, "lorcast-sets.json");
    writeLorcastSetsLedger(
      [
        { code: "P1", name: "Promo Set 1" },
        { code: "dis", name: "EPCOT Festival of the Arts" },
        { code: "PD1", name: "PD1" },
        { code: "x", name: "  " },
      ],
      ledgerPath,
    );
    const map = readLorcastSetNameMap(ledgerPath);
    expect(map.get("P1")).toBe("Promo Set 1");
    expect(map.get("DIS")).toBe("EPCOT Festival of the Arts");
    expect(map.get("PD1")).toBe("PD1");
    expect(map.has("X")).toBe(false);
    const raw = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
      version: number;
    };
    expect(raw.version).toBe(1);
  });
});

describe("lorcastSetDisplayName", () => {
  const names = new Map([
    ["P1", "Promo Set 1"],
    ["PD1", "PD1"],
    ["CP", "Challenge Promo"],
    ["COCONUT", "Format Coconut"],
  ]);

  it("returns a real Lorcast label", () => {
    expect(lorcastSetDisplayName("P1", names)).toBe("Promo Set 1");
    expect(lorcastSetDisplayName("coconut", names)).toBe("Format Coconut");
  });

  it("rejects tautological names", () => {
    expect(lorcastSetDisplayName("PD1", names)).toBeNull();
  });

  it("aliases C1 from CP", () => {
    expect(lorcastSetDisplayName("C1", names)).toBe("Challenge Promo");
  });

  it("returns null when absent", () => {
    expect(lorcastSetDisplayName("RPH", names)).toBeNull();
  });
});
