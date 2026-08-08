import { describe, expect, it } from "vitest";

import { POKEMON_FOIL_NAMES } from "./foilNames";
import {
  listDumpedBundlesForShader,
  listPlayroomArtsForMaterial,
  pickDumpedBundleForShader,
  playroomArtForMaterial,
  playroomSeedFoilNames,
  PLAYROOM_FACES_PER_MATERIAL,
} from "./playroomArt";

describe("playroomArtForMaterial", () => {
  it("covers every dumped foil leaf with a face URL", () => {
    expect(playroomSeedFoilNames()).toEqual([...POKEMON_FOIL_NAMES]);

    for (const name of POKEMON_FOIL_NAMES) {
      const art = playroomArtForMaterial(name);
      expect(art?.imageUrl).toMatch(
        /^(https:\/\/assets\.tcgdex\.net\/.+|\/foil\/pokemon\/textures\/.+)\.(png|webp)$/,
      );
      expect(art?.label).toBeTruthy();
    }
  });

  it("caption names the dumped face (never a mismatched seed fantasy)", () => {
    const cases = [
      {
        name: "Cosmos",
        // Owned carddex face (smalt_fr_013) beats unowned FOIL_SEED bwalt_fr_038.
        bundleId: "smalt_fr_013",
        label: /smalt_fr_013 · Soleil & Lune \(alt\) n°13/,
      },
      {
        name: "Galaxy",
        bundleId: "xy12_fr_011",
        label: /Dracaufeu · XY · Évolutions n°11/,
      },
      {
        name: "Rainbow",
        // Owned carddex face (bw1_fr_095) beats unowned FOIL_SEED bw10_fr_001.
        bundleId: "bw1_fr_095",
        label: /bw1_fr_095 · Noir & Blanc n°95/,
      },
      {
        name: "RadiantHolo",
        bundleId: "swsh10-5_fr_011",
        label: /Dracaufeu Radieux · Épée & Bouclier · Pokémon GO n°11/,
      },
      {
        name: "Squares",
        bundleId: "xy10_fr_014",
        label: /Goupelin TURBO · XY · Rupture TURBO n°14/,
      },
    ] as const;

    for (const { name, bundleId, label } of cases) {
      const dumped = pickDumpedBundleForShader(name);
      expect(dumped?.bundleId).toBe(bundleId);
      const art = playroomArtForMaterial(name);
      expect(art?.imageUrl).toContain(`/textures/${bundleId}/`);
      expect(art?.label).toMatch(label);
      expect(art?.label).not.toMatch(/bw10_fr_|xy12_fr_|bwalt_fr_/);
    }
  });

  it("prefers owned Rainbow dump over unowned FOIL_SEED", () => {
    const dumped = pickDumpedBundleForShader("Rainbow");
    expect(dumped?.bundleId).toBe("bw1_fr_095");
    const art = playroomArtForMaterial("Rainbow");
    expect(art?.imageUrl).toBe(
      "/foil/pokemon/textures/bw1_fr_095/bw1_fr_095.webp",
    );
    expect(art?.maskUrl).toBe(
      "/foil/pokemon/textures/bw1_fr_095/bw1_wp_ph_fr_095.webp",
    );
  });

  it("SunPillar → Charkos-ex (me5_fr_045) owned Live face preferred", () => {
    const dumped = pickDumpedBundleForShader("SunPillar");
    expect(dumped?.bundleId).toBe("me5_fr_045");
    const art = playroomArtForMaterial("SunPillar");
    expect(art?.imageUrl).toBe(
      "/foil/pokemon/textures/me5_fr_045/me5_fr_045.webp",
    );
    expect(art?.maskUrl).toBe(
      "/foil/pokemon/textures/me5_fr_045/me5_wp_fr_045.webp",
    );
    expect(art?.label).toMatch(/Charkos-ex/);
    expect(art?.label).toMatch(/Nuit Noire/);
    expect(art?.foilMask).toBe("CastAndCure");
    expect(art?.bundleId).toBe("me5_fr_045");
    // Listed in liveOwned.json — playroom must keep this ahead of other dumps.
    expect(listDumpedBundlesForShader("SunPillar", 1)[0]?.bundleId).toBe(
      "me5_fr_045",
    );
  });

  it("SunBeam → owned Brindibou reverse (sm1_fr_009)", () => {
    const dumped = pickDumpedBundleForShader("SunBeam");
    expect(dumped?.bundleId).toBe("sm1_fr_009");
    expect(dumped?.variant).toBe("ph");
    const art = playroomArtForMaterial("SunBeam");
    expect(art?.imageUrl).toBe(
      "/foil/pokemon/textures/sm1_fr_009/sm1_fr_009.webp",
    );
    expect(art?.maskUrl).toBe(
      "/foil/pokemon/textures/sm1_fr_009/sm1_wp_ph_fr_009.webp",
    );
    expect(art?.label).toMatch(/sm1_fr_009 · Soleil & Lune n°9/);
    expect(art?.bundleId).toBe("sm1_fr_009");
    expect(art?.liveOwned).toBe(true);
  });

  it("Squares BREAK seed → faceQuarterTurns 1", () => {
    const dumped = pickDumpedBundleForShader("Squares");
    expect(dumped?.bundleId).toBe("xy10_fr_014");
    const art = playroomArtForMaterial("Squares");
    expect(art?.faceQuarterTurns).toBe(1);
    expect(art?.label).toMatch(/Goupelin TURBO · XY · Rupture TURBO n°14/);
  });

  it("flags liveOwned on carddex faces; prefers Pokémon over energy", () => {
    expect(playroomArtForMaterial("Galaxy")?.liveOwned).toBe(true);
    expect(playroomArtForMaterial("RadiantHolo")?.liveOwned).toBe(false);
    expect(pickDumpedBundleForShader("AngledPillars")?.bundleId).toBe(
      "smalt_fr_001",
    );
    expect(playroomArtForMaterial("AngledPillars")?.liveOwned).toBe(true);
  });
});

describe("listPlayroomArtsForMaterial", () => {
  it("stacks several faces across sets for Ultra Gold Rainbow", () => {
    const arts = listPlayroomArtsForMaterial(
      "SvUltraGoldRainbow",
      PLAYROOM_FACES_PER_MATERIAL,
    );
    expect(arts.length).toBeGreaterThan(1);
    expect(arts.length).toBeLessThanOrEqual(PLAYROOM_FACES_PER_MATERIAL);
    expect(arts[0]?.bundleId).toBe("me1_fr_187");
    const bundles = arts.map((a) => a.bundleId);
    expect(new Set(bundles).size).toBe(bundles.length);
    // One face per set stem — not four me1 cards.
    const sets = bundles.map((id) => id?.replace(/_[a-z]{2}_\d+$/i, "") ?? "");
    expect(new Set(sets).size).toBe(sets.length);
  });

  it("matches playroomArtForMaterial on the first face", () => {
    const one = playroomArtForMaterial("RadiantHolo");
    const many = listPlayroomArtsForMaterial("RadiantHolo", 3);
    expect(many[0]?.bundleId).toBe(one?.bundleId);
    expect(many[0]?.imageUrl).toBe(one?.imageUrl);
    expect(many.length).toBeGreaterThan(1);
  });

  it("listDumpedBundlesForShader prefers the seed then FR", () => {
    const list = listDumpedBundlesForShader("RadiantHolo", 4);
    expect(list[0]?.bundleId).toBe("swsh10-5_fr_011");
    expect(list.every((p) => /_fr_/i.test(p.bundleId))).toBe(true);
  });
});
