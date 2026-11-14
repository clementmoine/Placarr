import { describe, expect, it } from "vitest";

import {
  asciiProgressBar,
  checklistMarkdownMark,
  checklistSetHasVisibleCards,
  checklistSetsForMarkdown,
  formatChecklistMarkdown,
  type ChecklistMarkdownVisibility,
} from "./checklistMarkdown";

const SHOW_ALL: ChecklistMarkdownVisibility = {
  showOwned: true,
  showAway: true,
  showPast: true,
  showVirtual: true,
};

const HIDE_OWNED: ChecklistMarkdownVisibility = {
  ...SHOW_ALL,
  showOwned: false,
};

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

  it("exports mixed checkboxes for away / past / virtual", () => {
    expect(checklistMarkdownMark({ owned: false, presence: "past" })).toBe(
      "mixed",
    );
    expect(checklistMarkdownMark({ owned: true, presence: "owned" })).toBe(
      "checked",
    );
    const md = formatChecklistMarkdown({
      totals: { owned: 1, total: 4, completion: 25 },
      sets: [
        {
          label: "Série 1",
          owned: 1,
          total: 4,
          completion: 25,
          cards: [
            {
              reference: "NI-001",
              title: "Naruto",
              owned: true,
              presence: "owned",
            },
            {
              reference: "NI-002",
              title: "Sasuke",
              owned: false,
              presence: "away",
              presenceLabel: "Absent",
            },
            {
              reference: "NI-003",
              title: "Sakura",
              owned: false,
              presence: "past",
              presenceLabel: "Déjà eu",
            },
            {
              reference: "NI-004",
              title: "Kakashi",
              owned: false,
              presence: "virtual",
              presenceLabel: "Virtuel",
            },
          ],
        },
      ],
    });
    expect(md).toContain("- [x] NI-001 · Naruto");
    expect(md).toContain("- [-] NI-002 · Sasuke · Absent");
    expect(md).toContain("- [-] NI-003 · Sakura · Déjà eu");
    expect(md).toContain("- [-] NI-004 · Kakashi · Virtuel");
  });

  it("can export a completed set with no visible rows", () => {
    const md = formatChecklistMarkdown({
      totals: { owned: 1, total: 1, completion: 100 },
      sets: [
        {
          label: "Série 1",
          owned: 1,
          total: 1,
          completion: 100,
          cards: [],
        },
      ],
    });
    expect(md).toContain("████████████████████ Complet — 1 / 1 · 100 %");
    expect(md).not.toContain("- [x]");
  });

  it("keeps past/away/virtual when owned rows are hidden", () => {
    const sets = checklistSetsForMarkdown(
      [
        {
          label: "Série 1",
          owned: 1,
          away: 1,
          total: 4,
          completion: 50,
          cards: [
            {
              printKey: "a",
              reference: "NI-001",
              title: "Naruto",
              owned: true,
              presence: "owned",
            },
            {
              printKey: "b",
              reference: "NI-002",
              title: "Sasuke",
              presence: "away",
            },
            {
              printKey: "c",
              reference: "NI-003",
              title: "Sakura",
              presence: "past",
            },
            {
              printKey: "d",
              reference: "NI-004",
              title: "Kakashi",
              owned: false,
              presence: "missing",
            },
          ],
          missing: [],
        },
      ],
      HIDE_OWNED,
      undefined,
      true,
      (presence) =>
        presence === "away"
          ? "Absent"
          : presence === "past"
            ? "Déjà eu"
            : null,
    );
    const md = formatChecklistMarkdown({
      totals: { owned: 2, total: 4, completion: 50 },
      sets,
    });
    expect(md).not.toContain("NI-001");
    expect(md).toContain("- [-] NI-002 · Sasuke · Absent");
    expect(md).toContain("- [-] NI-003 · Sakura · Déjà eu");
    expect(md).toContain("- [ ] NI-004 · Kakashi");
  });

  it("checklistSetsForMarkdown hides owned when showOwned is off", () => {
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
              presence: "owned",
            },
            {
              printKey: "naruto:s1-ni002",
              reference: "NI-002",
              title: "Sasuke",
              owned: false,
              presence: "missing",
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
      HIDE_OWNED,
    );
    expect(sets[0]!.cards).toEqual([
      {
        reference: "NI-002",
        title: "Sasuke",
        owned: false,
        presence: "missing",
      },
    ]);

    const md = formatChecklistMarkdown({
      totals: { owned: 1, total: 2, completion: 50 },
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
      SHOW_ALL,
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
      SHOW_ALL,
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
      SHOW_ALL,
    );
    const md = formatChecklistMarkdown({
      totals: { owned: 0, total: 1, completion: 0 },
      sets,
    });
    expect(md).toContain("- [ ] NI-002 · Sasuke · 3 €");
  });
});

describe("checklistSetHasVisibleCards", () => {
  const complete = {
    id: "s1",
    label: "Série 1",
    cards: [
      {
        printKey: "naruto:s1-ni001",
        reference: "NI-001",
        title: "Naruto",
        owned: true,
        presence: "owned",
      },
    ],
    missing: [],
  };

  it("hides the collapse on a complete set when owned cards are hidden", () => {
    expect(checklistSetHasVisibleCards(complete, HIDE_OWNED)).toBe(false);
  });

  it("keeps the collapse when owned cards are shown", () => {
    expect(checklistSetHasVisibleCards(complete, SHOW_ALL)).toBe(true);
  });

  it("keeps the collapse when a missing card remains", () => {
    expect(
      checklistSetHasVisibleCards(
        {
          ...complete,
          cards: [
            ...complete.cards,
            {
              printKey: "naruto:s1-ni002",
              reference: "NI-002",
              title: "Sasuke",
              owned: false,
              presence: "missing",
            },
          ],
        },
        HIDE_OWNED,
      ),
    ).toBe(true);
  });

  it("opens a complete set that still has a visible past card", () => {
    expect(
      checklistSetHasVisibleCards(
        {
          id: "s2",
          label: "Série 2",
          cards: [
            {
              printKey: "naruto:s2-ni001",
              reference: "NI-001",
              title: "Sakura",
              owned: false,
              presence: "past",
            },
          ],
          missing: [],
        },
        { ...HIDE_OWNED, showPast: true },
      ),
    ).toBe(true);
    expect(
      checklistSetHasVisibleCards(
        {
          id: "s2",
          label: "Série 2",
          cards: [
            {
              printKey: "naruto:s2-ni001",
              reference: "NI-001",
              title: "Sakura",
              owned: false,
              presence: "past",
            },
          ],
          missing: [],
        },
        { ...HIDE_OWNED, showPast: false },
      ),
    ).toBe(false);
  });

  it("does not expand a name-matched set whose cards are all hidden", () => {
    expect(
      checklistSetHasVisibleCards(complete, HIDE_OWNED, "serie"),
    ).toBe(false);
    expect(checklistSetHasVisibleCards(complete, SHOW_ALL, "serie")).toBe(
      true,
    );
    expect(checklistSetHasVisibleCards(complete, HIDE_OWNED, "sasuke")).toBe(
      false,
    );
  });
});
