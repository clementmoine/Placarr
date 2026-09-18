import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import amazonFr from "../curated/sources/amazon-fr.json";
import carddasCom from "../curated/sources/carddas-com-naruto.json";
import checklist from "../curated/sources/carddass-fr-checklist.json";
import dig_collectionNarutoYoutube from "../curated/sources/collection-naruto-youtube-2026-08-29.json";
import dreamHobby from "../curated/sources/dream-hobby.json";
import dig from "../curated/sources/facebook-naruto-collection-france-2026-09-02.json";
import hobbysearch from "../curated/sources/hobbysearch.json";
import juggernauts from "../curated/sources/juggernauts-xrea.json";
import ledger from "../curated/sources/s6-fr-printed.json";
import sets from "../curated/sources/sets.json";
import trictrac from "../curated/sources/trictrac.json";
import tvTokyo from "../curated/sources/tv-tokyo-naruto-goods.json";
import vialudibunda from "../curated/sources/vialudibunda.json";
import yahooShopping from "../curated/sources/yahoo-shopping.json";
import dig_youtubeGapsWebHunt from "../curated/sources/youtube-gaps-web-hunt-2026-08-29.json";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { NARUTO_SEALED_SKUS } from "../sealed";
import { carteSemaineCardId, guessSetForCarteSemaineId, mergeCarteSemaineIntoIndex, parseCarteSemaineHtml, isNarutoS6FrPrintedNumber, narutoS6FrPrintedDiskNumbers, resetNarutoS6FrPrintedCache, syncNarutoS6FrPrintedAppearances, canonicalizeUrl, stagingRelFromUrl } from "./titles";

