import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { catalogueCollectorKey } from "@/lib/admin/catalogueCards";
import { ggCardName, ggCardsMissingFrom, ggSetLabel, parseGgCardIndex, splitCompoundGgId } from "@/providers/naruto/shared/gg/parseNarutoCardGameGg";
import ledger from "../curated/sources/nikita-nrt.json";
import tcdbEnCcg from "../curated/sources/tcdb-en-ccg.json";
import vintage from "../curated/sources/vintage-naruto-ccg.json";
import { narutoDiskCardId } from "../identity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { goatEnCcgSetsToScrape } from "../scrape/catalogues";
import { pickTitleForNumber, titlesForPrints } from "../sources/titles";
import { goatLastPage, parseGoatCataloguePage, parseGoatProductName, mergeGoatEnCcgCardsIntoIndex, parseGoatEnCcgListing, decodeHinokunianHtml, hinokunianPageUrl, parseHinokunianAlts, parseHinokunianPage, parseHinokunianTable, toHalfWidth, cardgameclubItCuratedCards, mergeCardgameclubItCardsIntoIndex, parseCardgameclubItListing, parseCardgameclubItListingFaces, parseCardgameclubItTitle, parsePrimegameExpansions, parsePrimegameSinglesAjax, parsePrimegameSinglesResultCount, primegameExpansionSetCode, parseNikitaCardlist, nikitaNrtFaceUrl, nikitaNrtFileToDiskId, nikitaNrtVolumeSetCode, parseNikitaNrtImgList, mergeNarutoCardsCaIntoIndex, narutoCardsCaHintBelongsOnDisk, narutoCardsCaMayMintPrint, narutoCardsCaSetsToScrape, parseNarutoCardsCaLabel, parseNarutoCardsCaSetHtml, mergeNarutoCardsNetIntoIndex, parseNarutoCardsNetCardUrl, parseNarutoCardsNetSitemap, printedRefFromNarutoCardsNetSuffix, slugToNarutoCardsNetName, assignVintageNarutoDiskIds, normalizeVintageNarutoName, parseVintageNarutoCcgBundle, vintageNarutoCcgFaceUrl, cleanCollectorsCometProductName, collectorsCometEditionSetCode, mergeCollectorsCometIntoIndex, parseCollectorsCometProduct, fansetEnTitleCards, mergeFansetEnTitlesIntoIndex, htmlToChecklistText, mangaNewsDeckImageUrl, normalizeCardNumber, parseMangaNewsChecklistText, uniqueNumbers, parseTcdbNarutoRef, parseTcdbSidFromUrl, tcdbAcronymToSeries, tcdbNarutoSidIngestPolicy, tcdbNarutoSidKind, driveFaceAppearanceSet, driveFaceDiskId, driveFolderSetCode, driveHubHarvestRoots, driveOfficialSetCodeInPath, drivePathIsFanset, driveStagingSegment, parseDriveEmbeddedFolderHtml, parseDriveNarutoFaceFilename, pickDriveFaceWinner } from "./catalogues";

// —— parseGoatCatalogue ——
{
  describe("parseGoatProductName", () => {
    it("splits name / ref / rarity / edition / finish", () => {
      expect(
        parseGoatProductName(
          "8 Trigram Divination Seal Spell Fomula - J-006 - Common - 1st Edition - Wavy Foil",
        ),
      ).toMatchObject({
        printedRef: "J-006",
        name: "8 Trigram Divination Seal Spell Fomula",
        rarity: "Common",
        edition: "1st Edition",
        finish: "Wavy Foil",
        extra: [],
      });
    });

    it("classifies by vocabulary, not by position", () => {
      // Finish before edition, and the shop's own order is not guaranteed.
      const row = parseGoatProductName("Kakashi - N-100 - Rare - Diamond Foil");
      expect(row?.rarity).toBe("Rare");
      expect(row?.finish).toBe("Diamond Foil");
      expect(row?.edition).toBeNull();
    });

    it("keeps a segment it cannot place instead of guessing", () => {
      // A real printing quirk on this shop — not noise to drop.
      const row = parseGoatProductName(
        "8 Trigram - J-006 - Common - 1st Edition on top left",
      );
      expect(row?.rarity).toBe("Common");
      expect(row?.edition).toBeNull();
      expect(row?.extra).toEqual(["1st Edition on top left"]);
    });

    it("keeps a hyphen that belongs to the card name", () => {
      const row = parseGoatProductName(
        "Naruto Uzumaki - Nine Tails - N-1646 - Super Rare - 1st Edition",
      );
      expect(row?.name).toBe("Naruto Uzumaki - Nine Tails");
      expect(row?.printedRef).toBe("N-1646");
      expect(row?.rarity).toBe("Super Rare");
    });

    it("reads the US tin refs the shop writes", () => {
      expect(
        parseGoatProductName("Prompt Instruction - M-US043 - Rare"),
      ).toMatchObject({ printedRef: "M-US043", rarity: "Rare" });
    });

    it("refuses a title with no ref rather than inventing one", () => {
      expect(parseGoatProductName("Naruto CCG Booster Pack")).toBeNull();
      expect(parseGoatProductName("J-006")).toBeNull();
    });
  });

  describe("parseGoatCataloguePage", () => {
    const HTML = `
      <form class="add-to-cart-form" data-name="A Kind Teacher - M-004 - Starter Deck"></form>
      <form class="add-to-cart-form" data-name="A Kind Teacher - M-004 - Starter Deck"></form>
      <form class="add-to-cart-form" data-name="Rock Lee &amp; Guy - N-041 - Rare - Unlimited Edition"></form>
      <form class="add-to-cart-form" data-name="Sleeves 100ct"></form>
    `;

    it("dedupes identical products and drops what has no ref", () => {
      const rows = parseGoatCataloguePage(HTML);
      expect(rows.map((r) => r.printedRef)).toEqual(["M-004", "N-041"]);
      expect(rows[1]?.name).toBe("Rock Lee & Guy");
    });
  });

  describe("goatLastPage", () => {
    it("takes the highest page the pager exposes", () => {
      const html = `<a href="/catalog/x/3877?page=2">2</a><a href="/catalog/x/3877?page=5">5</a>`;
      expect(goatLastPage(html, 3877)).toBe(5);
      expect(goatLastPage("<a>no pager</a>", 3877)).toBe(1);
    });
  });
}

