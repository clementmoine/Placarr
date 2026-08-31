import { describe, expect, it } from "vitest";

import { formatChecklistMarkdown } from "./checklistMarkdown";

describe("formatChecklistMarkdown", () => {
  it("exports GFM checkboxes for owned and missing cards", () => {
    const md = formatChecklistMarkdown({
      shelfName: "Naruto FR",
      language: "fr",
      languageLabel: "Français",
      totals: { owned: 1, total: 2, completion: 50 },
      sets: [
        {
          label: "Série 1",
          owned: 1,
          total: 2,
          completion: 50,
          cards: [
            { reference: "NI-001", title: "Naruto", owned: true },
            { reference: "NI-002", title: "Sasuke", owned: false },
          ],
        },
      ],
    });

    expect(md).toContain("# Check-list — Naruto FR");
    expect(md).toContain("Français · 1 / 2 (50 %)");
    expect(md).toContain("## Série 1");
    expect(md).toContain("- [x] NI-001 · Naruto");
    expect(md).toContain("- [ ] NI-002 · Sasuke");
  });

  it("can export missing-only lists", () => {
    const md = formatChecklistMarkdown({
      totals: { owned: 1, total: 1, completion: 100 },
      includeOwned: false,
      sets: [
        {
          label: "Série 1",
          owned: 1,
          total: 1,
          completion: 100,
          cards: [{ reference: "NI-001", title: "Naruto", owned: true }],
        },
      ],
    });
    expect(md).toContain("_Complet — 1 / 1 (100 %)_");
    expect(md).not.toContain("- [x]");
  });

  it("lists sets without catalogue cards", () => {
    const md = formatChecklistMarkdown({
      totals: { owned: 0, total: 0, completion: 0 },
      sets: [],
      setsWithoutCatalogue: [{ label: "Série fantôme" }],
    });
    expect(md).toContain("## Sans catalogue");
    expect(md).toContain("- Série fantôme");
  });
});
