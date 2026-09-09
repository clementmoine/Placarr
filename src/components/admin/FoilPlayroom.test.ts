import { describe, expect, it } from "vitest";

import {
  printInfoFromSample,
  resolveEffectPackId,
  resolvePlayroomLayout,
  resolvePlayroomMaterial,
} from "@/components/admin/FoilPlayroom";
import { variantRendering } from "@/lib/client/hooks/usePrintVariant";

const IDS = ["lorcana", "pokemon"] as const;
const MATERIALS = ["SvHolo", "SvUltra", "SvUltraGoldRainbow"] as const;

describe("resolveEffectPackId", () => {
  it.each([
    ["lorcana", "lorcana"],
    ["pokemon", "pokemon"],
    ["POKEMON", "pokemon"],
  ])("résout l'id exact %s", (slug, expected) => {
    expect(resolveEffectPackId(slug, IDS)).toBe(expected);
  });

  it.each([
    ["lor", "lorcana"],
    ["poke", "pokemon"],
  ])("résout le préfixe %s", (slug, expected) => {
    expect(resolveEffectPackId(slug, IDS)).toBe(expected);
  });

  it("mappe l'ancien slug pokemonpaper", () => {
    expect(resolveEffectPackId("pokemonpaper", IDS)).toBe("pokemon");
    expect(resolveEffectPackId("Pokemon-Paper", IDS)).toBe("pokemon");
  });

  it("mappe le chemin catalogue Kayou vers le pack d'effets", () => {
    expect(
      resolveEffectPackId("naruto/kayou", ["naruto-kayou", "pokemon"]),
    ).toBe("naruto-kayou");
  });

  it.each([null, undefined, "", "magic"])("ne devine rien pour %s", (slug) => {
    expect(resolveEffectPackId(slug, IDS)).toBeNull();
  });

  it("refuse un préfixe ambigu plutôt que de tirer à pile ou face", () => {
    expect(resolveEffectPackId("p", ["pokemon", "pikachu"])).toBeNull();
    expect(resolveEffectPackId("poke", IDS)).toBe("pokemon");
  });
});

describe("resolvePlayroomLayout", () => {
  it.each([
    ["focus", "focus"],
    ["carte", "focus"],
    ["card", "focus"],
    ["grid", "grid"],
    [null, "grid"],
    ["", "grid"],
  ] as const)("mappe %s → %s", (value, expected) => {
    expect(resolvePlayroomLayout(value)).toBe(expected);
  });
});

describe("resolvePlayroomMaterial", () => {
  it("prend le premier matériau sans slug", () => {
    expect(resolvePlayroomMaterial(null, MATERIALS)).toBe("SvHolo");
    expect(resolvePlayroomMaterial("", MATERIALS)).toBe("SvHolo");
  });

  it("match exact puis case-insensitive", () => {
    expect(resolvePlayroomMaterial("SvUltra", MATERIALS)).toBe("SvUltra");
    expect(resolvePlayroomMaterial("svultragoldrainbow", MATERIALS)).toBe(
      "SvUltraGoldRainbow",
    );
  });

  it("retombe sur le premier matériau pour un slug inconnu", () => {
    expect(resolvePlayroomMaterial("Missing", MATERIALS)).toBe("SvHolo");
  });

  it("renvoie null sans matériaux", () => {
    expect(resolvePlayroomMaterial("SvHolo", [])).toBeNull();
  });
});

describe("compare layout", () => {
  it("resolves from the URL, in both languages", () => {
    expect(resolvePlayroomLayout("compare")).toBe("compare");
    expect(resolvePlayroomLayout("comparer")).toBe("compare");
  });

  it("leaves the other layouts alone", () => {
    expect(resolvePlayroomLayout("carte")).toBe("focus");
    expect(resolvePlayroomLayout("grid")).toBe("grid");
    expect(resolvePlayroomLayout(undefined)).toBe("grid");
    // Not a prefix match: a stray value must not fall into compare.
    expect(resolvePlayroomLayout("comp")).toBe("grid");
  });
});

describe("printInfoFromSample", () => {
  it("keeps playroom material finishes when the print only exposes collection axis", () => {
    const sample = {
      id: "kayou:smritiheavenscrolls1-nrss.hr.002:hr-2x2",
      name: "Sasuke & Naruto",
      variant: "hr-2x2",
      printKey: "kayou:smritiheavenscrolls1-nrss.hr.002",
      shelfType: "tcg",
      imageUrl: "/assets/naruto/kayou/cards/smritiheavenscrolls1/en/nrss.hr.002/art.narutocards.webp",
      foilMaskUrl: "/assets/naruto/kayou/full_foil_mask.webp",
      effectPack: "naruto-kayou",
    };
    const merged = printInfoFromSample(sample, {
      finishes: ["normal", "hr", "holo"],
      plainFinishes: ["normal"],
      effectPack: "naruto-kayou",
    });
    expect(merged?.finishes).toContain("hr-2x2");
    const rendered = variantRendering(
      "hr-2x2",
      merged,
      sample.imageUrl,
    );
    expect(rendered.imageUrl).toBe(sample.imageUrl);
    expect(rendered.foilMaskUrl).toBe(sample.foilMaskUrl);
    expect(rendered.shader?.id).toBe("kayouLenticular");
    expect(rendered.lenticularGrid).toEqual({ cols: 2, rows: 2 });
  });
});
