import { describe, expect, it } from "vitest";

import composition from "@/providers/lorcanajson/curated/booster-composition.json";
import narutoComposition from "@/providers/narutocarddass/curated/booster-composition.json";
import dbscgComposition from "@/providers/dbscg/curated/booster-composition.json";
import dbsfwComposition from "@/providers/dbsfw/curated/booster-composition.json";
import pokemonComposition from "@/providers/tcgdex/curated/booster-composition.json";

import {
  normalizeRarityKey,
  packsPerHitForSpecificPrint,
  rarityHitFor,
  resolveBoosterComposition,
  specificPacksPerHitByPrint,
  type BoosterCompositionFile,
} from "./boosterComposition";

const file = composition as BoosterCompositionFile;

describe("normalizeRarityKey", () => {
  it("collapses Super_rare / Super Rare", () => {
    expect(normalizeRarityKey("Super_rare")).toBe("super rare");
    expect(normalizeRarityKey("Super Rare")).toBe("super rare");
  });
});

describe("Lorcana booster composition seed", () => {
  it("attests Enchanted ≈ 1/96 packs ≈ 1/4 displays", () => {
    const profile = resolveBoosterComposition(file, "1");
    const hit = rarityHitFor(profile, "Enchanted");
    expect(hit?.packsPerHit).toBe(96);
    expect(hit?.displaysPerHit).toBe(4);
    expect(hit?.confidence).toBe("community");
  });

  it("matches localized catalogue rarities (FR Enchantée, DE Verzaubert)", () => {
    const profile = resolveBoosterComposition(file, "1");
    expect(rarityHitFor(profile, "Enchantée")?.packsPerHit).toBe(96);
    expect(rarityHitFor(profile, "Verzaubert")?.packsPerHit).toBe(96);
    expect(rarityHitFor(profile, "Légendaire")?.packsPerHit).toBe(5);
    expect(rarityHitFor(profile, "Très Rare")?.packsPerHit).toBe(2);
  });

  it("scales a specific Enchanted by the chase pool size", () => {
    expect(
      packsPerHitForSpecificPrint({
        packsPerHitAnyOfRarity: 96,
        printsOfSameRarityInPool: 12,
      }),
    ).toBe(1152);
  });

  it("builds per-print rates from a FR set pool", () => {
    const profile = resolveBoosterComposition(file, "1");
    const pool = [
      ...Array.from({ length: 12 }, (_, i) => ({
        printKey: `lorcana:1-20${i}`,
        rarity: "Enchantée",
      })),
      { printKey: "lorcana:1-21", rarity: "Commune" },
    ];
    const rates = specificPacksPerHitByPrint({ profile, pool });
    expect(rates.get("lorcana:1-205")).toBe(1152);
    expect(rates.has("lorcana:1-21")).toBe(false);
  });
});

describe("other TCG booster composition seeds", () => {
  it("Naruto: 1 holo per FR booster", () => {
    const profile = resolveBoosterComposition(
      narutoComposition as BoosterCompositionFile,
    );
    expect(profile.cardsPerPack).toBe(8);
    expect(rarityHitFor(profile, "holo")?.packsPerHit).toBe(1);
    expect(rarityHitFor(profile, "SR")?.packsPerHit).toBe(1);
  });

  it("DBS Masters: SCR ~144 packs, GDR ~864", () => {
    const profile = resolveBoosterComposition(
      dbscgComposition as BoosterCompositionFile,
    );
    expect(profile.packsPerDisplay).toBe(24);
    expect(profile.displaysPerCase).toBe(12);
    expect(rarityHitFor(profile, "Secret Rare[SCR]")?.packsPerHit).toBe(144);
    expect(rarityHitFor(profile, "SCR")?.packsPerHit).toBe(144);
    expect(rarityHitFor(profile, "God Rare[GDR]")?.packsPerHit).toBe(864);
  });

  it("DBS Fusion World: letter rarities SCR/SR", () => {
    const profile = resolveBoosterComposition(
      dbsfwComposition as BoosterCompositionFile,
    );
    expect(rarityHitFor(profile, "SCR")?.packsPerHit).toBe(144);
    expect(rarityHitFor(profile, "SR")?.packsPerHit).toBe(5);
  });

  it("Pokémon SV+: SIR ~60, IR ~11, Hyper ~100", () => {
    const profile = resolveBoosterComposition(
      pokemonComposition as BoosterCompositionFile,
    );
    expect(profile.packsPerDisplay).toBe(36);
    expect(
      rarityHitFor(profile, "Special illustration rare")?.packsPerHit,
    ).toBe(60);
    expect(
      rarityHitFor(profile, "Illustration spéciale rare")?.packsPerHit,
    ).toBe(60);
    expect(rarityHitFor(profile, "IllustrationRare")?.packsPerHit).toBe(11);
    expect(rarityHitFor(profile, "Hyper rare")?.packsPerHit).toBe(100);
  });
});
