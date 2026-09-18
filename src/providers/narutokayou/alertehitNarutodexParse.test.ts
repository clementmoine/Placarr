import path from "node:path";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildAlertehitImageIndex,
  enrichChecklistWithAlertehitFaces,
  parseAlertehitImages,
} from "./alertehitNarutodexParse";
import type { KayouChecklist } from "./kayouLedgerTypes";

describe("alertehitNarutodexParse", () => {
  const js = readFileSync(
    path.join(__dirname, "fixtures/alertehit-narutodex.js"),
    "utf8",
  );

  it("indexes hitmarket images by rarity folder", () => {
    const rows = parseAlertehitImages(js);
    expect(rows.length).toBeGreaterThan(1600);
    expect(rows.some((r) => r.faceUrl.includes("naruto.hitmarket.fr/UR/NRSS-UR-001.webp"))).toBe(
      true,
    );
  });

  it("enriches merged rows with short-ref hitmarket URLs", () => {
    const index = buildAlertehitImageIndex(js);
    const base: KayouChecklist = {
      source: "test",
      url: "https://example.test/",
      sets: [
        {
          slug: "t1w1",
          code: "t1w1",
          label: "T1W1",
          url: "https://example.test/",
          cards: [
            {
              printed: "NR-SP-002",
              number: "nr.sp.002",
              name: "Nagato",
              rarity: "SP",
              faceUrl: "https://cdn.narutocards.ca/a.webp",
            },
          ],
        },
      ],
    };
    const enriched = enrichChecklistWithAlertehitFaces(base, index);
    const card = enriched.sets[0]?.cards[0];
    expect(card?.faceUrlAlternates?.some((u) => u.includes("hitmarket.fr/SP/SP-2.webp"))).toBe(
      true,
    );
  });
});