// —— parseGoatEnCcg ——
{
  const FIXTURE = `
  <a>Anbu - N-082 - Super Rare - 1st Edition - Foil</a>
  <a>Anbu - N-082 - Super Rare - Unlimited Edition - Foil</a>
  <a>Baiu - N-077 - Common - Unlimited Edition</a>
  <a>A Tool Called 'Ninja' - M-050 - Rare - 1st Edition</a>
  `;

  describe("parseGoatEnCcgListing", () => {
    it("dedupes finishes and keeps Bandai N/J/M numbers", () => {
      expect(parseGoatEnCcgListing(FIXTURE, "s2")).toEqual([
        {
          number: "m050",
          cardType: "m",
          name: "A Tool Called 'Ninja'",
          setCode: "s2",
        },
        { number: "n077", cardType: "n", name: "Baiu", setCode: "s2" },
        { number: "n082", cardType: "n", name: "Anbu", setCode: "s2" },
      ]);
    });

    it("pairs the CDN JPEG from the listing img, dropping /medium/", () => {
      const html = `
  <a>A Tool Called 'Ninja' - M-050 - Common - 1st Edition</a>
  <img loading="lazy" src="https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/202638/medium/144519.jpg" alt="A Tool Called 'Ninja' - M-050 - Common - 1st Edition">
  `;
      expect(parseGoatEnCcgListing(html, "s2")).toEqual([
        {
          number: "m050",
          cardType: "m",
          name: "A Tool Called 'Ninja'",
          setCode: "s2",
          faceUrl:
            "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/202638/144519.jpg",
        },
      ]);
    });
  });

  describe("goatEnCcgSetsToScrape", () => {
    it("covers s1–s27 as fill after official Bandai lists, skipping Storm 3 and the s8 reprints drawer", () => {
      const sets = goatEnCcgSetsToScrape();
      expect(sets.map((row) => row.setCode)).toEqual([
        "s1",
        "s2",
        "s3",
        "s4",
        "s5",
        "s6",
        "s7",
        "s8",
        "s9",
        "s10",
        "s11",
        "s12",
        "s13",
        "s14",
        "s15",
        "s16",
        "s17",
        "s18",
        "s19",
        "s20",
        "s21",
        "s22",
        "s23",
        "s24",
        "s25",
        "s26",
        "s27",
      ]);
      expect(sets.some((row) => row.role === "reprints-drawer")).toBe(false);
    });
  });

  describe("mergeGoatEnCcgCardsIntoIndex", () => {
    it("mints N prints beside NI and does not overwrite BGG titles", () => {
      const merged = mergeGoatEnCcgCardsIntoIndex({
        prints: [
          {
            printKey: "naruto:ni-0082",
            setCode: "s2",
            number: "ni0082",
            cardType: "ni",
            family: "ninja",
          },
          {
            printKey: "naruto:n-0082",
            setCode: "s2",
            number: "n0082",
            cardType: "n",
            family: "ninja",
          },
        ],
        titles: [
          { printKey: "naruto:n-0082", lang: "en", fullName: "Anbu (BGG)" },
        ],
        cards: parseGoatEnCcgListing(FIXTURE, "s2"),
      });
      expect(
        merged.titles.find((t) => t.printKey === "naruto:n-0082")?.fullName,
      ).toBe("Anbu (BGG)");
      expect(merged.addedPrints).toContain("naruto:n-0077");
      expect(merged.prints.some((p) => p.printKey === "naruto:ni-0082")).toBe(
        true,
      );
    });
  });

  describe("la rareté du shop entre au catalogue", () => {
    it("pose la rareté sur un titre neuf", () => {
      const merged = mergeGoatEnCcgCardsIntoIndex({
        prints: [],
        titles: [],
        cards: [
          {
            number: "n0041",
            cardType: "n",
            name: "Rock Lee",
            setCode: "s1",
            rarity: "Rare",
          },
        ],
      });
      expect(merged.titles[0]).toMatchObject({ lang: "en", rarity: "Rare" });
      expect(merged.rarityFilled).toHaveLength(1);
    });

    it("comble la rareté d'un titre déjà connu au lieu de sauter la ligne", () => {
      const merged = mergeGoatEnCcgCardsIntoIndex({
        prints: [],
        titles: [{ printKey: "naruto:n-0041", lang: "en", fullName: "Rock Lee" }],
        cards: [
          {
            number: "n0041",
            cardType: "n",
            name: "Rock Lee",
            setCode: "s1",
            rarity: "Rare",
          },
        ],
      });
      expect(merged.titles[0]?.rarity).toBe("Rare");
      expect(merged.rarityFilled).toEqual(["naruto:n-0041"]);
    });

    it("ne réécrit pas une rareté déjà posée", () => {
      const merged = mergeGoatEnCcgCardsIntoIndex({
        prints: [],
        titles: [
          {
            printKey: "naruto:n-0041",
            lang: "en",
            fullName: "Rock Lee",
            rarity: "Super Rare",
          },
        ],
        cards: [
          {
            number: "n0041",
            cardType: "n",
            name: "Rock Lee",
            setCode: "s1",
            rarity: "Rare",
          },
        ],
      });
      expect(merged.titles[0]?.rarity).toBe("Super Rare");
      expect(merged.rarityFilled).toEqual([]);
    });
  });
}

// —— parseHinokunian ——
{
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
}

// —— parseCardgameclubIt ——
{
  describe("cardgameclubItCuratedCards", () => {
    it("keeps attested Magento IT titles and does not invent the rest", () => {
      const cards = cardgameclubItCuratedCards();
      expect(cards).toHaveLength(273);
      expect(cards.find((row) => row.number === "ni001")).toMatchObject({
        name: "Naruto Uzumaki",
        setCode: "s1",
      });
      expect(cards.find((row) => row.number === "te231")?.name).toBe("Juken");
      expect(cards.some((row) => row.number.startsWith("n0"))).toBe(false);
    });
  });

  describe("parseCardgameclubItTitle", () => {
    it("reads NI/TE/ST shop titles and maps ST to ta", () => {
      expect(
        parseCardgameclubItTitle(
          "NI01 Naruto Uzumaki rara foil -NEAR MINT-",
          "s1",
        ),
      ).toEqual({
        number: "ni001",
        name: "Naruto Uzumaki",
        setCode: "s1",
        printedRef: "NI-01",
      });
      expect(
        parseCardgameclubItTitle("ST74 Segno di riconoscenza comune", "s2"),
      ).toMatchObject({ number: "ta074", name: "Segno di riconoscenza" });
      expect(parseCardgameclubItTitle("TE-231 Juken comune", "s5")).toMatchObject(
        { number: "te231", name: "Juken" },
      );
    });
  });

  describe("parseCardgameclubItListingFaces", () => {
    it("pairs Magento data-name titles with 300×375 small_image URLs", () => {
      const html = `
        <div class="product-item-info">
          <a class="product-image" data-name="NI08 Iruka comune -MINT-">
            <img src="https://web.archive.org/web/20201030165412im_/https://media.cardgame-club.it/catalog/product/cache/1/small_image/300x375/9df78eab33525d08d6e5fb8d27136e95/4/-/4-564.jpg">
          </a>
        </div>
        <div class="product-item-info">
          <a data-name="ST74 Segno di riconoscenza comune -MINT-">
            <img src="https://web.archive.org/web/20201030165412im_/https://media.cardgame-club.it/catalog/product/cache/1/small_image/300x375/abc/4/-/4-625.jpg">
          </a>
        </div>
      `;
      expect(parseCardgameclubItListingFaces(html, "s2")).toEqual([
        {
          number: "ni008",
          name: "Iruka",
          setCode: "s2",
          printedRef: "NI-08",
          imageUrl:
            "https://web.archive.org/web/20201030165412im_/https://media.cardgame-club.it/catalog/product/cache/1/small_image/300x375/9df78eab33525d08d6e5fb8d27136e95/4/-/4-564.jpg",
        },
        {
          number: "ta074",
          name: "Segno di riconoscenza",
          setCode: "s2",
          printedRef: "ST-74",
          imageUrl:
            "https://web.archive.org/web/20201030165412im_/https://media.cardgame-club.it/catalog/product/cache/1/small_image/300x375/abc/4/-/4-625.jpg",
        },
      ]);
    });
  });

  describe("parseCardgameclubItListing", () => {
    it("pulls titles out of Magento product anchors", () => {
      const html = `
        <a>NI01 Naruto Uzumaki rara foil -NEAR MINT-</a>
        <a>TE96 Strangolare comune -NEAR MINT-</a>
      `;
      expect(parseCardgameclubItListing(html, "s1")).toEqual([
        {
          number: "ni001",
          name: "Naruto Uzumaki",
          setCode: "s1",
          printedRef: "NI-01",
        },
        {
          number: "te096",
          name: "Strangolare",
          setCode: "s1",
          printedRef: "TE-96",
        },
      ]);
    });
  });

  describe("mergeCardgameclubItCardsIntoIndex", () => {
    it("adds IT titles on the Carddass NI print, not a second key", () => {
      const merged = mergeCardgameclubItCardsIntoIndex({
        prints: [
          {
            printKey: "naruto:ni-0001",
            setCode: "s1",
            number: "ni0001",
            cardType: "ni",
            family: "ninja",
          },
        ],
        titles: [
          { printKey: "naruto:ni-0001", lang: "fr", fullName: "Naruto Uzumaki" },
        ],
        cards: [
          {
            number: "ni001",
            name: "Naruto Uzumaki",
            setCode: "s1",
            printedRef: "NI-01",
          },
        ],
      });
      expect(merged.addedPrints).toEqual([]);
      expect(
        merged.titles.find(
          (t) => t.printKey === "naruto:ni-0001" && t.lang === "it",
        )?.fullName,
      ).toBe("Naruto Uzumaki");
    });
  });
}

