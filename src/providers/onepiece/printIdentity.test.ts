/**
 * OPTCG printKey + punk-records parse (no live download).
 */
import { describe, expect, it } from "vitest";

import {
  formatOnepieceReference,
  onepiecePrintKey,
} from "./printIdentity";
import {
  buildOnepiecePrintWrites,
  parsePunkRecordsCardsById,
} from "./punkRecords";

describe("onepiecePrintKey", () => {
  it("frappe la clé Bandai OPTCG", () => {
    expect(onepiecePrintKey("OP01-001")).toBe("onepiece:op01-001");
    expect(onepiecePrintKey("ST01-001_p1")).toBe("onepiece:st01-001-p1");
    expect(onepiecePrintKey("EB01-009_r1")).toBe("onepiece:eb01-009-r1");
  });

  it("affiche la référence imprimée", () => {
    expect(formatOnepieceReference("op01", "001")).toBe("OP01-001");
    expect(formatOnepieceReference("st01", "001", "p1")).toBe("ST01-001_P1");
  });
});

describe("parsePunkRecordsCardsById", () => {
  const SAMPLE = {
    "OP01-001": {
      card_id: "OP01-001",
      name: "Monkey D. Luffy",
      rarity: "Leader",
      category: "Leader",
      img_url:
        "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.webp",
    },
    "EB01-009_p1": {
      card_id: "EB01-009_p1",
      name: "Arrête de discuter et viens avec nous&nbsp;!!",
      rarity: "Common",
      category: "Event",
      img_url:
        "https://fr.onepiece-cardgame.com/images/cardlist/card/EB01-009_p1.webp",
    },
    junk: { name: "no id shape" },
  };

  it("garde les ids Bandai et décode le HTML des titres", () => {
    const cards = parsePunkRecordsCardsById(SAMPLE);
    expect(cards).toHaveLength(2);
    expect(cards[0]!.cardId).toBe("EB01-009_p1");
    expect(cards[0]!.name).toBe(
      "Arrête de discuter et viens avec nous !!",
    );
    expect(cards[1]!.cardId).toBe("OP01-001");
  });

  it("fusionne FR+EN sur la même printKey", () => {
    const writes = buildOnepiecePrintWrites([
      {
        lang: "fr",
        cards: parsePunkRecordsCardsById({
          "OP01-001": {
            card_id: "OP01-001",
            name: "Monkey D. Luffy",
            rarity: "Leader",
            img_url: "https://fr.example/OP01-001.webp",
          },
        }),
      },
      {
        lang: "en",
        cards: parsePunkRecordsCardsById({
          "OP01-001": {
            card_id: "OP01-001",
            name: "Monkey D. Luffy",
            rarity: "Leader",
            img_url: "https://en.example/OP01-001.webp",
          },
        }),
      },
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.printKey).toBe("onepiece:op01-001");
    expect(writes[0]!.titles.map((t) => t.lang).sort()).toEqual(["en", "fr"]);
  });
});
