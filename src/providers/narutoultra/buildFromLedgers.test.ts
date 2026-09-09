import { describe, expect, it } from "vitest";

import {
  buildUltraChallengeFromLedgers,
  readUltraChecklist,
  ULTRA_TITLE_LANG,
} from "./buildFromLedgers";
import {
  formatUltraChallengeReference,
  ultraChallengePrintKey,
} from "./printKey";

describe("checklist Ultra Challenge", () => {
  const ledger = readUltraChecklist();

  it("porte les cent cartes, sans trou ni doublon", () => {
    expect(ledger.cards).toHaveLength(100);
    const nums = ledger.cards.map((c) => Number.parseInt(c.number, 10));
    expect(new Set(nums).size).toBe(100);
    expect(Math.min(...nums)).toBe(1);
    expect(Math.max(...nums)).toBe(100);
  });

  it("respecte la régularité qui l'atteste : 25 personnages, 4 cartes chacun", () => {
    // C'est cette régularité qui fait foi. Un relevé fautif ne tomberait pas
    // juste sur des blocs de quatre alignés sur les numéros.
    const byName = new Map<string, number[]>();
    for (const c of ledger.cards) {
      const n = Number.parseInt(c.number, 10);
      byName.set(c.name, [...(byName.get(c.name) ?? []), n]);
    }
    expect(byName.size).toBe(25);
    for (const [name, nums] of byName) {
      expect(nums, name).toHaveLength(4);
      const sorted = [...nums].sort((a, b) => a - b);
      expect(sorted[3] - sorted[0], name).toBe(3);
      expect(sorted[0] % 4, name).toBe(1);
    }
  });
});

describe("buildUltraChallengeFromLedgers", () => {
  it("rend cent tirages et cent titres, sans rien écarter", () => {
    const report = buildUltraChallengeFromLedgers({ dryRun: true });
    expect(report.rows).toBe(100);
    expect(report.prints).toBe(100);
    expect(report.titles).toBe(100);
    expect(report.skipped).toEqual([]);
  });

  it("titre en français — la collection est distribuée en France", () => {
    expect(ULTRA_TITLE_LANG).toBe("fr");
  });
});

describe("clé et référence", () => {
  it("frappe la clé du pack, pas celle du Carddass", () => {
    expect(ultraChallengePrintKey("0001")).toBe("naruto:uc-0001");
    expect(ultraChallengePrintKey("0100")).toBe("naruto:uc-0100");
  });

  it("affiche le numéro tel qu'il est imprimé, sans zéros de tête", () => {
    expect(formatUltraChallengeReference("0001")).toBe("1");
    expect(formatUltraChallengeReference("0047")).toBe("47");
    expect(formatUltraChallengeReference("0100")).toBe("100");
  });
});
