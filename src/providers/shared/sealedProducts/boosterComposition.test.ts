import { describe, expect, it } from "vitest";

import composition from "@/providers/lorcana/lorcanajson/curated/booster-composition.json";
import narutoComposition from "@/providers/naruto/narutocarddass/curated/booster-composition.json";
import dbscgComposition from "@/providers/dragonball/dbscg/curated/booster-composition.json";
import dbsfwComposition from "@/providers/dragonball/dbsfw/curated/booster-composition.json";
import pokemonComposition from "@/providers/pokemon/tcgdex/curated/booster-composition.json";

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

  it("builds per-print rates from a FR set pool (incl. communes structurales)", () => {
    const profile = resolveBoosterComposition(file, "1");
    const pool = [
      ...Array.from({ length: 12 }, (_, i) => ({
        printKey: `lorcana:1-20${i}`,
        rarity: "Enchantée",
      })),
      ...Array.from({ length: 90 }, (_, i) => ({
        printKey: `lorcana:1-c${i}`,
        rarity: "Commune",
      })),
    ];
    const rates = specificPacksPerHitByPrint({ profile, pool });
    expect(rates.get("lorcana:1-205")).toBe(1152);
    /* 1/6 × 90 communes = 15 sachets pour une commune précise */
    expect(rates.get("lorcana:1-c0")).toBeCloseTo(15, 5);
  });
});

describe("dedicated slot listing several spellings of one rarity", () => {
  /*
    Régression : un slot `dedicated` avec `["commune","common","C"]` était
    rejeté comme multi-rareté → aucune commune Naruto / Pokémon n'avait de
    taux (156 cartes S1 sans « 1 sur N »). Les graphies sont des alias.
  */
  it("Naruto: les communes FR tirent du slot non_holo (7 / 8 cartes)", () => {
    const profile = resolveBoosterComposition(
      narutoComposition as BoosterCompositionFile,
    );
    const pool = [
      ...Array.from({ length: 156 }, (_, i) => ({
        printKey: `nc:s1-${i}`,
        rarity: "commune",
      })),
      ...Array.from({ length: 28 }, (_, i) => ({
        printKey: `nc:s1-h${i}`,
        rarity: "holo",
      })),
    ];
    const rates = specificPacksPerHitByPrint({ profile, pool });
    /* 7 tirages communs / sachet, 156 communes → 156 / 7 ≈ 22,3 sachets */
    expect(rates.get("nc:s1-0")).toBeCloseTo(156 / 7, 5);
    expect(rates.get("nc:s1-h0")).toBe(28);
    expect(rates.size).toBe(184);
  });

  it("Pokémon: Common et Commune comptent dans le même pool", () => {
    const profile = resolveBoosterComposition(
      pokemonComposition as BoosterCompositionFile,
    );
    const pool = [
      ...Array.from({ length: 40 }, (_, i) => ({
        printKey: `pk:c${i}`,
        rarity: "Common",
      })),
      ...Array.from({ length: 40 }, (_, i) => ({
        printKey: `pk:cf${i}`,
        rarity: "Commune",
      })),
    ];
    const rates = specificPacksPerHitByPrint({ profile, pool });
    expect(rates.get("pk:c0")).toBeDefined();
    expect(rates.get("pk:c0")).toBe(rates.get("pk:cf0"));
    /* N_r = 80, pas 40 : les deux graphies forment un seul pool. */
    const commonSlot = profile.slots!.find((s) => s.id === "common")!;
    expect(rates.get("pk:c0")).toBeCloseTo(80 / commonSlot.count, 5);
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
