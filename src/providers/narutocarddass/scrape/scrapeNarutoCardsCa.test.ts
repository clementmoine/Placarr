import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadNarutoCardsCaLedger } from "./scrapeNarutoCardsCa";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function stageLedger(cards: unknown[]): string {
  const packDir = mkdtempSync(path.join(os.tmpdir(), "narutocards-ca-"));
  roots.push(packDir);
  const dir = path.join(packDir, "staging", "narutocards-ca");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "cards.json"), JSON.stringify({ cards }));
  return packDir;
}

describe("loadNarutoCardsCaLedger", () => {
  it("re-derives the number from the printedRef — a stale cache predates the prus convention", () => {
    const packDir = stageLedger([
      {
        number: "pr006-us",
        name: "Big Boss",
        setCode: "promo",
        printedRef: "PR-US006",
        usExclusive: true,
      },
      {
        number: "pr010",
        name: "Hoka Rocks",
        setCode: "promo",
        printedRef: "PR-010",
        usExclusive: false,
      },
    ]);
    const rows = loadNarutoCardsCaLedger(packDir);
    expect(rows.map((row) => row.number)).toEqual(["prus006", "pr010"]);
    expect(rows[0]?.usExclusive).toBe(true);
  });

  it("keeps the stored number when the printedRef is absent or unparsable", () => {
    const packDir = stageLedger([
      { number: "pr010", name: "Hoka Rocks", setCode: "promo" },
    ]);
    expect(loadNarutoCardsCaLedger(packDir)[0]?.number).toBe("pr010");
  });
});
