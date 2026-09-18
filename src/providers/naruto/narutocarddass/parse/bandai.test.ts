import { describe, expect, it } from "vitest";
import enCcgSeries from "../curated/sources/en-ccg-series.json";
import tcdb from "../curated/sources/tcdb-en-ccg.json";
import { mintNarutoPrintKey, parseNarutoCollector } from "../identity";
import { canonicalizeCarddassUrl, siteRelPathFromOriginal } from "../scrape/scrapeCards";
import { cardTypeFromCollectorNumber, enSetCode, parseBandaicgAssetPath, bandaicgEnCardlistCards, mergeBandaicgEnNamesIntoIndex, parseBandaicgCardlistHtml, bggEnCcgPrinted, bggEnCcgS1Cards, bggEnCcgS1Ledger, mergeBggEnCcgS1IntoIndex, parseCarddasJpAssetPath, carddasJpStagingFaceToDiskId, carddasJpStagingFaceInstallTarget, carddasJpCardlistCards, carddasJpVolumeSetCode, mergeCarddasJpNamesIntoIndex, parseCarddasJpCardlistHtml, carddasJpPromoCards, mergeCarddasJpPromoIntoIndex, NARUTO_GAME, carddassFaceFilename, parseCarddassAssetPath, parseCarddassMedThumbFilename, pickLatestCdxRow, faceArtRank, pickPreferredFaceArtFilename, waybackRawUrl, parseEnCcgPrintedRef } from "./bandai";

// —— parseBandaicgAsset ——
{
  describe("parseBandaicgAssetPath", () => {
    it.each([
      {
        url: "http://www.bandaicg.com/naruto/images/cards_s1/n001.jpg",
        set: "s1",
        number: "n001",
        cardType: "n",
        role: "art" as const,
      },
      {
        url: "http://www.bandaicg.com:80/naruto/images/cards_s10/j049_t.jpg",
        set: "s10",
        number: "j049",
        cardType: "j",
        role: "thumb" as const,
      },
      {
        url: "http://www.bandaicg.com/naruto/images/cards_pr/pr018b.jpg",
        set: "promo",
        number: "pr018b",
        cardType: "pr",
        role: "art" as const,
      },
      {
        url: "http://www.bandaicg.com/naruto/images/cards_pr/ps004_t.jpg",
        set: "promo",
        number: "ps004",
        cardType: "ps",
        role: "thumb" as const,
      },
      {
        url: "http://www.bandaicg.com/naruto/images/cards_s2/m117.jpg",
        set: "s2",
        number: "m117",
        cardType: "m",
        role: "art" as const,
      },
    ])("$url → $set/$number ($role)", ({ url, set, number, cardType, role }) => {
      const parsed = parseBandaicgAssetPath(url);
      expect(parsed).toMatchObject({
        set,
        number,
        cardType,
        role,
        cardId: number,
        printKey: `naruto:${set}-${number}`,
      });
    });

    it("rejects chrome and FR paths", () => {
      expect(
        parseBandaicgAssetPath(
          "http://www.bandaicg.com/naruto/images/bg_paper.jpg",
        ),
      ).toBeNull();
      expect(
        parseBandaicgAssetPath(
          "http://www.carddass.fr/naruto/images/cartes/1/NINJA-001.jpg",
        ),
      ).toBeNull();
    });
  });

  describe("enSetCode / cardTypeFromCollectorNumber", () => {
    it("builds series set codes (no locale prefix)", () => {
      expect(enSetCode("s1")).toBe("s1");
      expect(enSetCode("promo")).toBe("promo");
    });

    it.each([
      ["ni023", "ni"],
      ["n001", "n"],
      ["pr002", "pr"],
      ["ps004", "ps"],
      ["j049", "j"],
    ])("%s → %s", (number, type) => {
      expect(cardTypeFromCollectorNumber(number)).toBe(type);
    });
  });
}

