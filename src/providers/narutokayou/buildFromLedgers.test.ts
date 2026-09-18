import { describe, expect, it } from "vitest";

import {
  buildKayouFromLedgers,
  KAYOU_TITLE_LANG,
  readKayouChecklist,
} from "./buildFromLedgers";
import {
  formatKayouReference,
  kayouPrintKey,
  normalizeKayouSearchQuery,
} from "./printKey";

describe("checklist Kayou", () => {
  const ledger = readKayouChecklist();

  it("agrège plusieurs sets avec des codes uniques", () => {
    expect(ledger.sets.length).toBeGreaterThan(20);
    const codes = ledger.sets.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    const cards = ledger.sets.reduce((n, s) => n + s.cards.length, 0);
    expect(cards).toBeGreaterThan(2000);
  });

  it("encode le code imprimé sans tiret dans le numéro", () => {
    const sample = ledger.sets
      .flatMap((s) => s.cards)
      .find((c) => c.printed === "NR-R-001");
    expect(sample?.number).toBe("nr.r.001");
  });
});

describe("buildKayouFromLedgers", () => {
  it("aligne tirages et titres", () => {
    const report = buildKayouFromLedgers({ dryRun: true });
    expect(report.prints).toBeGreaterThan(2700);
    expect(report.titles).toBe(report.prints);
    expect(report.skipped.length).toBeLessThan(report.rows / 10);
  });

  it("titre en anglais — pages tracker", () => {
    expect(KAYOU_TITLE_LANG).toBe("en");
  });

  it("collapse nr.ss / nr.cc aliases in the merged ledger", () => {
    const numbers = readKayouChecklist().sets.flatMap((s) =>
      s.cards.map((c) => c.number),
    );
    expect(numbers.some((n) => n.startsWith("nr.ss."))).toBe(false);
    expect(numbers.some((n) => n.startsWith("nr.cc."))).toBe(false);
  });
});

describe("clé et référence Kayou", () => {
  it("frappe le jeu kayou", () => {
    expect(kayouPrintKey("t1w1", "nr.r.001")).toBe("kayou:t1w1-nr.r.001");
    expect(kayouPrintKey("newyeargiftbox", "nr.ss.hr.011")).toBe(
      "kayou:newyeargiftbox-nrss.hr.011",
    );
  });

  it("restaure les tirets du code imprimé", () => {
    expect(formatKayouReference("t1w1", "nr.r.001")).toBe("NR-R-001");
    expect(formatKayouReference("smritihs1", "nrss.hr.001")).toBe(
      "NRSS-HR-001",
    );
  });

  it("normalise une recherche par code imprimé", () => {
    expect(normalizeKayouSearchQuery("NR-R-001")).toBe("nr.r.001");
    expect(normalizeKayouSearchQuery("NR-SS-HR-011")).toBe("nrss.hr.011");
    expect(normalizeKayouSearchQuery("Naruto")).toBe("Naruto");
  });
});