// —— parsePrimegameIt ——
{
  const FIXTURE = path.join(
    import.meta.dirname,
    "../scrape/fixtures/primegame-naruto-hub.html",
  );

  describe("parsePrimegameIt", () => {
    it("reads expansion rubrics from the Naruto singles hub", () => {
      const html = readFileSync(FIXTURE, "utf8");
      const expansions = parsePrimegameExpansions(html);
      expect(expansions.map((row) => row.expansionId)).toEqual([
        38, 39, 40, 41, 42, 43, 175, 196, 201,
      ]);
      expect(primegameExpansionSetCode(175)).toBe("s6");
      expect(primegameExpansionSetCode(196)).toBe("s7");
    });

    it("parses ajax rows when the shop has stock", () => {
      const html = `
  <div class="parte_prodotti">
  <div class="product-item style1">
    <div class="product-inner">
      <div class="product-thumb"><a href="/Product/99123/Naruto_Uzumaki"><img src="https://www.tcgtrend.it/sthumb/400/99123" alt=""></a></div>
      <div class="product-innfo">
        <div class="product-name"><a href="/Product/99123/Naruto_Uzumaki">NI-01 Naruto Uzumaki</a></div>
      </div>
    </div>
  </div>
  </div>
  <span Class="show-resuilt">Showing 1-1 of 1 result(s)</span>`;
      expect(parsePrimegameSinglesResultCount(html)).toBe(1);
      const cards = parsePrimegameSinglesAjax(html, {
        expansionId: 38,
        slug: "La_Forza_della_Foglia",
        name: "La Forza della Foglia",
        setCode: "s1",
      });
      expect(cards).toEqual([
        expect.objectContaining({
          number: "ni001",
          printedRef: "NI-01",
          name: "Naruto Uzumaki",
          productId: 99123,
          thumbUrl: "https://www.tcgtrend.it/sthumb/1000/99123",
        }),
      ]);
    });
  });
}

// —— parseNikitaCardlist ——
{
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
}

// —— parseNikitaNrt ——
{
  const FIXTURE = `
  <div style="font-size:14pt;font-weight:bold;border-bottom:double 5px lightblue;">巻ノ壱</div>
  <div id="img"><img src="/img/card/nrt/N-001.jpg"/><img src="/img/card/nrt/N-001_2.jpg"/>
  <img src="/img/card/nrt/J-002.jpg"/><img src="/img/card/nrt/S-003.jpg"/>
  <img src="/img/card/nrt/I-002.jpg"/><img src="/img/card/nrt/PRN-006.jpg"/>
  <img src="/img/card/nrt/PRS-003.jpg"/><img src="/img/card/nrt/K-007.jpg"/>
  <img src="/img/card/nrt/back.jpg"/></div>
  <div style="font-size:14pt;">巻ノ十三 両雄激突！終末の谷編</div>
  <div id="img"><img src="/img/card/nrt/N-384.jpg"/></div>
  `;

  describe("nikita nrt keys", () => {
    it("maps JP Carddass prefixes, never EN CCG n001", () => {
      expect(nikitaNrtFileToDiskId("N-001.jpg")).toEqual({
        number: "ni0001",
        nikitaKey: "N-001",
        variant: 0,
      });
      expect(nikitaNrtFileToDiskId("J-002.jpg")?.number).toBe("te0002");
      expect(nikitaNrtFileToDiskId("S-003.jpg")?.number).toBe("ta0003");
      expect(nikitaNrtFileToDiskId("I-002.jpg")?.number).toBe("cl0002");
      expect(nikitaNrtFileToDiskId("PRN-006.jpg")?.number).toBe("prni0006");
      expect(nikitaNrtFileToDiskId("PRS-003.jpg")?.number).toBe("prta0003");
      // 騎士 K used to be dropped. cardcheckbox prints 騎-1〜6 / 騎-7〜8, so it
      // is a real number and the site's single K face maps like any other.
      expect(nikitaNrtFileToDiskId("K-007.jpg")?.number).toBe("ki0007");
      expect(nikitaNrtFileToDiskId("N-001_2.jpg")?.variant).toBe(2);
      expect(nikitaNrtFaceUrl("/img/card/nrt/N-001.jpg")).toBe(
        "https://tcg-db.nikita.jp/img/card/nrt/N-001.jpg",
      );
    });

    it("reads 巻ノ headers as maki sets", () => {
      expect(nikitaNrtVolumeSetCode("巻ノ壱")).toBe("maki1");
      expect(nikitaNrtVolumeSetCode("巻ノ十三 両雄激突！終末の谷編")).toBe(
        "maki13",
      );
    });
  });

  describe("parseNikitaNrtImgList", () => {
    it("keeps the unsuffixed face and the 騎 number, skips the pack back", () => {
      const rows = parseNikitaNrtImgList(FIXTURE);
      expect(rows.map((r) => r.number)).toEqual([
        "cl0002",
        "ki0007",
        "ni0001",
        "ni0384",
        "prni0006",
        "prta0003",
        "ta0003",
        "te0002",
      ]);
      expect(rows.some((r) => r.number === "back")).toBe(false);
      expect(rows.find((r) => r.number === "ni0001")).toMatchObject({
        variant: 0,
        setCode: "maki1",
        imagePath: "/img/card/nrt/N-001.jpg",
      });
      expect(rows.find((r) => r.number === "ni0384")?.setCode).toBe("maki13");
    });
  });

  describe("nikita-nrt ledger", () => {
    it("ingests JP faces onto ni, not EN n", () => {
      expect(ledger.ingest).toBe("faces");
      expect(ledger.line).toBe("carddass-jp");
      expect(ledger.not).toContain("en-ccg");
      expect(ledger.not).toContain("n001");
      expect(ledger.prefixes.N).toBe("ni");
    });
  });
}

