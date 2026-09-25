import { describe, expect, it } from "vitest";
import ledger from "../curated/sources/avalon-shop-jp.json";
import ledger_parseSurugaCarddass from "../curated/sources/suruga-ya-carddass.json";
import { narutoDiskCardId } from "../identity";
import { avalonFullImageUrl, avalonListingUrl, cleanAvalonTitle, decodeAvalonHtml, parseAvalonNarutoListing, chitoroVolumeSetCode, chitoroPsDiskOverride, japaneseFamilyOf, normalizeShopName, parseChitoroTitle, resolveChitoroIdentity, resolveChitoroNameFamily, frilFamilyClash, frilLargeImage, frilRefFromTitle, frilRefWithinPublishedRange, frilSearchUrl, parseFrilSearch, parseStorm3Listing, parseStorm3ProductFaceUrl, storm3PrintKey, foldSurugaCarddassListings, loadSurugaCarddassCuratedListings, mergeSurugaCarddassListings, parseSurugaCarddassPrinted, parseSurugaCarddassSearchHtml, parseSurugaProductDetailHtml, parseSurugaCarddassCharacterName, surugaCarddassFaceUrl, surugaPrintedToDiskId } from "./marketplace";

// —— parseAvalonShop ——
{
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
}

// —— parseChitoroshop ——
{
  /*
    La boutique ne dit pas la famille de ses cartes : « Baki 130 » peut être
    忍-130 comme 術-130. Deux signaux indépendants la donnent — le nom anglais,
    qui joint le catalogue CCG américain, et le volume, dont les plages de numéros
    sont connues. Sur les 227 produits ils se prononcent ensemble 15 fois et ne se
    contredisent jamais ; c'est cette absence de désaccord qui autorise à faire
    confiance aux cas où un seul parle.
  */

  describe("identifier une carte de chitoroshop", () => {
    it("reads the name and the number off the title", () => {
      expect(parseChitoroTitle("Baki 130 | Naruto Card Game")).toEqual({
        name: "baki",
        number: 130,
      });
      expect(parseChitoroTitle("Gaara of the desert 295 | X")).toEqual({
        name: "gaara of the desert",
        number: 295,
      });
    });

    it("routes the known PS bonus scan off the retail booster number", () => {
      expect(chitoroPsDiskOverride("ni0002")).toBe("ni0002-ps");
      expect(chitoroPsDiskOverride("ni0003")).toBeNull();
    });

    /*
      La boutique ajoute parfois une rareté ou un surnom (« Hime UR ») après le
      nom CCG. Le préfixe catalogue le plus long qui matche encore le titre
      récupère la famille — sans liste magique de tokens.
    */
    it("joins a shop title that lengthens the catalog EN name", () => {
      const index = new Map<string, Set<string>>([
        ["tsunade|354", new Set(["ni"])],
        ["chakra rope|354", new Set(["te"])],
      ]);
      expect(resolveChitoroNameFamily(index, "tsunade hime ur", 354)).toBe("ni");
      expect(resolveChitoroNameFamily(index, "tsunade", 354)).toBe("ni");
      expect(resolveChitoroNameFamily(index, "gaara of the desert", 295)).toBeNull();
    });

    /*
      La collection tient aussi des autocollants et de la Data Carddass, qui ne
      sont pas des cartes de ce jeu. 85 des 227 produits sont dans ce cas.
    */
    it("refuses a title that is not a card of this game", () => {
      expect(
        parseChitoroTitle("Orochimaru 2-26 N | Naruto Wafer Stickers"),
      ).toBeNull();
      expect(parseChitoroTitle("Naruto Card Game")).toBeNull();
    });

    it("folds accents, so Kidōmaru meets Kidomaru", () => {
      expect(normalizeShopName("Kidōmaru")).toBe(normalizeShopName("Kidomaru"));
    });

    it("reads the volume the shop prints", () => {
      expect(chitoroVolumeSetCode("Naruto Card Game Vol.6 (2004)")).toBe("maki6");
      expect(chitoroVolumeSetCode("Vol. 13 | BANDAI")).toBe("maki13");
      expect(chitoroVolumeSetCode("Naruto Card Game | Promo")).toBeNull();
    });

    /** Le catalogue américain numérote `n`/`j`/`m` ce que le japonais dit 忍/術/作. */
    it("translates the American family into the Japanese one", () => {
      expect(japaneseFamilyOf("n")).toBe("ni");
      expect(japaneseFamilyOf("j")).toBe("te");
      expect(japaneseFamilyOf("m")).toBe("ta");
      expect(japaneseFamilyOf("zzz")).toBeNull();
    });

    /*
      Un désaccord ne se tranche pas. Il ne s'en est présenté aucun, et le jour où
      il s'en présentera un, c'est qu'une des deux tables est fausse — pas qu'il
      faut départager au hasard.
    */
    it("refuses to choose when the two signals disagree", () => {
      expect(
        resolveChitoroIdentity({ number: 130, byName: "ni", byVolume: "te" }),
      ).toBeNull();
    });

    it("marks what decided, so a doubt stays traceable", () => {
      expect(
        resolveChitoroIdentity({ number: 130, byName: "ni", byVolume: "ni" }),
      ).toEqual({ family: "ni", number: 130, by: "both" });
      expect(
        resolveChitoroIdentity({ number: 130, byName: "ni", byVolume: null }),
      ).toEqual({ family: "ni", number: 130, by: "name" });
      expect(
        resolveChitoroIdentity({ number: 130, byName: null, byVolume: null }),
      ).toBeNull();
    });
  });
}

