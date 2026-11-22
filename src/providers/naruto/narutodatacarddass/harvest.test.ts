import { describe, expect, it } from "vitest";

import { mergeChecklistWithPrevious } from "./harvest";

const card = (printed: string, name: string, note?: string) => {
  const [prefix, number] = printed.split("-");
  return {
    printed,
    set: (prefix ?? "").toLowerCase(),
    number: number ?? "",
    name,
    nameJa: name,
    ...(note ? { note } : {}),
  };
};

describe("mergeChecklistWithPrevious", () => {
  it("keeps cards whose source was not re-read instead of shrinking", () => {
    // 2026-11-22 : `staging/official` (hand mirror) gone → Sync re-assembled
    // 125 cards and overwrote the 1 482-card checklist.
    const previous = {
      cards: [card("DN-001", "ナルト"), card("NF-002", "旧名")],
      sources: ["dn/battle_card.csv", "nf/nf1.php"],
    };
    const assembled = {
      cards: [card("NF-002", "うずまきナルト(疾風伝)", "suruga-ya GL411753")],
      byPrefix: { NF: 1 },
      sources: ["suruga-scan-gl411.json"],
    };

    const merged = mergeChecklistWithPrevious(assembled, previous);

    expect(merged.cards.map((c) => `${c.printed}:${c.name}`)).toEqual([
      "DN-001:ナルト",
      // A card read again this run wins over the stored one.
      "NF-002:うずまきナルト(疾風伝)",
    ]);
    expect(merged.byPrefix).toEqual({ DN: 1, NF: 1 });
    expect(merged.sources).toEqual([
      "dn/battle_card.csv",
      "nf/nf1.php",
      "suruga-scan-gl411.json",
    ]);
  });

  it("is the assembly itself when there is no previous checklist", () => {
    const assembled = {
      cards: [card("NX-001", "a")],
      byPrefix: { NX: 1 },
      sources: ["nx/cat69001.html"],
    };
    expect(mergeChecklistWithPrevious(assembled, null)).toEqual(assembled);
  });
});