// —— parseNarutoCardsCa ——
{
  const FIXTURE = `
  <article aria-label="Naruto Uzumaki, N-001, C"></article>
  <article aria-label="Shadow Clone Jutsu, J-US001, UR"></article>
  <article aria-label="Naruto Uzumaki, N-US122, UR"></article>
  <article aria-label="Main navigation"></article>
  <article aria-label="Kunai, J-001, C"></article>
  `;

  describe("parseNarutoCardsCaLabel", () => {
    it("reads Bandai N/J and keeps N-US off n001", () => {
      expect(parseNarutoCardsCaLabel("Naruto Uzumaki, N-001, C", "s1")).toEqual({
        number: "n001",
        name: "Naruto Uzumaki",
        setCode: "s1",
        printedRef: "N-001",
        usExclusive: false,
      });
      expect(
        parseNarutoCardsCaLabel("Shadow Clone Jutsu, J-US001, UR", "s6"),
      ).toMatchObject({
        number: "jus001",
        name: "Shadow Clone Jutsu",
        usExclusive: true,
      });
      expect(parseNarutoCardsCaLabel("Main navigation", "s1")).toBeNull();
    });

    it("decodes HTML entities from aria-labels", () => {
      expect(
        parseNarutoCardsCaLabel("Let&#x27;s Take it Outside, PR-022, C", "promo"),
      ).toMatchObject({
        number: "pr022",
        name: "Let's Take it Outside",
        printedRef: "PR-022",
      });
      expect(
        parseNarutoCardsCaLabel(
          "Mission Of Capturing Missing Pet &quot;Tora&quot;, M-006, C",
          "s1",
        ),
      ).toMatchObject({
        name: 'Mission Of Capturing Missing Pet "Tora"',
      });
    });
  });

  describe("parseNarutoCardsCaSetHtml", () => {
    it("dedupes aria-labels and skips chrome", () => {
      expect(
        parseNarutoCardsCaSetHtml(FIXTURE, "s1").map((row) => row.number),
      ).toEqual(["j001", "jus001", "n001", "nus122"]);
    });
  });

  describe("narutoCardsCaSetsToScrape", () => {
    it("covers official Bandai sets and skips Kayou / set 29", () => {
      const sets = narutoCardsCaSetsToScrape();
      expect(sets.map((row) => row.setCode)).toContain("s1");
      expect(sets.map((row) => row.setCode)).toContain("s28");
      expect(sets.map((row) => row.setCode)).toContain("tp1");
      expect(sets.map((row) => row.setCode)).toContain("tin1");
      expect(sets.some((row) => row.slug === "bandai-ccg-29")).toBe(false);
    });
  });

  describe("narutoCardsCaMayMintPrint", () => {
    it("lets booster pages mint and blocks fanset leftovers on TP/tin", () => {
      expect(
        narutoCardsCaMayMintPrint({ usExclusive: false, setCode: "s1" }, false),
      ).toBe(true);
      expect(
        narutoCardsCaMayMintPrint({ usExclusive: false, setCode: "tp2" }, false),
      ).toBe(false);
      expect(
        narutoCardsCaMayMintPrint({ usExclusive: true, setCode: "tin1" }, false),
      ).toBe(true);
      expect(
        narutoCardsCaHintBelongsOnDisk(
          {
            number: "n1715",
            name: "Shikamaru Nara",
            setCode: "tp2",
            printedRef: "N-1715",
            usExclusive: false,
          },
          new Set(["n0145"]),
        ),
      ).toBe(false);
      expect(
        narutoCardsCaHintBelongsOnDisk(
          {
            number: "n0145",
            name: "Shikamaru Nara",
            setCode: "tp2",
            printedRef: "N-0145",
            usExclusive: false,
          },
          new Set(["n0145"]),
        ),
      ).toBe(true);
    });
  });

  describe("mergeNarutoCardsCaIntoIndex", () => {
    it("does not mint invented TP/tin collector numbers into the catalogue", () => {
      const invented = parseNarutoCardsCaLabel(
        "Shikamaru Nara, N-1715, C",
        "tp2",
      );
      expect(invented).toMatchObject({ number: "n1715", setCode: "tp2" });
      const merged = mergeNarutoCardsCaIntoIndex({
        prints: [
          {
            printKey: "naruto:n-0145",
            setCode: "s4",
            number: "n0145",
            cardType: "n",
            family: "ninja",
          },
        ],
        titles: [],
        cards: [
          invented!,
          parseNarutoCardsCaLabel("Shikamaru Nara, N-0145, C", "tp2")!,
        ],
      });
      expect(merged.addedPrints).toEqual([]);
      expect(merged.prints.some((p) => p.printKey === "naruto:n-1715")).toBe(
        false,
      );
      expect(
        merged.titles.find((t) => t.printKey === "naruto:n-0145")?.fullName,
      ).toBe("Shikamaru Nara");
      expect(
        merged.titles.find((t) => t.printKey === "naruto:n-1715"),
      ).toBeUndefined();
    });

    it("mints N-US beside N and does not overwrite an official EN title", () => {
      const merged = mergeNarutoCardsCaIntoIndex({
        prints: [
          {
            printKey: "naruto:n-0001",
            setCode: "s1",
            number: "n0001",
            cardType: "n",
            family: "ninja",
          },
        ],
        titles: [
          {
            printKey: "naruto:n-0001",
            lang: "en",
            fullName: "Naruto (official)",
          },
        ],
        cards: parseNarutoCardsCaSetHtml(FIXTURE, "s1"),
      });
      expect(
        merged.titles.find((t) => t.printKey === "naruto:n-0001")?.fullName,
      ).toBe("Naruto (official)");
      expect(merged.addedPrints).toContain("naruto:nus-0122");
      expect(merged.addedPrints).toContain("naruto:jus-0001");
      expect(
        merged.prints.find((p) => p.printKey === "naruto:nus-0122"),
      ).toMatchObject({
        number: "nus0122",
        grouping: null,
      });
      expect(merged.prints.some((p) => p.printKey === "naruto:n-0122")).toBe(
        false,
      );
    });
  });
}

// —— parseNarutoCardsNet ——
{
  describe("printedRefFromNarutoCardsNetSuffix", () => {
    it.each([
      ["n", "-069", "N-069"],
      ["n", "-us069", "N-US069"],
      ["pr", "-us001", "PR-US001"],
    ] as const)("maps %s %s → %s", (type, suffix, ref) => {
      expect(printedRefFromNarutoCardsNetSuffix(type, suffix)).toBe(ref);
    });
  });

  describe("parseNarutoCardsNetCardUrl", () => {
    it("parses a US exclusive slug", () => {
      expect(
        parseNarutoCardsNetCardUrl(
          "https://narutocards.net/card/gaara-of-the-desert-n-us069/",
        ),
      ).toMatchObject({
        number: "nus0069",
        name: "Gaara Of The Desert",
        printedRef: "N-US069",
      });
    });

    it("parses a tin PR-US promo slug", () => {
      expect(
        parseNarutoCardsNetCardUrl(
          "https://narutocards.net/card/naruto-uzumaki-pr-us001/",
        ),
      ).toMatchObject({
        number: "prus0001",
        name: "Naruto Uzumaki",
        printedRef: "PR-US001",
      });
    });
  });

  describe("parseNarutoCardsNetSitemap", () => {
    it("dedupes card locs from sitemap xml", () => {
      const cards = parseNarutoCardsNetSitemap(`
        <urlset>
          <url><loc>https://narutocards.net/card/gaara-of-the-desert-n-us069/</loc></url>
          <url><loc>https://narutocards.net/card/yukie-fujikaze-c-us001/</loc></url>
        </urlset>
      `);
      expect(cards.map((c) => c.number)).toEqual(["cus0001", "nus0069"]);
    });
  });

  describe("mergeNarutoCardsNetIntoIndex", () => {
    it("fills EN titles on existing prints only", () => {
      const merged = mergeNarutoCardsNetIntoIndex({
        prints: [
          {
            printKey: "naruto:nus-0069",
            setCode: "s9",
            number: "nus0069",
            cardType: "nus",
            family: "ninja",
          },
        ],
        titles: [],
        cards: [
          {
            number: "nus0069",
            name: "Gaara Of The Desert",
            printedRef: "N-US069",
            slug: "gaara-of-the-desert-n-us069",
            pageUrl: "https://narutocards.net/card/gaara-of-the-desert-n-us069/",
          },
          {
            number: "n9999",
            name: "Ghost Card",
            printedRef: "N-9999",
            slug: "ghost-n-9999",
            pageUrl: "https://narutocards.net/card/ghost-n-9999/",
          },
        ],
      });
      expect(merged.titled).toEqual(["naruto:nus-0069"]);
      expect(merged.titles).toHaveLength(1);
      expect(merged.titles[0]).toMatchObject({
        nameSource: "narutocards-net:slug",
      });
      expect(merged.addedPrints).toEqual([]);
    });
  });

  describe("slugToNarutoCardsNetName", () => {
    it("title-cases hyphenated slug fragments", () => {
      expect(slugToNarutoCardsNetName("8-trigrams-palms-rotation")).toBe(
        "8 Trigrams Palms Rotation",
      );
    });
  });
}

