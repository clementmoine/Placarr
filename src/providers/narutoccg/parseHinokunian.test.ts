import { describe, expect, it } from "vitest";

import {
  decodeHinokunianHtml,
  hinokunianPageUrl,
  parseHinokunianAlts,
  parseHinokunianPage,
  parseHinokunianTable,
  toHalfWidth,
} from "./parseHinokunian";

/* Rognés sur les pages du 2026-08-20 — les trois formes du site. */
const VOLUME = `
<TABLE>
<TR><TD width="65" align="center"><FONT size="-1">忍-1</FONT></TD>
<TD width="200"><FONT size="-1">うずまきナルト</FONT></TD>
<TD width="85"></TD></TR>
<TR><TD width="65" align="center"><FONT size="-1">忍-2</FONT></TD>
<TD width="200"><FONT size="-1">うちはサスケ</FONT></TD>
<TD width="85"><FONT size="-1">R</FONT></TD></TR>
</TABLE>`;

const ARCADE_TABLE = `
<TABLE>
<TR><TD>DN-002T</TD><TD>うずまきナルト</TD><TD>忍術　うずまきナルト連弾</TD>
<TD>新イラスト</TD><TD>50円</TD><TD>SR</TD></TR>
<TR><TD>DN-003T</TD><TD>うずまきナルト</TD><TD>口寄せ　ガマブン太</TD>
<TD>再録</TD><TD>　</TD><TD>U</TD></TR>
</TABLE>`;

const ARCADE_ALTS = `
<img src="a.gif" alt="DN-001T うずまきナルト -影分身の術-【ノーマル】" width="43" height="64">
<img src="b.gif" alt="DN-004T うずまきナルト -螺旋丸-【爆レア】" width="43" height="64">
<img src="logo.gif" alt="火の国庵" width="200" height="40">`;

describe("toHalfWidth", () => {
  it("ramène les deux chasses du site à une seule", () => {
    expect(toHalfWidth("ＤＮ－００２Ｔ")).toBe("DN-002T");
    expect(toHalfWidth("忍-1")).toBe("忍-1");
  });
});

describe("parseHinokunianTable", () => {
  it("lit une page de volume : référence, nom, rareté", () => {
    const cards = parseHinokunianTable(VOLUME);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      printed: "忍-1",
      name: "うずまきナルト",
      rarity: null,
    });
    // Une case vide vaut « normale » : on n'invente pas de rareté.
    expect(cards[1]).toMatchObject({ printed: "忍-2", rarity: "R" });
  });

  it("lit une page arcade à six colonnes sans compter sur leur ordre", () => {
    const cards = parseHinokunianTable(ARCADE_TABLE);
    expect(cards[0]).toMatchObject({
      printed: "DN-002T",
      name: "うずまきナルト",
      subtitle: "忍術 うずまきナルト連弾",
      rarity: "SR",
      editionNote: "新イラスト",
    });
    expect(cards[1]?.editionNote).toBe("再録");
  });

  it("laisse la cote du site dehors : ce n'est pas une donnée de carte", () => {
    const cards = parseHinokunianTable(ARCADE_TABLE);
    expect(JSON.stringify(cards)).not.toContain("50円");
    expect(cards[0]?.extra).toEqual([]);
  });
});

describe("parseHinokunianAlts", () => {
  it("lit la première vague arcade, qui ne met rien en table", () => {
    const cards = parseHinokunianAlts(ARCADE_ALTS);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      printed: "DN-001T",
      name: "うずまきナルト",
      subtitle: "影分身の術",
      rarity: "ノーマル",
    });
    expect(cards[1]?.rarity).toBe("爆レア");
  });

  it("ignore les vignettes d'habillage", () => {
    expect(parseHinokunianAlts('<img alt="火の国庵">')).toEqual([]);
  });
});

describe("parseHinokunianPage", () => {
  it("préfère la table, qui porte plus de colonnes que l'alt", () => {
    const cards = parseHinokunianPage(`${ARCADE_TABLE}${ARCADE_ALTS}`);
    expect(cards.map((c) => c.printed)).toEqual(["DN-002T", "DN-003T"]);
  });

  it("retombe sur les alt quand la page n'a pas de table", () => {
    expect(parseHinokunianPage(ARCADE_ALTS)).toHaveLength(2);
  });

  it("ne rend qu'une fiche par référence", () => {
    // Le site réécrit la même référence ailleurs dans la page.
    expect(parseHinokunianPage(`${VOLUME}${VOLUME}`)).toHaveLength(2);
  });
});

