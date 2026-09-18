import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import dig from "../curated/sources/pack-decouverte-packshot-2026-08-30.json";
import { narutoCatalogueLineForSealed, narutoDiskCardId } from "../identity";
import { narutoCuratedProductsDir } from "../install/curated";
import { NARUTO_SEALED_SKUS } from "../sealed";
import { cardgameclubImageUrl, cardgameclubIngestPackshots, cardgameclubLedger, gradedcardcenterIngestPackshots, gradedcardcenterLedger, gradedcardcenterOriginalUrl, ebayIngestFaces, ebayIngestPackshots, ebayListingImageFull, ebayPackshotLedger, martinaIngestPackshots, martinaLedger, toywizIngestPackshots, toywizPackshotLedger, atomicempireIngestPackshots, atomicempirePackshotLedger, vintedIngestBacks, vintedIngestPackshots, vintedLedger, mangaSanctuaryIngestPackshots, mangaSanctuaryPackshotLedger, sunnystoreIngestBacks, sunnystoreIngestPackshots, sunnystorePackshotLedger, leboncoinIngestBacks, leboncoinIngestPackshots, leboncoinPackshotImageFull, leboncoinPackshotLedger, kinkaiIngestBacks, kinkaiIngestPackshots, kinkaiPackshotLedger, goatCdnOriginal, goatIngestPackshots, goatMintDisplayPackshots, goatPackshotLedger, trictracCdnOriginal, trictracIngestPackshots, trictracLedger, mangaNewsFullGoodieUrl, mangaNewsIngestPackshots, mangaNewsPackshotLedger, magentoCatalogOriginal, vialudibundaIngestPackshots, vialudibundaLedger, scifiUniverseIngestPackshots, scifiUniverseLedger } from "./packshots";

// —— cardgameclubPackshots ——
{
  describe("cardgameclub CACG IT packshots", () => {
    it("keeps the six pasted SKUs and does not crawl the collection", () => {
      const ledger = cardgameclubLedger();
      expect(ledger.ingestCollection).toBe(false);
      expect(cardgameclubIngestPackshots().map((row) => row.slug)).toEqual([
        "display-s1-it",
        "starter-forza-della-foglia",
        "booster-s1-it",
        "display-s2-it",
        "booster-s2-it",
        "booster-s3-it",
      ]);
      expect(ledger.products.every((row) => row.lang === "IT")).toBe(true);
      expect(ledger.products.every((row) => row.barcode === null)).toBe(true);
      expect(
        ledger.products.every((row) =>
          row.url.startsWith("https://cardgameclub.it/products/"),
        ),
      ).toBe(true);
      expect(ledger.probedMissingSealed.status).toBe(404);
      expect(ledger.probedMissingSealed.handles).toContain("na06riv-ica08bu");
      expect(
        ledger.probedMissingSealed.handles.every((h) => !h.includes("na01")),
      ).toBe(true);
    });

    it("drops Shopify cache query strings", () => {
      expect(
        cardgameclubImageUrl(
          "https://cdn.shopify.com/s/files/1/0918/2072/0513/files/image_a.png?v=1786449412",
        ),
      ).toBe(
        "https://cdn.shopify.com/s/files/1/0918/2072/0513/files/image_a.png",
      );
    });

    it("files Italian displays on CACG, not Bandai CCG", () => {
      expect(
        narutoCatalogueLineForSealed({
          slug: "display-s1-it",
          setCode: "s1",
          lang: "IT",
        }),
      ).toBe("carddass-fr");
      expect(
        narutoCatalogueLineForSealed({
          slug: "booster-s2-it",
          setCode: "s2",
          lang: "IT",
        }),
      ).toBe("carddass-fr");
      expect(
        narutoCatalogueLineForSealed({
          slug: "display-s13",
          setCode: "s13",
        }),
      ).toBe("en-ccg");
    });
  });
}

