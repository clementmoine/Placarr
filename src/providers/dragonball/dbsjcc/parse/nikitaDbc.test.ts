import { describe, expect, it } from "vitest";

import { parseNikitaDbcCardlist } from "./nikitaDbc";

const SAMPLE = `
<table border='1'><tr><td><img src='/img/card/dbc/D-005.jpg' /><img src='/img/card/dbc/back.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>D-005　<a href='?name=ウーロン'>ウーロン</a></span><br /><a href='?ctype=キャラクター'>キャラクター</a>　<a href='?exp=カードゲーム1'>カードゲーム1</a></td></tr>
<tr><td><img src='/img/card/dbc/D-057.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>D-057　<a href='?name=フリーザ'>フリーザ</a></span></td></tr>
</table>
`;

describe("parseNikitaDbcCardlist", () => {
  it("normalizes D- numbers onto the JCC collector shape", () => {
    const cards = parseNikitaDbcCardlist(SAMPLE);
    expect(cards).toEqual([
      {
        printed: "D-5",
        number: "d0005",
        nameJa: "ウーロン",
        faceUrlJa: "https://tcg-db.nikita.jp/img/card/dbc/D-005.jpg",
        setLabel: "カードゲーム1",
      },
      {
        printed: "D-57",
        number: "d0057",
        nameJa: "フリーザ",
        faceUrlJa: "https://tcg-db.nikita.jp/img/card/dbc/D-057.jpg",
        setLabel: null,
      },
    ]);
  });
});