// —— parseFrilListing ——
{
  /* Two result cards from the 2026-08-19 capture, trimmed to the attributes we read. */
  const FIXTURE = `
  <div class="content"><section class="view view_grid">
  <div class="item"><div class="item-box"><div class="item-box__image-wrapper">
  <a href="https://item.fril.jp/600d1c2c892ad9bde4e4825fac4866ad" class="link_search_image"
     data-rat-itemid="16205181/848809897"
     data-rat-item_name="NARUTO ナルト カードゲーム 忍-106 赤胴ヨロイ BANDAI 2005"
     data-rat-price="980"
     data-rat-cp-totalresults="286">
  <img data-original="https://img.fril.jp/img/848809897/m/2931377158.jpg?1787152936" alt="x"></a>
  </div></div></div>
  <div class="item"><div class="item-box"><div class="item-box__image-wrapper">
  <a href="https://item.fril.jp/aaaa1c2c892ad9bde4e4825fac48660d" class="link_search_image"
     data-rat-itemid="16205181/848809900"
     data-rat-item_name="NARUTO ナルト カードゲーム ガマブン太 カツユ マンダ 5枚セット 忍-220 221 222"
     data-rat-price="1500">
  <img data-original="https://img.fril.jp/img/848809900/m/2931377999.jpg" alt="x"></a>
  </div></div></div>
  </section></div>
  `;

  describe("frilRefFromTitle", () => {
    it("takes the single printed ref, hyphen or katakana long mark", () => {
      expect(frilRefFromTitle("NARUTO カードゲーム 忍-106 赤胴ヨロイ")).toEqual({
        ref: "忍-106",
      });
      // Sellers type 忍ー257 with the katakana mark; it is the same card.
      expect(
        frilRefFromTitle("NARUTOカードゲーム　うちはサスケ　忍ー257"),
      ).toEqual({ ref: "忍-257" });
      expect(frilRefFromTitle("NARUTO ナルトカードゲーム PR忍-4 プロモ")).toEqual(
        {
          ref: "PR忍-4",
        },
      );
    });

    it("refuses a lot — a photo of several cards is the face of none", () => {
      expect(
        frilRefFromTitle("ナルトカードゲーム 5枚セット 忍-220 221 222"),
      ).toEqual({ reason: "lot" });
      // Even without 枚/セット: the seller stopped repeating the prefix.
      expect(frilRefFromTitle("ナルトカードゲーム 忍-220 221 222")).toEqual({
        reason: "lot",
      });
      expect(frilRefFromTitle("【NARUTO】ナルトカードゲーム 忍-25～27")).toEqual({
        reason: "lot",
      });
      expect(frilRefFromTitle("ナルトカードゲーム 忍-45 まとめ売り")).toEqual({
        reason: "lot",
      });
    });

    it("keeps `1枚` — it means one card, not a lot", () => {
      expect(
        frilRefFromTitle("NARUTO ナルトカードゲーム PR忍-4 うずまきナルト 1枚"),
      ).toEqual({ ref: "PR忍-4" });
    });

    it("keeps a duo card — 忍-264 is printed 奈良シカマル&テマリ", () => {
      expect(
        frilRefFromTitle("NARUTOカードゲーム 忍-264 奈良シカマル&テマリ SR"),
      ).toEqual({ ref: "忍-264" });
    });

    it("refuses the other product lines that share the franchise", () => {
      for (const title of [
        "ナルト疾風伝 カードゲーム 忍伝-145 うずまきナルト",
        "ナルト データカードダス 忍-3",
        "NARUTO ミラクルバトルカードダス 忍-1 プロモ",
        "ナルト ウエハース 忍-2",
        "NARUTO ROAD TO NINJA 忍-11 プロモ",
      ]) {
        expect(frilRefFromTitle(title)).toEqual({ reason: "other-line" });
      }
    });

    it("says why when there is nothing to join on", () => {
      expect(frilRefFromTitle("NARUTOカードゲーム プロモ 初期 映画")).toEqual({
        reason: "no-ref",
      });
    });
  });

  describe("parseFrilSearch", () => {
    it("reads id, title, price and the large photo; drops the lot", () => {
      const parsed = parseFrilSearch(FIXTURE);
      expect(parsed.total).toBe(286);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0]).toMatchObject({
        listingId: "848809897",
        sellerId: "16205181",
        printedRef: "忍-106",
        priceYen: 980,
        itemUrl: "https://item.fril.jp/600d1c2c892ad9bde4e4825fac4866ad",
      });
      // The grid serves `/m/`; the face must come from `/l/`.
      expect(parsed.items[0]?.imageUrl).toContain("/848809897/l/");
      expect(narutoDiskCardId(parsed.items[0]!.printedRef)).toBe("ni0106");
      expect(parsed.rejected).toEqual([
        {
          title:
            "NARUTO ナルト カードゲーム ガマブン太 カツユ マンダ 5枚セット 忍-220 221 222",
          reason: "lot",
        },
      ]);
    });
  });

  describe("frilLargeImage / frilSearchUrl", () => {
    it("swaps the size segment and nothing else", () => {
      expect(
        frilLargeImage("https://img.fril.jp/img/848809897/m/2931377158.jpg?1"),
      ).toBe("https://img.fril.jp/img/848809897/l/2931377158.jpg?1");
    });

    it("paginates only past page 1", () => {
      expect(frilSearchUrl("ナルト")).not.toContain("page=");
      expect(frilSearchUrl("ナルト", 2)).toContain("page=2");
    });
  });

  describe("frilRefWithinPublishedRange", () => {
    it("accepts what Bandai printed", () => {
      // cardcheckbox: 忍 1-417, 術 1-361, 作 1-337, 依 1-46, 騎 1-8.
      expect(frilRefWithinPublishedRange("忍-417")).toBe(true);
      expect(frilRefWithinPublishedRange("術-361")).toBe(true);
      expect(frilRefWithinPublishedRange("騎-8")).toBe(true);
    });

    it("refuses a seller typo past the end of a family", () => {
      expect(frilRefWithinPublishedRange("忍-9999")).toBe(false);
      expect(frilRefWithinPublishedRange("騎-9")).toBe(false);
      expect(frilRefWithinPublishedRange("依-47")).toBe(false);
      expect(frilRefWithinPublishedRange("忍-0")).toBe(false);
    });

    it("lets promo sequences through — they have no published maximum", () => {
      expect(frilRefWithinPublishedRange("PR忍-4")).toBe(true);
      expect(frilRefWithinPublishedRange("OP忍-3")).toBe(true);
    });
  });

  describe("frilFamilyClash", () => {
    /*
      Relevé le 2026-08-20 sur `依頼人　風花小雪　文字泊　忍-25` : le vendeur
      nomme la famille 依頼人 et le personnage 風花小雪, puis écrit `忍-25`. La
      photo tranche — la carte porte 依-25 en bas à gauche. Le numéro pris au mot
      a collé le visage de Koyuki sur 忍-25 au catalogue.
    */
    it("refuse un titre qui nomme une famille et en numérote une autre", () => {
      expect(
        frilRefFromTitle("ナルトカードゲーム　依頼人　風花小雪　文字泊　忍-25"),
      ).toEqual({ reason: "family-clash:依!=忍" });
    });

    it("laisse passer un titre d'accord avec lui-même", () => {
      expect(frilRefFromTitle("ナルト カードゲーム 依-25 風花小雪")).toEqual({
        ref: "依-25",
      });
      expect(
        frilRefFromTitle(
          "NARUTO ナルト カードゲーム 忍-106 赤胴ヨロイ BANDAI 2005",
        ),
      ).toEqual({ ref: "忍-106" });
    });

    it("ne dit rien quand le titre ne nomme aucune famille", () => {
      expect(
        frilFamilyClash("ナルト カードゲーム 術-131 千鳥", "術-131"),
      ).toBeNull();
      expect(frilFamilyClash("何もない", "忍-1")).toBeNull();
    });

    /*
      Première version du garde : elle reconnaissait `忍` et `術` seuls, et
      rejetait cinq bonnes annonces sur six. Le 忍 de `忍法` ou de
      `忍という名の道具` est dans le **nom de la carte**, pas une famille.
      Mesuré sur les 123 annonces tenues : 122 passent, une seule tombe.
    */
    it("ne prend pas le 忍 d'un nom de carte pour une déclaration de famille", () => {
      for (const title of [
        "NARUTOカード　作-50 忍という名の道具",
        "忍法 風蜘蛛 術-271 ナルト カードゲーム",
        "陽炎忍法 泡沫 術-273 ナルト カードゲーム",
        "ナルトカード2002　術-28　擬獣忍法・四脚の術",
        "ふうま忍法 呪縛曼荼羅 術-265 ナルトカードゲーム",
      ]) {
        expect(frilRefFromTitle(title)).toHaveProperty("ref");
      }
    });
  });
}

