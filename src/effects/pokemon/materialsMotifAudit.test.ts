/**
 * Guard: SHARED_MOTIF_OVERRIDES must not silently wash dump spectrum plates.
 * CrackedIce / SolidColor once overrode Bands_Vertical with DesaturateOneSide.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { packMaterialSheetsPath } from "@/lib/packPaths";

import {
  paperMaterial,
  sharedMotifStems,
} from "./materials";

const SHARED_MOTIFS_PATH = path.join(
  path.dirname(packMaterialSheetsPath("pokemon")),
  "shared-motifs.json",
);

function loadDumpMotifs(): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(SHARED_MOTIFS_PATH, "utf8")) as Record<
    string,
    Record<string, string>
  >;
}

/** Spectrum-ish slots — an override that disagrees with dump is almost always wrong. */
const SPECTRUM_SLOTS = [
  "_SpectrumTexture",
  "_SpectrumTex",
  "_Spectrum_Tex",
  "_Spectrum",
  "_SpectrumBright",
  "_HolofoilSpectrumTexture",
  "_speccyspect",
];

describe("Pokémon foil motif audit", () => {
  it("override never replaces a dump spectrum plate with a different stem", () => {
    const dump = loadDumpMotifs();
    const conflicts: string[] = [];
    for (const [leaf, dumpSlots] of Object.entries(dump)) {
      const merged = sharedMotifStems(leaf);
      for (const slot of SPECTRUM_SLOTS) {
        const dumped = dumpSlots[slot];
        const live = merged[slot];
        if (dumped && live && dumped !== live) {
          conflicts.push(`${leaf}.${slot}: dump=${dumped} live=${live}`);
        }
      }
    }
    expect(conflicts).toEqual([]);
  });

  it("dump spectrum leaves stay vivid (no DesaturateOneSide wash)", () => {
    for (const leaf of ["CrackedIce", "SolidColor", "Celebrations", "Rainbow"]) {
      const m = paperMaterial(leaf);
      expect(m, leaf).toBeTruthy();
      const files = Object.values(m!.textures)
        .map((t) => (typeof t === "string" ? t : t?.file))
        .filter(Boolean)
        .join(" ");
      expect(files, leaf).not.toMatch(/DesaturateOneSide/);
      expect(files, leaf).not.toMatch(/FX_T_Spectrum_Celebration/);
    }
  });

  it("AceFoil binds dump shine + spectrum slots the frag samples", () => {
    const m = paperMaterial("AceFoil")!;
    expect(m.textures._CrossTexture?.file).toContain(
      "T_Holofoil_Mask_RadiantHolo_RG_X_Grad_5",
    );
    expect(m.textures._Foil_Shine_Thin?.file).toContain(
      "T_Holofoil_Mask_Bar_Wide_Single",
    );
    expect(m.textures._Foil_Fake_Shine_Tex?.file).toContain(
      "T_Holofoil_Shine_Wide",
    );
    expect(m.textures._SpectrumTexture?.file).toContain(
      "FX_T_Spectrum_Squares_Hue",
    );
    // Dead override slots must stay unbound.
    expect(m.textures._FoilShineTexture).toBeUndefined();
    expect(m.textures._speccyspect).toBeUndefined();
  });
});
