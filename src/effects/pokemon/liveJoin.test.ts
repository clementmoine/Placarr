import { describe, expect, it } from "vitest";

import {
  faceQuarterTurnsForPokemonPrint,
  isOwnedPlayroomBundle,
  ownedBundlesForShader,
  remapCollectorNumberForLive,
  reprintMetaForTcgdexSet,
  SM115_SHINY_VAULT_LIVE_OFFSET,
} from "./liveJoin";

describe("faceQuarterTurnsForPokemonPrint", () => {
  it.each([
    [{ rarityCode: "BreakRare" }, 1],
    [{ stage: "BREAK" }, 1],
    [{ stage: "TURBO" }, 1],
    [{ stage: "turbo" }, 1],
    [{ stage: "Stage 2" }, 0],
    [{ rarityCode: "RareHolo" }, 0],
    [{}, 0],
  ] as const)("%j → %s", (signals, expected) => {
    expect(faceQuarterTurnsForPokemonPrint(signals)).toBe(expected);
  });
});

describe("remapCollectorNumberForLive", () => {
  it.each([
    ["sma", "SV1", "70"],
    ["sma", "sv2", "71"],
    ["sma", "SV10", "79"],
    ["sma", "SV49", "118"],
    ["sma", "SV94", "163"],
  ] as const)("%s %s → Live %s", (set, num, expected) => {
    expect(remapCollectorNumberForLive(set, num)).toBe(expected);
    expect(Number(expected)).toBe(
      SM115_SHINY_VAULT_LIVE_OFFSET +
        Number.parseInt(num.replace(/\D/g, ""), 10),
    );
  });

  it("remaps Shining Fates Shiny Vault via generated reprint meta", () => {
    const meta = reprintMetaForTcgdexSet("swsh4.5sv");
    expect(meta?.svOffset).toBe(73);
    expect(remapCollectorNumberForLive("swsh4.5sv", "SV001")).toBe("74");
    expect(remapCollectorNumberForLive("swsh4.5sv", "sv122")).toBe("195");
  });

  it("leaves non-SV sma numbers untouched", () => {
    expect(remapCollectorNumberForLive("sma", "1")).toBe("1");
  });

  it("leaves other sets untouched", () => {
    expect(remapCollectorNumberForLive("sm115", "1")).toBe("1");
    expect(remapCollectorNumberForLive("g1", "RC1")).toBe("RC1");
  });

  it("remaps 30ᵉ Classic Collection TCGdex order onto Live me5-5c", () => {
    // TCGdex #001 Charizard / Dracaufeu → Live #2 (not Pikachu #1)
    expect(remapCollectorNumberForLive("me05.5c", "001")).toBe("2");
    expect(remapCollectorNumberForLive("me05.5c", "1")).toBe("2");
    expect(remapCollectorNumberForLive("30th-c", "014")).toBe("1"); // Pikachu
    expect(remapCollectorNumberForLive("me05.5c", "002")).toBe("8"); // Delcatty
    expect(remapCollectorNumberForLive("me05.5c", "003")).toBe("11"); // Metagross
  });
});

describe("liveOwnedBundles", () => {
  it("lists carddex-synced owned faces from liveOwned.json", () => {
    expect(ownedBundlesForShader("SunPillar")).toContain("me5_fr_045");
    expect(ownedBundlesForShader("SunPillar").length).toBeGreaterThan(1);
    expect(ownedBundlesForShader("FlatSilver").length).toBeGreaterThan(0);
    expect(ownedBundlesForShader("Thatch")).toContain("bwalt_fr_008");
    expect(ownedBundlesForShader("Galaxy")).toContain("xy12_fr_011");
    expect(ownedBundlesForShader("Cosmos")).toContain("smalt_fr_013");
    expect(ownedBundlesForShader("AngledPillars")[0]).toBe("smalt_fr_001");
  });

  it("isOwnedPlayroomBundle scopes to shader when given", () => {
    expect(isOwnedPlayroomBundle("me5_fr_045", "SunPillar")).toBe(true);
    expect(isOwnedPlayroomBundle("me5_fr_045", "Galaxy")).toBe(false);
    expect(isOwnedPlayroomBundle("me5_fr_045")).toBe(true);
  });
});