// —— parseStorm3Shop ——
{
  const LISTING = `
  <a href="j1002.html">J1002 GOLEM TECHNIQUE Ulitmate Ninja Storm 3 Naruto Series 28 Common Card</a>
  <a href="j1002.html">J1002 GOLEM TECHNIQUE Ulitmate Ninja Storm 3 Naruto Series 28 Common Card</a>
  <a href="n1685.html">N1685 MADARA UCHIHA Ulitmate Ninja Storm 3 Naruto Series 28 Gold Foil Super Rare Card</a>
  <a href="m986.html">M986 CLASH OF IDEALS Ultimate Ninja Storm 3 Naruto Series 28 Rare Card</a>
  `;

  const PRODUCT = `
  <h1 id=itemName>J1002 GOLEM TECHNIQUE Ulitmate Ninja Storm 3 Naruto Series 28 Common Card</h1>
  <div id=itemMainImage><a href="https://s.turbifycdn.com/aah/my1stop2shop/j1002-golem-technique-ulitmate-ninja-storm-3-naruto-series-28-common-card-26.gif" data-fancybox="itemimages"><img src="https://s.turbifycdn.com/aah/my1stop2shop/j1002-golem-technique-ulitmate-ninja-storm-3-naruto-series-28-common-card-27.gif" width="350" height="350" /></a></div>
  `;

  describe("parseStorm3Listing", () => {
    it("reads unique Series 28 singles and keeps the shop typo listing", () => {
      const cards = parseStorm3Listing(LISTING);
      expect(cards).toHaveLength(3);
      expect(cards.map((c) => c.number)).toEqual(["j1002", "m986", "n1685"]);
      expect(cards[0]).toMatchObject({
        cardType: "j",
        name: "GOLEM TECHNIQUE",
        rarity: "common",
        productPath: "/j1002.html",
      });
      expect(cards.find((c) => c.number === "n1685")?.rarity).toBe("super rare");
      expect(cards.find((c) => c.number === "m986")?.rarity).toBe("rare");
    });
  });

  describe("parseStorm3ProductFaceUrl", () => {
    it("takes the fancybox scan, not the 350² display crop", () => {
      expect(parseStorm3ProductFaceUrl(PRODUCT)).toBe(
        "https://s.turbifycdn.com/aah/my1stop2shop/j1002-golem-technique-ulitmate-ninja-storm-3-naruto-series-28-common-card-26.gif",
      );
    });
  });

  describe("storm3PrintKey", () => {
    it("stays on s28 so FR Carddass s1–s6 are untouched", () => {
      expect(storm3PrintKey("N1685")).toBe("naruto:n-1685");
    });
  });
}