// —— gradedcardcenterPackshots ——
{
  function jan13ChecksumOk(digits: string): boolean {
    if (!/^\d{13}$/.test(digits)) return false;
    const body = digits.slice(0, 12);
    const odd = [...body].reduce(
      (sum, ch, i) => sum + (i % 2 === 0 ? Number(ch) : 0),
      0,
    );
    const even = [...body].reduce(
      (sum, ch, i) => sum + (i % 2 === 1 ? Number(ch) : 0),
      0,
    );
    const check = (10 - ((odd + even * 3) % 10)) % 10;
    return check === Number(digits[12]);
  }

  describe("Graded Card Center JP Carddass packshots", () => {
    it("keeps the pasted 巻ノ五 booster, not FR s5 and not Shippuden 第五幕", () => {
      const ledger = gradedcardcenterLedger();
      expect(ledger.ingestCatalog).toBe(false);
      expect(gradedcardcenterIngestPackshots().map((row) => row.slug)).toEqual([
        "booster-vol5-jp",
      ]);
      const row = ledger.products[0]!;
      expect(row.setCode).toBe("maki5");
      expect(row.setCode).not.toBe("s5");
      expect(row.lang).toBe("JA");
      expect(row.printedRef).toBe("NA-B5");
      expect(row.cardsPerPack).toBe(6);
      expect(row.cardsPerPack).not.toBe(8);
      expect(row.year).toBe(2004);
      expect(row.title).toContain("巻ノ五");
      expect(row.title).not.toContain("第五幕");
      expect(row.barcode).toBe("4543112200365");
      expect(jan13ChecksumOk(row.barcode)).toBe(true);
      expect(row.url).toContain("f96806f8-6e60-4dcd-9acd-8592855db527");
      expect(row.recto.url).not.toContain("cdn-cgi/image");
      expect(row.verso.url).not.toContain("cdn-cgi/image");
    });

    it("strips Cloudflare resizes so we do not keep an upscaled webp", () => {
      expect(
        gradedcardcenterOriginalUrl(
          "https://cdn.gradedcardcenter.com/cdn-cgi/image/width=800,fit=contain,format=webp,quality=65/item_recto_MBFCqKzG6LDJwmCWOP7Un",
        ),
      ).toBe("https://cdn.gradedcardcenter.com/item_recto_MBFCqKzG6LDJwmCWOP7Un");
      expect(
        gradedcardcenterOriginalUrl(
          "https://cdn.gradedcardcenter.com/item_verso_cmXWHyO66GQ69MEEJz399",
        ),
      ).toBe("https://cdn.gradedcardcenter.com/item_verso_cmXWHyO66GQ69MEEJz399");
    });

    it("files the JP volume on Carddass, not Bandai CCG", () => {
      expect(
        narutoCatalogueLineForSealed({
          slug: "booster-vol5-jp",
          setCode: "maki5",
          lang: "JA",
        }),
      ).toBe("carddass-fr");
    });
  });
}