// —— parseBandaicgCardlist ——
{
  const FIXTURE = `
  <div class="card_row">
    <div class="card_col1" title="Card Number">N-044</div>
    <div class="card_link"><a href="cardlists_detail.php?s=2&c=n044" class="card_link">The Third Hokage</a></div>
    <div class="card_col2" title="Card Type">Ninja</div>
    <div class="card_col3" title="Rarity">SR</div>
  </div>
  <div class="card_row"><div class="card_col1" title="Card Number">J-387</div><div class="card_link"><a href="cardlists_detail_new.php?s=12&amp;c=j387" class="card_link" id="j387_name">Sexy Jutsu</a></div><div class="card_col2" title="Card Type">Jutsu</div><div class="card_col3" title="Rarity">R</div></div>
  <div class="card_row">
    <div class="card_col1" title="Card Number">N-US122</div>
    <div class="card_link">Tin exclusive</div>
  </div>
  <div class="card_row">
    <div class="card_col1" title="Card Number">N-186</div>
    <div class="card_link">Naruto Uzumaki & Iruka Umino</div>
    <div class="card_col3" title="Rarity">U</div>
  </div>
  `;

  describe("parseBandaicgCardlistHtml", () => {
    it("reads official N/J titles and skips N-US exclusives", () => {
      expect(parseBandaicgCardlistHtml(FIXTURE, "s2")).toEqual([
        {
          number: "n044",
          cardType: "n",
          name: "The Third Hokage",
          setCode: "s2",
          printed: "N-044",
          rarity: "SR",
        },
        {
          number: "j387",
          cardType: "j",
          name: "Sexy Jutsu",
          setCode: "s2",
          printed: "J-387",
          rarity: "R",
        },
        {
          number: "n186",
          cardType: "n",
          name: "Naruto Uzumaki & Iruka Umino",
          setCode: "s2",
          printed: "N-186",
          rarity: "U",
        },
      ]);
    });
  });

  describe("bandaicgEnCardlistCards", () => {
    it("ships official s1–s15 titles, not shop copy", () => {
      const cards = bandaicgEnCardlistCards();
      expect(cards.length).toBeGreaterThan(1500);
      expect(cards.find((row) => row.number === "n001")).toMatchObject({
        name: "Naruto Uzumaki",
        setCode: "s1",
      });
      expect(cards.some((row) => row.setCode === "s15")).toBe(true);
      expect(cards.some((row) => row.setCode === "s16")).toBe(false);
      expect(cards.some((row) => row.number.startsWith("ni"))).toBe(false);
    });
  });

  describe("mergeBandaicgEnNamesIntoIndex", () => {
    it("mints N prints beside NI and does not overwrite an existing EN title", () => {
      const merged = mergeBandaicgEnNamesIntoIndex({
        prints: [
          {
            printKey: "naruto:ni-0001",
            setCode: "s1",
            number: "ni0001",
            cardType: "ni",
            family: "ninja",
          },
          {
            printKey: "naruto:n-0001",
            setCode: "s1",
            number: "n0001",
            cardType: "n",
            family: "ninja",
          },
        ],
        titles: [
          { printKey: "naruto:n-0001", lang: "en", fullName: "Naruto (BGG)" },
        ],
      });
      expect(
        merged.titles.find((t) => t.printKey === "naruto:n-0001")?.fullName,
      ).toBe("Naruto (BGG)");
      expect(merged.addedPrints).toContain("naruto:n-0044");
      expect(merged.prints.some((p) => p.printKey === "naruto:ni-0001")).toBe(
        true,
      );
    });
  });
}

