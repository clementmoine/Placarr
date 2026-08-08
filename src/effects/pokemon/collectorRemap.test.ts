import { describe, expect, it } from "vitest";

import {
  remapCollectorNumberForLive,
  SM115_SHINY_VAULT_LIVE_OFFSET,
} from "./collectorRemap";
import { reprintMetaForTcgdexSet } from "./reprintMeta";

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
      SM115_SHINY_VAULT_LIVE_OFFSET + Number.parseInt(num.replace(/\D/g, ""), 10),
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
});
