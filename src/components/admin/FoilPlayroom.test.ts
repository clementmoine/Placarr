import { describe, expect, it } from "vitest";

import {
  resolveEffectPackId,
  resolvePlayroomLayout,
  resolvePlayroomMaterial,
} from "@/components/admin/FoilPlayroom";

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
