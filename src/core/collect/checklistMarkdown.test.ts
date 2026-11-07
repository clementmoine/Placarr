import { describe, expect, it } from "vitest";

import {
  asciiProgressBar,
  checklistSetsForMarkdown,
  formatChecklistMarkdown,
} from "./checklistMarkdown";

describe("asciiProgressBar", () => {
  it("fills proportionally", () => {
    expect(asciiProgressBar(0, 10)).toBe("░░░░░░░░░░");
    expect(asciiProgressBar(50, 10)).toBe("█████░░░░░");
    expect(asciiProgressBar(90, 20)).toBe("██████████████████░░");
    expect(asciiProgressBar(100, 10)).toBe("██████████");
  });
});

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
    expect(md).not.toContain("Français");
    expect(md.indexOf("## Série 1")).toBeLessThan(md.indexOf("█"));
    expect(md).toContain("██████████░░░░░░░░░░ 1 / 2 · 50 %");
    expect(md).not.toContain("`█");
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
    expect(md).toContain("████████████████████ Complet — 1 / 1 · 100 %");
    expect(md).not.toContain("- [x]");
  });

  it("omits owned cards when includeOwned is false", () => {
    const md = formatChecklistMarkdown({
      totals: { owned: 1, total: 2, completion: 50 },
      includeOwned: false,
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
    expect(md).toContain("- [ ] NI-002 · Sasuke");
    expect(md).not.toContain("NI-001");
    expect(md).not.toContain("- [x]");
  });

  it("checklistSetsForMarkdown uses missing when owned are hidden", () => {
    const sets = checklistSetsForMarkdown(
      [
        {
          label: "Série 1",
          owned: 1,
          total: 2,
          completion: 50,
          cards: [
            {
              printKey: "naruto:s1-ni001",
              reference: "NI-001",
              title: "Naruto",
              owned: true,
            },
            {
              printKey: "naruto:s1-ni002",
              reference: "NI-002",
              title: "Sasuke",
              owned: false,
            },
          ],
          missing: [
            {
              printKey: "naruto:s1-ni002",
              reference: "NI-002",
              title: "Sasuke",
            },
          ],
        },
      ],
      false,
    );
    expect(sets[0]!.cards).toEqual([
      { reference: "NI-002", title: "Sasuke", owned: false },
    ]);

    const md = formatChecklistMarkdown({
      totals: { owned: 1, total: 2, completion: 50 },
      includeOwned: false,
      sets,
    });
    expect(md).toContain("- [ ] NI-002 · Sasuke");
    expect(md).not.toContain("NI-001");
  });

  it("omits sole finish; shows finish when dual or prerelease sibling", () => {
    const sets = checklistSetsForMarkdown(
      [
        {
          label: "Série 1",
          owned: 0,
          total: 5,
          completion: 0,
          cards: [
            {
              printKey: "naruto:s2-ni0023-promo",
              reference: "NI-023 · promo",
              title: "Kakashi",
              owned: false,
              finish: "holo",
            },
            {
              printKey: "naruto:s1-ni0001",
              reference: "NI-001",
              title: "Naruto",
              owned: false,
              finish: "normal",
            },
            {
              printKey: "naruto:s1-ni0001",
              reference: "NI-001",
              title: "Naruto",
              owned: false,
              finish: "holo",
            },
            {
              printKey: "naruto:s1-ni0019",
              reference: "NI-019",
              title: "Retail",
              owned: false,
              finish: "holo",
            },
            {
              printKey: "naruto:s1-ni0019-prerelease",
              reference: "NI-019 · prerelease",
              title: "Sachet",
              owned: false,
              finish: "sealed",
            },
          ],
          missing: [],
        },
      ],
      true,
      (finish) =>
        finish === "holo"
          ? "Holofoil"
          : finish === "normal"
            ? "Normale"
            : finish === "sealed"
              ? "Scellé"
              : finish,
    );
    expect(sets[0]!.cards.map((c) => c.reference)).toEqual([
      "NI-023 · promo",
      "NI-001 (Normale)",
      "NI-001 (Holofoil)",
      "NI-019 (Holofoil)",
      "NI-019 · prerelease (Scellé)",
    ]);

    const always = checklistSetsForMarkdown(
      [
        {
          label: "Série 1",
          owned: 0,
          total: 1,
          completion: 0,
          cards: [
            {
              printKey: "naruto:s2-ni0023-promo",
              reference: "NI-023 · promo",
              title: "Kakashi",
              owned: false,
              finish: "holo",
            },
          ],
          missing: [],
        },
      ],
      true,
      (finish) => (finish === "holo" ? "Holofoil" : finish),
      false,
    );
    expect(always[0]!.cards[0]!.reference).toBe("NI-023 · promo (Holofoil)");
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

  it("appends formatted prices when provided", () => {
    const sets = checklistSetsForMarkdown(
      [
        {
          label: "Série 1",
          owned: 0,
          total: 1,
          completion: 0,
          cards: [
            {
              printKey: "naruto:s1-ni002",
              reference: "NI-002",
              title: "Sasuke",
              owned: false,
            },
          ],
          missing: [],
          prices: { "naruto:s1-ni002": "3 €" },
        },
      ],
      true,
    );
    const md = formatChecklistMarkdown({
      totals: { owned: 0, total: 1, completion: 0 },
      sets,
    });
    expect(md).toContain("- [ ] NI-002 · Sasuke · 3 €");
  });
});
