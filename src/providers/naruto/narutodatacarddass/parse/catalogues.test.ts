import { describe, expect, it } from "vitest";
import {
  foldSurugaDataCarddassListings,
  looksLikeMojibakeJa,
  mergeNaoYoshiSeesaaRows,
  normalizeNaoYoshiRarity,
  normalizeOfficialPrinted,
  parseBattleCardCsv,
  parseCrossCardlistHtml,
  parseEbayDataCarddassSearchHtml,
  parseFormationCardlistHtml,
  parseMissionCardlistHtml,
  parseNaoYoshiSeesaaArticle,
  parseSurugaDataCarddassCategoryHtml,
  parseSurugaDataCarddassListingsTsv,
  parseSurugaDataCarddassPrintedFromTitle,
  surugaDataCarddassFaceUrl,
} from "./catalogues";

// —— parseEbaySearchHtml ——
{
  describe("parseEbayDataCarddassSearchHtml", () => {
    it("extracts printedRef + imageId from pasted search HTML", () => {
      const html = `
        <a href="https://www.ebay.fr/itm/187160256573">
          <img src="https://i.ebayimg.com/images/g/DxkAAOSwyhZoBa93/s-l500.webp"/>
          <span>NFP-017 Promo Uchiha Sasuke Naruto Data Carddass</span>
        </a>
        <a href="https://www.ebay.fr/itm/186247937473">
          <img src="https://i.ebayimg.com/images/g/KiMAAOSwSt1ln04z/s-l225.webp"/>
          NARUTO Ultimate Cross orochimaru NX-290 Shippuden
        </a>
      `;
      const faces = parseEbayDataCarddassSearchHtml(html);
      expect(faces.map((f) => f.printedRef).sort()).toEqual([
        "NFP-17",
        "NX-290",
      ]);
      expect(faces.find((f) => f.printedRef === "NX-290")?.imageId).toBe(
        "KiMAAOSwSt1ln04z",
      );
      expect(faces[0]!.url).toMatch(/\/s-l1600\.webp$/);
    });

    it("skips ambiguous NXP-SP romans", () => {
      const html = `
        <a href="https://www.ebay.fr/itm/186019830697">
          <img src="https://i.ebayimg.com/images/g/1C0AAOSwmnFkzGH1/s-l500.webp"/>
          SASUKE NXP-SPⅡ promo
        </a>
      `;
      expect(parseEbayDataCarddassSearchHtml(html)).toEqual([]);
    });
  });
}

// —— parseNaoYoshiSeesaa ——
{
  const NX_SNIPPET = `
  <table>
  <tr><th>NO.</th><th>カード名</th><th>レア</th><th>start</th><th>データ</th><th>CheckDigit</th><th>stop</th></tr>
  <tr><td>NX-001</td><td>うずまきナルト</td><td>N</td><td>A</td><td>NX5VC3336</td><td>FF</td><td>stop</td></tr>
  <tr><td>NX-002</td><td>うずまきナルト</td><td>SR</td><td>A</td><td>NX2CZ5D89</td><td>SHIFT</td><td>stop</td></tr>
  <tr><td>NX-108</td><td>うちはサスケ</td><td>激</td><td>A</td><td>NX9AB4Y86</td><td>GS</td><td>stop</td></tr>
  <tr><td>NX-MAC001</td><td>うずまきナルト</td><td>-</td><td>A</td><td>NF0LB7400</td><td>D</td><td>stop</td></tr>
  <tr><td colspan="7">noise NXSKZQ65P barcode only</td></tr>
  </table>
  `;

  const DN_SNIPPET = `
  <table>
  <tr><th>種</th><th>NO.</th><th>カード名</th><th>レア</th><th>start</th><th>データ</th><th>CheckDigit</th><th>stop</th></tr>
  <tr><td>-</td><td>DN-001T</td><td>うずまきナルト</td><td>Ｎ</td><td>A</td><td>NR5AH0016</td><td>U</td><td>stop</td></tr>
  <tr><td>-</td><td>DN-002T,DNP-001</td><td>うずまきナルト</td><td>Ｎ</td><td>A</td><td>NR0AS0041</td><td>BS</td><td>stop</td></tr>
  <tr><td>-</td><td>DN-108T</td><td>うずまきナルト</td><td>爆</td><td>A</td><td>NR9AB4Y86</td><td>GS</td><td>stop</td></tr>
  </table>
  `;

  describe("parseNaoYoshiSeesaa", () => {
    it("normalizes rarity glyphs", () => {
      expect(normalizeNaoYoshiRarity("Ｎ")).toBe("N");
      expect(normalizeNaoYoshiRarity("Ｒ")).toBe("R");
      expect(normalizeNaoYoshiRarity("激")).toBe("激レア");
      expect(normalizeNaoYoshiRarity("爆")).toBe("爆レア");
      expect(normalizeNaoYoshiRarity("-")).toBeNull();
      expect(normalizeNaoYoshiRarity("stop")).toBeNull();
    });

    it("detects mojibake Japanese titles", () => {
      expect(looksLikeMojibakeJa("うずまきナルト")).toBe(false);
      expect(looksLikeMojibakeJa("縺�★縺ｾ縺阪リ")).toBe(true);
      expect(looksLikeMojibakeJa("broken�name")).toBe(true);
    });

    it("parses NX article rows without treating barcodes as printed refs", () => {
      const rows = parseNaoYoshiSeesaaArticle(NX_SNIPPET, {
        articleId: "387083772",
        cabinet: "nx",
      });
      expect(rows.map((r) => r.printed)).toEqual([
        "NX-001",
        "NX-002",
        "NX-108",
        "NX-MAC001",
      ]);
      expect(rows.find((r) => r.printed === "NX-002")?.rarity).toBe("SR");
      expect(rows.find((r) => r.printed === "NX-108")?.rarity).toBe("激レア");
      expect(rows.find((r) => r.printed === "NX-MAC001")?.rarity).toBeNull();
      expect(rows.find((r) => r.printed === "NX-001")?.barcodeData).toBe(
        "NX5VC3336",
      );
    });

    it("parses DN rows including comma-joined printed refs", () => {
      const rows = parseNaoYoshiSeesaaArticle(DN_SNIPPET, {
        articleId: "387082531",
        cabinet: "dn",
      });
      expect(rows.map((r) => r.printed)).toEqual([
        "DN-001T",
        "DN-002T",
        "DNP-001",
        "DN-108T",
      ]);
      expect(rows.find((r) => r.printed === "DN-001T")?.rarity).toBe("N");
      expect(rows.find((r) => r.printed === "DN-108T")?.rarity).toBe("爆レア");
    });

    it("merges duplicate printed refs preferring richer rows", () => {
      const merged = mergeNaoYoshiSeesaaRows([
        {
          printed: "NX-001",
          nameJa: "うずまきナルト",
          rarity: null,
          barcodeData: null,
          cabinet: "nx",
          articleId: "a",
        },
        {
          printed: "NX-001",
          nameJa: "うずまきナルト",
          rarity: "N",
          barcodeData: "NX5VC3336",
          cabinet: "nx",
          articleId: "b",
        },
      ]);
      expect(merged.get("NX-001")?.rarity).toBe("N");
      expect(merged.get("NX-001")?.barcodeData).toBe("NX5VC3336");
    });
  });
}