// —— parseBggNarutoList ——
{
  describe("BGG Path to Hokage checklist (2006 xls)", () => {
    it("is EN CCG Series 1 only — 127 rows, same count as TCDB, no faces", () => {
      const ledger = bggEnCcgS1Ledger();
      const cards = bggEnCcgS1Cards();
      expect(ledger.ingest).toBe("titles");
      expect(ledger.set.series).toBe(1);
      expect(ledger.set.title).toBe("The Path to Hokage");
      expect(ledger.file.sheet).toBe("Path to Hokage");
      expect(cards).toHaveLength(127);
      expect(ledger.counts).toEqual({
        cards: 127,
        N: 43,
        J: 42,
        M: 42,
        rarity: { C: 70, U: 25, ST: 12, R: 13, SR: 7 },
      });
      const s1 = tcdb.mainSets.find((row) => row.series === 1);
      expect(s1?.tcdbCards).toBe(127);
      expect(s1?.sid).toBe(ledger.tcdbSid);
      expect(ledger.urls.filepage).toBe(
        "https://boardgamegeek.com/filepage/20590/narutotcglistxls",
      );
      expect(JSON.stringify(ledger.urls)).not.toContain("download_redirect");
    });

    it("maps sheet type+number to printed Bandai codes, not PTH or NI", () => {
      const naruto = bggEnCcgS1Cards().find(
        (row) => row.type === "N" && row.number === "001",
      );
      const kunai = bggEnCcgS1Cards().find(
        (row) => row.type === "J" && row.number === "001",
      );
      expect(naruto?.name).toBe("Naruto Uzumaki");
      expect(kunai?.name).toBe("Kunai");
      expect(bggEnCcgPrinted(naruto!)).toEqual({
        cardType: "n",
        number: "n001",
        usExclusive: false,
      });
      expect(bggEnCcgPrinted(kunai!)).toEqual({
        cardType: "j",
        number: "j001",
        usExclusive: false,
      });
      expect(bggEnCcgS1Cards().every((row) => bggEnCcgPrinted(row))).toBe(true);
      expect(bggEnCcgS1Cards().some((row) => row.type === "NI")).toBe(false);
    });

    it("keeps the sheet error on N-028 and the 2006 typos", () => {
      const kiba = bggEnCcgS1Cards().find(
        (row) => row.type === "N" && row.number === "028",
      );
      expect(kiba?.name).toBe("Kiba Inuzuka");
      expect(kiba?.symbol).toBe("R");
      expect(bggEnCcgS1Ledger().observedSheetErrors).toEqual([
        {
          ref: "N-028",
          field: "symbol",
          value: "R",
          note: "R is a rarity letter, not an element",
        },
      ]);
      const names = bggEnCcgS1Cards().map((row) => row.name);
      expect(names).toContain("Transfrmation Jutsu");
      expect(names).toContain("Disquise Jutsu");
      expect(names).toContain("Crass-Shaped Shuriken");
    });

    it("mints EN CCG keys, not Carddass NI, and keeps sheet typos", () => {
      const merged = mergeBggEnCcgS1IntoIndex({
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
          {
            printKey: "naruto:ni-0001",
            lang: "fr",
            fullName: "Naruto Uzumaki",
          },
        ],
      });
      expect(merged.addedPrints).toContain("naruto:n-0001");
      expect(merged.addedPrints).toContain("naruto:j-0001");
      expect(merged.addedPrints).not.toContain("naruto:ni-0001");
      expect(
        merged.titles.find((t) => t.printKey === "naruto:n-0001"),
      ).toMatchObject({
        lang: "en",
        fullName: "Naruto Uzumaki",
      });
      expect(
        merged.titles.find((t) => t.printKey === "naruto:ni-0001")?.lang,
      ).toBe("fr");
      expect(
        merged.titles.find((t) => t.printKey === "naruto:j-0016")?.fullName,
      ).toBe("Transfrmation Jutsu");
      expect(
        merged.prints.find((p) => p.printKey === "naruto:n-0001"),
      ).toMatchObject({
        setCode: "s1",
        number: "n0001",
        family: "ninja",
      });
    });
  });
}

