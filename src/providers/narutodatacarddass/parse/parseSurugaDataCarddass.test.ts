import { describe, expect, it } from "vitest";

import {
  foldSurugaDataCarddassListings,
  parseSurugaDataCarddassCategoryHtml,
  parseSurugaDataCarddassListingsTsv,
  parseSurugaDataCarddassPrintedFromTitle,
  surugaDataCarddassFaceUrl,
} from "./parseSurugaDataCarddass";

describe("parseSurugaDataCarddass", () => {
  it("extrait la ref depuis un titre EN boutique", () => {
    expect(
      parseSurugaDataCarddassPrintedFromTitle("NM-113 [R] : Mukai Moji"),
    ).toBe("NM-113");
    expect(
      parseSurugaDataCarddassPrintedFromTitle("DN-032T [N] : Uzumaki Naruto"),
    ).toBe("DN-032T");
    expect(
      parseSurugaDataCarddassPrintedFromTitle("NFM 003 [Special] : Foo"),
    ).toBe("NFM-003");
    expect(
      parseSurugaDataCarddassPrintedFromTitle("NM - 031: Might Guy"),
    ).toBe("NM-031");
    expect(
      parseSurugaDataCarddassPrintedFromTitle(
        "NARUTOデータカードダス NX-CAM001[デザインレア]：うずまきナルト",
      ),
    ).toBe("NX-CAM-001");
    expect(
      parseSurugaDataCarddassPrintedFromTitle(
        "NX-SP I[プロモ]：うずまきナルト（Bランク）",
      ),
    ).toBe("NX-SP-I");
    expect(
      parseSurugaDataCarddassPrintedFromTitle('NFM-SP[R]：撃破”暁”'),
    ).toBe("NFM-SP");
  });

  it("CDN face URL matches Carddass host pattern", () => {
    expect(surugaDataCarddassFaceUrl("G8922301")).toBe(
      "https://cdn.suruga-ya.jp/database/pics/game/g8922301.jpg",
    );
  });

  it("lit le bloc ecommerce des pages catégorie EN", () => {
    const html = `
      items.push({
        item_id: "G8922301",
        item_name: "NM-113 [R] : Mukai Moji",
        currency: "JPY",
      })
      items.push({
        item_id: "G8904130",
        item_name: "DMP-003 [Promotion] : Itachi",
      })
    `;
    expect(parseSurugaDataCarddassCategoryHtml(html)).toEqual([
      {
        id: "G8922301",
        printed: "NM-113",
        title: "NM-113 [R] : Mukai Moji",
      },
      {
        id: "G8904130",
        printed: "DMP-003",
        title: "DMP-003 [Promotion] : Itachi",
      },
    ]);
  });

  it("lit les tuiles DOM modernes et code commun suruga-ya.jp", () => {
    const html = `
      <div class="item_detail">
        <div class="title">
          <a href="/product/detail/G9008358?branch_number=0077">
            <h3 class="product-name">DN-051T[激レア]：九尾のナルト（Bランク）</h3>
          </a>
        </div>
      </div>
      <script>
        var item_product = {
          item_id: common.htmlDecode('G9007603'),
          item_name: common.htmlDecode('DNP-012[プロモ]：日向ネジ'),
        };
      </script>
    `;
    expect(parseSurugaDataCarddassCategoryHtml(html)).toEqual([
      {
        id: "G9008358",
        printed: "DN-051T",
        title: "DN-051T[激レア]：九尾のナルト（Bランク）",
      },
      {
        id: "G9007603",
        printed: "DNP-012",
        title: "DNP-012[プロモ]：日向ネジ",
      },
    ]);
  });

  it("lit les tuiles legacy data-info (Wayback 2019)", () => {
    const html = `
      <a data-info="{&quot;id&quot;:&quot;G8903919&quot;,&quot;name&quot;:&quot;NM - 031: Might Guy&quot;,&quot;language&quot;:&quot;en&quot;}"
         data-product-id="G8903919">NM - 031: Might Guy</a>
    `;
    expect(parseSurugaDataCarddassCategoryHtml(html)).toEqual([
      {
        id: "G8903919",
        printed: "NM-031",
        title: "NM - 031: Might Guy",
      },
    ]);
  });

  it("fold TSV par printKey et garde plusieurs productIds", () => {
    const listings = parseSurugaDataCarddassListingsTsv(`
G1\tNM-113
G2\tNM-113
G3\tDN-001T
`);
    const cards = foldSurugaDataCarddassListings(listings);
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.printed === "NM-113")?.productIds).toEqual([
      "G1",
      "G2",
    ]);
  });
});
