import { describe, expect, it } from "vitest";

import { narutoDiskCardId } from "../collectorIdentity";
import {
  frilFamilyClash,
  frilLargeImage,
  frilRefFromTitle,
  frilRefWithinPublishedRange,
  frilSearchUrl,
  parseFrilSearch,
} from "./parseFrilListing";

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