// —— parseCarddasJpAsset ——
{
  describe("parseCarddasJpAssetPath", () => {
    it("parses special gifs into spc print identity", () => {
      expect(
        parseCarddasJpAssetPath(
          "http://www.carddas.com/naruto/cardlist/card_img/jutsu-027_spc2.gif",
        ),
      ).toEqual({
        set: "spc",
        stem: "jutsu-027_spc2",
        kind: "jutsu",
        number: "jutsu027spc2",
        cardId: "jutsu027spc2",
        printKey: "naruto:spc-jutsu027spc2",
        ext: ".gif",
      });
      expect(
        parseCarddasJpAssetPath(
          "http://www.carddas.com/naruto/cardlist/card_img/irai-043_spc2.gif",
        ),
      ).toMatchObject({
        kind: "irai",
        set: "spc",
        number: "irai043spc2",
      });
    });

    it("skips chrome head.gif", () => {
      expect(
        parseCarddasJpAssetPath(
          "http://www.carddas.com/naruto/cardlist/card_img/head.gif",
        ),
      ).toBeNull();
    });
  });

  describe("carddasJpStagingFaceToDiskId", () => {
    it("maps sparse official GIFs onto collector disk ids", () => {
      expect(carddasJpStagingFaceToDiskId("shinobi-393_spc2.gif")).toBe("ni0393");
      expect(carddasJpStagingFaceToDiskId("shinobi-003_1.gif")).toBe("ni0003");
      expect(carddasJpStagingFaceToDiskId("jutsu-015_1.gif")).toBe("te0015");
      expect(carddasJpStagingFaceToDiskId("shinobi-146_7.gif")).toBe("ni0146");
      expect(carddasJpStagingFaceToDiskId("jutsu-348_17.gif")).toBe("te0348");
      expect(carddasJpStagingFaceToDiskId("shinobi-352.gif")).toBe("ni0352");
      expect(carddasJpStagingFaceToDiskId("shinobi_372_16.gif")).toBe("ni0372");
      expect(carddasJpStagingFaceToDiskId("jutsu-027_spc2.gif")).toBe("te0027");
      expect(carddasJpStagingFaceToDiskId("saku-010_spc2.gif")).toBe("ta0010");
      expect(carddasJpStagingFaceToDiskId("irai-043_spc2.gif")).toBe("cl0043");
      expect(carddasJpStagingFaceToDiskId("ju-062_d3.gif")).toBe("mju0062");
      expect(carddasJpStagingFaceToDiskId("head.gif")).toBeNull();
      expect(carddasJpStagingFaceToDiskId("001.gif")).toBeNull();
      expect(carddasJpStagingFaceToDiskId("shinobi-203.jpg")).toBeNull();
      expect(carddasJpStagingFaceToDiskId("jutsu-169_yuki.gif")).toBeNull();
    });

    it("installs volume dumps on the official cardlist, skips sequential /card/ ids", () => {
      expect(carddasJpStagingFaceInstallTarget("shinobi-146_7.gif")).toBe(
        "ni0146",
      );
      expect(carddasJpStagingFaceInstallTarget("shinobi-352.gif")).toBe("ni0352");
      expect(carddasJpStagingFaceInstallTarget("shinobi-393_spc2.gif")).toBe(
        "ni0393",
      );
      expect(carddasJpStagingFaceInstallTarget("saku-214.gif")).toBeNull();
      expect(carddasJpStagingFaceInstallTarget("shinobi-314.gif")).toBeNull();
    });
  });
}

