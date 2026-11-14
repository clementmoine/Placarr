import { describe, expect, it } from "vitest";

// Installs the SQLite `card_foil` lookups; without it the pack sees stubs.
import "./cardFoilIndex";

import { POKEMON_FOIL_NAMES } from "./foilNames";
import { listPokemonMaterialNames } from "./materials";
import {
  listDumpedBundlesForShader,
  listPlayroomArtsForMaterial,
  pickDumpedBundleForShader,
  playroomArtForMaterial,
  playroomSeedFoilNames,
  playroomSeedHighPng,
  PLAYROOM_FACES_PER_MATERIAL,
} from "./playroomArt";

describe("playroomArtForMaterial", () => {
  it("covers every foiled leaf with a face URL (NonFoil stays data-only)", () => {
    expect(playroomSeedFoilNames()).not.toContain("NonFoil");
    expect(playroomSeedFoilNames()).toEqual(
      POKEMON_FOIL_NAMES.filter((n) => n !== "NonFoil"),
    );

    for (const name of playroomSeedFoilNames()) {
      const art = playroomArtForMaterial(name);
      expect(art?.imageUrl).toMatch(
        /^(https:\/\/assets\.tcgdex\.net\/.+|\/assets\/pokemon\/cards\/.+)\.(png|webp)$/,
      );
      expect(art?.label).toBeTruthy();
    }
  });

  it("still resolves NonFoil art when asked by name", () => {
    const art = playroomArtForMaterial("NonFoil");
    expect(art?.imageUrl).toMatch(
      /^(https:\/\/assets\.tcgdex\.net\/.+|\/assets\/pokemon\/cards\/.+)\.(png|webp)$/,
    );
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
      expect(art?.imageUrl).toContain(`/cards/`);
      expect(art?.label).toMatch(label);
      expect(art?.label).not.toMatch(/bw10_fr_|xy12_fr_|bwalt_fr_/);
    }
  });

  it("prefers owned Rainbow dump over unowned FOIL_SEED", () => {
    const dumped = pickDumpedBundleForShader("Rainbow");
    expect(dumped?.bundleId).toBe("bw1_fr_095");
    const art = playroomArtForMaterial("Rainbow");
    expect(art?.imageUrl).toBe("/assets/pokemon/cards/fr/bw1/095/art.webp");
    expect(art?.maskUrl).toBe("/assets/pokemon/cards/fr/bw1/095/mask-ph.webp");
  });

  it("SunPillar → Charkos-ex (me5_fr_045) owned Live face preferred", () => {
    const dumped = pickDumpedBundleForShader("SunPillar");
    expect(dumped?.bundleId).toBe("me5_fr_045");
    const art = playroomArtForMaterial("SunPillar");
    // ME05 faces are harvested — prefer local pack art over TCGdex seed.
    expect(art?.imageUrl).toBe("/assets/pokemon/cards/fr/me5/045/art.webp");
    expect(art?.maskUrl).toMatch(/\/assets\/pokemon\/cards\/fr\/me5\/045\/mask/);
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
    expect(art?.imageUrl).toBe("/assets/pokemon/cards/fr/sm1/009/art.webp");
    expect(art?.maskUrl).toBe("/assets/pokemon/cards/fr/sm1/009/mask-ph.webp");
    expect(art?.label).toMatch(/sm1_fr_009 · Soleil & Lune n°9/);
    expect(art?.bundleId).toBe("sm1_fr_009");
    expect(art?.liveOwned).toBe(true);
  });

  it("SunLava → owned Lugulabre (sm2) first; dumps ship mask, no etch", () => {
    // std = SunLava, ph = SunBeam — pickFromLookup must keep the lava print.
    const dumped = pickDumpedBundleForShader("SunLava");
    expect(dumped?.bundleId).toBe("sm2_fr_013");
    expect(dumped?.variant).toBe("std");
    expect(dumped?.etchTex).toBeFalsy();
    const arts = listPlayroomArtsForMaterial("SunLava", 4);
    expect(arts[0]?.liveOwned).toBe(true);
    expect(arts[0]?.bundleId).toBe("sm2_fr_013");
    expect(arts[0]?.imageUrl).toBe(
      "/assets/pokemon/cards/fr/sm2/013/art.webp",
    );
    expect(arts[0]?.maskUrl).toBe(
      "/assets/pokemon/cards/fr/sm2/013/mask.webp",
    );
    // Empty etch TexEnv → white varnishMask fallback in the renderer.
    expect(arts[0]?.varnishMaskUrl ?? null).toBeNull();
    expect(arts.length).toBeGreaterThanOrEqual(2);
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

  it("CDN seed paths match TCGdex ids (padded me01 / swsh10.5, ecard1, mep)", () => {
    expect(playroomSeedHighPng("RadiantHolo")).toBe(
      "https://assets.tcgdex.net/fr/swsh/swsh10.5/011/high.png",
    );
    expect(playroomSeedHighPng("SwSecret")).toBe(
      "https://assets.tcgdex.net/fr/swsh/swsh10.5/079/high.png",
    );
    expect(playroomSeedHighPng("SwHolo")).toBe(
      "https://assets.tcgdex.net/fr/swsh/swsh10.5/003/high.png",
    );
    expect(playroomSeedHighPng("SvUltraGoldRainbow")).toBe(
      "https://assets.tcgdex.net/fr/me/me01/187/high.png",
    );
    expect(playroomSeedHighPng("SvHolo")).toBe(
      "https://assets.tcgdex.net/fr/me/me01/010/high.png",
    );
    expect(playroomSeedHighPng("SvUltra")).toBe(
      "https://assets.tcgdex.net/fr/me/me01/003/high.png",
    );
    expect(playroomSeedHighPng("FlatSilver")).toBe(
      "https://assets.tcgdex.net/fr/ecard/ecard1/36/high.png",
    );
    expect(playroomSeedHighPng("Stamped")).toBe(
      "https://assets.tcgdex.net/fr/me/mep/028/high.png",
    );
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

  it("sheet aliases reuse parent-frag Live dumps (Rainbow02 → Rainbow)", () => {
    const arts = listPlayroomArtsForMaterial("Rainbow02", 2);
    expect(arts.length).toBeGreaterThan(0);
    expect(arts[0]?.bundleId).toBeTruthy();
    expect(arts[0]?.imageUrl).toMatch(/\/assets\/pokemon\/cards\//);
    // Reverse Rainbow dumps usually have wp mask, rarely etch.
    expect(arts[0]?.maskUrl || arts[0]?.varnishMaskUrl).toBeTruthy();
  });

  it("FlatSilver stack never pastes FOIL_SEED art onto another dump caption", () => {
    const arts = listPlayroomArtsForMaterial("FlatSilver", 4);
    const seed = playroomSeedHighPng("FlatSilver");
    expect(arts.length).toBeGreaterThan(1);
    for (const art of arts) {
      expect(art.imageUrl).toBeTruthy();
      if (art.bundleId && art.bundleId !== "ec_fr_036") {
        expect(art.imageUrl, art.label ?? art.bundleId).not.toBe(seed);
        expect(art.imageUrl).not.toContain("/ecard/ecard1/36/");
      }
    }
  });

  it("no playroom face binds art.webp as the foil whiteplate", () => {
    /*
      Promo `*_foil_*` mask stems need role `"mask"` or they resolve to the
      card's own art — full-card Stamped/Rainbow bars. Lock every leaf, not
      only Stamped: bwbsp Rainbow Amplify uses the same naming.
    */
    let faces = 0;
    let foilNamed = 0;
    for (const name of listPokemonMaterialNames()) {
      const arts = listPlayroomArtsForMaterial(
        name,
        PLAYROOM_FACES_PER_MATERIAL,
      );
      for (const art of arts) {
        if (!art.maskUrl) continue;
        faces += 1;
        expect(art.maskUrl, `${name} ${art.bundleId}`).not.toMatch(
          /\/art\.webp$/i,
        );
        expect(art.maskUrl, `${name} ${art.bundleId}`).toMatch(
          /\/mask(-ph|-mph|-sph)?\.webp$/i,
        );
        if (/_foil_/i.test(art.bundleId ?? "") || /bsp_/i.test(art.bundleId ?? "")) {
          foilNamed += 1;
        }
      }
    }
    expect(faces).toBeGreaterThan(10);
    expect(foilNamed).toBeGreaterThan(0);
  });

  it("listDumpedBundlesForShader prefers the seed then FR", () => {
    const list = listDumpedBundlesForShader("RadiantHolo", 4);
    expect(list[0]?.bundleId).toBe("swsh10-5_fr_011");
    expect(list.every((p) => /_fr_/i.test(p.bundleId))).toBe(true);
  });
});
