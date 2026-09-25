/**
 * Tests for Hatatoy DBC harvest — EUC-JP decode, category table.list only,
 * printed / DB hint / JA title, full-size image preference.
 */
import { describe, expect, it } from "vitest";

import {
  decodeHatatoyHtml,
  extractHatatoyCategoryListHtml,
  extractJaTitleFromHatatoyTitle,
  extractPrintedFromHatatoyTitle,
  extractSetHintFromHatatoyTitle,
  facesFromHatatoyListings,
  hatatoyFullImageUrl,
  matchHatatoyToDbsjccPrint,
  parseHatatoyCategoryListing,
  preferHatatoyFullImage,
} from "./hatatoy";
import type { DbsjccPrintCandidate } from "./chitoroshop";

/**
 * Trimmed from a 2026-09-24 capture of cbid=2849233&csid=31 page 1.
 * Sidebar products come *before* category_title (must be ignored).
 */
const FIXTURE_UTF8 = `
<div class="side">
  <a href="?pid=999000001"><img src="https://img07.shop-pro.jp/PA01424/345/product/999000001_th.jpg" />遊戯王 サイドバー</a>
  <div class="name"><a href="?pid=999000002">ONE PIECE OP01-001 ルフィ</a></div>
</div>
<div class="category_title">バンダイ ドラゴンボール</div>
<div class="pagenavi">全 [<span>878</span>] 商品中 [<span>1</span>-<span>12</span>] 商品を表示しています。</div>
<table class="list" border="0" cellspacing="0" cellpadding="0">
  <tr valign="top">
    <td class="img">
      <span class="img-layout">
      <a href="?pid=172757160" /><img src="https://img07.shop-pro.jp/PA01424/345/product/172757160_th.jpg?cmsp_timestamp=20230530170425" class="border" /></a>
      </span>
    </td>
    <td>
      <div class="name"><a href="?pid=172757160">バンダイ ドラゴンボール DB10 D-920 真空の嵐 ☆2 レア ホロ</a></div>
    </td>
  </tr>
  <tr valign="top">
    <td class="img">
      <img src="https://img07.shop-pro.jp/PA01424/345/product/172757161_th.jpg" class="border" />
    </td>
    <td>
      <div class="name"><a href="?pid=172757161">バンダイ ドラゴンボール DB4 D-298 ピッコロ(マジュニア) ☆2 レア ホロ</a></div>
    </td>
  </tr>
  <tr valign="top">
    <td class="img">
      <img src="https://img07.shop-pro.jp/PA01424/345/product/172757401_th.jpg" />
    </td>
    <td>
      <div class="name"><a href="?pid=172757401">バンダイ ドラゴンボール SP-52 ベビー(スーパーベビー) ☆0 プロモ</a></div>
    </td>
  </tr>
  <tr valign="top">
    <td class="img">
      <img src="https://img07.shop-pro.jp/PA01424/345/product/172759000_th.jpg" />
    </td>
    <td>
      <div class="name"><a href="?pid=172759000">バンダイ ドラゴンボール DB1 D026 孫悟空 ☆0 ノーマル</a></div>
    </td>
  </tr>
</table>
`;

describe("decodeHatatoyHtml", () => {
  it("decodes EUC-JP — the shop serves nothing else", () => {
    // 龍 in EUC-JP is 0xCE 0xB6; as UTF-8 it would be mojibake.
    const bytes = new Uint8Array([0xce, 0xb6]);
    expect(decodeHatatoyHtml(bytes)).toBe("龍");
  });
});

describe("extractHatatoyCategoryListHtml", () => {
  it("returns only the category table.list body", () => {
    const block = extractHatatoyCategoryListHtml(FIXTURE_UTF8);
    expect(block).toBeTruthy();
    expect(block!).toContain("172757160");
    expect(block!).not.toContain("999000001");
  });
});

describe("parseHatatoyCategoryListing", () => {
  it("keeps category singles and drops the site-wide sidebar", () => {
    const rows = parseHatatoyCategoryListing(FIXTURE_UTF8);
    expect(rows.map((r) => r.pid)).toEqual([
      "172757160",
      "172757161",
      "172757401",
      "172759000",
    ]);
    expect(rows.some((r) => r.pid.startsWith("999"))).toBe(false);
  });
});

describe("preferHatatoyFullImage / hatatoyFullImageUrl", () => {
  it("strips _th and query from CDN thumbs", () => {
    expect(
      preferHatatoyFullImage(
        "https://img07.shop-pro.jp/PA01424/345/product/172757160_th.jpg?cmsp_timestamp=1",
      ),
    ).toBe(
      "https://img07.shop-pro.jp/PA01424/345/product/172757160.jpg",
    );
  });

  it("builds the full-size photo URL from pid", () => {
    expect(hatatoyFullImageUrl("172757160")).toBe(
      "https://img07.shop-pro.jp/PA01424/345/product/172757160.jpg",
    );
    expect(hatatoyFullImageUrl("172757160")).not.toContain("_th");
  });
});