// —— parseCarddasJpCardlist ——
{
  const FIXTURE = `
  <td rowspan="2" align="center" nowrap bgcolor="#FFEEFF" class="s_font">忍-1</td>
  <td align="left" bgcolor="#FFFFFF" class="m_font_b" nowrap><a href="#"><font color="#990000">うずまきナルト</font></a></td>
  <td align="center" bgcolor="#FFFFFF" class="s_font" nowrap>巻ノ壱</td>
  <td rowspan="2" align="center" nowrap bgcolor="#EEFFFF" class="s_font">術-9</td>
  <td align="left" bgcolor="#FFFFFF" class="m_font_b" nowrap><a href="#"><font color="#000066">千年殺し</font></a></td>
  <td align="center" bgcolor="#FFFFFF" class="s_font" nowrap>巻ノ壱</td>
  <td rowspan="2" align="center" nowrap bgcolor="#EEFFEE" class="s_font">作-1</td>
  <td align="left" bgcolor="#FFFFFF" class="m_font_b" nowrap><a href="#"><font color="#006600">任務開始</font></a></td>
  <td align="center" bgcolor="#FFFFFF" class="s_font" nowrap>巻の四</td>
  `;

  describe("parseCarddasJpCardlistHtml", () => {
    it("reads 忍/術/作 and maps 巻の四 to maki4", () => {
      const rows = parseCarddasJpCardlistHtml(FIXTURE, "maki1");
      expect(rows).toEqual([
        {
          printed: "忍-1",
          number: "ni0001",
          name: "うずまきナルト",
          setCode: "maki1",
          volume: "巻ノ壱",
        },
        {
          printed: "術-9",
          number: "te0009",
          name: "千年殺し",
          setCode: "maki1",
          volume: "巻ノ壱",
        },
        {
          printed: "作-1",
          number: "ta0001",
          name: "任務開始",
          setCode: "maki4",
          volume: "巻の四",
        },
      ]);
      expect(carddasJpVolumeSetCode("巻ノ十七")).toBe("maki17");
    });
  });

  describe("carddasJpCardlistCards", () => {
    it("ships the official 巻ノ壱…十七 titles, not Data Carddass", () => {
      const cards = carddasJpCardlistCards();
      expect(cards.length).toBe(1010);
      expect(cards.find((row) => row.number === "ni0390")?.name).toBe(
        "マイト・ガイ",
      );
      expect(cards.find((row) => row.number === "ni0391")?.name).toBe(
        "四代目火影＆ガマブン太",
      );
      expect(cards.find((row) => row.number === "ni0392")?.name).toBe(
        "うずまきナルト＆ロック・リー",
      );
      expect(cards.find((row) => row.number === "ni0393")?.name).toBe(
        "うずまきナルト",
      );
      expect(cards.find((row) => row.number === "ni0394")?.name).toBe(
        "はたけカカシ",
      );
      expect(cards.find((row) => row.number === "ni0395")?.name).toBe(
        "ロック・リー",
      );
      expect(cards.find((row) => row.number === "ni0396")?.name).toBe(
        "春野サクラ",
      );
      expect(cards.find((row) => row.number === "ta0322")?.name).toBe(
        "熱血指導",
      );
      expect(cards.find((row) => row.number === "cl0043")?.name).toBe(
        "ツキ・ヒカル",
      );
      expect(cards[0]).toMatchObject({
        printed: "忍-1",
        number: "ni0001",
        name: "うずまきナルト",
        setCode: "maki1",
      });
      expect(cards.some((row) => row.number.startsWith("nm"))).toBe(false);
    });
  });

  describe("mergeCarddasJpNamesIntoIndex", () => {
    it("adds a JA title on an existing NI print and mints later volumes", () => {
      const merged = mergeCarddasJpNamesIntoIndex({
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
      });
      expect(
        merged.titles.find(
          (t) => t.printKey === "naruto:ni-0001" && t.lang === "ja",
        )?.fullName,
      ).toBe("うずまきナルト");
      expect(
        merged.prints.find((p) => p.printKey === "naruto:ni-0001")?.setCode,
      ).toBe("s1");
      expect(merged.addedPrints.length).toBeGreaterThan(900);
    });
  });
}