describe("decodeHinokunianHtml", () => {
  it("décode le SHIFT_JIS que le site sert", () => {
    // Lu en UTF-8, les références ASCII passent et les noms sortent en
    // mojibake : le relevé aurait l'air correct sans l'être.
    const bytes = new Uint8Array([0x82, 0xa0, 0x82, 0xa2]);
    expect(decodeHinokunianHtml(bytes)).toBe("あい");
  });
});

describe("hinokunianPageUrl", () => {
  it("construit l'URL d'une page du relevé", () => {
    expect(hinokunianPageUrl("cardgamemakino1.html")).toBe(
      "https://hinokunian.konohashigure.com/cardgamemakino1.html",
    );
  });
});

describe("les préfixes venus du relevé lui-même", () => {
  /*
    Le ledger ne connaissait que `DN` et `NM`. La moisson a rendu deux autres
    préfixes, et chacun a été lu sur la page avant d'entrer ici : la quatrième
    vague arcade numérote `DT-002T`, et le porte-cartes 木ノ葉絵巻 `CAN-1` —
    ce dernier corrobore `cardcheckbox-jp.json`, qui annonçait « CAN-1〜CAN-6 ».
  */
  it("lit la quatrième vague arcade, qui passe de DN à DT", () => {
    const cards = parseHinokunianTable(
      "<TABLE><TR><TD>DT-002T</TD><TD>うずまきナルト</TD><TD>うずまきナルト連弾</TD><TD>再録</TD><TD>SR</TD></TR></TABLE>",
    );
    expect(cards[0]).toMatchObject({
      printed: "DT-002T",
      name: "うずまきナルト",
      rarity: "SR",
      editionNote: "再録",
    });
  });

  it("lit le porte-cartes, numéroté CAN", () => {
    const cards = parseHinokunianTable(
      "<TABLE><TR><TD>CAN-1</TD><TD>うずまきナルト</TD><TD></TD></TR></TABLE>",
    );
    expect(cards[0]?.printed).toBe("CAN-1");
  });

  it("ne prend pas les pages de stickers pour des cartes", () => {
    // Les séries シール / スナック ne portent aucune référence de cette forme :
    // rendre zéro est le bon résultat, pas un échec de lecture.
    expect(
      parseHinokunianTable(
        "<TABLE><TR><TD>ナルト</TD><TD>１種</TD></TR></TABLE>",
      ),
    ).toEqual([]);
  });
});

describe("les encarts boutique", () => {
  /*
    Le site vit d'affiliation : chaque page porte des vignettes Rakuten. Sur la
    page du 巻ノ七, elles annoncent des cartes du 巻ノ八 — `術-131 千鳥［巻ノ八
    /ウルトラレア］`. Les lire comme des cartes de la page en cours rattacherait
    un tirage à la mauvaise sortie.
  */
  it("refuse une vignette qui annonce une autre sortie", () => {
    const html =
      '<img alt="術-131 千鳥［巻ノ八/ウルトラレア］"><img alt="DN-001T うずまきナルト -影分身の術-【ノーマル】">';
    expect(parseHinokunianAlts(html).map((c) => c.printed)).toEqual([
      "DN-001T",
    ]);
  });

  it("écarte la cote, en colonne comme dans un encart", () => {
    const cards = parseHinokunianTable(
      "<TABLE><TR><TD>SR</TD><TD>DN-051T</TD><TD>九尾のナルト</TD><TD>九尾の力</TD><TD></TD><TD>2,000円(中古)</TD></TR></TABLE>",
    );
    expect(cards[0]).toMatchObject({
      printed: "DN-051T",
      name: "九尾のナルト",
      subtitle: "九尾の力",
      rarity: "SR",
    });
    // `extra` ne doit garder que ce qu'on n'a pas su placer, pas des prix.
    expect(cards[0]?.extra).toEqual([]);
  });
});
