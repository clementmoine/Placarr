import { describe, expect, it } from "vitest";

import { parseNikitaBlcCardlist } from "./parseNikitaBlc";

const SAMPLE = `
<table border='1'><tr><td><img src='/img/card/blc/S-002.jpg' /><img src='/img/card/blc/back.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>S-002　<a href='?name=黒崎 一護'>黒崎 一護</a></span><br /><a href='?ctype=メインソウル'>メインソウル</a>　<a href='?exp=1.THE DEATH AND THE STRAWBERRY'>1.THE DEATH AND THE STRAWBERRY</a>　★</td></tr>
<tr><td><img src='/img/card/blc/B-120.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>B-120　<a href='?name=射殺せ『神鎗』'>射殺せ『神鎗』</a></span><br /><a href='?ctype=バトル'>バトル</a>　<a href='?exp=7.No One Stand On the Sky'>7.No One Stand On the Sky</a></td></tr>
<tr><td><img src='/img/card/blc/A-029.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>A-029　<a href='?name=良い太刀筋'>良い太刀筋</a></span><br /><a href='?ctype=アビリティ'>アビリティ</a>　<a href='?exp=11.THE Approaching Danger'>11.THE Approaching Danger</a></td></tr>
<tr><td><img src='/img/card/blc/E-007.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>E-007　<a href='?name=義魂丸'>義魂丸</a></span><br /><a href='?ctype=イベント'>イベント</a>　<a href='?exp=1.THE DEATH AND THE STRAWBERRY'>1.THE DEATH AND THE STRAWBERRY</a></td></tr>
<tr><td><img src='/img/card/blc/J-011.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>J-011　<a href='?name=女性死神協会'>女性死神協会</a></span><br /><a href='?ctype=メインソウル'>メインソウル</a>　<a href='?exp=プロモーションカード'>プロモーションカード</a></td></tr>
</table>
`;

describe("parseNikitaBlcCardlist", () => {
  it("extracts JA printed refs, names and face URLs", () => {
    const cards = parseNikitaBlcCardlist(SAMPLE);
    expect(cards).toHaveLength(5);
    expect(cards.find((c) => c.printed === "S-002")).toMatchObject({
      set: "s",
      number: "002",
      nameJa: "黒崎 一護",
      faceUrlJa: "https://tcg-db.nikita.jp/img/card/blc/S-002.jpg",
    });
    expect(cards.find((c) => c.printed === "B-120")).toMatchObject({
      set: "b",
      number: "120",
      nameJa: "射殺せ『神鎗』",
    });
    expect(cards.find((c) => c.printed === "E007")).toMatchObject({
      set: "e",
      number: "007",
      nameJa: "義魂丸",
      faceUrlJa: "https://tcg-db.nikita.jp/img/card/blc/E-007.jpg",
    });
  });

  it("keeps JP Ability A- off the FR âme set a", () => {
    const ability = parseNikitaBlcCardlist(SAMPLE).find(
      (c) => c.printed === "A-029",
    );
    expect(ability).toMatchObject({
      set: "ability",
      number: "029",
      nameJa: "良い太刀筋",
      cardType: "アビリティ",
      faceUrlJa: "https://tcg-db.nikita.jp/img/card/blc/A-029.jpg",
    });
  });

  it("keeps Jump promos J- off promo PZ", () => {
    const jump = parseNikitaBlcCardlist(SAMPLE).find(
      (c) => c.printed === "J-011",
    );
    expect(jump).toMatchObject({
      set: "j",
      number: "011",
      nameJa: "女性死神協会",
      faceUrlJa: "https://tcg-db.nikita.jp/img/card/blc/J-011.jpg",
    });
  });

  it("keeps nikita reprint face stems (_2) when base .jpg is absent", () => {
    const html = `
<table border='1'><tr><td><img src='/img/card/blc/B-014_2.jpg' /><img src='/img/card/blc/back.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>B-014　<a href='?name=疾ッ！！'>疾ッ！！</a></span><br /><a href='?ctype=バトル'>バトル</a>　<a href='?exp=4.Secret of the Moon'>4.Secret of the Moon</a></td></tr>
<tr><td><img src='/img/card/blc/E-003_2.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>E-003　<a href='?name=捂魂手甲'>捂魂手甲</a></span><br /><a href='?ctype=イベント'>イベント</a>　<a href='?exp=4.Secret of the Moon'>4.Secret of the Moon</a></td></tr>
</table>`;
    const cards = parseNikitaBlcCardlist(html);
    expect(cards.find((c) => c.printed === "B-014")).toMatchObject({
      set: "b",
      number: "014",
      nameJa: "疾ッ！！",
      faceUrlJa: "https://tcg-db.nikita.jp/img/card/blc/B-014_2.jpg",
    });
    expect(cards.find((c) => c.printed === "E003")).toMatchObject({
      set: "e",
      number: "003",
      faceUrlJa: "https://tcg-db.nikita.jp/img/card/blc/E-003_2.jpg",
    });
  });
});