// —— parseCarddasJpExtras ——
{
  describe("official JP promo identity", () => {
    it("keeps PR忍 off 忍 and 忍-1（PS） off the booster", () => {
      expect(parseNarutoCollector("PR-忍-1")).toMatchObject({
        family: "promo",
        number: 1,
        printedPrefix: "prni",
      });
      expect(mintNarutoPrintKey("PR-忍-1")).toBe("naruto:prni-0001");
      expect(mintNarutoPrintKey("忍-1")).toBe("naruto:ni-0001");
      expect(parseNarutoCollector("忍-1（PS）")).toMatchObject({
        family: "ninja",
        number: 1,
        grouping: "ps",
      });
      expect(mintNarutoPrintKey("忍-1（PS）")).toBe("naruto:ni-0001-ps");
    });

    it("does not fold 幕 ju-001 onto CCG J-001", () => {
      expect(mintNarutoPrintKey("mju0001")).toBe("naruto:mju-0001");
      expect(mintNarutoPrintKey("J-001")).toBe("naruto:j-0001");
      expect(mintNarutoPrintKey("shi0001")).toBe("naruto:shi-0001");
      expect(mintNarutoPrintKey("ni0001")).toBe("naruto:ni-0001");
    });
  });

  describe("carddasJpPromoCards", () => {
    it("ships official promo titles, not Data Carddass", () => {
      const cards = carddasJpPromoCards();
      expect(cards.length).toBe(61);
      expect(cards.find((row) => row.printed === "PR-忍-6")?.name).toBe(
        "二代目火影",
      );
      expect(cards.some((row) => row.number.startsWith("nm"))).toBe(false);
    });
  });

  describe("mergeCarddasJpPromoIntoIndex", () => {
    it("mints PR忍 beside NI and does not overwrite 巻ノ JA", () => {
      const merged = mergeCarddasJpPromoIntoIndex({
        prints: [
          {
            printKey: "naruto:ni-0001",
            setCode: "maki1",
            number: "ni0001",
            cardType: "ni",
            family: "ninja",
          },
        ],
        titles: [
          { printKey: "naruto:ni-0001", lang: "ja", fullName: "うずまきナルト" },
        ],
      });
      expect(merged.addedPrints).toContain("naruto:prni-0001");
      expect(
        merged.titles.find((t) => t.printKey === "naruto:ni-0001")?.fullName,
      ).toBe("うずまきナルト");
    });
  });
}

