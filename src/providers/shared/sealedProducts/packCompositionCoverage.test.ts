import { describe, expect, it } from "vitest";

import type { SealedProductEntry } from "./indexFormat";
import { packCompositionCoverageForEntries } from "./packCompositionCoverage";
import { profileToSkuPackComposition } from "./boosterComposition";
import composition from "@/providers/lorcana/lorcanajson/curated/booster-composition.json";
import type { BoosterCompositionFile } from "./boosterComposition";

function entry(
  over: Partial<SealedProductEntry> &
    Pick<SealedProductEntry, "slug" | "kind" | "behavior">,
): SealedProductEntry {
  return {
    path: "",
    category: "",
    name: over.slug,
    image: null,
    imageBack: null,
    setLogo: null,
    setCode: "3",
    catalogueSetId: "3",
    lang: "fr",
    releaseDate: null,
    priceCents: null,
    cardsPerPack: 12,
    packsContained: 1,
    guaranteedPrints: [],
    randomPoolScope: "set",
    randomPoolPrints: [],
    declaredCardCount: null,
    setCardCount: null,
    contentsKnown: false,
    containsPrintsIsPreview: false,
    prints: [],
    ...over,
  };
}

describe("packCompositionCoverageForEntries", () => {
  it("counts missing lottery SKUs without packComposition", () => {
    const cov = packCompositionCoverageForEntries([
      entry({
        slug: "booster-inklands",
        kind: "booster",
        behavior: "random_pack",
      }),
      entry({
        slug: "starter",
        kind: "deck",
        behavior: "known_bundle",
      }),
    ]);
    expect(cov.lotterySkuCount).toBe(1);
    expect(cov.missingCompositionCount).toBe(1);
    expect(cov.missingSlugs).toEqual(["booster-inklands"]);
  });

  it("accepts seeded object composition", () => {
    const file = composition as BoosterCompositionFile;
    const packComposition = profileToSkuPackComposition(file.default);
    const cov = packCompositionCoverageForEntries([
      entry({
        slug: "booster-inklands",
        kind: "booster",
        behavior: "random_pack",
        packComposition,
      }),
    ]);
    expect(cov.withCompositionCount).toBe(1);
    expect(cov.missingCompositionCount).toBe(0);
  });

  it("treats pack_container without local composition as covered (child resolve)", () => {
    const cov = packCompositionCoverageForEntries([
      entry({
        slug: "display-24",
        kind: "display",
        behavior: "pack_container",
        packsContained: 24,
        cardsPerPack: null,
      }),
    ]);
    expect(cov.lotterySkuCount).toBe(1);
    expect(cov.missingCompositionCount).toBe(0);
  });
});
