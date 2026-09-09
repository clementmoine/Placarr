import { describe, expect, it } from "vitest";

import { enrichChecklistWithOfficialFaces } from "./kayouOfficialFaces";
import type { KayouOfficialCatalog } from "./kayouOfficialCrawl";
import type { KayouChecklist } from "./kayouLedgerTypes";

describe("enrichChecklistWithOfficialFaces", () => {
  it("prefers official landscape fronts for wedding ◇MR rows", () => {
    const checklist: KayouChecklist = {
      source: "test",
      url: "https://example/",
      sets: [
        {
          slug: "ninjaageboxn",
          code: "ninjaageboxn",
          label: "N",
          url: "https://example/",
          cards: [
            {
              printed: "NR-CC-MR-001S",
              number: "cc.mr.001s",
              name: "Naruto Uzumaki",
              rarity: "CC-MR",
              faceUrl: "https://capsulecorpgear.com/wp-content/uploads/CC-MR-P001-H-yoccg.jpg",
              faceSource: "capsulecorpgear",
            },
          ],
        },
      ],
    };
    const catalog = {
      source: "test",
      ipId: "ip",
      observed: "",
      crawledAt: "",
      contentHash: "",
      previousHash: null,
      changed: false,
      series: [
        {
          seriesId: "series-x",
          seriesTypeName: "",
          seriesTypeDescription: "",
          productSpecs: {},
          sectionEyebrow: "",
          sectionTitle: "",
          url: "",
          cards: [
            {
              idCode: "NRCCNA-◇MR-001",
              name: "Happy Wedding",
              rarity: "◇MR",
              frontImage: "https://static-sg.kayouofficial.com/wedding-001.png",
              frontWidth: 1028,
              frontHeight: 733,
              backImage: "https://cdn.example/back.png",
            },
          ],
        },
      ],
    } satisfies KayouOfficialCatalog;

    const out = enrichChecklistWithOfficialFaces(checklist, catalog);
    const card = out.sets[0]!.cards[0]!;
    expect(card.faceUrl).toContain("kayouofficial.com");
    expect(card.faceSource).toBe("kayouofficial");
    expect(card.faceUrlAlternates).toContain(
      "https://capsulecorpgear.com/wp-content/uploads/CC-MR-P001-H-yoccg.jpg",
    );
  });
});