// —— parseSurugaCarddass ——
{
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
      ["騎-2[レア]：ハイド", "騎-2"],
      ["PR忍-1-R", "PR忍-1-R"],
      ["NM-049", null],
      ["DN-032T", null],
    ] as const)("reads %s", (raw, printed) => {
      expect(parseSurugaCarddassPrinted(raw)).toBe(printed);
    });
  });

  describe("parseSurugaCarddassCharacterName", () => {
    it("reads the name after the rarity colon", () => {
      expect(
        parseSurugaCarddassCharacterName(
          "駿河屋 -&lt;中古&gt;忍-390[ノーマル]：マイト・ガイ（アニメ・ゲーム）",
        ),
      ).toBe("マイト・ガイ");
      expect(
        parseSurugaCarddassCharacterName(
          "作-322[ノーマル]：熱血指導（アニメ・ゲーム）",
        ),
      ).toBe("熱血指導");
      expect(
        parseSurugaCarddassCharacterName(
          "駿河屋 -<中古>忍-391[ウルトラレア]：四代目火影＆ガマブン太(赤箔押し)（アニメ・ゲーム）",
        ),
      ).toBe("四代目火影＆ガマブン太(赤箔押し)");
      expect(
        parseSurugaCarddassCharacterName(
          "駿河屋 -<中古>忍-392[レア]：うずまきナルト＆ロック・リー（アニメ・ゲーム）",
        ),
      ).toBe("うずまきナルト＆ロック・リー");
    });

    it("reads a name after the printed ref with no colon", () => {
      expect(parseSurugaCarddassCharacterName("依-12 ヒマツ")).toBe("ヒマツ");
    });
  });

  describe("surugaPrintedToDiskId", () => {
    it("maps JP Carddass prefixes, never EN CCG n001", () => {
      expect(surugaPrintedToDiskId("忍-85")).toBe("ni0085");
      expect(surugaPrintedToDiskId("術-1")).toBe("te0001");
      expect(surugaPrintedToDiskId("作-248")).toBe("ta0248");
      expect(surugaPrintedToDiskId("依-12")).toBe("cl0012");
      expect(surugaPrintedToDiskId("騎-2")).toBe("ki0002");
      expect(surugaPrintedToDiskId("PR忍-1-R")).toBe("prni0001-R");
    });

    /*
      Data Carddass arcade → `narutodatacarddass`. Hors Carddass : pas de
      disk id `nm####` / `dn####`. Les annonces de borne restent rejetées
      par le parseur détail.
    */
    it("refuse les cartes de borne (autre provider)", () => {
      expect(surugaPrintedToDiskId("NM-049")).toBeNull();
      expect(surugaPrintedToDiskId("DN-032T")).toBeNull();
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
      expect(ledger_parseSurugaCarddass.ingest).toBe("faces");
      expect(ledger_parseSurugaCarddass.lang).toBe("ja");
      expect(ledger_parseSurugaCarddass.line).toBe("carddass-jp");
      expect(ledger_parseSurugaCarddass.not).toContain("data-carddass");
      expect(ledger_parseSurugaCarddass.not).toContain("en-ccg");
      const listings = loadSurugaCarddassCuratedListings();
      expect(listings.length).toBe(1214);
      expect(listings.some((row) => row.id === "G8859390")).toBe(true);
      expect(listings.some((row) => row.printed === "PR忍-10")).toBe(true);
      expect(listings.some((row) => row.id === "GU112665")).toBe(true);
      expect(listings.some((row) => row.id === "GL398669")).toBe(true);
      expect(listings.some((row) => row.id === "GL685033")).toBe(true);
      expect(listings.some((row) => row.id === "GL685034")).toBe(true);
      expect(listings.some((row) => row.id === "GL685035")).toBe(true);
      expect(listings.some((row) => row.id === "GL636976")).toBe(true);
      expect(listings.some((row) => row.id === "GG936720")).toBe(true);
      expect(listings.some((row) => row.printed === "COIN-9")).toBe(true);
      expect(listings.some((row) => row.id === "GL818531")).toBe(true);
      expect(listings.some((row) => row.printed === "忍-1-a")).toBe(true);
      expect(listings.some((row) => row.id === "GL734891")).toBe(false);
      expect(listings.some((row) => row.id === "GL410641")).toBe(false);
      expect(listings.some((row) => /DN-|NM-/.test(row.printed))).toBe(false);
      expect(foldSurugaCarddassListings(listings).length).toBeGreaterThan(300);
      expect(listings.some((row) => row.printed === "忍-3")).toBe(true);
    });
  });
}