// —— parseVintageNarutoCcg ——
{
  const FIXTURE = `
  {"id":"ccg-the-path-to-hokage","name":"The Path to Hokage","slug":"the-path-to-hokage","category":"Main Sets","description":"Path to Hokage.","cardCount":3,"cards":[{"id":"ccg-278401","displayNumber":"1/122","name":"Kunai","rarity":"Common","thumbnail":"https://api.ccgtrader.co.uk/_/assets/7le1t5u9evswcck4?key=card-medium","image":"https://api.ccgtrader.co.uk/_/assets/7le1t5u9evswcck4?key=card-large"},{"id":"ccg-278402","displayNumber":"2/122","name":"Naruto Uzumaki - Super Rare","rarity":"Super Rare","thumbnail":"https://api.ccgtrader.co.uk/_/assets/abc123?key=card-medium","image":"https://api.ccgtrader.co.uk/_/assets/abc123?key=card-large"}]}
  {"id":"ccg-eternal-rivalry","name":"Eternal Rivalry","slug":"eternal-rivalry","category":"Main Sets","description":"s6.","cardCount":1,"cards":[{"id":"ccg-900001","displayNumber":"1/113","name":"Kunai","rarity":"Common","thumbnail":"https://api.ccgtrader.co.uk/_/assets/us001?key=card-medium","image":"https://api.ccgtrader.co.uk/_/assets/us001?key=card-large"}]}
  {"id":"ccg-shinobis-dream","name":"Shinobi's Dream","slug":"shinobis-dream","category":"Main Sets","description":"custom.","cardCount":1,"cards":[{"id":"ccg-fake","displayNumber":"1/1","name":"Fake","rarity":"Common","thumbnail":"https://api.ccgtrader.co.uk/_/assets/fake?key=card-medium","image":"https://api.ccgtrader.co.uk/_/assets/fake?key=card-large"}]}
  `;

  describe("parseVintageNarutoCcgBundle", () => {
    it("keeps Bandai CCG sets and drops Shinobi's Dream", () => {
      const cards = parseVintageNarutoCcgBundle(FIXTURE);
      expect(cards.map((c) => `${c.setCode}:${c.name}`)).toEqual([
        "s1:Kunai",
        "s1:Naruto Uzumaki - Super Rare",
        "s6:Kunai",
      ]);
      expect(cards[0]?.faceUrl).toBe(
        "https://api.ccgtrader.co.uk/_/assets/7le1t5u9evswcck4",
      );
    });

    it("maps s6 Kunai to J-US, not s1 J-001", () => {
      const mapped = assignVintageNarutoDiskIds(
        parseVintageNarutoCcgBundle(FIXTURE),
        [
          { number: "j001", setCode: "s1", name: "Kunai" },
          { number: "n001", setCode: "s1", name: "Naruto Uzumaki" },
          { number: "jus001", setCode: "s6", name: "Kunai" },
        ],
      );
      expect(
        mapped.find((c) => c.setCode === "s1" && c.name === "Kunai")?.number,
      ).toBe("j0001");
      expect(mapped.find((c) => c.setCode === "s6")?.number).toBe("jus0001");
      expect(
        mapped.find((c) => c.name.startsWith("Naruto Uzumaki"))?.number,
      ).toBe("n0001");
    });
  });

  describe("vintageNarutoCcgFaceUrl", () => {
    it("strips the broken card-large transform key", () => {
      expect(
        vintageNarutoCcgFaceUrl(
          "https://api.ccgtrader.co.uk/_/assets/7le1t5u9evswcck4?key=card-large",
        ),
      ).toBe("https://api.ccgtrader.co.uk/_/assets/7le1t5u9evswcck4");
    });
  });

  describe("normalizeVintageNarutoName", () => {
    it("drops shop rarity suffixes so Super Rare matches the checklist", () => {
      expect(normalizeVintageNarutoName("Naruto Uzumaki - Super Rare")).toBe(
        "naruto uzumaki",
      );
    });
  });

  describe("vintage-naruto-ccg ledger", () => {
    it("ingests CCG Trader faces, not Panini French or set 29", () => {
      expect(vintage.ingest).toBe("faces");
      expect(vintage.lang).toBe("en");
      expect(vintage.skip).toContain("shinobis-dream");
      expect(vintage.skip).toContain("french-panini");
      expect(vintage.not).toContain("carddass");
    });
  });
}

// —— parseCollectorsComet ——
{
  describe("collectorsCometEditionSetCode", () => {
    it("maps booster and tournament editions", () => {
      expect(collectorsCometEditionSetCode("Set 9 - The Chosen")).toBe("s9");
      expect(collectorsCometEditionSetCode("Set 21.5 - Tournament Pack 3")).toBe(
        "tp3",
      );
      expect(collectorsCometEditionSetCode("Promos")).toBe("promo");
    });
  });

  describe("parseCollectorsCometProduct", () => {
    it("reads NUS and M refs from the shop API", () => {
      expect(
        parseCollectorsCometProduct(
          { name: "Choji Akimichi", number: "NUS-087" },
          "Set 9 - The Chosen",
        ),
      ).toMatchObject({
        number: "nus0087",
        name: "Choji Akimichi",
        setCode: "s9",
        printedRef: "N-US-087",
      });
      expect(
        parseCollectorsCometProduct(
          { name: "Frustrated Ambition", number: "M-274" },
          "Set 9 - The Chosen",
        ),
      ).toMatchObject({
        number: "m0274",
        name: "Frustrated Ambition",
        setCode: "s9",
      });
    });

    it("strips redundant printed ref suffixes from titles", () => {
      expect(cleanCollectorsCometProductName("Sasuke Uchiha (NUS-090)")).toBe(
        "Sasuke Uchiha",
      );
    });
  });

  describe("mergeCollectorsCometIntoIndex", () => {
    it("fills EN titles only onto existing prints", () => {
      const merged = mergeCollectorsCometIntoIndex({
        prints: [
          {
            printKey: "naruto:nus-0087",
            setCode: "s9",
            number: "nus0087",
            cardType: "n",
            family: "ninja",
          },
          {
            printKey: "naruto:n-0087",
            setCode: "s3",
            number: "n0087",
            cardType: "n",
            family: "ninja",
          },
        ],
        titles: [{ printKey: "naruto:n-0087", lang: "en", fullName: "Sakura" }],
        cards: [
          {
            number: "nus0087",
            name: "Choji Akimichi",
            setCode: "s9",
            printedRef: "N-US-087",
          },
        ],
      });
      expect(merged.titled).toEqual(["naruto:nus-0087"]);
      expect(merged.titles).toContainEqual({
        printKey: "naruto:nus-0087",
        lang: "en",
        fullName: "Choji Akimichi",
        nameSource: "collectors-comet",
      });
      expect(merged.titles).toHaveLength(2);
    });
  });
}

