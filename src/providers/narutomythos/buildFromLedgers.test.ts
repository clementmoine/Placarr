import { describe, expect, it } from "vitest";

import {
  buildMythosFromLedgers,
  MYTHOS_TITLE_LANG,
  readMythosChecklist,
} from "./buildFromLedgers";
import {
  formatMythosReference,
  mythosPrintKey,
  NARUTO_MYTHOS_KS1_SET_CODE,
  normalizeMythosSearchQuery,
} from "./printKey";

describe("checklist Mythos KS1", () => {
  const ledger = readMythosChecklist();

  it("porte Konoha Shidō Ch.1 sans doublon de clé", () => {
    expect(ledger.set.code).toBe(NARUTO_MYTHOS_KS1_SET_CODE);
    expect(ledger.cards.length).toBeGreaterThan(180);
    const keys = new Set(
      ledger.cards.map(
        (c) => `${c.number}:${c.grouping ?? ""}`,
      ),
    );
    expect(keys.size).toBe(ledger.cards.length);
  });

  it("sépare Rare Art et Mythos V du tirage de base", () => {
    const n104 = ledger.cards.filter((c) => c.number === "0104");
    expect(n104.some((c) => !c.grouping)).toBe(true);
    expect(n104.some((c) => c.grouping === "a")).toBe(true);
  });
});

describe("buildMythosFromLedgers", () => {
  it("aligne tirages et titres, sans écart", () => {
    const report = buildMythosFromLedgers({ dryRun: true });
    expect(report.prints).toBe(report.rows);
    expect(report.titles).toBe(report.rows);
    expect(report.skipped).toEqual([]);
  });

  it("titre en français", () => {
    expect(MYTHOS_TITLE_LANG).toBe("fr");
  });
});

describe("clé et référence Mythos", () => {
  it("frappe le jeu mythos, pas naruto", () => {
    expect(mythosPrintKey("ks1", "0001")).toBe("mythos:ks1-0001");
    expect(mythosPrintKey("ks1", "0001", "a")).toBe("mythos:ks1-0001-a");
    expect(mythosPrintKey("ks1", "m1")).toBe("mythos:ks1-m1");
  });

  it("affiche la référence imprimée", () => {
    expect(formatMythosReference("ks1", "0001")).toBe("001/130");
    expect(formatMythosReference("ks1", "0001", "a")).toBe("001/130 A");
    expect(formatMythosReference("ks1", "m8")).toBe("M8");
    expect(formatMythosReference("ks1", "lg01")).toBe("XXXX/1000");
  });

  it("normalise une recherche par référence imprimée", () => {
    expect(normalizeMythosSearchQuery("001/130")).toBe("0001");
    expect(normalizeMythosSearchQuery("1/130 A")).toBe("0001");
    expect(normalizeMythosSearchQuery("M8")).toBe("m8");
  });
});
