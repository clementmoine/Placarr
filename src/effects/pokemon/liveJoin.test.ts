import { describe, expect, it } from "vitest";

import {
  faceQuarterTurnsForPokemonPrint,
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

  it("strips GG/TG/CC prefixes onto Live 1…N gallery folders", () => {
    expect(remapCollectorNumberForLive("swsh12.5gg", "gg01")).toBe("1");
    expect(remapCollectorNumberForLive("swsh12.5gg", "GG70")).toBe("70");
    expect(remapCollectorNumberForLive("swsh9tg", "TG01")).toBe("1");
    expect(remapCollectorNumberForLive("cel25cc", "cc001")).toBe("1");
    expect(remapCollectorNumberForLive("cel25cc", "CC025")).toBe("25");
  });

  it("strips swsh prefix on Black Star SWSH promos", () => {
    expect(remapCollectorNumberForLive("swshp", "swsh251")).toBe("251");
    expect(remapCollectorNumberForLive("swshp", "SWSH307")).toBe("307");
  });

  it("strips sm prefix on Black Star SM promos", () => {
    expect(remapCollectorNumberForLive("smp", "SM01")).toBe("1");
    expect(remapCollectorNumberForLive("smp", "sm205")).toBe("205");
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