// —— carteSemaine ——
{
  describe("carteSemaine", () => {
    it("normalizes printed ids", () => {
      expect(carteSemaineCardId("NI-34")).toBe("ni034");
      expect(carteSemaineCardId("TE 263")).toBe("te263");
      expect(carteSemaineCardId("CL-27")).toBe("cl027");
    });

    it("guesses cancelled-set band as s6", () => {
      expect(guessSetForCarteSemaineId("te263")).toBe("s6");
      expect(guessSetForCarteSemaineId("ta240")).toBe("s6");
      expect(guessSetForCarteSemaineId("ni309")).toBe("s6");
      expect(guessSetForCarteSemaineId("ni203")).toBe("s5");
      expect(guessSetForCarteSemaineId("ni064")).not.toBe("s6");
    });

    it("parses early [ID] Name layout", () => {
      const week = parseCarteSemaineHtml(
        `<p>[TE-122] L'art d'escalader Une fois n'est pas coutume</p>
         <p>[NI-34] Konoha Maru ). Son faible coût</p>`,
        { week: 1, page: "w1.html" },
      );
      expect(week.featured).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            cardId: "te122",
            name: "L'art d'escalader",
          }),
          expect.objectContaining({ cardId: "ni034", name: "Konoha Maru" }),
        ]),
      );
    });

    it("parses DATE [ID] Name and DATE Name [ID]", () => {
      const week = parseCarteSemaineHtml(
        `27/06/2007 [TE-177] Arcanes Lunaires Cette semaine
         15/12/2008 Mélodie du guerrier illusoire [TE-263] Cette semaine
         22/12/2008 Ino Yamanaka [NI-309] Cette semaine
         08/12/2008 L'homme-ivre [TA-240] Voici`,
        { week: 26, page: "w26.html" },
      );
      const byId = Object.fromEntries(week.featured.map((e) => [e.cardId, e]));
      expect(byId.te177).toMatchObject({
        date: "27/06/2007",
        name: "Arcanes Lunaires",
      });
      expect(byId.te263).toMatchObject({
        date: "15/12/2008",
        name: "Mélodie du guerrier illusoire",
      });
      expect(byId.ni309).toMatchObject({
        date: "22/12/2008",
        name: "Ino Yamanaka",
      });
      expect(byId.ta240).toMatchObject({
        date: "08/12/2008",
        name: "L'homme-ivre",
      });
    });

    it("fills empty titles and injects missing print stubs", () => {
      const prints: NarutoPrintRow[] = [
        {
          printKey: "naruto:ni-0264",
          setCode: "s6",
          number: "ni0264",
          cardType: "ni",
          family: "ninja",
        },
      ];
      const titles: NarutoTitleRow[] = [
        {
          printKey: "naruto:ni-0264",
          lang: "fr",
          fullName: "",
        },
      ];
      const merged = mergeCarteSemaineIntoIndex({
        prints,
        titles,
        report: {
          generatedAt: "2026-01-01T00:00:00.000Z",
          source: "test",
          weekCount: 1,
          featuredCount: 2,
          uniqueFeaturedIds: ["ni264", "te263"],
          weeks: [
            {
              week: 26,
              page: "w26.html",
              featured: [
                {
                  week: 26,
                  name: "Shikamaru Nara & Temari",
                  printedId: "NI-264",
                  cardId: "ni264",
                  page: "w26.html",
                },
                {
                  week: 26,
                  name: "Mélodie du guerrier illusoire",
                  printedId: "TE-263",
                  cardId: "te263",
                  page: "w26.html",
                },
              ],
              alsoMentioned: [],
            },
          ],
        },
      });
      expect(merged.named).toContain("naruto:ni-0264");
      expect(
        merged.titles.find((t) => t.printKey === "naruto:ni-0264")?.fullName,
      ).toBe("Shikamaru Nara & Temari");
      expect(merged.addedPrints).toEqual(["naruto:te-0263"]);
      expect(
        merged.titles.find((t) => t.printKey === "naruto:te-0263")?.fullName,
      ).toBe("Mélodie du guerrier illusoire");
    });

    it("does not mint a second NI-064 beside the retail print", () => {
      const merged = mergeCarteSemaineIntoIndex({
        prints: [
          {
            printKey: "naruto:ni-0064",
            setCode: "s2",
            number: "ni0064",
            cardType: "ni",
            family: "ninja",
          },
        ],
        titles: [
          {
            printKey: "naruto:ni-0064",
            lang: "fr",
            fullName: "Kakashi Hatake",
          },
        ],
        report: {
          generatedAt: "2026-01-01T00:00:00.000Z",
          source: "test",
          weekCount: 1,
          featuredCount: 1,
          uniqueFeaturedIds: ["ni064"],
          weeks: [
            {
              week: 1,
              page: "w1.html",
              featured: [
                {
                  week: 1,
                  name: "qui",
                  printedId: "NI-064",
                  cardId: "ni064",
                  page: "w1.html",
                },
              ],
              alsoMentioned: [],
            },
          ],
        },
      });
      expect(merged.prints).toHaveLength(1);
      expect(merged.prints[0]?.printKey).toBe("naruto:ni-0064");
      expect(merged.addedPrints).toEqual([]);
      expect(
        merged.titles.find((t) => t.printKey === "naruto:ni-0064")?.fullName,
      ).toBe("Kakashi Hatake");
    });

    it("drops a relative pronoun captured as a name", () => {
      const week = parseCarteSemaineHtml(`15/12/2008 qui [NI-064]`, {
        week: 1,
        page: "w1.html",
      });
      expect(week.featured.find((e) => e.cardId === "ni064")).toBeUndefined();
    });
  });
}

