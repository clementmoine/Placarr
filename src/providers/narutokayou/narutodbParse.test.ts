import { describe, expect, it } from "vitest";

import { kayouOfficialIdToPrint } from "./kayouOfficialId";
import {
  buildNarutodbKayouChecklist,
  narutodbOfficialImageUrl,
  parseNarutodbCardsJson,
  parseNarutodbSetsJson,
} from "./narutodbParse";

describe("narutodbParse", () => {
  it("maps NREA01 ids like official product codes", () => {
    expect(kayouOfficialIdToPrint("NREA01-SR-018L2")).toEqual({
      setCode: "nrea01",
      number: "nrea01.sr.018l2",
    });
  });

  it("builds CDN front/back URLs", () => {
    expect(narutodbOfficialImageUrl("NREA01-SR-018L2", "back")).toBe(
      "https://cdn.narutodb.com/storage/cards/official/NREA01-SR-018L2-back.png",
    );
  });

  it("builds a checklist set for Earth Scroll 1", () => {
    const sets = parseNarutodbSetsJson([
      { id: "NREA01", name: "Earth Scroll", subtitle: "Series 1", total_cards: 132 },
    ]);
    const cards = parseNarutodbCardsJson([
      {
        card_number: "NREA01-SR-018L2",
        set_id: "NREA01",
        rarity_code: "SR",
        character_name: "Inojin Yamanaka",
      },
      {
        card_number: "NRCCNA-MR-001",
        set_id: "NRCCNA",
        rarity_code: "MR",
        character_name: "Naruto",
      },
    ]);
    const ledger = buildNarutodbKayouChecklist({
      sets,
      cardsBySet: { NREA01: cards.filter((c) => c.set_id === "NREA01") },
      observed: "2026-09-05",
    });
    expect(ledger.sets).toHaveLength(1);
    expect(ledger.sets[0]?.code).toBe("nrea01");
    expect(ledger.sets[0]?.cards[0]).toMatchObject({
      printed: "NREA01-SR-018L2",
      number: "nrea01.sr.018l2",
      name: "Inojin Yamanaka",
      rarity: "SR",
      faceSource: "narutodb",
      faceUrl:
        "https://cdn.narutodb.com/storage/cards/official/NREA01-SR-018L2-front.png",
    });
  });
});
