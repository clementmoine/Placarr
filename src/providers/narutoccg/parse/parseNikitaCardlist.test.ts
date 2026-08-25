import { describe, expect, it } from "vitest";

import { parseNikitaCardlist } from "./parseNikitaCardlist";

/* One row per shape, copied from the 2026-08-19 capture of /cardlist/nrt. */
const FIXTURE = `
<table border='1'>
<tr><td><img src='/img/card/nrt/N-001.jpg' /><img src='/img/card/nrt/back.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>忍-1　<a href='?name=うずまきナルト'>うずまきナルト</a></span><br /><a href='?ctype=忍'>忍</a>　<a href='?exp=巻ノ壱'>巻ノ壱</a><br />シンボル：<a href='?color=雷'>雷</a>　コスト：0<br />戦闘力：1　支援力：0　負傷戦闘力：3　負傷支援力：1<br />特徴：<a href='?type=木ノ葉'>木ノ葉</a>／<a href='?type=下忍'>下忍</a>／<a href='?type=男'>男</a>　戦闘属性：<a href='?btype=忍'>忍</a><span style='font-style:italic;'><br />「オレってば、もう二度と助けられるようなマネはしねぇ・・・」</span></td></tr>
<tr><td><img src='/img/card/nrt/J-002.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>術-2　<a href='?name=十字手裏剣'>十字手裏剣</a></span><br /><a href='?ctype=術'>術</a>　<a href='?exp=巻ノ壱'>巻ノ壱</a><br />シンボル：<a href='?color=雷'>雷</a>　コスト：2<br />【目標】使用者<br />【効果】目標はターン中、+3/±0を得る。<span style='font-style:italic;'><br />「ここだ！」</span></td></tr>
<tr><td><img src='/img/card/nrt/I-002.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>依-2　<a href='?name=タズナ'>タズナ</a></span><br /><a href='?ctype=依頼人'>依頼人</a>　<a href='?exp=巻ノ参 挑戦者集結！編'>巻ノ参 挑戦者集結！編</a><br />シンボル：<a href='?color=水'>水</a>／<a href='?color=土'>土</a>　コスト：1<br />特徴：<a href='?type=波の国'>波の国</a>／<a href='?type=男'>男</a><br />【効果】相手の戦果を捨て札にする。<span style='font-style:italic;'><br />「わしが国に帰るまで護衛してもらう！」</span></td></tr>
<tr><td><img src='/img/card/nrt/K-007.jpg' /></td><td><span style='font-weight:bold;font-size:120%;'>K-7　<a href='?name=テムジン'>テムジン</a></span><br /><a href='?ctype=騎士'>騎士</a>　<a href='?exp=巻ノ十三 両雄激突！終末の谷編'>巻ノ十三 両雄激突！終末の谷編</a><br />シンボル：<a href='?color=火'>火</a>　コスト：4<br />戦闘力：5　支援力：2　負傷戦闘力：4　負傷支援力：0<br />特徴：<a href='?type=騎士'>騎士</a>／<a href='?type=男'>男</a>／<a href='?type=ゲレル'>ゲレル</a>　戦闘属性：<a href='?btype=剣'>剣</a><span style='font-style:italic;'><br />「石のことなら誰より知ってる」</span></td></tr>
</table>
`;

describe("parseNikitaCardlist", () => {
  it("reads a ninja row whole", () => {
    const [naruto] = parseNikitaCardlist(FIXTURE);
    expect(naruto).toMatchObject({
      nikitaKey: "N-001",
      number: "ni0001",
      printedRef: "忍-1",
      name: "うずまきナルト",
      cardType: "忍",
      setLabel: "巻ノ壱",
      setCode: "maki1",
      symbols: ["雷"],
      cost: 0,
      power: 1,
      support: 0,
      woundedPower: 3,
      woundedSupport: 1,
      traits: ["木ノ葉", "下忍", "男"],
      battleAttribute: "忍",
      quote: "オレってば、もう二度と助けられるようなマネはしねぇ・・・",
    });
    // A vanilla ninja has no rules text — the type/set line is not one.
    expect(naruto?.effect).toBeNull();
    expect(naruto?.target).toBeNull();
  });

  it("splits 目標 from 効果 on a jutsu", () => {
    const jutsu = parseNikitaCardlist(FIXTURE)[1];
    expect(jutsu).toMatchObject({
      number: "te0002",
      cardType: "術",
      cost: 2,
      target: "使用者",
      effect: "目標はターン中、+3/±0を得る。",
    });
    // Jutsu carry no combat values.
    expect(jutsu?.power).toBeNull();
    expect(jutsu?.traits).toEqual([]);
  });

  it("keeps both symbols of a two-symbol client", () => {
    const client = parseNikitaCardlist(FIXTURE)[2];
    expect(client).toMatchObject({
      number: "cl0002",
      cardType: "依頼人",
      symbols: ["水", "土"],
      cost: 1,
      traits: ["波の国", "男"],
      setCode: "maki3",
      effect: "相手の戦果を捨て札にする。",
    });
  });

  it("folds the Latin knight key — the text view writes K-7, not 騎-7", () => {
    const knight = parseNikitaCardlist(FIXTURE)[3];
    expect(knight).toMatchObject({
      nikitaKey: "K-007",
      printedRef: "騎-7",
      number: "ki0007",
      cardType: "騎士",
      setCode: "maki13",
      battleAttribute: "剣",
      traits: ["騎士", "男", "ゲレル"],
      power: 5,
      woundedPower: 4,
    });
  });

  it("mints nothing — every row resolves onto an id we already speak", () => {
    const rows = parseNikitaCardlist(FIXTURE);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.number !== null)).toBe(true);
  });
});
