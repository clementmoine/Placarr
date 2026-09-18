import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  LORCANA_MATERIAL_NAMES,
  lorcanaMaterial,
  lorcanaMaterialForPrint,
  hotFoilStampUniforms,
  secondTopLayerFragment,
} from "./manifest";

const SHADERS_DIR = path.join(
  process.cwd(),
  "data",
  "lorcana",
  "foil",
  "shaders",
);
const TEXTURES_DIR = path.join(
  process.cwd(),
  "data",
  "lorcana",
  "foil",
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
  const hasDump = LORCANA_MATERIAL_NAMES.length > 0;

  it.skipIf(!hasDump)("couvre les 13 finitions du vocabulaire de l'app", () => {
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

  it.skipIf(!hasDump)(
    "expose un fragment Time pour chaque matériau (idle natif)",
    () => {
      for (const name of LORCANA_MATERIAL_NAMES) {
        const material = lorcanaMaterial(name)!;
        expect(material.fragmentTime, name).toBeTruthy();
        expect(
          existsSync(path.join(SHADERS_DIR, material.fragmentTime!)),
          material.fragmentTime,
        ).toBe(true);
        expect(material.fragmentTime).toContain("SCROLLMODE_TIME");
      }
    },
  );

  for (const name of LORCANA_MATERIAL_NAMES) {
    const material = lorcanaMaterial(name)!;

    describe.skipIf(!hasDump)(name, () => {
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
          ...new Set(
            sources.flatMap((source) => [...fragmentSamplers(source)]),
          ),
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
        // « ses fragments » inclut le sibling USESECONDTOPLAYER : c'est vers lui
        // que `lorcanaMaterialForPrint` bascule dès qu'une carte a un second
        // vernis, et `_SecondHotFoilColor` est la couleur que le matériau Unity
        // porte pour lui — pas une valeur orpheline.
        const sibling = secondTopLayerFragment(material.fragment);
        const declared = new Set<string>();
        for (const source of [
          readFileSync(fragmentPath, "utf8"),
          ...(fragmentTimePath ? [readFileSync(fragmentTimePath, "utf8")] : []),
          ...(sibling && existsSync(path.join(SHADERS_DIR, sibling))
            ? [readFileSync(path.join(SHADERS_DIR, sibling), "utf8")]
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
  const hasDump = LORCANA_MATERIAL_NAMES.length > 0;

  it.skipIf(!hasDump)(
    "bascule MagmaMetallicHotFoil vers le sibling qui sample le 2e masque",
    () => {
      const upgraded = lorcanaMaterialForPrint("CardMagmaMetallicHotFoil", {
        secondVarnishMaskUrl: "/uploads/second.png",
      });
      expect(upgraded?.fragment).toContain("USESECONDTOPLAYER");
      expect(upgraded?.textures._SecondTopLayerMask).toEqual({
        role: "secondVarnishMask",
      });
      expect(upgraded?.colors._SecondHotFoilColor).toBeDefined();
      expect(existsSync(path.join(SHADERS_DIR, upgraded!.fragment))).toBe(true);
      expect(
        readFileSync(path.join(SHADERS_DIR, upgraded!.fragment), "utf8"),
      ).toContain("sampler2D _SecondTopLayerMask");
    },
  );

  it.skipIf(!hasDump)(
    "lie le DistortionTex du 2e CalculateVarnishLayers (sinon sampler noir)",
    () => {
      for (const name of [
        "CardMagmaSnowHotFoil",
        "CardMagmaMetallicHotFoil",
        "CardMagmaChromeRainbowHotFoilMaterial",
        "CardLoreMetallicHotFoil",
        "CardSeaWaveMatteHotFoil",
      ]) {
        const upgraded = lorcanaMaterialForPrint(name, {
          secondVarnishMaskUrl: "/uploads/second.png",
        });
        expect(upgraded, name).toBeTruthy();
        if (!upgraded?.fragment.includes("USESECONDTOPLAYER")) continue;
        const source = readFileSync(
          path.join(SHADERS_DIR, upgraded.fragment),
          "utf8",
        );
        const unbound = [...fragmentSamplers(source)].filter(
          (sampler) => !upgraded.textures[sampler],
        );
        expect(unbound, name).toEqual([]);
        const secondDistortion = Object.keys(upgraded.textures).find((key) =>
          key.includes("b94d50f356ab4aa9980ffc008846a1cd"),
        );
        expect(secondDistortion, name).toBeTruthy();
        expect(upgraded.textures[secondDistortion!]?.file, name).toBeTruthy();
      }
    },
  );

  it.skipIf(!hasDump)("ne change rien sans second masque", () => {
    const base = lorcanaMaterial("CardMagmaMetallicHotFoil")!;
    const same = lorcanaMaterialForPrint("CardMagmaMetallicHotFoil", {});
    expect(same?.fragment).toBe(base.fragment);
    // Phantom dump role stripped — WebGL must not wait on a 2e masque absent.
    expect(base.textures._SecondTopLayerMask).toBeUndefined();
    expect(same?.textures._SecondTopLayerMask).toBeUndefined();
  });

  it.skipIf(!hasDump)(
    "n'exige pas de 2e masque sur les HotFoil de base (sampler compilé out)",
    () => {
      for (const name of [
        "CardMagmaSnowHotFoil",
        "CardMagmaMetallicHotFoil",
        "CardMagmaChromeRainbowHotFoilMaterial",
        "CardLoreMetallicHotFoil",
        "CardSeaWaveMatteHotFoil",
      ]) {
        const material = lorcanaMaterial(name)!;
        expect(material.fragment.includes("USESECONDTOPLAYER"), name).toBe(
          false,
        );
        expect(material.textures._SecondTopLayerMask, name).toBeUndefined();
      }
    },
  );

  it("ne invente pas de sibling pour Silver (pas de variante HotFoil)", () => {
    expect(secondTopLayerFragment("CardFoilSilver.frag")).toBeNull();
    if (!hasDump) return;
    const same = lorcanaMaterialForPrint("CardFoilSilver", {
      secondVarnishMaskUrl: "/uploads/second.png",
    });
    expect(same?.fragment).toBe("CardFoilSilver.frag");
  });
});

describe("CardMagmaSnowHotFoil APK fidelity", () => {
  const hasDump = LORCANA_MATERIAL_NAMES.includes("CardMagmaSnowHotFoil");

  it.skipIf(!hasDump)(
    "garde les reglages Snow de l'APK (pas de HotFoilColor)",
    () => {
      const material = lorcanaMaterial("CardMagmaSnowHotFoil")!;
      // Snow compiles _HotFoilColor out — stamp rides on VarnishLightColor.
      expect(material.colors._HotFoilColor).toBeUndefined();
      expect(material.colors._VarnishLightColor).toEqual([
        0.858824, 0.937255, 0.952941, 1.0,
      ]);
      expect(material.keywords).toContain("_HOTFOILSURFACE_SNOW");
      expect(material.fragment).toContain("HOTFOILSURFACE_SNOW");
      expect(hotFoilStampUniforms(material)).toEqual(
        new Set(["_VarnishLightColor"]),
      );
    },
  );

  it.skipIf(!hasDump)(
    "Metallic stamp via HotFoilColor, lighting via VarnishLight",
    () => {
      const material = lorcanaMaterial("CardMagmaMetallicHotFoil")!;
      expect(material.colors._HotFoilColor).toBeDefined();
      expect(material.colors._VarnishLightColor).toBeDefined();
      expect(hotFoilStampUniforms(material)).toEqual(
        new Set(["_HotFoilColor"]),
      );
    },
  );

  it.skipIf(!hasDump)("bind chaque sampler Snow (tilt + time)", () => {
    const material = lorcanaMaterial("CardMagmaSnowHotFoil")!;
    for (const frag of [material.fragment, material.fragmentTime]) {
      expect(frag).toBeTruthy();
      const source = readFileSync(path.join(SHADERS_DIR, frag!), "utf8");
      const unbound = [...fragmentSamplers(source)].filter(
        (sampler) => !material.textures[sampler],
      );
      expect(unbound, frag).toEqual([]);
    }
  });
});
