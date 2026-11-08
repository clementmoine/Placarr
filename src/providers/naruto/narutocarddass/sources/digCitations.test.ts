import { describe, expect, it } from "vitest";

import {
  facebookProductInsertCitationForNumber,
  kanaDvdInsertCitationForNumber,
  kanaMangaInsertCitationForNumber,
  narutoPrereleaseDistributionCitationUrl,
  narutoSealedDistributionCitation,
  resetNarutoDigCitationCaches,
  narutoStoryFactsForPrint,
  narutoStoryFactsForSealedSlug,
  uns3PromoDistributionCitationForNumber,
  uns3StoryFactForNumber,
} from "./digCitations";

describe("digCitations", () => {
  resetNarutoDigCitationCaches();

  it("stamps the Collection Naruto Pré-release chapter on S1 avant-première", () => {
    const url = narutoPrereleaseDistributionCitationUrl();
    expect(url).toMatch(
      /^https:\/\/www\.youtube\.com\/watch\?v=JYwlXQQlooI/,
    );
    expect(url).toContain("t=1156");
  });

  it("maps Kana 2008 tome inserts to Wayback proof", () => {
    const ni253 = kanaMangaInsertCitationForNumber("ni253");
    expect(ni253).toMatchObject({
      label: "Insert manga — tome 6 (Kana)",
    });
    expect(ni253?.url).toContain("web.archive.org");
    expect(ni253?.url).toContain("mangakana.com");

    expect(kanaMangaInsertCitationForNumber("ni9999")).toBeNull();
  });

  it("maps attested sealed SKUs to dig press / Wayback proofs", () => {
    expect(narutoSealedDistributionCitation("pack-decouverte")).toMatchObject({
      label: "Canal — presse Manga Sanctuary",
      url: "https://www.manga-sanctuary.com/news/7397/naruto-jcc.html",
    });
    expect(narutoSealedDistributionCitation("tin-box-hobby")?.url).toContain(
      "web.archive.org",
    );
    expect(narutoSealedDistributionCitation("tin-box")?.url).toContain(
      "scifi-universe.com",
    );
    expect(narutoSealedDistributionCitation("display-s1")).toBeNull();
  });

  it("maps Kana DVD sealed SKUs + visible cards to Facebook permalinks", () => {
    const sealed = narutoSealedDistributionCitation("kana-dvd-naruto-vol3");
    expect(sealed?.label).toMatch(/DVD vol\. 3/i);
    expect(sealed?.url).toContain("facebook.com/groups/");

    const ta214 = kanaDvdInsertCitationForNumber("ta214");
    expect(ta214).toMatchObject({
      label: "Insert DVD",
      value: expect.stringMatching(/vol\. 3/i),
    });
    expect(ta214?.url).toContain("permalink");

    // Manga + DVD channels coexist for S6 inserts.
    expect(kanaMangaInsertCitationForNumber("ni236")?.label).toMatch(/tome/i);
    expect(kanaDvdInsertCitationForNumber("ni236")?.label).toBe("Insert DVD");
  });

  it("maps UNS3 / duopack sealed SKUs and window-promo cards", () => {
    expect(narutoSealedDistributionCitation("xbox360-uns3")?.label).toMatch(
      /Storm 3/i,
    );
    expect(
      narutoSealedDistributionCitation("duopack-s24-organisation-pacifique")
        ?.url,
    ).toContain("facebook.com");

    expect(facebookProductInsertCitationForNumber("pr095")).toMatchObject({
      label: "Insert jeu",
    });
    expect(facebookProductInsertCitationForNumber("m873")).toMatchObject({
      label: "Insert duopack",
      value: expect.stringMatching(/Duo Pack/i),
    });
    expect(facebookProductInsertCitationForNumber("pr093")?.label).toBe(
      "Insert promo",
    );
  });

  it("stamps UNS3 dig official / press Distribution for PR-093 / PR-095", () => {
    expect(uns3PromoDistributionCitationForNumber("pr093")).toMatchObject({
      label: expect.stringMatching(/Kana Japan Expo 2013/i),
      url: "https://www.kana.fr/je-18-carte-naruto-offerte/",
    });
    expect(uns3PromoDistributionCitationForNumber("PR-095")?.url).toMatch(
      /afjv\.com|gematsu\.com/,
    );
    expect(uns3PromoDistributionCitationForNumber("pr100")).toBeNull();
  });

  it("emits dig-claim storytelling for UNS3 PR-093 / 095 / 096", () => {
    const story = uns3StoryFactForNumber("pr093");
    expect(story?.kind).toBe("story");
    expect(story?.value).toMatch(/Stand Kana JE 2013/i);
    expect(story?.url).toBe("https://www.kana.fr/je-18-carte-naruto-offerte/");

    const dayOne = uns3StoryFactForNumber("pr095");
    expect(dayOne?.value).toMatch(/Sangoku|carte à collectionner/i);
    expect(dayOne?.url).toMatch(/afjv\.com|gematsu\.com|facebook\.com/);

    const duopack = uns3StoryFactForNumber("pr096");
    expect(duopack?.value).toMatch(/s28|window promo/i);
    expect(duopack?.url).toMatch(/kinkai\.fr|ebay\.fr|facebook\.com/);
  });

  it("emits sealed dig claims for Pack Découverte / Tin Boxes", () => {
    const pack = narutoStoryFactsForSealedSlug("pack-decouverte");
    expect(pack[0]?.value).toMatch(/2 starters S1/i);
    expect(pack[0]?.url).toMatch(/manga-sanctuary|youtube\.com/);

    const hobby = narutoStoryFactsForSealedSlug("tin-box-hobby");
    expect(hobby[0]?.value).toMatch(/PR-016|PR-011/i);
    expect(hobby[0]?.url).toMatch(/web\.archive\.org|youtube\.com|carddass/);

    const tin = narutoStoryFactsForSealedSlug("tin-box");
    expect(tin[0]?.value).toMatch(/Tin Box Collector|Noël/i);
    expect(tin[0]?.url).toContain("scifi-universe.com");

    expect(narutoStoryFactsForSealedSlug("display-s1")).toEqual([]);
  });

  it("emits print dig claims for Kana manga / prerelease / S6 FR", () => {
    const kana = narutoStoryFactsForPrint({ number: "ni253", setCode: "s6" });
    expect(kana[0]?.value).toMatch(/15 premiers tomes/i);
    expect(kana[0]?.url).toContain("web.archive.org");

    const prerelease = narutoStoryFactsForPrint({
      number: "ni019-prerelease",
      setCode: "s1",
      grouping: "prerelease",
    });
    expect(prerelease[0]?.value).toMatch(/avant-première manga/i);
    expect(prerelease[0]?.url).toContain("youtube.com");

    const s6 = narutoStoryFactsForPrint({ number: "ni236", setCode: "s6" });
    // Kana canal wins over S6 territory when both apply (ni236 is tome 2).
    expect(s6[0]?.value).toMatch(/15 premiers tomes|S6 FR starters|made in japan/i);

    // Pure S6 territory (not in Kana tome map) → FB MIJ claim.
    const s6Only = narutoStoryFactsForPrint({
      number: "ni221",
      setCode: "s6",
    });
    expect(s6Only[0]?.value).toMatch(/made in japan|Série 6/i);
    expect(s6Only[0]?.url).toContain("facebook.com");
  });

  it("emits tournament shuriken / tin promo dig notes", () => {
    const te002 = narutoStoryFactsForPrint({
      number: "te002",
      setCode: "promo",
    });
    expect(te002[0]?.value).toMatch(/participant/i);
    expect(te002[0]?.url).toContain("7r7LwtIENKs");

    const ni023 = narutoStoryFactsForPrint({
      number: "ni023",
      setCode: "promo",
    });
    expect(ni023[0]?.value).toMatch(/Vainqueur tournoi|Champion de France/i);

    const pr016 = narutoStoryFactsForPrint({
      number: "pr016",
      setCode: "promo",
    });
    expect(pr016[0]?.value).toMatch(/Tin Box Série 4 Invocation/i);
  });

  it("emits Facebook DVD dig stories for PR-100 / sealed DVD SKUs", () => {
    const pr100 = narutoStoryFactsForPrint({
      number: "pr100",
      setCode: "promo",
    });
    expect(pr100[0]?.value).toMatch(/DVD vol\. 21|Shippuden/i);
    expect(pr100[0]?.url).toContain("facebook.com");

    const sealed = narutoStoryFactsForSealedSlug("kana-dvd-shippuden-vol21");
    expect(sealed[0]?.value).toMatch(/DVD vol\. 21|Shippuden/i);

    const vol15 = narutoStoryFactsForSealedSlug("kana-dvd-naruto-vol15");
    expect(vol15[0]?.value).toMatch(/vol\. 15|Série 6/i);

    const vol8 = narutoStoryFactsForSealedSlug("kana-dvd-naruto-vol8");
    expect(vol8[0]?.value).toMatch(/2 cartes/i);
    expect(vol8[0]?.url).toMatch(/facebook\.com|youtube\.com/);

    const vol3 = narutoStoryFactsForSealedSlug("kana-dvd-naruto-vol3");
    expect(vol3[0]?.value).toMatch(/série 5/i);

    const xbox = narutoStoryFactsForSealedSlug("xbox360-uns3");
    expect(xbox[0]?.value).toMatch(/Sangoku|carte à collectionner/i);

    const duo24 = narutoStoryFactsForSealedSlug(
      "duopack-s24-organisation-pacifique",
    );
    expect(duo24[0]?.value).toMatch(/carte spéciale|boosters/i);
    expect(duo24[0]?.url).toContain("facebook.com");

    const duo28 = narutoStoryFactsForSealedSlug("duopack-s28");
    expect(duo28[0]?.value).toMatch(/s28|window promo/i);

    const mangaPack = narutoStoryFactsForSealedSlug("kana-manga-pack-1-2-3");
    expect(mangaPack[0]?.value).toMatch(/avant-première manga/i);
    expect(mangaPack[0]?.url).toContain("youtube.com");
  });

  it("stamps FR S5 sealed Distribution from joueur.ch / Parence digs", () => {
    expect(narutoSealedDistributionCitation("starter-la-quete")?.url).toContain(
      "joueur.ch",
    );
    expect(
      narutoSealedDistributionCitation("starter-un-nouveau-depart")?.url,
    ).toContain("joueur.ch");
    expect(narutoSealedDistributionCitation("booster-s5")?.url).toMatch(
      /parence\.com|checklist_naruto_S5/,
    );
  });

  it("stamps kana manga pack Distribution from prerelease dig chapter", () => {
    expect(
      narutoSealedDistributionCitation("kana-manga-pack-1-2-3")?.url,
    ).toContain("youtube.com");
  });

  it("stamps Détruire Konoha + duopack-s28 from Ultrajeux / Kinkai digs", () => {
    expect(
      narutoSealedDistributionCitation("starter-detruire-konoha")?.url,
    ).toContain("ultrajeux.com");
    const destroy = narutoStoryFactsForSealedSlug("starter-detruire-konoha");
    expect(destroy[0]?.value).toMatch(/40 cartes|exclusives/i);

    expect(
      narutoSealedDistributionCitation("starter-sceller-le-malefice")?.url,
    ).toContain("ultrajeux.com");
    expect(
      narutoStoryFactsForSealedSlug("starter-sceller-le-malefice")[0]?.value,
    ).toMatch(/40 cartes|exclusives/i);

    expect(narutoSealedDistributionCitation("duopack-s28")?.url).toMatch(
      /kinkai\.fr|ebay\.fr/,
    );
  });

  it("stamps display-s28-fr from eBay tin-metal dig listing", () => {
    expect(narutoSealedDistributionCitation("display-s28-fr")?.url).toContain(
      "ebay.fr/itm/285342890666",
    );
    expect(narutoStoryFactsForSealedSlug("display-s28-fr")[0]?.value).toMatch(
      /Storm 3|3391891969949/i,
    );
  });


  it("stamps ES / IT / EN sealed hunts to openable marketplace proofs", () => {
    expect(narutoSealedDistributionCitation("booster-s3-es")?.url).toContain(
      "sunnystore.es",
    );
    expect(narutoSealedDistributionCitation("booster-tp3")?.url).toContain(
      "sunnystore.es",
    );
    expect(narutoSealedDistributionCitation("booster-s5-en")?.url).toContain(
      "sunnystore.es",
    );
    expect(
      narutoSealedDistributionCitation("starter-il-fascino-del-male")?.url,
    ).toContain("vinted.fr");
    expect(narutoSealedDistributionCitation("booster-s6-it")?.url).toMatch(
      /ebay\.(fr|it)/,
    );
    expect(narutoSealedDistributionCitation("booster-s7-it")?.url).toMatch(
      /ebay\.it|madhouse\.it/,
    );
    expect(narutoSealedDistributionCitation("booster-s8-it")?.url).toContain(
      "ebay.it",
    );
    expect(narutoSealedDistributionCitation("starter-tradimento")?.url).toContain(
      "emporiodimilo.it/prodotti/",
    );
    expect(narutoSealedDistributionCitation("starter-lealta")?.url).toContain(
      "emporiodimilo.it/prodotti/",
    );

    const itStory = narutoStoryFactsForSealedSlug("starter-tradimento");
    expect(itStory[0]?.value).toMatch(/40 carte|Regolamento/i);
    expect(itStory[0]?.url).toContain("emporiodimilo.it");
  });
});


