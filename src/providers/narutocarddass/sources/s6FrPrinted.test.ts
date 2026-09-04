import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import ledger from "../curated/sources/s6-fr-printed.json";
import {
  isNarutoS6FrPrintedNumber,
  narutoS6FrPrintedDiskNumbers,
  resetNarutoS6FrPrintedCache,
  syncNarutoS6FrPrintedAppearances,
} from "./s6FrPrinted";

const dirs: string[] = [];

afterEach(() => {
  resetNarutoS6FrPrintedCache();
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("s6 FR printed inserts", () => {
  it("does not treat cancelled retail as a full French set", () => {
    expect(ledger.retailFr).toBe(false);
    expect(ledger.cards.map((c) => c.number).sort()).toEqual([
      "ni232",
      "ni236",
      "ni252",
      "ni253",
      "ta221",
      "ta226",
    ]);
  });

  it("attests the t1185 inédites and keeps TE-191 out of S6", () => {
    expect(isNarutoS6FrPrintedNumber("ni236")).toBe(true);
    expect(isNarutoS6FrPrintedNumber("ni0236")).toBe(true);
    expect(isNarutoS6FrPrintedNumber("ta221")).toBe(true);
    expect(isNarutoS6FrPrintedNumber("ni268")).toBe(false);
    expect(isNarutoS6FrPrintedNumber("te191")).toBe(false);
  });

  it("lists disk number forms for membership SQL", () => {
    const nums = narutoS6FrPrintedDiskNumbers();
    expect(nums).toEqual(
      expect.arrayContaining(["ta221", "ta0221", "ni236", "ni0236"]),
    );
  });

  it("writes s6 onto appearances.fr for ledger cards", () => {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-s6-fr-"));
    dirs.push(root);
    const file = path.join(root, "appearances.json");
    writeFileSync(
      file,
      `${JSON.stringify({
        generatedAt: "2026-01-01T00:00:00.000Z",
        appearances: { ta0221: { ja: "maki11" } },
      })}\n`,
    );

    const changed = syncNarutoS6FrPrintedAppearances(root);
    expect(changed).toBeGreaterThan(0);
    expect(existsSync(file)).toBe(true);

    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      appearances: Record<string, Record<string, string | string[]>>;
    };
    expect(raw.appearances.ta0221?.fr).toBe("s6");
    expect(raw.appearances.ta0221?.ja).toBe("maki11");
  });
});
