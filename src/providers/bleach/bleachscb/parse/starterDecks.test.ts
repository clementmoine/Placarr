import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { bleachScbCuratedDir } from "../pack";
import {
  bleachPrintedToPrintKey,
  parseBleachS1StarterDecks,
  parseBleachStarterLines,
} from "./starterDecks";

describe("bleachscb parseStarterDecks", () => {
  it("parses qty + printed lines", () => {
    const lines = parseBleachStarterLines(`
1 Ichigo Kurosaki A-002
2 Rukia Kuchiki A-003
1 Zanpakutô Z-001
`);
    expect(lines).toEqual([
      { qty: 1, printed: "A002", nameFr: "Ichigo Kurosaki" },
      { qty: 2, printed: "A003", nameFr: "Rukia Kuchiki" },
      { qty: 1, printed: "Z001", nameFr: "Zanpakutô" },
    ]);
    expect(bleachPrintedToPrintKey("A002")).toBe("bleachscb:a-002");
  });

  it("extracts Compagnons + Rivaux from Wayback S1 HTML when present", () => {
    const htmlPath = path.join(
      bleachScbCuratedDir(),
      "sources",
      "wayback",
      "bleach-s1.html",
    );
    if (!existsSync(htmlPath)) return;
    const html = readFileSync(htmlPath, "latin1");
    const decks = parseBleachS1StarterDecks(html);
    expect(decks.map((d) => d.slug)).toEqual([
      "starter-compagnons",
      "starter-rivaux",
    ]);
    const c = decks[0]!;
    expect(c.lines.reduce((n, l) => n + l.qty, 0)).toBe(33);
    expect(c.lines.find((l) => l.printed === "A002")?.qty).toBe(1);
    expect(c.lines.find((l) => l.printed === "A003")?.qty).toBe(2);
    const r = decks[1]!;
    expect(r.lines.reduce((n, l) => n + l.qty, 0)).toBe(33);
    expect(r.lines.find((l) => l.printed === "A001")?.qty).toBe(2);
    expect(r.lines.find((l) => l.printed === "Z002")?.qty).toBe(1);
  });
});