// —— s6FrPrinted ——
{
  const dirs: string[] = [];

  afterEach(() => {
    resetNarutoS6FrPrintedCache();
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe("s6 FR printed inserts", () => {
    it("does not treat cancelled retail as a full French set", () => {
      expect(ledger.retailFr).toBe(false);
      expect(ledger.cards.map((c) => c.number).sort()).toEqual([
        "ni232",
        "ni236",
        "ni252",
        "ni253",
        "ta221",
        "ta226",
      ]);
    });

    it("attests the Kana-official inédites and keeps TE-191 out of S6", () => {
      expect(ledger.officialKana?.announced).toBe("2008-04-25");
      expect(isNarutoS6FrPrintedNumber("ni236")).toBe(true);
      expect(isNarutoS6FrPrintedNumber("ni0236")).toBe(true);
      expect(isNarutoS6FrPrintedNumber("ta221")).toBe(true);
      expect(isNarutoS6FrPrintedNumber("ta214")).toBe(true);
      expect(isNarutoS6FrPrintedNumber("ni240")).toBe(true);
      expect(isNarutoS6FrPrintedNumber("ni268")).toBe(false);
      expect(isNarutoS6FrPrintedNumber("te191")).toBe(false);
    });

    it("lists disk number forms for membership SQL", () => {
      const nums = narutoS6FrPrintedDiskNumbers();
      expect(nums).toEqual(
        expect.arrayContaining(["ta221", "ta0221", "ni236", "ni0236"]),
      );
    });

    it("writes s6 onto appearances.fr for inédites and Kana S5 reprints", () => {
      const root = mkdtempSync(path.join(tmpdir(), "naruto-s6-fr-"));
      dirs.push(root);
      const file = path.join(root, "appearances.json");
      writeFileSync(
        file,
        `${JSON.stringify({
          generatedAt: "2026-01-01T00:00:00.000Z",
          appearances: {
            ta0221: { ja: "maki11" },
            ta0214: { fr: "s5" },
          },
        })}\n`,
      );

      const changed = syncNarutoS6FrPrintedAppearances(root);
      expect(changed).toBeGreaterThan(0);
      expect(existsSync(file)).toBe(true);

      const raw = JSON.parse(readFileSync(file, "utf8")) as {
        appearances: Record<string, Record<string, string | string[]>>;
      };
      expect(raw.appearances.ta0221?.fr).toBe("s6");
      expect(raw.appearances.ta0221?.ja).toBe("maki11");
      expect(raw.appearances.ta0214?.fr).toEqual(["s5", "s6"]);
    });
  });
}

// —— waybackSiteMirror ——
{
  describe("stagingRelFromUrl", () => {
    it("strips /naruto/ and lowercases", () => {
      expect(
        stagingRelFromUrl(
          "http://www.bandaicg.com/naruto/images/cards_s1/N001.jpg",
          { stripPathPrefix: "/naruto/" },
        ),
      ).toBe("images/cards_s1/n001.jpg");
    });

    it("encodes query into the filename", () => {
      expect(
        stagingRelFromUrl(
          "http://www.bandaicg.com/naruto/cardlists_detail.php?s=1&c=n001",
          { stripPathPrefix: "/naruto/" },
        ),
      ).toBe("cardlists_detail__s=1_c=n001.php");
    });

    it("can prefix host for multi-host mirrors", () => {
      expect(
        stagingRelFromUrl(
          "http://www.carddas.com/naruto/cardlist/card_img/jutsu-027_spc2.gif",
          { stripPathPrefix: "/naruto/", includeHost: true },
        ),
      ).toBe("www.carddas.com/cardlist/card_img/jutsu-027_spc2.gif");
    });

    it("rejects polluted archive-url paths", () => {
      expect(
        stagingRelFromUrl(
          "http://www.bandaicg.com/naruto/cardlists_s1.html%7Carchive-url=x",
          { stripPathPrefix: "/naruto/" },
        ),
      ).toBeNull();
    });
  });

  describe("canonicalizeUrl", () => {
    it("drops default ports and hash", () => {
      expect(canonicalizeUrl("http://www.carddas.com:80/naruto/#x")).toBe(
        "http://www.carddas.com/naruto",
      );
    });
  });
}

// —— facebookNarutoCollectionFrance ——
{
  describe("facebook Naruto Collection France dig", () => {
    it("links Victor Husson group to Collection Naruto YT cross-ref", () => {
      expect(dig.group.url).toMatch(/805799330361374/);
      expect(dig.crossRefs.youtube).toContain("collection-naruto-youtube");
      expect(dig.group.adminVoice).toMatch(/Victor Husson/i);
    });

    it("documents NI-236 via DVD vol. 15 with fixed mapping", () => {
      const channel = dig.distributionChannels.find(
        (c) => c.id === "kana-dvd-naruto-vol15",
      );
      expect(channel?.fixedMapping).toBe(true);
      expect(channel?.randomPool).toBe(false);
      expect(channel?.cards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ number: "ni236", serie: 6 }),
        ]),
      );
      expect(channel?.stickerText).toMatch(/série 6/i);
    });

    it("records Jordan thread permalink and Made in Japan identification", () => {
      const post = dig.posts.find((p) => p.id === "jordan-blue-back-made-in-japan");
      expect(post?.permalink).toContain("permalink/1248487462759223");
      const victor = post?.thread?.find((t) => t.author === "Victor Husson");
      expect(victor?.claim).toMatch(/made in japan/i);
      expect(victor?.claim).toMatch(/série 6/i);
      expect(victor?.claim).toMatch(/Shippuden/i);
    });

    it("records Shippuden vol.21 promo channel from Victor comment", () => {
      const channel = dig.distributionChannels.find(
        (c) => c.id === "kana-dvd-shippuden-vol21",
      );
      expect(channel?.permalink).toContain("1228068058134497");
      expect(channel?.cards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ number: "pr100", name: "Naruto Uzumaki" }),
        ]),
      );
    });

    it("archives user packshot DVD/game insert table", () => {
      expect(dig.packshotAttestations).toHaveLength(10);
      const vol15 = dig.packshotAttestations.find(
        (p) => p.id === "kana-dvd-naruto-vol15-packshot",
      );
      expect(vol15?.cardsVisible).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ number: "ni236" }),
          expect.objectContaining({ number: "ni232" }),
        ]),
      );
      const vol8 = dig.packshotAttestations.find(
        (p) => p.id === "kana-dvd-naruto-vol8",
      );
      expect(vol8?.cardsVisible).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ number: "ni118" }),
          expect.objectContaining({ number: "ni119" }),
        ]),
      );
      const uns3 = dig.distributionChannels.find(
        (c) => c.id === "game-xbox360-uns3-collector-card",
      );
      expect(uns3?.cards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ number: "pr095" }),
        ]),
      );
    });

    it("documents Sage's Legacy s24 duopack variants with FB packshots", () => {
      const channel = dig.distributionChannels.find(
        (c) => c.id === "duopack-s24-fr-bipack-variants",
      );
      expect(channel?.permalink).toContain("1619206362353996");
      expect(channel?.variants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "organisation-pacifique",
            windowPromo: expect.objectContaining({ number: "m873" }),
          }),
          expect.objectContaining({
            id: "loup-bicephale",
            windowPromo: expect.objectContaining({ number: "n1379" }),
          }),
        ]),
      );
    });

    it("flags PR-098 Double éclair pourfendeur as absent from FR catalogue", () => {
      const gap = dig.promoGapsFr?.find((p) => p.printedRef === "PR-098");
      expect(gap?.nameFr).toMatch(/Double éclair pourfendeur/i);
      const att = dig.packshotAttestations.find(
        (p) => p.id === "pr098-double-eclair-pourfendeur-binder",
      );
      expect(att?.photoUrl).toContain("1968916513588340");
      expect(att?.notToConfuseWith?.te030).toMatch(/L'éclair pourfendeur/i);
    });

    it("flags open conflict manga t1185 vs DVD vol. 15 for NI-236", () => {
      expect(dig.openConflicts.some((c) => c.id === "ni236-manga-t2-vs-dvd-vol15"))
        .toBe(true);
    });

    it("records DVD SKUs minted with packshots; blisters S6 still attestation-only", () => {
      expect(dig.doNot.join(" ")).toMatch(/EAN/i);
      expect(dig.ingest).toMatch(/mintés|minté/i);
      expect(dig.ingest).toMatch(/Blisters Kana.*attestation-only/i);
    });
  });
}

