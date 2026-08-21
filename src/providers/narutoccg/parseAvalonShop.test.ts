import { describe, expect, it } from "vitest";

import { narutoDiskCardId } from "./collectorIdentity";
import ledger from "./curated/sources/avalon-shop-jp.json";
import {
  avalonFullImageUrl,
  avalonListingUrl,
  cleanAvalonTitle,
  decodeAvalonHtml,
  parseAvalonNarutoListing,
} from "./parseAvalonShop";

/* Trimmed from the 2026-08-19 capture: two 巻ノ singles, one 騎 number, one
   sidebar product from another game, and one ナルティメット title. */
const FIXTURE = `
<ul class="product"> <li> <a href="?pid=163062619">
<img src="https://img08.shop-pro.jp/PA01034/747/product/163062619_th.jpg?cmsp_timestamp=20210901164730" />忍-165 パックン（若干傷み）
</a> <span class="price">40円(税込44円)</span></li>
<li> <a href="?pid=163062626">
<img src="https://img08.shop-pro.jp/PA01034/747/product/163062626_th.jpg" />忍-190 聖シモン（若干傷み）
</a></li>
<li> <a href="?pid=163062700">
<img src="https://img08.shop-pro.jp/PA01034/747/product/163062700_th.jpg" />騎-7 テムジン
</a></li>
<li> <a href="?pid=192026862">
<img src="https://img08.shop-pro.jp/PA01034/747/product/192026862_th.jpg" />OP16-108 シリュウ
</a></li>
<li> <a href="?pid=163062800">
<img src="https://img08.shop-pro.jp/PA01034/747/product/163062800_th.jpg" />ナルティメットカードバトル うずまきナルト
</a></li></ul>
`;

describe("parseAvalonNarutoListing", () => {
  it("keeps 巻ノ refs and drops the site-wide sidebar", () => {
    const rows = parseAvalonNarutoListing(FIXTURE);
    expect(rows.map((row) => row.printedRef)).toEqual([
      "忍-165",
      "忍-190",
      "騎-7",
    ]);
    // OP16-108 is a ONE PIECE card in the sidebar; ナルティメット is another
    // product line of the same shop. Neither opens on a 忍/術/作/依/騎 ref.
    expect(rows.some((row) => row.pid === "192026862")).toBe(false);
    expect(rows.some((row) => row.pid === "163062800")).toBe(false);
  });

  it("reads the JP name and leaves the grade out of it", () => {
    const rows = parseAvalonNarutoListing(FIXTURE);
    expect(rows[0]?.title).toBe("パックン");
    expect(rows[1]?.title).toBe("聖シモン");
    expect(rows[2]?.title).toBe("テムジン");
  });

  it("keeps parentheses that are part of a name", () => {
    expect(cleanAvalonTitle("うずまきナルト（九尾）")).toBe(
      "うずまきナルト（九尾）",
    );
    expect(cleanAvalonTitle("パックン（若干傷み）")).toBe("パックン");
    expect(cleanAvalonTitle("（傷み）")).toBeNull();
  });

  it("maps the printed refs onto disk ids, 騎 included", () => {
    const rows = parseAvalonNarutoListing(FIXTURE);
    expect(rows.map((row) => narutoDiskCardId(row.printedRef))).toEqual([
      "ni0165",
      "ni0190",
      "ki0007",
    ]);
  });

  it("builds the full-size photo URL, never the _th thumbnail", () => {
    expect(avalonFullImageUrl("163062619")).toBe(
      "https://img08.shop-pro.jp/PA01034/747/product/163062619.jpg",
    );
    expect(avalonFullImageUrl("163062619")).not.toContain("_th");
  });

  it("decodes EUC-JP — the shop serves nothing else", () => {
    // 忍 in EUC-JP is 0xC7 0xA6; as UTF-8 it would be mojibake.
    const bytes = new Uint8Array([0xc7, 0xa6, 0x2d, 0x31]);
    expect(decodeAvalonHtml(bytes)).toBe("忍-1");
  });
});

describe("avalon-shop-jp ledger", () => {
  it("stays a paste-and-verify host, not a crawl", () => {
    expect(ledger.crawlLive).toBe(false);
    expect(ledger.lang).toBe("ja");
    expect(ledger.line).toBe("carddass-jp");
    expect(ledger.not).toContain("naruTimate-as-tabletop");
    expect(ledger.url).toBe(avalonListingUrl());
  });
});