describe("extractPrintedFromHatatoyTitle", () => {
  it("parses D-920 and D026 without hyphen", () => {
    expect(
      extractPrintedFromHatatoyTitle(
        "バンダイ ドラゴンボール DB10 D-920 真空の嵐 ☆2 レア ホロ",
      ),
    ).toEqual({ printed: "D-920", number: "d0920" });
    expect(
      extractPrintedFromHatatoyTitle(
        "バンダイ ドラゴンボール DB1 D026 孫悟空 ☆0 ノーマル",
      ),
    ).toEqual({ printed: "D-26", number: "d0026" });
  });

  it("parses SP-52", () => {
    expect(
      extractPrintedFromHatatoyTitle(
        "バンダイ ドラゴンボール SP-52 ベビー(スーパーベビー) ☆0 プロモ",
      ),
    ).toEqual({ printed: "SP-52", number: "sp0052" });
  });
});

describe("extractSetHintFromHatatoyTitle", () => {
  it("maps DB N to partN", () => {
    expect(
      extractSetHintFromHatatoyTitle(
        "バンダイ ドラゴンボール DB10 D-920 真空の嵐",
        "d0920",
      ),
    ).toBe("part10");
    expect(
      extractSetHintFromHatatoyTitle(
        "バンダイ ドラゴンボール DB4 D-298 ピッコロ",
        "d0298",
      ),
    ).toBe("part4");
  });

  it("forces SP printed numbers onto set sp", () => {
    expect(
      extractSetHintFromHatatoyTitle(
        "バンダイ ドラゴンボール SP-52 ベビー ☆0 プロモ",
        "sp0052",
      ),
    ).toBe("sp");
  });
});

describe("extractJaTitleFromHatatoyTitle", () => {
  it("keeps the Japanese name and drops brand / DB / rarity", () => {
    expect(
      extractJaTitleFromHatatoyTitle(
        "バンダイ ドラゴンボール DB10 D-920 真空の嵐 ☆2 レア ホロ",
      ),
    ).toBe("真空の嵐");
    expect(
      extractJaTitleFromHatatoyTitle(
        "バンダイ ドラゴンボール DB4 D-298 ピッコロ(マジュニア) ☆2 レア ホロ",
      ),
    ).toBe("ピッコロ(マジュニア)");
    expect(
      extractJaTitleFromHatatoyTitle(
        "バンダイ ドラゴンボール SP-52 ベビー(スーパーベビー) ☆0 プロモ",
      ),
    ).toBe("ベビー(スーパーベビー)");
  });
});

describe("facesFromHatatoyListings", () => {
  it("dedupes by number and prefers full-size CDN urls", () => {
    const faces = facesFromHatatoyListings(
      parseHatatoyCategoryListing(FIXTURE_UTF8),
    );
    expect(faces.map((f) => f.printed)).toEqual([
      "D-26",
      "D-298",
      "D-920",
      "SP-52",
    ]);
    const d920 = faces.find((f) => f.number === "d0920")!;
    expect(d920.setHint).toBe("part10");
    expect(d920.titleJa).toBe("真空の嵐");
    expect(d920.url).toBe(
      "https://img07.shop-pro.jp/PA01424/345/product/172757160.jpg",
    );
    expect(d920.url).not.toContain("_th");
  });
});

describe("matchHatatoyToDbsjccPrint", () => {
  const d0920: DbsjccPrintCandidate[] = [
    {
      printKey: "dbsjcc:part10-d0920",
      setCode: "part10",
      number: "d0920",
      grouping: null,
    },
    {
      printKey: "dbsjcc:promo-d0920",
      setCode: "promo",
      number: "d0920",
      grouping: null,
    },
  ];

  it("prefers DB/part hint over other sets", () => {
    expect(matchHatatoyToDbsjccPrint("d0920", "part10", d0920)).toEqual({
      kind: "match",
      print: d0920[0],
    });
  });

  it("without hint prefers lowest partN over promo", () => {
    const many: DbsjccPrintCandidate[] = [
      {
        printKey: "dbsjcc:part4-d0129",
        setCode: "part4",
        number: "d0129",
        grouping: null,
      },
      {
        printKey: "dbsjcc:part1-d0129",
        setCode: "part1",
        number: "d0129",
        grouping: null,
      },
      {
        printKey: "dbsjcc:promo-d0129",
        setCode: "promo",
        number: "d0129",
        grouping: null,
      },
    ];
    expect(matchHatatoyToDbsjccPrint("d0129", null, many)).toEqual({
      kind: "match",
      print: many[1],
    });
  });

  it("mints JA-only when set hint has no FR print", () => {
    expect(matchHatatoyToDbsjccPrint("d0584", "part7", [])).toEqual({
      kind: "mint",
      setCode: "part7",
    });
  });

  it("skips when no hint and no FR print", () => {
    expect(matchHatatoyToDbsjccPrint("d0584", null, [])).toEqual({
      kind: "skip",
      reason: "no FR print for d0584 and no set hint",
    });
  });
});