// —— parseFansetEnTitles ——
{
  function print(number: string, set = "fanset"): NarutoPrintRow {
    return {
      printKey: `naruto:${number}`,
      setCode: set,
      number,
      cardType: number.slice(0, 1),
    };
  }

  describe("fansetEnTitleCards", () => {
    it("covers validated C/N/M/J 5000+ fanset batches", () => {
      const cards = fansetEnTitleCards();
      expect(cards).toHaveLength(119);
      expect(cards.find((r) => r.number === "c5003")?.name).toBe("Izuna Uchiha");
      expect(cards.find((r) => r.number === "n5000")?.name).toBe(
        "The Second Mizukage",
      );
      expect(cards.find((r) => r.number === "m5000")?.name).toBe("A New Arrival");
      expect(cards.find((r) => r.number === "j5000")?.name).toBe(
        "Earth Style: Mud Fall",
      );
      expect(cards.find((r) => r.number === "j5018")?.name).toBe(
        "Water Gun: Double Blast",
      );
    });
  });

  describe("mergeFansetEnTitlesIntoIndex", () => {
    it("fills EN on existing fanset prints only", () => {
      const merged = mergeFansetEnTitlesIntoIndex({
        prints: [print("c-5001"), print("c-5002")],
        titles: [],
      });
      expect(merged.titled).toEqual(["naruto:c-5001", "naruto:c-5002"]);
      expect(merged.titles[0]).toMatchObject({
        printKey: "naruto:c-5001",
        lang: "en",
        fullName: "Gengo",
        nameSource: "fanset-ocr-validated",
      });
    });

    it("does not overwrite an attested EN title", () => {
      const kept: NarutoTitleRow = {
        printKey: "naruto:c-5001",
        lang: "en",
        fullName: "Already named",
      };
      const merged = mergeFansetEnTitlesIntoIndex({
        prints: [print("c-5001")],
        titles: [kept],
      });
      expect(merged.titled).toEqual([]);
      expect(merged.titles).toEqual([kept]);
    });

    it("re-syncs a prior fanset-ocr-validated title from the ledger", () => {
      const stale: NarutoTitleRow = {
        printKey: "naruto:n-5002",
        lang: "en",
        fullName: "Five Hungty Sharks",
        nameSource: "fanset-ocr-validated",
      };
      const merged = mergeFansetEnTitlesIntoIndex({
        prints: [print("n-5002")],
        titles: [stale],
      });
      expect(merged.titled).toEqual(["naruto:n-5002"]);
      expect(merged.titles[0]?.fullName).toBe("Five Hungry Sharks");
    });

    it("skips prints absent from the index", () => {
      const merged = mergeFansetEnTitlesIntoIndex({
        prints: [print("c-9999")],
        titles: [],
      });
      expect(merged.titled).toEqual([]);
    });
  });
}

// —— parseMangaNewsChecklist ——
{
  describe("parseMangaNewsChecklistText", () => {
    it("parses NI/TE/TA/CL lines with rarity", () => {
      const text = `
  NI-01 Naruto Uzumaki / Holo
  NI-04 Ino Yamanaka / Commune
  TE-54 La Lame du vent / Holo
  TA-190 La fête / Holo
  CL-18 Koji / Commune
  `;
      const lines = parseMangaNewsChecklistText(text);
      expect(lines).toEqual([
        {
          type: "ni",
          numberDigits: "1",
          number: "ni001",
          name: "Naruto Uzumaki",
          rarity: "holo",
          raw: "NI-01 Naruto Uzumaki / Holo",
        },
        {
          type: "ni",
          numberDigits: "4",
          number: "ni004",
          name: "Ino Yamanaka",
          rarity: "commune",
          raw: "NI-04 Ino Yamanaka / Commune",
        },
        {
          type: "te",
          numberDigits: "54",
          number: "te054",
          name: "La Lame du vent",
          rarity: "holo",
          raw: "TE-54 La Lame du vent / Holo",
        },
        {
          type: "ta",
          numberDigits: "190",
          number: "ta190",
          name: "La fête",
          rarity: "holo",
          raw: "TA-190 La fête / Holo",
        },
        {
          type: "cl",
          numberDigits: "18",
          number: "cl018",
          name: "Koji",
          rarity: "commune",
          raw: "CL-18 Koji / Commune",
        },
      ]);
    });

    it("ignores non-checklist noise and dedupes identical rows", () => {
      const text = `
  Naruto - Deck Serie 1
  NI-01 Naruto Uzumaki / Holo
  NI-01 Naruto Uzumaki / Holo
  Prix 8.00
  `;
      expect(parseMangaNewsChecklistText(text)).toHaveLength(1);
    });

    it("keeps same number with different names (MN anomalies)", () => {
      const text = `
  NI-73 Iwashi Tatami / Commune
  NI-73 Serpent Géant / Commune
  `;
      const lines = parseMangaNewsChecklistText(text);
      expect(lines).toHaveLength(2);
      expect(uniqueNumbers(lines)).toEqual(["ni073"]);
    });
  });

  describe("normalizeCardNumber", () => {
    it.each([
      ["ni", "1", "ni001"],
      ["ni", "023", "ni023"],
      ["ta", 190, "ta190"],
      ["cl", "27", "cl027"],
    ] as const)("%s %s → %s", (type, digits, expected) => {
      expect(normalizeCardNumber(type, digits)).toBe(expected);
    });
  });

  describe("htmlToChecklistText", () => {
    it("recovers checklist lines from HTML fragments", () => {
      const html = `<div><p>NI-203 Itachi Uchiwa / Holo</p><br/>TA-190 La fête / Holo</div>`;
      const lines = parseMangaNewsChecklistText(htmlToChecklistText(html));
      expect(lines.map((l) => l.number)).toEqual(["ni203", "ta190"]);
    });
  });

  describe("pickTitleForNumber", () => {
    it("prefers matching set then fullest name", () => {
      const picked = pickTitleForNumber(
        [
          {
            number: "ta190",
            name: "La fêt...",
            rarity: "holo",
            setHint: "s3",
          },
          {
            number: "ta190",
            name: "La fête",
            rarity: "holo",
            setHint: "s4",
          },
        ],
        "s4",
      );
      expect(picked?.name).toBe("La fête");
    });
  });

  describe("titlesForPrints", () => {
    it("attaches FR title to matching printKey", () => {
      const titles = titlesForPrints(
        [
          {
            printKey: "naruto:s4-ta190",
            setCode: "s4",
            number: "ta190",
            cardType: "ta",
          },
        ],
        [
          {
            number: "ta190",
            name: "La fête",
            rarity: "holo",
            setHint: "s4",
          },
        ],
      );
      expect(titles).toEqual([
        {
          printKey: "naruto:s4-ta190",
          lang: "fr",
          fullName: "La fête",
          rarity: "holo",
        },
      ]);
    });
  });

  describe("mangaNewsDeckImageUrl", () => {
    it("prefers the deck og:image over other goodie thumbs", () => {
      const html = `
        <meta property="og:image" content="https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-1.jpg">
        <img src="/public/images/goodies/.spy-x-family-agenda.webp">
      `;
      expect(mangaNewsDeckImageUrl(html)).toBe(
        "https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-1.jpg",
      );
    });

    it("prefers the full packshot over the dotted _medium og:image", () => {
      const html = `
        <meta property="og:image" content="https://www.manga-news.com/public/images/goodies/.tcg-naruto-deck-serie-4_medium.jpg">
        <a href="https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-4.jpg">deck</a>
      `;
      expect(mangaNewsDeckImageUrl(html)).toBe(
        "https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-4.jpg",
      );
    });
  });
}