// —— youtubeGapsWebHunt ——
{
  describe("youtube-gaps-web-hunt", () => {
    it("closes the Supplication S2 ghost against S3 TA-108", () => {
      const finding = dig_youtubeGapsWebHunt.findings.find((row) => row.id === "supplication-not-s2-ghost");
      expect(finding?.status).toBe("resolved");
      expect(checklist.sets.s3.ids).toContain("ta108");
      expect(checklist.sets.s3.names?.ta108 ?? checklist.sets.s2.names).toBeTruthy();
      expect(
        (checklist.sets.s3.names as Record<string, string> | undefined)?.ta108,
      ).toBe("Supplication");
      expect(
        (sets.sets.s2.collectorCount as { checklistGhost?: string }).checklistGhost,
      ).toBeUndefined();
    });

    it("keeps early FR displays blocked on packshot; Pack Découverte + Hobby tin have art", () => {
      expect(dig_youtubeGapsWebHunt.stillBlockedOnPackshot).toEqual(
        expect.arrayContaining(["display-s1…s5"]),
      );
      expect(dig_youtubeGapsWebHunt.stillBlockedOnPackshot).not.toContain("pack-decouverte");
      expect(dig_youtubeGapsWebHunt.stillBlockedOnPackshot).not.toContain("tin-box-hobby");
      const hobby = dig_youtubeGapsWebHunt.findings.find((row) => row.id === "tin-box-hobby");
      expect(hobby?.status).toBe("minted");
      expect(hobby?.renamedFrom).toBe("tin-box-obi");
      expect(hobby?.sku).toBe("tin-box-hobby");
    });
  });
}