// —— parseOfficialCardlists ——
{
  describe("parseOfficialCardlists", () => {
    it("normalise NF001 et DN-032T", () => {
      expect(normalizeOfficialPrinted("NF001")).toBe("NF-001");
      expect(normalizeOfficialPrinted("DN-032T")).toBe("DN-032T");
      expect(normalizeOfficialPrinted("DN-051-R")).toBe("DN-051R");
      expect(normalizeOfficialPrinted("DN-051R")).toBe("DN-051R");
    });

    it("lit le CSV battle_card", () => {
      const csv = [
        "収録,カードNo,カード名,奥義名",
        "1弾,DN-001T,うずまきナルト,忍術 影分身の術",
        "promo,DNP-001,はたけカカシ,写輪眼",
      ].join("\n");
      expect(parseBattleCardCsv(csv)).toEqual([
        { printed: "DN-001T", nameJa: "うずまきナルト" },
        { printed: "DNP-001", nameJa: "はたけカカシ" },
      ]);
    });

    it("lit une ligne Mission NM", () => {
      const html = `
        <td rowspan="5" bgcolor="#006DB8" class="s_font_wb" nowrap>NM-049</td>
        <td rowspan="3" bgcolor="#EEFFFF" nowrap><strong><a href="javascript:;">うちはイタチ</a></strong></td>
      `;
      expect(parseMissionCardlistHtml(html)).toEqual([
        { printed: "NM-049", nameJa: "うちはイタチ" },
      ]);
    });

    it("lit une ligne Formation NF sans tiret", () => {
      const html = `
        <td rowspan="4" nowrap="nowrap" class="cardNum s_font_b">NF141</td>
        <td rowspan="4" nowrap="nowrap" class="m_font_b"><a href="javascript:;">うちはイタチ<br>(疾風伝)</a></td>
      `;
      expect(parseFormationCardlistHtml(html)).toEqual([
        { printed: "NF-141", nameJa: "うちはイタチ" },
      ]);
    });

    it("lit une ligne Cross NX / NXP / NXpf", () => {
      const html = `
        <td rowspan="3" class="card_name_num">NX-002</td>
        <td nowrap="nowrap" class="card_name_num"><a href="javascript:;">うずまきナルト</a></td>
        <td rowspan="3" class="card_name_num">NXpf-001</td>
        <td nowrap="nowrap" class="card_name_num"><a href="javascript:;">うずまきナルト</a></td>
      `;
      expect(parseCrossCardlistHtml(html)).toEqual([
        { printed: "NX-002", nameJa: "うずまきナルト" },
        { printed: "NXPF-001", nameJa: "うずまきナルト" },
      ]);
    });
  });
}

// —— parseSurugaDataCarddass ——
{
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
}