// —— parseTcdbNaruto ——
{
  describe("parseTcdbNarutoRef", () => {
    it.each([
      ["PTHJ-001", "PTH", "j", "j001"],
      ["pthn-015", "PTH", "n", "n015"],
      ["PTHM-001", "PTH", "m", "m001"],
      ["COSJ-043", "COS", "j", "j043"],
      ["COSN-074", "COS", "n", "n074"],
      ["COSC-001", "COS", "c", "c001"],
      ["CUSC-008", "CUS", "c", "c008"],
      ["CUSJ-085", "CUS", "j", "j085"],
      ["CUSN-124", "CUS", "n", "n124"],
      ["DLN-187", "DL", "n", "n187"],
      ["BODN-264", "BOD", "n", "n264"],
    ])("%s → %s %s %s", (raw, acronym, cardType, number) => {
      expect(parseTcdbNarutoRef(raw)).toMatchObject({
        acronym,
        cardType,
        number,
        variant: null,
      });
    });

    it("does not invent a Bandai id for TCDB US-variant codes", () => {
      expect(parseTcdbNarutoRef("BODN-us059")).toMatchObject({
        acronym: "BOD",
        cardType: "n",
        number: null,
        variant: "us",
      });
    });

    it("never stores the invented TCDB prefix as a collector id", () => {
      const parsed = parseTcdbNarutoRef("PTHJ-001")!;
      expect(parsed.number).toBe("j001");
      expect(parsed.number).not.toMatch(/pth/i);
      expect(catalogueCollectorKey(parsed.number!)).toBe("j:0001");
    });

    it("rejects Carddass, Coleka EU, and real Bandai promo prefixes", () => {
      expect(parseTcdbNarutoRef("NI-1650")).toBeNull();
      expect(parseTcdbNarutoRef("TE-109")).toBeNull();
      expect(parseTcdbNarutoRef("TA-190")).toBeNull();
      expect(parseTcdbNarutoRef("CL-032")).toBeNull();
      expect(parseTcdbNarutoRef("PR-096")).toBeNull();
      expect(parseTcdbNarutoRef("j001")).toBeNull();
    });
  });

  describe("tcdb acronyms and sids", () => {
    it("maps observed acronyms onto EN CCG series, not Carddass labels", () => {
      expect(tcdbAcronymToSeries("PTH")).toBe(1);
      expect(tcdbAcronymToSeries("COS")).toBe(2);
      expect(tcdbAcronymToSeries("CUS")).toBe(3);
      expect(tcdbAcronymToSeries("DL")).toBe(5);
      expect(tcdbAcronymToSeries("BOD")).toBe(8);
      expect(tcdbAcronymToSeries("NI")).toBeNull();
    });

    it("treats the three 2006 main sets as staging-only, never cards/s1/en", () => {
      for (const row of tcdbEnCcg.mainSets) {
        expect(tcdbNarutoSidIngestPolicy(row.sid)).toBe("staging-only");
        expect(tcdbNarutoSidKind(row.sid)).toMatchObject({
          kind: "en-ccg-set",
          series: row.series,
          title: row.title,
        });
      }
    });

    it("rejects the promo grab-bag and the misdated 2002 listing", () => {
      expect(tcdbNarutoSidKind(118974)).toEqual({
        kind: "grab-bag",
        sid: 118974,
      });
      expect(tcdbNarutoSidIngestPolicy(118974)).toBe("reject");
      expect(tcdbNarutoSidKind(256824)).toEqual({
        kind: "do-not-merge",
        sid: 256824,
      });
      expect(tcdbNarutoSidIngestPolicy(256824)).toBe("reject");
    });

    it("reads sids from the ViewSet URLs the user sent", () => {
      expect(
        parseTcdbSidFromUrl(
          "https://www.tcdb.com/ViewSet.cfm/sid/116757/2006-Naruto-Series-1:-The-Path-to-Hokage",
        ),
      ).toBe(116757);
      expect(
        parseTcdbSidFromUrl(
          "https://www.tcdb.com/ViewCard.cfm/sid/116757/cid/7993800",
        ),
      ).toBe(116757);
      expect(parseTcdbSidFromUrl("/ViewAll.cfm/sp/Gaming?Let=N")).toBeNull();
    });

    it("records that the N-index does not list Storm 3", () => {
      expect(tcdbEnCcg.nIndex.missingOnIndex).toContain(28);
      expect(tcdbEnCcg.nIndex.listedSeriesTitles).not.toHaveProperty("13");
      expect(tcdbEnCcg.nIndex.listedSeriesTitles["1"]).toBe("The Path to Hokage");
      expect(
        parseTcdbSidFromUrl(
          "https://www.tcdb.com/ViewSet.cfm/sid/256824/2002-Bandai-Naruto-The-Path-to-Hokage",
        ),
      ).toBe(256824);
      const misdated = tcdbEnCcg.doNotIngest.find((row) => row.sid === 256824);
      expect(misdated?.url).toContain("sid/256824");
    });
  });
}