// —— collectionNarutoYoutube ——
{
  describe("collection-naruto youtube dig", () => {
    it("covers both master-set videos and mints pack-decouverte + tin-box-hobby", () => {
      expect(dig_collectionNarutoYoutube.videos.map((v) => v.id).sort()).toEqual([
        "7r7LwtIENKs",
        "JYwlXQQlooI",
      ]);
      expect(dig_collectionNarutoYoutube.sealedFrCarddass.attestedNow.map((r) => r.slug).sort()).toEqual([
        "pack-decouverte",
        "tin-box-hobby",
      ]);
      expect(
        dig_collectionNarutoYoutube.sealedFrCarddass.skuGapsNeedPackshot.some(
          (g) => g.slug === "display-s1",
        ),
      ).toBe(true);
      expect(
        dig_collectionNarutoYoutube.sealedFrCarddass.skuGapsNeedPackshot.some(
          (g) => g.slug === "tin-box-hobby",
        ),
      ).toBe(false);
      expect(dig_collectionNarutoYoutube.doNot.join(" ")).toMatch(/display-s1/);
      const pack = NARUTO_SEALED_SKUS.find((r) => r.slug === "pack-decouverte");
      expect(pack).toMatchObject({
        kind: "deck_bundle",
        setCode: "s1",
        attested: true,
        stagingFile: "pack-decouverte.jpg",
        stagingKind: "wrappers",
        declaredCardCount: 96,
      });
      expect(
        NARUTO_SEALED_SKUS.find((r) => r.slug === "tin-box-hobby"),
      ).toMatchObject({
        kind: "tin",
        stagingFile: "tin-box-hobby.png",
        stagingKind: "wrappers",
        name: "Tin Box Hobby",
      });
    });

    it("records collector counts on Carddass FR sets", () => {
      expect(sets.sets.s1.collectorCount?.total).toBe(188);
      expect(sets.sets.s5.collectorCount?.total).toBe(149);
      expect(sets.sets.s6.frenchArtefact).toMatch(/MADE IN JAPAN/i);
    });

    it("lists the 10 S1 manga prerelease true variants at ~10 €", () => {
      expect(dig_collectionNarutoYoutube.setCardCounts.s1.prereleaseAlts).toBe(10);
      expect(dig_collectionNarutoYoutube.indicativePrices.s1.prereleaseEur).toBe(10);
      expect(dig_collectionNarutoYoutube.prerelease.fullTen).toEqual([
        "ni025",
        "ni019",
        "ni047",
        "ni027",
        "ta005",
        "ta004",
        "te015",
        "te007",
        "te003",
        "te036",
      ]);
      expect(
        dig_collectionNarutoYoutube.prerelease.nonHoloAltsOfHolos.cards.map((c) => c.number).sort(),
      ).toEqual(["ni019", "ta005", "te007", "te036"]);
      expect(dig_collectionNarutoYoutube.indicativePrices.s2.premium.map((p) => p.number).sort()).toEqual(
        ["ni064", "ni068", "te073"],
      );
      expect(dig_collectionNarutoYoutube.indicativePrices.s3.premium.map((p) => p.number).sort()).toEqual(
        ["ni063", "ni128", "ni129", "ni153"],
      );
      expect(dig_collectionNarutoYoutube.indicativePrices.s4).toMatchObject({
        normalEur: 0.3,
        holoEur: 10,
      });
      expect(dig_collectionNarutoYoutube.indicativePrices.s4.premium.map((p) => p.number).sort()).toEqual(
        ["ni167", "ni168", "ni172", "ni203"],
      );
      expect(dig_collectionNarutoYoutube.indicativePrices.s5).toMatchObject({ normalEur: 0.5 });
      expect(dig_collectionNarutoYoutube.indicativePrices.s5.premium.map((p) => p.number).sort()).toEqual(
        ["ni221", "ni247", "ni254"],
      );
      expect(dig_collectionNarutoYoutube.indicativePrices.s6.premium.map((p) => p.number).sort()).toEqual(
        ["ni236", "ni240", "ni252", "ni253", "ta221", "ta226", "ta227"],
      );
    });

    it("records promo shuriken lists and CdF / tin specials", () => {
      expect(dig_collectionNarutoYoutube.promos.lists["1"]).toEqual(
        expect.arrayContaining(["te002", "te139", "ni034"]),
      );
      expect(dig_collectionNarutoYoutube.promos.lists["2"]).toEqual(
        expect.arrayContaining(["ni063", "ta081"]),
      );
      expect(dig_collectionNarutoYoutube.promos.lists["3"]).toEqual(
        expect.arrayContaining(["ni023", "ta011", "te073"]),
      );
      expect(dig_collectionNarutoYoutube.indicativePrices.promo).toMatchObject({
        shuriken1Eur: 20,
        shuriken2Eur: 30,
        shuriken3Eur: 50,
      });
      expect(
        dig_collectionNarutoYoutube.indicativePrices.promo.special.map((p) => [p.number, p.priceEur]),
      ).toEqual(
        expect.arrayContaining([
          ["pr016", 5],
          ["pr011", 8],
          ["ni023", 100],
        ]),
      );
    });
  });
}

