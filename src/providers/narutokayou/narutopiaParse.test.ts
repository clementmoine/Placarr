import { describe, expect, it } from "vitest";

import {
  buildNarutopiaKayouImageIndex,
  enrichChecklistWithNarutopiaFaces,
  narutopiaKayouLookupKeys,
} from "./narutopiaParse";
import type { KayouChecklist } from "./kayouLedgerTypes";

describe("narutopiaKayouLookupKeys", () => {
  it("adds NR- prefix for SSR codes", () => {
    expect(narutopiaKayouLookupKeys("SSR-001")).toEqual(
      expect.arrayContaining(["SSR-001", "NR-SSR-001", "nr.ssr.001"]),
    );
  });
});

describe("enrichChecklistWithNarutopiaFaces", () => {
  it("fills missing faces from Narutopia index", () => {
    const index = buildNarutopiaKayouImageIndex([
      {
        url: "https://narutopia.fr/ssr-naruto-kayou/",
        entries: [
          {
            heading: "SSR-001-NARUTO",
            code: "SSR-001",
            name: "NARUTO",
            faceUrl: "https://narutopia.fr/wp-content/uploads/x/SSR-001.webp",
            widgetId: "SSR-001",
          },
        ],
      },
    ]);
    const base: KayouChecklist = {
      source: "test",
      url: "https://example.test",
      sets: [
        {
          slug: "t1",
          code: "t1w1",
          label: "T1W1",
          url: "https://example.test",
          cards: [
            {
              printed: "NR-SSR-001",
              number: "nr.ssr.001",
              name: "Naruto",
              rarity: "SSR",
              faceUrl: null,
            },
          ],
        },
      ],
    };
    const enriched = enrichChecklistWithNarutopiaFaces(base, index);
    expect(enriched.sets[0]!.cards[0]!.faceUrl).toContain("SSR-001.webp");
    expect(enriched.sets[0]!.cards[0]!.faceSource).toBe("narutopia");
  });
});
