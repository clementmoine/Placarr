import { describe, expect, it } from "vitest";

import { formatCessionMarkdown } from "./cessionMarkdown";

describe("formatCessionMarkdown", () => {
  it("lists past items with presence / reason / channel / price", () => {
    const md = formatCessionMarkdown({
      shelfName: "Naruto FR",
      items: [
        {
          name: "Naruto",
          reference: "NI-001",
          presence: "past",
          absenceReason: "sold",
          absenceSince: "2026-10-12T10:00:00.000Z",
          absenceSource: "Vinted",
          absencePriceCents: 2500,
        },
        {
          name: "Still owned",
          presence: "owned",
        },
      ],
    });
    expect(md).toContain("# Déjà eus — Naruto FR");
    expect(md).toContain(
      "- NI-001 · Naruto | past | sold | 2026-10-12 | Vinted | 25,00 €",
    );
    expect(md).not.toContain("Still owned");
  });

  it("handles empty past", () => {
    expect(formatCessionMarkdown({ items: [] })).toContain(
      "Aucun item en historique",
    );
  });
});
