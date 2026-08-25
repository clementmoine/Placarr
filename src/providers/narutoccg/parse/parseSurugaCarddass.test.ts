import { describe, expect, it } from "vitest";

import ledger from "../curated/sources/suruga-ya-carddass.json";
import {
  foldSurugaCarddassListings,
  loadSurugaCarddassCuratedListings,
  mergeSurugaCarddassListings,
  parseSurugaCarddassPrinted,
  parseSurugaCarddassSearchHtml,
  parseSurugaProductDetailHtml,
  surugaCarddassFaceUrl,
  surugaPrintedToDiskId,
} from "./parseSurugaCarddass";

const FIXTURE = `
<a href="https://www.suruga-ya.jp/product/detail/GL636976">NARUTO-ナルト-カードゲーム 巻ノ六 依-12 ヒマツ</a>
<a href="https://www.suruga-ya.jp/product/detail/GL410631">忍-85[ウルトラレア]：うずまきナルト(パック版)</a>
<a href="https://www.suruga-ya.jp/product/detail/NM049xxx">データカードダス NARUTO NM-049 猿飛アスマ</a>
<a href="https://www.suruga-ya.jp/product/detail/GL999dn">ナルティメットカードバトル DN-032T</a>
`;

describe("parseSurugaCarddassPrinted", () => {
  it.each([
    ["依-12 ヒマツ", "依-12"],
    ["忍-85[ウルトラレア]", "忍-85"],
    ["PR忍-1-R", "PR忍-1-R"],
    ["NM-049", null],
    ["DN-032T", null],
  ] as const)("reads %s", (raw, printed) => {
    expect(parseSurugaCarddassPrinted(raw)).toBe(printed);
  });
});

describe("surugaPrintedToDiskId", () => {
  it("maps JP Carddass prefixes, never EN CCG n001", () => {
    expect(surugaPrintedToDiskId("忍-85")).toBe("ni0085");
    expect(surugaPrintedToDiskId("術-1")).toBe("te0001");
    expect(surugaPrintedToDiskId("作-248")).toBe("ta0248");
    expect(surugaPrintedToDiskId("依-12")).toBe("cl0012");
    expect(surugaPrintedToDiskId("PR忍-1-R")).toBe("prni0001-R");
  });

  /*
    `NM-049` rendait `null` jusqu'au 2026-08-19, Data Carddass étant hors
    catalogue. La ligne arcade y est entrée : le convertisseur sait désormais
    la nommer. Ce qui n'a pas changé, c'est la frontière — une annonce de borne
    n'entre pas dans un relevé Carddass, et c'est le parseur qui la garde, pas
    l'ignorance du numéro.
  */
  it("nomme les cartes de borne sans les laisser entrer chez le jeu de table", () => {
    expect(surugaPrintedToDiskId("NM-049")).toBe("nm0049");
    expect(
      parseSurugaProductDetailHtml("<h1>NM-049 猿飛アスマ</h1>", "GL1"),
    ).toBeNull();
  });
});

describe("parseSurugaCarddassSearchHtml", () => {
  it("keeps tabletop 忍/術/作/依 and drops Data Carddass", () => {
    const rows = parseSurugaCarddassSearchHtml(FIXTURE);
    expect(rows).toEqual([
      { id: "GL636976", printed: "依-12" },
      { id: "GL410631", printed: "忍-85" },
    ]);
    expect(surugaCarddassFaceUrl("GL636976")).toBe(
      "https://cdn.suruga-ya.jp/database/pics/game/gl636976.jpg",
    );
  });
});

describe("foldSurugaCarddassListings", () => {
  it("keeps extra Suruga SKUs as fallbacks for the same disk id", () => {
    const folded = foldSurugaCarddassListings([
      { id: "GN431411", printed: "依-12" },
      { id: "GL636976", printed: "依-12" },
    ]);
    expect(folded).toEqual([
      {
        number: "cl0012",
        printed: "依-12",
        productIds: ["GN431411", "GL636976"],
        faceUrl: "https://cdn.suruga-ya.jp/database/pics/game/gn431411.jpg",
      },
    ]);
  });
});

describe("parseSurugaProductDetailHtml", () => {
  it("reads printed code from a product page", () => {
    expect(
      parseSurugaProductDetailHtml(
        "<title>NARUTO 巻ノ壱 忍-1 うずまきナルト</title><h1>忍-1 うずまきナルト</h1>",
        "gl636810",
      ),
    ).toEqual({ id: "GL636810", printed: "忍-1" });
  });

  it("drops Data Carddass pages without a tabletop code", () => {
    expect(
      parseSurugaProductDetailHtml(
        "データカードダス NARUTO NM-049 猿飛アスマ",
        "NM049XXX",
      ),
    ).toBeNull();
  });
});

describe("mergeSurugaCarddassListings", () => {
  it("dedupes by product id, probes first", () => {
    expect(
      mergeSurugaCarddassListings(
        [{ id: "GL636810", printed: "忍-1" }],
        [
          { id: "GL636812", printed: "忍-6" },
          { id: "GL636810", printed: "忍-1" },
        ],
      ),
    ).toEqual([
      { id: "GL636810", printed: "忍-1" },
      { id: "GL636812", printed: "忍-6" },
    ]);
  });
});

describe("suruga-ya-carddass ledger", () => {
  it("ingests tabletop Carddass faces, not arcade Data Carddass", () => {
    expect(ledger.ingest).toBe("faces");
    expect(ledger.lang).toBe("ja");
    expect(ledger.line).toBe("carddass-jp");
    expect(ledger.not).toContain("data-carddass");
    expect(ledger.not).toContain("en-ccg");
    const listings = loadSurugaCarddassCuratedListings();
    expect(listings.length).toBe(460);
    expect(listings.some((row) => row.id === "GL636976")).toBe(true);
    expect(listings.some((row) => /DN-|NM-/.test(row.printed))).toBe(false);
    expect(foldSurugaCarddassListings(listings).length).toBeGreaterThan(300);
    expect(listings.some((row) => row.printed === "忍-3")).toBe(false);
  });
});
