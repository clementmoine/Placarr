import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  loadMythosPromoDistributionDig,
  mythosPrintFacts,
  mythosPromoCuratedAssetPath,
  mythosPromoCuratedAssetsExist,
  mythosPromoProofAttachments,
  resetMythosPromoDistributionCache,
  VV2_PROMO_PRINT_KEY,
} from "./promoDistribution";

describe("kana-boruto-tbv6-vv2-promo dig", () => {
  it("is a confirmed dig for the VV2 print with tweet + curated media", () => {
    resetMythosPromoDistributionCache();
    const dig = loadMythosPromoDistributionDig();
    expect(dig).not.toBeNull();
    expect(dig!.verdict).toBe("confirmed");
    expect(dig!.kind).toBe("research-dig");
    expect(dig!.printKey).toBe(VV2_PROMO_PRINT_KEY);
    expect(dig!.officialAnnouncement.isbn).toBe("9782505142133");
    expect(dig!.officialAnnouncement.printRun).toMatch(/premier tirage/i);
    expect(dig!.proof.tweet.statusUrl).toContain(
      "NarutoMythosTCG/status/2094456658164391972",
    );
    expect(dig!.proof.tweet.claimFr).toMatch(/premier tirage du tome 6/i);
    expect(dig!.proof.tweet.claimFr).toMatch(/Myhtos/);
    expect(dig!.proof.tweet.claimEn).toMatch(/September 4, 2026/i);
    expect(dig!.proof.tweet.media).toHaveLength(2);
    expect(mythosPromoCuratedAssetsExist(dig!)).toBe(true);
    for (const media of dig!.proof.tweet.media) {
      expect(existsSync(mythosPromoCuratedAssetPath(media.local))).toBe(true);
    }
    expect(
      existsSync(mythosPromoCuratedAssetPath(dig!.proof.faceCrop!.local)),
    ).toBe(true);
  });
});

describe("mythosPrintFacts", () => {
  it("emits a citable Kana Distribution fact for the VV2 print", () => {
    resetMythosPromoDistributionCache();
    const facts = mythosPrintFacts(VV2_PROMO_PRINT_KEY);
    const kana = facts.find((f) => /Boruto Two Blue Vortex/i.test(f.value));
    expect(kana).toMatchObject({
      kind: "category",
      label: "Distribution",
    });
    expect(kana!.value).toMatch(/1er tirage|premier tirage/i);
    expect(kana!.value).toMatch(/Kana/i);
    expect(kana!.url).toBe(
      "https://x.com/NarutoMythosTCG/status/2094456658164391972",
    );
  });

  it("emits dig tweet claim as storytelling encart for VV2", () => {
    resetMythosPromoDistributionCache();
    const story = mythosPrintFacts(VV2_PROMO_PRINT_KEY).find(
      (f) => f.kind === "story",
    );
    expect(story).toMatchObject({
      label: "Le saviez-vous ?",
      url: "https://x.com/NarutoMythosTCG/status/2094456658164391972",
    });
    expect(story!.value).toMatch(/premier tirage du tome 6/i);
  });


  it("emits nothing for an unrelated printKey", () => {
    resetMythosPromoDistributionCache();
    expect(mythosPrintFacts("mythos:ks1-0001")).toEqual([]);
    expect(mythosPrintFacts(null)).toEqual([]);
    expect(mythosPrintFacts("")).toEqual([]);
  });
});

describe("mythosPromoProofAttachments", () => {
  it("points at FR/EN flyer assets under the card dir", () => {
    resetMythosPromoDistributionCache();
    const attachments = mythosPromoProofAttachments(VV2_PROMO_PRINT_KEY);
    expect(attachments).toHaveLength(2);
    expect(attachments.map((a) => a.role).sort()).toEqual([
      "mythos-proof-flyer-en",
      "mythos-proof-flyer-fr",
    ]);
    for (const a of attachments) {
      expect(a.url).toContain("/assets/naruto/mythos/cards/");
      expect(a.url).toMatch(/proof\.(french|english)\.twitter\.webp/);
      expect(a.coverProvenance).toBe("catalog");
    }
  });

  it("emits nothing for an unrelated printKey", () => {
    expect(mythosPromoProofAttachments("mythos:ks1-0133-v")).toEqual([]);
  });
});
