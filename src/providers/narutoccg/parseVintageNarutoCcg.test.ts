import { describe, expect, it } from "vitest";

import vintage from "./curated/sources/vintage-naruto-ccg.json";
import {
  assignVintageNarutoDiskIds,
  normalizeVintageNarutoName,
  parseVintageNarutoCcgBundle,
  vintageNarutoCcgFaceUrl,
} from "./parseVintageNarutoCcg";

const FIXTURE = `
{"id":"ccg-the-path-to-hokage","name":"The Path to Hokage","slug":"the-path-to-hokage","category":"Main Sets","description":"Path to Hokage.","cardCount":3,"cards":[{"id":"ccg-278401","displayNumber":"1/122","name":"Kunai","rarity":"Common","thumbnail":"https://api.ccgtrader.co.uk/_/assets/7le1t5u9evswcck4?key=card-medium","image":"https://api.ccgtrader.co.uk/_/assets/7le1t5u9evswcck4?key=card-large"},{"id":"ccg-278402","displayNumber":"2/122","name":"Naruto Uzumaki - Super Rare","rarity":"Super Rare","thumbnail":"https://api.ccgtrader.co.uk/_/assets/abc123?key=card-medium","image":"https://api.ccgtrader.co.uk/_/assets/abc123?key=card-large"}]}
{"id":"ccg-eternal-rivalry","name":"Eternal Rivalry","slug":"eternal-rivalry","category":"Main Sets","description":"s6.","cardCount":1,"cards":[{"id":"ccg-900001","displayNumber":"1/113","name":"Kunai","rarity":"Common","thumbnail":"https://api.ccgtrader.co.uk/_/assets/us001?key=card-medium","image":"https://api.ccgtrader.co.uk/_/assets/us001?key=card-large"}]}
{"id":"ccg-shinobis-dream","name":"Shinobi's Dream","slug":"shinobis-dream","category":"Main Sets","description":"custom.","cardCount":1,"cards":[{"id":"ccg-fake","displayNumber":"1/1","name":"Fake","rarity":"Common","thumbnail":"https://api.ccgtrader.co.uk/_/assets/fake?key=card-medium","image":"https://api.ccgtrader.co.uk/_/assets/fake?key=card-large"}]}
`;

describe("parseVintageNarutoCcgBundle", () => {
  it("keeps Bandai CCG sets and drops Shinobi's Dream", () => {
    const cards = parseVintageNarutoCcgBundle(FIXTURE);
    expect(cards.map((c) => `${c.setCode}:${c.name}`)).toEqual([
      "s1:Kunai",
      "s1:Naruto Uzumaki - Super Rare",
      "s6:Kunai",
    ]);
    expect(cards[0]?.faceUrl).toBe(
      "https://api.ccgtrader.co.uk/_/assets/7le1t5u9evswcck4",
    );
  });

  it("maps s6 Kunai to J-US, not s1 J-001", () => {
    const mapped = assignVintageNarutoDiskIds(
      parseVintageNarutoCcgBundle(FIXTURE),
      [
        { number: "j001", setCode: "s1", name: "Kunai" },
        { number: "n001", setCode: "s1", name: "Naruto Uzumaki" },
        { number: "jus001", setCode: "s6", name: "Kunai" },
      ],
    );
    expect(
      mapped.find((c) => c.setCode === "s1" && c.name === "Kunai")?.number,
    ).toBe("j0001");
    expect(mapped.find((c) => c.setCode === "s6")?.number).toBe("jus0001");
    expect(
      mapped.find((c) => c.name.startsWith("Naruto Uzumaki"))?.number,
    ).toBe("n0001");
  });
});

describe("vintageNarutoCcgFaceUrl", () => {
  it("strips the broken card-large transform key", () => {
    expect(
      vintageNarutoCcgFaceUrl(
        "https://api.ccgtrader.co.uk/_/assets/7le1t5u9evswcck4?key=card-large",
      ),
    ).toBe("https://api.ccgtrader.co.uk/_/assets/7le1t5u9evswcck4");
  });
});

describe("normalizeVintageNarutoName", () => {
  it("drops shop rarity suffixes so Super Rare matches the checklist", () => {
    expect(normalizeVintageNarutoName("Naruto Uzumaki - Super Rare")).toBe(
      "naruto uzumaki",
    );
  });
});

describe("vintage-naruto-ccg ledger", () => {
  it("ingests CCG Trader faces, not Panini French or set 29", () => {
    expect(vintage.ingest).toBe("faces");
    expect(vintage.lang).toBe("en");
    expect(vintage.skip).toContain("shinobis-dream");
    expect(vintage.skip).toContain("french-panini");
    expect(vintage.not).toContain("carddass");
  });
});
