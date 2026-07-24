import { describe, expect, it } from "vitest";

import { catalogTitleAlignedWithItem } from "@/core/commerce/retailer/catalogTitleAlignment";
import {
  METADATA_TITLE_ALIGN_FLOOR,
  isMetadataTitleAligned,
  metadataTitleSimilarity,
} from "@/core/enrich/titleMatching";

/**
 * Shared fixture table locking merge vs catalog-URL gates on the same floor.
 * Both must agree on accept/reject for these pairs (hardware → residual;
 * games/boardgames → floor 0.58 + shared heuristics where applicable).
 */
const IDENTITY_GATE_CASES = [
  {
    item: "Black Stories",
    candidate: "Black Stories Fantastique",
    shelfType: "boardgames" as const,
    expectAccept: false,
  },
  {
    item: "Black Stories - Femmes Fatales",
    candidate: "Black Stories: Funny Death Edition 2",
    shelfType: "boardgames" as const,
    expectAccept: false,
  },
  {
    item: "PlayStation 2",
    candidate: "Playstation 2 System",
    shelfType: "hardware" as const,
    expectAccept: true,
  },
  {
    item: "PlayStation 5",
    candidate: "Sony Playstation 1",
    shelfType: "hardware" as const,
    expectAccept: false,
  },
  {
    item: "Nintendo Switch",
    candidate: "Nintendo Switch 2",
    shelfType: "hardware" as const,
    expectAccept: false,
  },
  {
    item: "Little Nightmare",
    candidate: "Little Nightmares III",
    shelfType: "games" as const,
    expectAccept: false,
  },
  {
    item: "Metal Gear Solid",
    candidate: "Metal Gear Solid",
    shelfType: "games" as const,
    expectAccept: true,
  },
  {
    item: "Nintendo Wii Bleu",
    candidate: "Nintendo Wii Rose",
    shelfType: "hardware" as const,
    expectAccept: false,
  },
] as const;

describe("identity gate parity (merge ↔ catalog URL)", () => {
  it(`exports METADATA_TITLE_ALIGN_FLOOR=${METADATA_TITLE_ALIGN_FLOOR}`, () => {
    expect(METADATA_TITLE_ALIGN_FLOOR).toBe(0.58);
  });

  it.each(IDENTITY_GATE_CASES)(
    "$expectAccept — $item ↔ $candidate ($shelfType)",
    ({ item, candidate, shelfType, expectAccept }) => {
      const mergeAligned = isMetadataTitleAligned(
        { title: candidate },
        [item],
        METADATA_TITLE_ALIGN_FLOOR,
        { shelfType },
      );
      const catalogAligned = catalogTitleAlignedWithItem(item, candidate, {
        shelfType,
      });

      expect(mergeAligned).toBe(expectAccept);
      expect(catalogAligned).toBe(expectAccept);
    },
  );

  it("rejects soft 0.45-band pairs that formerly passed catalog-only", () => {
    // Similarity in (0.45, 0.58) must not accept via catalog URL alone.
    const item = "WRC 4";
    const candidate = "WRC 4 FIA World Rally Championship Extra";
    const similarity = metadataTitleSimilarity(item, candidate);
    // Only assert the floor contract when the pair is in the soft band.
    if (similarity >= 0.45 && similarity < METADATA_TITLE_ALIGN_FLOOR) {
      expect(
        catalogTitleAlignedWithItem(item, candidate, { shelfType: "games" }),
      ).toBe(false);
      expect(
        isMetadataTitleAligned({ title: candidate }, [item], METADATA_TITLE_ALIGN_FLOOR, {
          shelfType: "games",
        }),
      ).toBe(false);
    }
  });
});
