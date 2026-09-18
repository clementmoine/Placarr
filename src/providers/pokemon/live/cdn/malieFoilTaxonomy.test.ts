import { describe, expect, it } from "vitest";

import {
  liveFoilEffectFromMalieExportType,
  liveFoilMaskFromMalieExportMask,
  MALIE_EXPORT_FOIL_TYPES,
  malieExportRainbowIsNotRainbowRare,
} from "./malieFoilTaxonomy";

describe("malieFoilTaxonomy", () => {
  it("maps every documented export foil.type to a Live leaf", () => {
    expect(liveFoilEffectFromMalieExportType("SV_HOLO")).toBe("SvHolo");
    expect(liveFoilEffectFromMalieExportType("SV_ULTRA_SCODIX")).toBe(
      "SvUltraScodix",
    );
    expect(liveFoilEffectFromMalieExportType("FLAT_SILVER")).toBe("FlatSilver");
    expect(liveFoilEffectFromMalieExportType("ACE_FOIL")).toBe("AceFoil");
    for (const type of MALIE_EXPORT_FOIL_TYPES) {
      const live = liveFoilEffectFromMalieExportType(type);
      expect(live, type).toBeTruthy();
      expect(live, type).not.toContain("_");
    }
  });

  it("keeps Live-shaped names from databases / longForm", () => {
    expect(liveFoilEffectFromMalieExportType("SvHolo")).toBe("SvHolo");
    expect(liveFoilEffectFromMalieExportType("Rainbow")).toBe("Rainbow");
  });

  it("maps export foil.mask to Live mask tokens", () => {
    expect(liveFoilMaskFromMalieExportMask("HOLO")).toBe("Holo");
    expect(liveFoilMaskFromMalieExportMask("REVERSE")).toBe("Reverse");
    expect(liveFoilMaskFromMalieExportMask("ETCHED")).toBe("Etched");
    expect(liveFoilMaskFromMalieExportMask("CastAndCure")).toBe("CastAndCure");
  });

  it("encodes the RAINBOW ≠ Rainbow Rare product lesson", () => {
    expect(malieExportRainbowIsNotRainbowRare()).toBe(true);
    expect(liveFoilEffectFromMalieExportType("RAINBOW")).toBe("Rainbow");
  });
});