// —— parseCarddassAsset ——
{
  describe("parseCarddassAssetPath", () => {
    it.each([
      [
        "http://www.carddass.fr/naruto/images/cartes/1/NINJA-001.jpg",
        {
          set: "s1",
          number: "ni001",
          printKey: `${NARUTO_GAME}:s1-ni001`,
          role: "art",
        },
      ],
      [
        "http://www.carddass.fr/naruto/images/cartes/s4/TACTIQUE-190.jpg",
        {
          set: "s4",
          number: "ta190",
          printKey: `${NARUTO_GAME}:s4-ta190`,
          role: "art",
        },
      ],
      [
        "http://www.carddass.fr/naruto/images/cartes/5/technique/TE-222.jpg",
        {
          set: "s5",
          number: "te222",
          printKey: `${NARUTO_GAME}:s5-te222`,
          role: "art",
        },
      ],
      [
        "http://www.carddass.fr/naruto/images/cartes/5/clients/CL-027.jpg",
        {
          set: "s5",
          number: "cl027",
          printKey: `${NARUTO_GAME}:s5-cl027`,
          role: "art",
        },
      ],
      [
        "http://www.carddass.fr/naruto/images/cartes/s4/NINJA-168-vc.jpg",
        {
          set: "s4",
          number: "ni168",
          printKey: `${NARUTO_GAME}:s4-ni168`,
          role: "corrected",
        },
      ],
      [
        "http://www.carddass.fr/naruto/images/cartes/promo/TECHNIQUE-030-CdF.jpg",
        {
          set: "promo",
          number: "te030",
          printKey: `${NARUTO_GAME}:promo-te030-cdf`,
          role: "art",
          grouping: "cdf",
        },
      ],
      [
        "http://www.carddass.fr/naruto/images/cartes/promo/NINJA-023.jpg",
        {
          set: "promo",
          number: "ni023",
          printKey: `${NARUTO_GAME}:promo-ni023`,
          role: "art",
          grouping: null,
        },
      ],
      [
        "http://www.carddass.fr/naruto/images/cartes/5/ninjas/NINJA%20211.jpg",
        {
          set: "s5",
          number: "ni211",
          printKey: `${NARUTO_GAME}:s5-ni211`,
          role: "art",
        },
      ],
    ] as const)("%s", (url, expected) => {
      const parsed = parseCarddassAssetPath(url);
      expect(parsed).toMatchObject(expected);
    });

    it("rejects med / chrome", () => {
      expect(
        parseCarddassAssetPath(
          "http://www.carddass.fr/naruto/images/cartes/cartes_med/TACTIQUE-183-med.jpg",
        ),
      ).toBeNull();
      expect(
        parseCarddassAssetPath(
          "http://www.carddass.fr/naruto/images/cartes/promo/cartes_preview_s4.jpg",
        ),
      ).toBeNull();
    });
  });

  describe("parseCarddassMedThumbFilename", () => {
    it.each([
      ["NINJA-001_med.jpg", "ni001"],
      ["NINJA 217-med.jpg", "ni217"],
      ["NINJA-023-mini.jpg", "ni023"],
      ["TECHNIQUE-062_med.jpg", "te062"],
      ["TE-236-med.jpg", "te236"],
      ["TACTIQUE-021-med.jpg", "ta021"],
      ["TA-252-med.jpg", "ta252"],
      ["CL-027-med.jpg", "cl027"],
      ["s4_start_boosts.jpg", null],
    ] as const)("%s → %s", (file, number) => {
      const parsed = parseCarddassMedThumbFilename(file);
      expect(parsed?.number ?? null).toBe(number);
    });
  });

  describe("corrected face filenames", () => {
    it("maps roles to disk names", () => {
      expect(carddassFaceFilename("art", ".jpg")).toBe("art.carddass.jpg");
      expect(carddassFaceFilename("corrected", "jpg")).toBe("art.corrected.jpg");
    });

    it("prefers art.corrected over art for serving", () => {
      expect(
        pickPreferredFaceArtFilename([
          "thumb.jpg",
          "art.jpg",
          "art.corrected.jpg",
        ]),
      ).toBe("art.corrected.jpg");
      expect(pickPreferredFaceArtFilename(["art.jpg", "back.jpg"])).toBe(
        "art.jpg",
      );
      expect(pickPreferredFaceArtFilename(["art.corrected.webp"])).toBe(
        "art.corrected.webp",
      );
      expect(pickPreferredFaceArtFilename(["thumb.jpg"])).toBeNull();
    });

    it("ranks faces so every caller agrees on precedence", () => {
      expect(faceArtRank("art.reconstructed.png")).toBeGreaterThan(
        faceArtRank("art.corrected.jpg"),
      );
      expect(faceArtRank("art.corrected.jpg")).toBeGreaterThan(
        faceArtRank("art.jpg"),
      );
      // A scrape merging disk into freshly downloaded files must not demote a
      // reconstruction just because it is not `.corrected.`.
      expect(faceArtRank("art.reconstructed.png")).toBeGreaterThan(
        faceArtRank("art.jpg"),
      );
      expect(faceArtRank("thumb.jpg")).toBe(0);
      expect(faceArtRank("back.jpg")).toBe(0);
    });

    it("prefers a hand-made reconstruction over both official faces", () => {
      expect(
        pickPreferredFaceArtFilename([
          "thumb.jpg",
          "art.jpg",
          "art.corrected.jpg",
          "art.reconstructed.png",
        ]),
      ).toBe("art.reconstructed.png");
      expect(
        pickPreferredFaceArtFilename(["art.jpg", "art.reconstructed.png"]),
      ).toBe("art.reconstructed.png");
      // `art.reconstructed.*` must not be served by the plain `art.*` branch.
      expect(pickPreferredFaceArtFilename(["art.reconstructed.png"])).toBe(
        "art.reconstructed.png",
      );
    });

    it("keeps every dump as art.<source> and prefers the locale's dump on a tie", () => {
      expect(faceArtRank("art.suruga.jpg")).toBeGreaterThan(0);
      expect(faceArtRank("art.nikita.jpg")).toBeGreaterThan(0);
      expect(faceArtRank("art.nikita.jpg", "ja")).toBeGreaterThan(
        faceArtRank("art.suruga.jpg", "ja"),
      );
      expect(
        pickPreferredFaceArtFilename(
          ["art.jpg", "art.suruga.jpg", "art.nikita.jpg"],
          "ja",
        ),
      ).toBe("art.nikita.jpg");
      expect(
        pickPreferredFaceArtFilename(["art.jpg", "art.vintage.jpg"], "en"),
      ).toBe("art.vintage.jpg");
    });
  });

  describe("wayback helpers", () => {
    it("picks latest timestamp", () => {
      expect(
        pickLatestCdxRow([
          ["20070101000000", "http://a"],
          ["20080101000000", "http://b"],
        ]),
      ).toEqual({ timestamp: "20080101000000", original: "http://b" });
    });

    it("builds id_ raw url", () => {
      expect(
        waybackRawUrl(
          "20071018170742",
          "http://www.carddass.fr/naruto/images/cartes/1/NINJA-001.jpg",
        ),
      ).toBe(
        "https://web.archive.org/web/20071018170742id_/http://www.carddass.fr/naruto/images/cartes/1/NINJA-001.jpg",
      );
    });

    it("canonicalizes :80 host duplicates", () => {
      expect(
        canonicalizeCarddassUrl(
          "http://www.carddass.fr:80/naruto/images/cartes/promo/x.jpg",
        ),
      ).toBe(
        canonicalizeCarddassUrl(
          "http://www.carddass.fr/naruto/images/cartes/promo/x.jpg",
        ),
      );
    });

    it("maps site mirror relative paths", () => {
      expect(
        siteRelPathFromOriginal(
          "http://www.carddass.fr/naruto/images/cartes/promo/orochimaru_promo.jpg",
        ),
      ).toBe("images/cartes/promo/orochimaru_promo.jpg");
    });
  });
}

