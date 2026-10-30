import { describe, expect, it } from "vitest";

import {
  leclercCampaignTitle,
  leclercSealedSeedProducts,
  mergeLeclercSealedSeedWithLedger,
} from "./sealedSeed";

describe("leclercSealedSeed", () => {
  it("names album / pochette / display from the campaign title", () => {
    expect(leclercCampaignTitle("disney25")).toBe(
      "Découvre la magie de Disney",
    );
    expect(leclercCampaignTitle("sw19")).toBe("Maîtriser la Force");
    const seed = leclercSealedSeedProducts("marvel21");
    expect(seed.map((s) => s.slug)).toEqual([
      "collector-album",
      "pochette",
      "display",
    ]);
    expect(seed[0]?.name).toBe("Album — Révèle ton Pouvoir");
    expect(seed[1]).toMatchObject({
      slug: "pochette",
      cardsPerPack: 4,
      packComposition: {
        provenance: "structural",
        cardsPerPack: 4,
        slots: [{ id: "card", count: 4, kind: "dedicated" }],
      },
    });
    expect(seed[1]?.packComposition).not.toHaveProperty("possibleChase");
    expect(seed[2]).toMatchObject({
      slug: "display",
      kind: "display",
      cardsPerPack: 4,
      packsContained: null,
    });
  });

  it("lets curated overlay keep art + Fixeez chase without dropping display stub", () => {
    const merged = mergeLeclercSealedSeedWithLedger("disney25", [
      {
        slug: "pochette",
        kind: "booster",
        category: "boosters",
        name: "Pochette — Découvre la magie de Disney",
        art: "art.paninimania.jpg",
        declaredCardCount: 4,
        cardsPerPack: 4,
        packComposition: {
          provenance: "structural",
          source: "attestation",
          verifiedAt: "2026-10-23",
          cardsPerPack: 4,
          slots: [
            { id: "card", count: 4, kind: "dedicated", rarities: ["card"] },
          ],
          rarityHits: {},
          possibleChase: ["Fixeez"],
        },
      },
      {
        slug: "collector-album",
        kind: "coffret",
        category: "albums",
        name: "Album — Découvre la magie de Disney",
        art: "art.paninimania.jpg",
        declaredCardCount: null,
        packComposition: "none",
      },
    ]);
    expect(merged.map((s) => s.slug)).toEqual([
      "collector-album",
      "pochette",
      "display",
    ]);
    expect(merged[0]?.art).toBe("art.paninimania.jpg");
    expect(merged[1]?.packComposition).toMatchObject({
      possibleChase: ["Fixeez"],
    });
    expect(merged[2]?.slug).toBe("display");
    expect(merged[2]?.art).toBeFalsy();
  });
});