// —— amazonFr ——
{
  describe("Amazon FR starter S1 B0019R7M2W", () => {
    it("records the SKU without ingesting a missing packshot", () => {
      expect(amazonFr.ingest).toBe("none");
      expect(amazonFr.asin).toBe("B0019R7M2W");
      expect(amazonFr.printedRef).toBe("05110");
      expect(amazonFr.slug).toBe("starter-pays-du-vent");
      expect(amazonFr.doNotDisplace).toBe(
        "staging/trictrac/starter-pays-du-vent.jpeg",
      );
      expect(
        vialudibunda.products.find((row) => row.slug === amazonFr.slug)
          ?.printedRef,
      ).toBe("05110");
      expect(
        trictrac.products.some((row) => row.slug === "starter-pays-du-vent"),
      ).toBe(true);
    });
  });
}

// —— jpVpnSources ——
{
  describe("JP VPN 2026-08-18 source probes", () => {
    it("records the Juggernauts SKU table without minting jumbo as makiN", () => {
      expect(juggernauts.ingest).toBe("none");
      expect(juggernauts.crawlLive).toBe(false);
      expect(juggernauts.url).toBe("http://card.g1.xrea.com/t2/tbc28nrt.html");
      expect(juggernauts.skuNotInSetsJson.map((row) => row.name)).toEqual([
        "秘儀伝授スターター",
        "極意忍法帳",
        "忍法法札絵巻",
        "雪姫忍法帳",
        "忍法法札絵巻2",
        "拡張ファイリングシート",
        "拡張ファイリングシート2",
        "ナルティメットカードバトルスペシャルコンボシート",
        "ナルティメットカードバトルスペシャルコンボシート2",
      ]);
      expect(
        juggernauts.skuNotInSetsJson.filter(
          (row) => row.skip === "data-carddass-mix",
        ),
      ).toHaveLength(2);
      expect(juggernauts.not).toContain("data-carddass");
      expect(juggernauts.not).toContain("faces");
    });

    it("keeps dream-hobby and TV Tokyo as SKU copy, not face dumps", () => {
      expect(dreamHobby.ingest).toBe("none");
      expect(dreamHobby.startersNamed).toContain("蝦蟇の書");
      expect(dreamHobby.maki16Split.carddass100).toBe("火の継承者編");
      expect(tvTokyo.ingest).toBe("none");
      expect(tvTokyo.pages[0]?.starters?.map((row) => row.set)).toEqual([
        "maki5",
        "maki8",
        "maki10",
      ]);
      expect(tvTokyo.pages[2]?.not).toContain("maki1");
    });

    it("does not treat Yahoo Shopping or HobbySearch as new face hosts", () => {
      expect(yahooShopping.ingest).toBe("none");
      expect(yahooShopping.crawlLive).toBe(false);
      expect(yahooShopping.sameAs).toBe("suruga-ya-carddass.json");
      expect(yahooShopping.sampleIds[0]).toMatch(/^GL/);
      expect(hobbysearch.ingest).toBe("none");
      expect(hobbysearch.note).toMatch(/0 product tiles/);
      expect(
        carddasCom.live["vpnTokyo2026-08-18"]["www.carddas.com/naruto"],
      ).toBe(404);
    });
  });
}