// —— ebayPackshots ——
{
  describe("eBay listing packshots", () => {
    it("keeps s-l1600 as the working large size", () => {
      expect(
        ebayListingImageFull(
          "https://i.ebayimg.com/images/g/XvQAAOSwOR5nAWTW/s-l500.webp",
        ),
      ).toBe("https://i.ebayimg.com/images/g/XvQAAOSwOR5nAWTW/s-l1600.webp");
      expect(
        ebayListingImageFull(
          "https://i.ebayimg.com/images/g/XvQAAOSwOR5nAWTW/s-l1600.webp",
        ),
      ).toBe("https://i.ebayimg.com/images/g/XvQAAOSwOR5nAWTW/s-l1600.webp");
    });

    it("upgrades booster-s2 from the pasted s-l1600, not a guessed listing", () => {
      const ledger = ebayPackshotLedger();
      expect(ebayIngestPackshots().map((row) => row.slug)).toEqual([
        "booster-s2",
        "display-s28-fr",
        "duopack-s28",
        "booster-s6-it",
        "booster-s7-it",
        "booster-s8-it",
      ]);
      expect(ledger.products[0]?.printedRef).toBe("05117");
      expect(ledger.products[0]?.url).toContain("/s-l1600.webp");
      expect(ledger.products[0]?.url).not.toContain("s-l2048");
      expect(ledger.products[1]?.slug).toBe("display-s28-fr");
      expect(ledger.products[1]?.ean).toBe("3391891969949");
      expect(ledger.products[2]?.slug).toBe("duopack-s28");
      expect(ledger.products[2]?.url).toContain("q1cAAeSwLDFqb6zN");
      expect(ledger.products[3]?.slug).toBe("booster-s6-it");
      expect(ledger.products[3]?.url).toContain("TrcAAOSwp-xgkVyZ");
      expect(ledger.products[3]?.listing).toContain("265148225277");
      expect(ledger.products[4]?.slug).toBe("booster-s7-it");
      expect(
        ledger.products.find((row) => row.slug === "booster-s8-it")?.staging,
      ).toBe("staging/ebay/booster-s8-it.webp");
      const falseDisplay = ledger.products.find(
        (row) => row.slug === "display-s7-it",
      );
      expect(falseDisplay?.ingest).toBe(false);
      expect(falseDisplay?.note).toMatch(/REJECTED as display/i);
      expect(ledger.ingestCollection).toBe(false);
    });

    it("keeps Italian scans in the research ledger, not as ingestible faces", () => {
      const italian = ebayPackshotLedger().faces.filter((row) => row.lang === "it");
      const byRef = new Map(italian.map((row) => [row.printedRef, row]));
      // The five pasted one by one, before the store batch — ledger only.
      expect(byRef.get("NI-01")?.imageId).toBe("jw4AAOSwIQdZEbr1");
      expect(byRef.get("NI-02")?.imageId).toBe("iZoAAOSwDiBZEbxd");
      expect(byRef.get("NI-03")?.imageId).toBe("ydcAAOSwUjthy9R2");
      expect(byRef.get("NI-19")?.imageId).toBe("KGoAAOSwrhBZEb16");
      expect(byRef.get("NI-20")?.imageId).toBe("gPYAAOSwNDFf8LI9");
      expect(byRef.get("NI-01")?.staging).toBe("staging/ebay/ni0001-it.webp");
      expect(italian.every((row) => row.ingest === false)).toBe(true);
      expect(ebayIngestFaces().every((row) => row.lang !== "it")).toBe(true);
      // s-l1600 is the working large size whatever the container; eBay serves
      // webp on some listings and jpg on others (the 騎 scans are jpg).
      expect(
        ebayIngestFaces().every((row) => /\/s-l1600\.(webp|jpg)$/.test(row.url)),
      ).toBe(true);
    });

    it("joins the whole Italian batch on numbers we already mint (ledger, not disk)", () => {
      // Former ingest batch (now catalogue-gated) — not the S-promo / TE-05 rejects.
      const italian = ebayPackshotLedger().faces.filter(
        (row) =>
          row.lang === "it" &&
          typeof row.reason === "string" &&
          row.reason.includes("Catalogue contract"),
      );
      const byRef = new Map(italian.map((row) => [row.printedRef, row]));
      expect(italian.length).toBeGreaterThanOrEqual(45);
      // Every Italian row resolves, and no number is claimed twice.
      const ids = italian.map((row) => narutoDiskCardId(row.printedRef));
      expect(ids.every((id) => id !== null)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
      // ST is the Italian tactique prefix — it files under mission, never `st`.
      const strategia = italian.find((row) => row.printedRef === "ST-69");
      expect(strategia && narutoDiskCardId(strategia.printedRef)).toBe("ta0069");
      // Errecards batch: eight jutsu scans were pasted as NI-N; corrected to TE-N.
      expect(byRef.has("NI-18")).toBe(false);
      expect(byRef.get("TE-18")?.title).toBe("Tecnica Del Mimetismo");
      expect(byRef.get("TE-60")?.staging).toBe("staging/ebay/te0060-it.webp");
    });

    it("refuses the Italian S-numbered promos and the seller's duplicate ref", () => {
      const rejected = ebayPackshotLedger().faces.filter(
        (row) => row.ingest === false && row.lang === "it",
      );
      // NI-S12 / NI-S02 / NI-S15 / ST-S04: an Italian promo sequence we do not
      // model. Rejected rather than folded onto NI-12 and friends.
      const sNumbers = rejected.filter((row) =>
        /-S\d/.test(row.printedRef ?? ""),
      );
      expect(sNumbers).toHaveLength(4);
      expect(rejected.every((row) => Boolean(row.reason))).toBe(true);
      // Two listings claim TE-05 for two different cards; one is mislabelled.
      expect(rejected.some((row) => row.printedRef === "TE-05")).toBe(true);
    });

    it("carries the 騎 knights — a family that exists only in JP", () => {
      const knights = ebayIngestFaces().filter((row) =>
        row.printedRef.startsWith("騎-"),
      );
      expect(knights.map((row) => row.printedRef)).toEqual([
        "騎-1",
        "騎-2",
        "騎-3",
        "騎-4",
        "騎-5",
        "騎-6",
        "騎-7",
        "騎-8",
      ]);
      // The family is complete: 騎-1 … 騎-8, none missing.
      expect(knights).toHaveLength(8);
      expect(knights.map((row) => narutoDiskCardId(row.printedRef))).toEqual([
        "ki0001",
        "ki0002",
        "ki0003",
        "ki0004",
        "ki0005",
        "ki0006",
        "ki0007",
        "ki0008",
      ]);
      expect(knights.every((row) => row.lang === "ja")).toBe(true);
      // cardcheckbox attests 巻ノ十三 for 騎-7/8 only; the rest stay unplaced.
      expect(
        knights
          .filter((row) => row.setCode !== null)
          .map((row) => row.printedRef),
      ).toEqual(["騎-7", "騎-8"]);
    });

    it("keeps GAKU-001 on 忍者学校, not as a missing CCG visual", () => {
      const gaku = ebayIngestFaces().find(
        (row) => row.printedRef === "忍伝-学001",
      )!;
      expect(gaku.setCode).toBe("gaku");
      expect(gaku.listing).toBe("https://www.ebay.com/itm/388364698616");
      expect(narutoDiskCardId("GAKU-001")).toBe("gaku0001");
      expect(gaku.verso?.staging).toBe("staging/ebay/gaku0001-ja-back.webp");
      expect(gaku.verso?.note).toContain("back.ja");
    });

    it("records gametradestore as a watch, not a crawl", () => {
      const ledger = ebayPackshotLedger();
      expect(ledger.ingestCollection).toBe(false);
      expect(ledger.sellerWatch.user).toBe("primegame");
      expect(ledger.sellerWatch.store).toBe("gametradestore");
      expect(ledger.sellerWatch.url).toContain("_ssn=primegame");
      expect(ledger.note).toContain("do not crawl");
    });
  });
}

// —— martinaPackshots ——
{
  describe("Martina’s Fumetti S6 IT starter", () => {
    it("keeps the pasted box as Il Fascino del Male, not a booster", () => {
      const ledger = martinaLedger();
      expect(ledger.ingestCatalog).toBe(false);
      expect(martinaIngestPackshots().map((row) => row.slug)).toEqual([
        "starter-il-fascino-del-male",
      ]);
      const row = ledger.products[0]!;
      expect(row.setCode).toBe("s6");
      expect(row.kind).toBe("deck");
      expect(row.lang).toBe("IT");
      expect(row.printedRef).toBe("93214");
      expect(row.url).toContain("141556-product_main_2x");
      expect(row.staging).toBe("staging/martina/starter-il-fascino-del-male.jpg");
    });

    it("files the Italian S6 starter on CACG, not Bandai CCG", () => {
      expect(
        narutoCatalogueLineForSealed({
          slug: "starter-il-fascino-del-male",
          setCode: "s6",
          lang: "IT",
        }),
      ).toBe("carddass-fr");
    });
  });
}

// —— packDecouvertePackshot ——
{
  describe("pack-decouverte clean packshot", () => {
    it("wires wrappers/pack-decouverte.jpg as catalogue face", () => {
      expect(dig.slug).toBe("pack-decouverte");
      expect(dig.ingest).toContain("wrappers/pack-decouverte.jpg");
      expect(
        existsSync(
          path.join(
            narutoCuratedProductsDir(),
            "wrappers",
            "pack-decouverte.jpg",
          ),
        ),
      ).toBe(true);
      expect(
        NARUTO_SEALED_SKUS.find((row) => row.slug === "pack-decouverte"),
      ).toMatchObject({
        stagingFile: "pack-decouverte.jpg",
        stagingKind: "wrappers",
        lang: "FR",
        setCode: "s1",
      });
    });
  });
}

// —— toywizPackshots ——
{
  describe("ToyWiz EN CCG packshots", () => {
    it("pastes Sage's Legacy + Emerging Alliance + 4 collector tins; Storm 3 thumb archival", () => {
      const ledger = toywizPackshotLedger();
      expect(ledger.ingestCollection).toBe(false);
      const rows = toywizIngestPackshots();
      expect(rows.map((row) => row.slug)).toEqual([
        "booster-s24-en",
        "booster-s14",
        "tin-unbound-power-naruto",
        "tin-guardian-kakashi",
        "tin-ultimate-ninja-way-gaara",
        "tin-ultimate-battle-sasori",
      ]);
      expect(rows[0]).toMatchObject({
        setCode: "s24",
        lang: "EN",
        cardsPerPack: 10,
        packsPerDisplay: 24,
        upc: "045557236328",
        staging: "staging/toywiz/booster-s24.jpg",
      });
      expect(rows[1]).toMatchObject({
        setCode: "s14",
        lang: "EN",
        cardsPerPack: 10,
        upc: "045557235826",
        staging: "staging/toywiz/booster-s14.jpg",
      });
      expect(rows[2]).toMatchObject({
        kind: "tin",
        upc: "045557239770",
        staging: "staging/toywiz/tin-unbound-power-naruto.jpg",
      });
      expect(rows[5]).toMatchObject({
        setCode: "tin2",
        upc: "643690287353",
        staging: "staging/toywiz/tin-ultimate-battle-sasori.jpg",
      });
      const s28 = ledger.products.find((row) => row.slug === "booster-s28-en");
      expect(s28?.ingest).toBe(false);
      expect(s28?.upc).toBe("045557236489");
      expect(s28?.note).toMatch(/superseded by Sunny Store/i);
    });
  });
}

// —— atomicempirePackshots ——
{
  describe("Atomic Empire EN CCG packshots", () => {
    it("pastes Sage's Legacy open-box display (despite booster listing title)", () => {
      const ledger = atomicempirePackshotLedger();
      expect(ledger.ingestCollection).toBe(false);
      const [row] = atomicempireIngestPackshots();
      expect(row).toMatchObject({
        slug: "display-s24",
        setCode: "s24",
        kind: "display",
        lang: "EN",
        ingest: true,
      });
      expect(row?.listing).toContain("atomicempire.com/Item/117169");
      expect(row?.staging).toBe("staging/atomicempire/display-s24.jpg");
      expect(row?.note?.toLowerCase()).toContain("display");
    });
  });
}

// —— vintedPackshots ——
{
  describe("Vinted Fascino packshots", () => {
    it("keeps pasted CDN only — front + back ingest, spines archival, avatar rejected", () => {
      const ledger = vintedLedger();
      expect(ledger.ingestCollection).toBe(false);
      expect(ledger.listing).toContain("7633991617");
      expect(vintedIngestPackshots().map((row) => row.staging)).toEqual([
        "staging/vinted/starter-il-fascino-del-male-01.webp",
      ]);
      expect(vintedIngestBacks().map((row) => row.staging)).toEqual([
        "staging/vinted/starter-il-fascino-del-male-02.webp",
      ]);
      expect(ledger.extraAngles.map((row) => row.angle)).toEqual([
        "spine",
        "spine-opposite",
        "top-edge",
      ]);
      expect(ledger.rejected[0]?.reason).toMatch(/avatar/i);
    });
  });
}

// —— mangaSanctuaryPackshots ——
{
  describe("mangaSanctuaryPackshots", () => {
    it("ingests the three S5 press packshots only", () => {
      const ledger = mangaSanctuaryPackshotLedger();
      expect(ledger.page).toContain("manga-sanctuary.com/news/7397");
      const rows = mangaSanctuaryIngestPackshots();
      expect(rows.map((r) => r.slug).sort()).toEqual([
        "booster-s5",
        "starter-la-quete",
        "starter-un-nouveau-depart",
      ]);
      expect(rows.every((r) => r.staging.startsWith("staging/manga-sanctuary/"))).toBe(
        true,
      );
      expect(ledger.skip.length).toBeGreaterThanOrEqual(2);
    });
  });
}

// —— sunnystorePackshots ——
{
  describe("sunnystore sealed packshots", () => {
    it("wires FR/ES/EN sealed pastes including USA Storm 3 (no crawl)", () => {
      const ledger = sunnystorePackshotLedger();
      expect(ledger.ingestCollection).toBe(false);
      expect(ledger.listings).toEqual(
        expect.arrayContaining([
          expect.stringContaining("ultimate-ninja-storm-3-sealed-booster"),
          expect.stringContaining("serie-series-3-jcc-castellano"),
          expect.stringContaining("bandai-sealed-booster-pack-ingles"),
          expect.stringContaining("dream-legacy-tsunade"),
          expect.stringContaining("storm-3-sealed-booster-pack-usa-version"),
        ]),
      );
      expect(sunnystoreIngestPackshots().map((row) => row.staging)).toEqual([
        "staging/sunnystore/booster-s28-01.jpg",
        "staging/sunnystore/booster-s3-es-01.jpg",
        "staging/sunnystore/booster-tp3-01.jpg",
        "staging/sunnystore/booster-s5-en-01.jpg",
        "staging/sunnystore/booster-s28-en-01.jpg",
      ]);
      expect(sunnystoreIngestBacks().map((row) => row.staging)).toEqual([
        "staging/sunnystore/booster-s28-02.jpg",
        "staging/sunnystore/booster-s3-es-02.jpg",
        "staging/sunnystore/booster-tp3-02.jpg",
        "staging/sunnystore/booster-s5-en-02.jpg",
        "staging/sunnystore/booster-s28-en-02.jpg",
      ]);
      expect(
        ledger.products.some(
          (row) =>
            row.staging === "staging/sunnystore/booster-s28-en-display.jpg" &&
            row.ingest === false,
        ),
      ).toBe(true);

      const s28en = sunnystoreIngestPackshots().find(
        (row) => row.slug === "booster-s28-en",
      )!;
      expect(s28en).toMatchObject({
        lang: "EN",
        setCode: "s28",
        cardsPerPack: 10,
        ean: "045557236489",
      });
      expect(
        sunnystoreIngestBacks().find((row) => row.slug === "booster-s28-en")!
          .note,
      ).toContain("MADE IN SINGAPORE");
    });
  });
}

// —— leboncoinPackshots ——
{
  describe("leboncoin product packshots", () => {
    it("wires Tin Box art + verso from pasted CDN (no crawl)", () => {
      const ledger = leboncoinPackshotLedger();
      expect(ledger.ingestCollection).toBe(false);
      expect(leboncoinIngestPackshots().map((row) => row.staging)).toEqual([
        "staging/leboncoin/tin-box-01.jpg",
      ]);
      expect(leboncoinIngestBacks().map((row) => row.staging)).toEqual([
        "staging/leboncoin/pack-decouverte-03.jpg",
        "staging/leboncoin/tin-box-02.jpg",
      ]);
      const art = leboncoinIngestPackshots().find((row) => row.slug === "tin-box")!;
      expect(art).toMatchObject({
        slug: "tin-box",
        role: "art",
        printedRef: "05129",
        ean: "3296580051298",
      });
      expect(art.listing).toContain("3258840985");
      expect(leboncoinPackshotImageFull(art.url)).toContain(
        "rule=classified-1200x800-jpg",
      );
      expect(
        leboncoinIngestPackshots().some((row) => row.slug === "pack-decouverte"),
      ).toBe(false);
      expect(
        leboncoinIngestBacks().find((row) => row.slug === "pack-decouverte"),
      ).toMatchObject({
        role: "back",
        staging: "staging/leboncoin/pack-decouverte-03.jpg",
      });
    });
  });
}

// —— kinkaiPackshots ——
{
  describe("kinkai duopack packshots", () => {
    it("wires FR duopack-s28 face + verso from pasted uploads (no crawl)", () => {
      const ledger = kinkaiPackshotLedger();
      expect(ledger.ingestCollection).toBe(false);
      expect(ledger.listing).toContain("/article/5274");
      expect(kinkaiIngestPackshots().map((row) => row.staging)).toEqual([
        "staging/kinkai/duopack-s28-01.webp",
      ]);
      expect(kinkaiIngestBacks().map((row) => row.staging)).toEqual([
        "staging/kinkai/duopack-s28-02.webp",
      ]);
      const back = kinkaiIngestBacks()[0]!;
      expect(back).toMatchObject({
        slug: "duopack-s28",
        role: "back",
        ean: "3391891970488",
      });
      expect(back.note).toContain("7 + 1");
      expect(back.note).toContain("MADE IN ITALY");
    });
  });
}

// —— goatPackshots ——
{
  describe("Goat EN display packshots", () => {
    it("drops /medium/ from listing thumbs", () => {
      expect(
        goatCdnOriginal(
          "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/351974/medium/broken_promise.jpg",
        ),
      ).toBe(
        "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/351974/broken_promise.jpg",
      );
      expect(
        goatCdnOriginal(
          "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/351974/broken_promise.jpg",
        ),
      ).toBe(
        "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/351974/broken_promise.jpg",
      );
    });

    it("archives every CDN display-box as art.goat — Coleka gaps only mint SKUs", () => {
      const rows = goatIngestPackshots();
      expect(rows.length).toBeGreaterThanOrEqual(20);
      expect(rows.map((row) => row.setCode)).toContain("s1");
      expect(rows.map((row) => row.setCode)).toContain("s12");
      expect(rows.map((row) => row.setCode)).toContain("s16");
      expect(rows.every((row) => row.slug === `display-${row.setCode}`)).toBe(
        true,
      );
      expect(
        rows.every((row) => row.staging.startsWith("staging/goat-en-boxes/")),
      ).toBe(true);
      expect(rows.find((row) => row.setCode === "s16")?.staging).toBe(
        "staging/goat-en-boxes/s16.gif",
      );
      expect(rows.find((row) => row.setCode === "s16")?.title).toBe(
        "Broken Promises",
      );

      const minted = goatMintDisplayPackshots();
      expect(minted.map((row) => row.setCode)).toEqual([
        "s16",
        "s19",
        "s21",
        "s22",
        "s23",
        "s27",
      ]);
      expect(minted.some((row) => /^s[1-6]$/.test(row.setCode))).toBe(false);

      const ledger = goatPackshotLedger();
      expect(ledger.sealed.boosterBoxes.packshots.ingest).toBe("all-cdn-displays");
      expect(ledger.ingest).toBe("faces");
      expect(
        ledger.sealed.boosterBoxes.products.filter(
          (row) => row.kind === "jp-box",
        ),
      ).toHaveLength(2);
    });
  });
}

// —— trictracPackshots ——
{
  describe("Tric Trac Naruto JCC galleries", () => {
    it("unwraps the Next 96px thumb into the cdn10 original", () => {
      expect(
        trictracCdnOriginal(
          "/_next/image?url=https%3A%2F%2Fcdn10.trictrac.net%2Ftrictrac%2F3f%2F2d%2F1d93407cb246c93603268bddb13a4b52e9f1.jpeg&w=96&q=75",
        ),
      ).toBe(
        "https://cdn10.trictrac.net/trictrac/3f/2d/1d93407cb246c93603268bddb13a4b52e9f1.jpeg",
      );
      expect(
        trictracCdnOriginal(
          "https://cdn10.trictrac.net/trictrac/3f/2d/1d93407cb246c93603268bddb13a4b52e9f1.jpeg",
        ),
      ).toBe(
        "https://cdn10.trictrac.net/trictrac/3f/2d/1d93407cb246c93603268bddb13a4b52e9f1.jpeg",
      );
    });

    it("ingests S1–S3 starter boxes + Coffret Métal — not same-pixel card faces", () => {
      const ledger = trictracLedger();
      expect(trictracIngestPackshots().map((row) => row.slug)).toEqual([
        "starter-pays-du-vent",
        "starter-maitre-hokage",
        "starter-sceller-le-malefice",
        "starter-detruire-konoha",
        "starter-apprentissage",
        "starter-puissances-cachees",
        "tin-box",
      ]);
      expect(ledger.faces.ingest).toBe("none");
      expect(ledger.faces.servedPixels).toEqual({ width: 350, height: 495 });
      const tin = ledger.products.find((row) => row.slug === "tin-box");
      expect(tin).toMatchObject({
        kind: "coffret",
        ingest: true,
        staging: "staging/trictrac/tin-box.jpeg",
        url: "https://cdn.trictrac.net/discourse/original/3X/6/2/62e132077392c32c832507a4a4a184d6a30f122f.jpeg",
      });
      expect(tin?.url).toMatch(/\/discourse\/original\//);
      const s1 = ledger.pages.find((row) => row.setCode === "s1");
      expect(s1?.community?.cardTypes).toBe(184);
      expect(s1?.localFrFaces).toBe(184);
      const s2 = ledger.pages.find((row) => row.setCode === "s2");
      expect(s2?.community?.cardTypes).toBe(146);
      expect(s2?.gap).toBe(10);
      expect(
        ledger.pages.find((row) => row.setCode === "s4")?.community,
      ).toBeNull();
    });
  });
}

// —— mangaNewsPackshots ——
{
  describe("Manga-News booster packshots", () => {
    it("turns the dotted _medium listing thumb into the full goodie", () => {
      expect(
        mangaNewsFullGoodieUrl(
          "https://www.manga-news.com/public/images/goodies/.tcg-naruto-deck-serie-4_medium.jpg",
        ),
      ).toBe(
        "https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-4.jpg",
      );
      expect(
        mangaNewsFullGoodieUrl(
          "https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-1.jpg",
        ),
      ).toBe(
        "https://www.manga-news.com/public/images/goodies/tcg-naruto-deck-serie-1.jpg",
      );
    });

    it("maps Deck Série 1–5 covers to FR boosters, not starters or Sage's Legacy", () => {
      const ledger = mangaNewsPackshotLedger();
      expect(mangaNewsIngestPackshots().map((row) => row.slug)).toEqual([
        "booster-s1",
        "booster-s2",
        "booster-s3",
        "booster-s4",
        "booster-s5",
      ]);
      expect(ledger.page).toContain("/collection/TCG-Naruto");
      expect(ledger.skip.map((row) => row.setCode)).toEqual(["s24"]);
      expect(ledger.skip[0]?.ingest).toBe(false);
      expect(ledger.products.every((row) => !row.url.includes("_medium"))).toBe(
        true,
      );
    });
  });
}

// —— vialudibunda ——
{
  describe("Via Ludibunda Magento packshots", () => {
    it("drops the Magento size cache, keeps the catalog original", () => {
      expect(
        magentoCatalogOriginal(
          "https://vialudibunda.com/media/catalog/product/cache/2/image/700x700/9df78eab33525d08d6e5fb8d27136e95/n/a/naruto-serie-1-booster.jpg",
        ),
      ).toBe(
        "https://vialudibunda.com/media/catalog/product/n/a/naruto-serie-1-booster.jpg",
      );
      expect(
        magentoCatalogOriginal(
          "https://vialudibunda.com/media/catalog/product/cache/1/image/988x988/9df78eab33525d08d6e5fb8d27136e95/n/a/naruto-serie-1-booster.jpg",
        ),
      ).toBe(
        "https://vialudibunda.com/media/catalog/product/n/a/naruto-serie-1-booster.jpg",
      );
      expect(
        magentoCatalogOriginal(
          "https://vialudibunda.com/media/catalog/product/cache/1/image/988x988/9df78eab33525d08d6e5fb8d27136e95/s/t/starter-naruto-serie-1-maitre-hokage.jpg",
        ),
      ).toBe(
        "https://vialudibunda.com/media/catalog/product/s/t/starter-naruto-serie-1-maitre-hokage.jpg",
      );
      expect(
        magentoCatalogOriginal(
          "https://vialudibunda.com/media/catalog/product/s/t/starter-naruto-serie-1-maitre-hokage.jpg",
        ),
      ).toBe(
        "https://vialudibunda.com/media/catalog/product/s/t/starter-naruto-serie-1-maitre-hokage.jpg",
      );
    });

    it("dumps the three live S1 SKUs and does not invent S2+", () => {
      const ledger = vialudibundaLedger();
      expect(vialudibundaIngestPackshots().map((row) => row.slug)).toEqual([
        "booster-s1",
        "starter-pays-du-vent",
        "starter-maitre-hokage",
      ]);
      expect(ledger.products.every((row) => !row.url.includes("/cache/"))).toBe(
        true,
      );
      expect(
        ledger.products.map((row) =>
          "printedRef" in row ? row.printedRef : null,
        ),
      ).toEqual(["05112", "05110", null]);
      const hokage = ledger.products.find(
        (row) => row.slug === "starter-maitre-hokage",
      )!;
      expect(hokage.url).toContain(
        "/s/t/starter-naruto-serie-1-maitre-hokage.jpg",
      );
      expect(hokage.url).not.toContain("/n/a/");
      expect(hokage.doNotDisplace).toBe(
        "staging/trictrac/starter-maitre-hokage.jpeg",
      );
      expect(ledger.search.hits).toBe(3);
    });
  });
}

// —— scifiUniverse ——
{
  describe("SciFi-Universe Naruto JCC packshots", () => {
    it("keeps the 200px unique SKUs as last-resort dumps", () => {
      const ledger = scifiUniverseLedger();
      expect(ledger.ingest).toBe("packshots");
      expect(ledger.missing).toEqual(["s5"]);
      expect(scifiUniverseIngestPackshots().map((row) => row.slug)).toEqual([
        "starter-pays-du-vent",
        "starter-maitre-hokage",
        "booster-s2",
        "starter-sceller-le-malefice",
        "starter-detruire-konoha",
        "booster-s4",
      ]);
      expect(
        ledger.products.filter((row) => !row.ingest).map((row) => row.id),
      ).toEqual([11651, 15061, 17700]);
      const boosterS1 = ledger.products.find((row) => row.id === 11651)!;
      expect(boosterS1.url).toContain("10095-naruto-jcc.jpg");
    });
  });
}

