import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  LORCANA_MATERIAL_NAMES,
  lorcanaMaterial,
  lorcanaMaterialForPrint,
  secondTopLayerFragment,
} from "./manifest";

const SHADERS_DIR = path.join(
  process.cwd(),
  "public",
  "foil",
  "lorcana",
  "shaders",
);
const TEXTURES_DIR = path.join(
  process.cwd(),
  "public",
  "foil",
  "lorcana",
  "textures",
);

const KNOWN_ROLES = new Set([
  "art",
  "foilMask",
  "varnishMask",
  "secondVarnishMask",
  "normals",
]);

function fragmentUniforms(source: string): Set<string> {
  const names = new Set<string>();
  const pattern =
    /(?:UNITY_UNIFORM|uniform)\s+(?:mediump\s+|highp\s+|lowp\s+)?(?:vec[234]|float|int|sampler2D)\s+(_\w+)\s*;/g;
  for (const match of source.matchAll(pattern)) {
    if (!match[1].startsWith("Xhlslcc_UnusedX")) names.add(match[1]);
  }
  return names;
}

function fragmentSamplers(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/sampler2D\s+(_\w+)\s*;/g)) {
    names.add(match[1]);
  }
  return names;
}

describe("manifest lorcana", () => {
  it("couvre les 13 finitions du vocabulaire de l'app", () => {
    const corpus = LORCANA_MATERIAL_NAMES.join(" ");
    for (const finish of [
      "Silver",
      "Satin",
      "Lore",
      "Lava",
      "Magma",
      "Glitter",
      "VertWave",
      "SeaWave",
      "RainbowPillars",
      "FreeForm1",
      "FreeForm2",
      "Tempest",
      "CalendarWave",
    ]) {
      expect(corpus).toContain(finish);
    }
  });

  it("expose un fragment Time pour chaque matériau (idle natif)", () => {
    for (const name of LORCANA_MATERIAL_NAMES) {
      const material = lorcanaMaterial(name)!;
      expect(material.fragmentTime, name).toBeTruthy();
      expect(
        existsSync(path.join(SHADERS_DIR, material.fragmentTime!)),
        material.fragmentTime,
      ).toBe(true);
      expect(material.fragmentTime).toContain("SCROLLMODE_TIME");
    }
  });

  for (const name of LORCANA_MATERIAL_NAMES) {
    const material = lorcanaMaterial(name)!;

    describe(name, () => {
      const fragmentPath = path.join(SHADERS_DIR, material.fragment);
      const fragmentTimePath = material.fragmentTime
        ? path.join(SHADERS_DIR, material.fragmentTime)
        : null;

      it("nomme un fragment qui existe et parle WebGL2", () => {
        expect(existsSync(fragmentPath)).toBe(true);
        const source = readFileSync(fragmentPath, "utf8");
        expect(source.startsWith("#version 300 es")).toBe(true);
        expect(source).toContain("#define HLSLCC_ENABLE_UNIFORM_BUFFERS 0");
        expect(source).toContain("#define UNITY_SUPPORTS_UNIFORM_LOCATION 0");
        expect(source).toContain("SV_TARGET0");
      });

      it("remplit chaque sampler que ses fragments déclarent", () => {
        const sources = [readFileSync(fragmentPath, "utf8")];
        if (fragmentTimePath) {
          sources.push(readFileSync(fragmentTimePath, "utf8"));
        }
        const unbound = [
          ...new Set(sources.flatMap((source) => [...fragmentSamplers(source)])),
        ].filter((sampler) => !material.textures[sampler]);
        expect(unbound).toEqual([]);
      });

      it("lie des textures présentes sur disque, ou des rôles connus", () => {
        for (const binding of Object.values(material.textures)) {
          if (binding.file) {
            expect(
              existsSync(path.join(TEXTURES_DIR, binding.file)),
              binding.file,
            ).toBe(true);
            expect(binding.wrap).toBeTruthy();
            expect(binding.filter).toBeTruthy();
            expect(typeof binding.mipmaps).toBe("boolean");
          } else {
            expect(KNOWN_ROLES.has(binding.role!), String(binding.role)).toBe(
              true,
            );
          }
        }
      });

      it("ne porte que des valeurs que l'un des fragments déclare", () => {
        const declared = new Set<string>();
        for (const source of [
          readFileSync(fragmentPath, "utf8"),
          ...(fragmentTimePath
            ? [readFileSync(fragmentTimePath, "utf8")]
            : []),
        ]) {
          for (const uniform of fragmentUniforms(source)) declared.add(uniform);
        }
        const orphans = [
          ...Object.keys(material.floats),
          ...Object.keys(material.colors),
        ].filter((uniform) => !declared.has(uniform));
        expect(orphans).toEqual([]);
      });
    });
  }
});

describe("USESECONDTOPLAYER", () => {
  it("bascule MagmaMetallicHotFoil vers le sibling qui sample le 2e masque", () => {
    const upgraded = lorcanaMaterialForPrint("CardMagmaMetallicHotFoil", {
      secondVarnishMaskUrl: "/uploads/second.png",
    });
    expect(upgraded?.fragment).toContain("USESECONDTOPLAYER");
    expect(upgraded?.textures._SecondTopLayerMask).toEqual({
      role: "secondVarnishMask",
    });
    expect(upgraded?.colors._SecondHotFoilColor).toBeDefined();
    expect(
      existsSync(path.join(SHADERS_DIR, upgraded!.fragment)),
    ).toBe(true);
    expect(
      readFileSync(path.join(SHADERS_DIR, upgraded!.fragment), "utf8"),
    ).toContain("sampler2D _SecondTopLayerMask");
  });

  it("ne change rien sans second masque", () => {
    const base = lorcanaMaterial("CardMagmaMetallicHotFoil")!;
    const same = lorcanaMaterialForPrint("CardMagmaMetallicHotFoil", {});
    expect(same?.fragment).toBe(base.fragment);
  });

  it("ne invente pas de sibling pour Silver (pas de variante HotFoil)", () => {
    expect(secondTopLayerFragment("CardFoilSilver.frag")).toBeNull();
    const same = lorcanaMaterialForPrint("CardFoilSilver", {
      secondVarnishMaskUrl: "/uploads/second.png",
    });
    expect(same?.fragment).toBe("CardFoilSilver.frag");
  });
});