// —— parseEnCcgPrinted ——
{
  describe("parseEnCcgPrintedRef", () => {
    it.each([
      ["N-1646", "n", "n1646", false],
      ["J-074", "j", "j074", false],
      ["M-125", "m", "m125", false],
      ["C-035", "c", "c035", false],
      ["PR-060", "pr", "pr060", false],
      ["PR-032", "pr", "pr032", false],
      ["PR-096", "pr", "pr096", false],
    ])("%s → %s %s", (raw, cardType, number, usExclusive) => {
      expect(parseEnCcgPrintedRef(raw)).toEqual({
        cardType,
        number,
        usExclusive,
      });
    });

    it("keeps tin/US exclusives off the regular N/J/M numbers", () => {
      expect(parseEnCcgPrintedRef("N-US122")).toEqual({
        cardType: "n",
        number: "nus122",
        usExclusive: true,
      });
      expect(parseEnCcgPrintedRef("J-US001")).toMatchObject({
        cardType: "j",
        usExclusive: true,
        number: "jus001",
      });
      expect(parseEnCcgPrintedRef("M-US093")).toMatchObject({
        usExclusive: true,
        number: "mus093",
      });
    });

    it("rejects Carddass and TCDB invented prefixes", () => {
      expect(parseEnCcgPrintedRef("NI-1650")).toBeNull();
      expect(parseEnCcgPrintedRef("PTHJ-001")).toBeNull();
      expect(parseEnCcgPrintedRef("TE-109")).toBeNull();
    });
  });

  describe("Brasil Bandai Unlimited series titles", () => {
    it("fills the TCDB hole at Series 13 and names 19–21", () => {
      expect(enCcgSeries.seriesTitles["13"]).toBe("Fateful Reunion");
      expect(enCcgSeries.seriesTitles["19"]).toBe("Path of Pain");
      expect(enCcgSeries.seriesTitles["20"]).toBe("Tales of the Gallant Sage");
      expect(enCcgSeries.seriesTitles["21"]).toBe("Shattered Truth");
      expect(enCcgSeries.seriesTitles["21.5"]).toBe("Tournament Pack 3");
      expect(enCcgSeries.seriesTitles).not.toHaveProperty("28");
    });

    it("records printed US-exclusive codes from the ban list", () => {
      expect(enCcgSeries.usExclusivePrinted).toContain("N-US122");
      expect(enCcgSeries.usExclusivePrinted).toContain("J-US001");
      expect(
        enCcgSeries.usExclusiveNamed.find((row) => row.printed === "N-US122")
          ?.name,
      ).toBe("Naruto Uzumaki");
      expect(enCcgSeries.printedAlsoSeen).toContain("C-035");
      expect(enCcgSeries.storm3Post.claimedIneditePromo).toBe("PR-032");
    });
  });
}