// —— parseNarutoCcgDrive ——
{
  describe("parseDriveNarutoFaceFilename", () => {
    it("reads Enhanced collector filenames", () => {
      expect(parseDriveNarutoFaceFilename("j001.png")).toMatchObject({
        diskHint: "j001",
        tag: null,
      });
      expect(parseDriveNarutoFaceFilename("j020 [Errata].png")).toMatchObject({
        diskHint: "j020",
        tag: "errata",
      });
      expect(parseDriveNarutoFaceFilename("m621 [Foil Print].png")).toMatchObject(
        {
          diskHint: "m621",
          tag: "foil",
        },
      );
      expect(parseDriveNarutoFaceFilename("nUS020.png")?.diskHint).toBe("nus020");
      expect(parseDriveNarutoFaceFilename("prUS010 [Errata].png")?.diskHint).toBe(
        "prus010",
      );
      expect(parseDriveNarutoFaceFilename("n1646.png")?.diskHint).toBe("n1646");
      expect(parseDriveNarutoFaceFilename("pr068.png")?.diskHint).toBe("pr068");
      expect(narutoDiskCardId("j001")).toBe("j0001");
      expect(narutoDiskCardId("n1646")).toBe("n1646");
      expect(parseDriveNarutoFaceFilename("PTHN-001.png")).toBeNull();
      expect(parseDriveNarutoFaceFilename("ni001.png")).toBeNull();
      expect(parseDriveNarutoFaceFilename("ex001.png")).toBeNull();
    });
  });

  describe("driveFolderSetCode", () => {
    it("maps Enhanced folder titles onto pack set codes", () => {
      expect(driveFolderSetCode("Set 1 - Path of the Hokage")).toBe("s1");
      expect(driveFolderSetCode("Set 28 - Ultimate Ninja Storm 3")).toBe("s28");
      expect(driveFolderSetCode("Set 17.5 - Tournament  Pack  1")).toBe("tp1");
      expect(driveFolderSetCode("Set 23.5 - Tournament Pack 4")).toBe("tp4");
      expect(driveFolderSetCode("Promos")).toBe("promo");
      expect(driveFolderSetCode("Set 31 - Silent Humming (Fan Made)")).toBeNull();
      expect(
        driveFolderSetCode("Set 29 - Shinobi's Dreams (Fan Made - Mardo)"),
      ).toBeNull();
    });
  });

  describe("driveFaceAppearanceSet", () => {
    it("keeps retail N/J/M promo reprints off the booster id", () => {
      expect(driveFaceAppearanceSet("n145", "promo")).toBe("promo");
      expect(driveFaceDiskId("n145", "promo")).toBe("n0145-promo");
      expect(driveFaceDiskId("pr077", "promo")).toBe("pr0077");
      expect(driveFaceDiskId("n001", "s1")).toBe("n0001");
    });
  });

  describe("pickDriveFaceWinner", () => {
    it("prefers errata over base and base over foil", () => {
      const winner = pickDriveFaceWinner([
        { tag: "foil" },
        { tag: null },
        { tag: "errata" },
      ]);
      expect(winner?.tag).toBe("errata");
      expect(
        pickDriveFaceWinner([{ tag: "foil" }, { tag: null }])?.tag,
      ).toBeNull();
    });
  });

  describe("driveOfficialSetCodeInPath", () => {
    it("reads set codes from hub folder titles or legacy s1 paths", () => {
      expect(
        driveOfficialSetCodeInPath([
          "Card Database",
          "[Enhanced] Naruto CCG Sets Database",
          "Set 1 - Path of the Hokage",
          "j001.png",
        ]),
      ).toBe("s1");
      expect(driveOfficialSetCodeInPath(["s1", "j001.png"])).toBe("s1");
      expect(
        driveOfficialSetCodeInPath([
          "Card Database",
          "[Fansets] Naruto CCG Sets Database",
          "Set 29 - Shinobi's Dreams (Fan Made - Mardo)",
          "n001.png",
        ]),
      ).toBeNull();
    });
  });

  describe("drivePathIsFanset", () => {
    it("detects the Fansets hub without treating Enhanced as fan-made", () => {
      expect(
        drivePathIsFanset([
          "Card Database",
          "[Fansets] Naruto CCG Sets Database",
          "Set 30 - Naruto CCG (Fan Made - Henrich)",
          "n001.png",
        ]),
      ).toBe(true);
      expect(
        drivePathIsFanset([
          "Card Database",
          "[Enhanced] Naruto CCG Sets Database",
          "Set 1 - Path of the Hokage",
          "n001.png",
        ]),
      ).toBe(false);
    });
  });

  describe("driveHubHarvestRoots", () => {
    it("lists every top-level hub folder for staging", () => {
      const roots = driveHubHarvestRoots();
      expect(roots.map((row) => row.label)).toEqual(
        expect.arrayContaining([
          "_Deck Lists",
          "Card Database",
          "Custom Card Creator",
          "Print Template",
          "Rules",
        ]),
      );
      expect(roots.every((row) => row.stagingRel.startsWith("hub/"))).toBe(true);
    });
  });

  describe("driveStagingSegment", () => {
    it("sanitizes Drive titles for disk segments", () => {
      expect(driveStagingSegment("Set 1 - Path of the Hokage")).toBe(
        "Set 1 - Path of the Hokage",
      );
      expect(driveStagingSegment("foo/bar:baz")).toBe("foo-bar-baz");
    });
  });

  describe("parseDriveEmbeddedFolderHtml", () => {
    it("pairs entry ids with flip-entry titles", () => {
      const html = `
        <div class="flip-entry" id="entry-abc123" tabindex="0">
          <div class="flip-entry-title">j001.png</div>
        </div>
        <div class="flip-entry" id="entry-def456" tabindex="0">
          <div class="flip-entry-title">Fierce Ambitions Tin Promos</div>
        </div>
      `;
      expect(parseDriveEmbeddedFolderHtml(html)).toEqual([
        { id: "abc123", name: "j001.png", kind: "file" },
        {
          id: "def456",
          name: "Fierce Ambitions Tin Promos",
          kind: "folder",
        },
      ]);
    });
  });
}

// —— parseNarutoCardGameGg ——
{
  /*
    Le set est dans l'URL de chaque carte, ce qui évite d'ouvrir quatre mille
    fiches pour une information déjà servie par la page d'index.
  */

  const HTML = `
    <a href="/archive/classic-ccg/the-path-to-hokage/n001-naruto-uzumaki">n001</a>
    <a href="/archive/classic-ccg/the-path-to-hokage/j001-kunai">j001</a>
    <a href="/archive/classic-ccg/coils-of-the-snake/c001-inari">c001</a>
    <a href="/archive/classic-ccg/the-path-to-hokage/n001-naruto-uzumaki">doublon</a>
    <a href="/cards">le jeu de 2027, pas celui-ci</a>
  `;

  describe("base narutocardgame.gg", () => {
    it("reads the prefix, the number and the set straight from the URL", () => {
      expect(parseGgCardIndex(HTML)).toEqual([
        {
          prefix: "n",
          number: 1,
          set: "the-path-to-hokage",
          slug: "naruto-uzumaki",
          rawId: "n001",
          line: "classic-ccg",
        },
        {
          prefix: "j",
          number: 1,
          set: "the-path-to-hokage",
          slug: "kunai",
          rawId: "j001",
          line: "classic-ccg",
        },
        {
          prefix: "c",
          number: 1,
          set: "coils-of-the-snake",
          slug: "inari",
          rawId: "c001",
          line: "classic-ccg",
        },
      ]);
    });

    it("counts a card once, however many times the page links it", () => {
      expect(parseGgCardIndex(HTML)).toHaveLength(3);
    });

    it("ignores links that are not cards of this game", () => {
      expect(parseGgCardIndex('<a href="/cards">x</a>')).toEqual([]);
    });

    it("turns a slug back into something readable", () => {
      expect(ggSetLabel("the-path-to-hokage")).toBe("The Path To Hokage");
      expect(ggCardName("naruto-uzumaki")).toBe("Naruto Uzumaki");
    });

    it("reports what we lack rather than merging it in", () => {
      const cards = parseGgCardIndex(HTML);
      expect(ggCardsMissingFrom(cards, new Set(["n1", "j1"]))).toEqual([
        {
          prefix: "c",
          number: 1,
          set: "coils-of-the-snake",
          slug: "inari",
          rawId: "c001",
          line: "classic-ccg",
        },
      ]);
      expect(ggCardsMissingFrom(cards, new Set())).toHaveLength(3);
    });

    it("parses kayou compound ids", () => {
      const html = `
        <a href="/archive/kayou/cards/nrz08-asp-001-naruto-uzumaki">a</a>
        <a href="/archive/kayou/cards/nrz08-asp-001-naruto-uzumaki">dup</a>
        <a href="/archive/mythos/cards/ks-000-gold-naruto">m</a>
      `;
      expect(parseGgCardIndex(html, "kayou")).toEqual([
        {
          prefix: "nrz08-asp",
          number: 1,
          set: "kayou",
          slug: "naruto-uzumaki",
          rawId: "nrz08-asp-001",
          line: "kayou",
        },
      ]);
      expect(parseGgCardIndex(html, "mythos")[0]?.rawId).toBe("ks-000");
      expect(splitCompoundGgId("ks-007")).toEqual({ prefix: "ks", number: 7 });
    });
  });
}

