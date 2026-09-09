import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOLO_SHADER_ID,
  NEUTRAL_VARNISH_COLOR,
  DEFAULT_VARNISH_SHADER_ID,
  FOIL_POINTER_GLARE_STYLE,
  FOIL_PLATE_GLARE_STYLE,
  FOIL_POINTER_LIGHT_MASK,
  HOLO_SHADER_IDS,
  holoLayerStyle,
  holoShader,
  type HoloShader,
  isHoloShaderId,
  maskedByStyle,
  varnishShader,
} from "./holoShaders";

/**
 * The shader for an id these tests know exists.
 *
 * `holoShader` is deliberately nullable: it accepts any string and answers
 * `null` for an unknown id — which is exactly what the null cases below check.
 * Here the id is known, so an absent shader is a broken test rather than a
 * value to narrow. Throwing names the id; a `!` would let the null travel and
 * fail three assertions later on something unrelated.
 */
function shaderOf(id: string): HoloShader {
  const shader = holoShader(id);
  if (!shader) throw new Error(`holoShader: unknown id "${id}"`);
  return shader;
}

describe("FOIL_POINTER_GLARE_STYLE", () => {
  it("covers the card once — default repeat seams at corner leans", () => {
    expect(FOIL_POINTER_GLARE_STYLE.backgroundRepeat).toBe("no-repeat");
    expect(FOIL_POINTER_GLARE_STYLE.backgroundSize).toBe("100% 100%");
    expect(FOIL_POINTER_GLARE_STYLE.backgroundImage).toContain(
      "radial-gradient",
    );
  });
});

describe("FOIL_PLATE_GLARE_STYLE", () => {
  it("is a white overlay through the foil plate (simey glare2)", () => {
    expect(FOIL_PLATE_GLARE_STYLE.backgroundColor).toBe("#fff");
    expect(FOIL_PLATE_GLARE_STYLE.mixBlendMode).toBe("overlay");
  });
});

describe("FOIL_POINTER_LIGHT_MASK", () => {
  it("is a raw radial gradient (not url-wrapped)", () => {
    expect(FOIL_POINTER_LIGHT_MASK.url).toMatch(/^radial-gradient\(/);
    const style = maskedByStyle([
      "/uploads/mask.png",
      FOIL_POINTER_LIGHT_MASK,
    ]) as Record<string, string>;
    expect(style.maskImage).toContain('url("/uploads/mask.png")');
    expect(style.maskImage).toContain("radial-gradient(");
    expect(style.maskImage).not.toContain('url("radial-gradient');
  });
});

describe("holoShader", () => {
  it("returns the look asked for", () => {
    expect(holoShader("lava")?.id).toBe("lava");
    expect(holoShader("lore")?.id).toBe("lore");
  });

  it("returns null when absent or unknown — packs own CSS defaults", () => {
    expect(holoShader("Lava")).toBeNull();
    expect(holoShader(null)).toBeNull();
    expect(holoShader(undefined)).toBeNull();
    // Constants remain for packs that pass them explicitly (Lorcana resolveCss).
    expect(DEFAULT_HOLO_SHADER_ID).toBe("silver");
  });
});

describe("varnishShader", () => {
  it("returns the coat asked for", () => {
    expect(varnishShader("chromeRainbowHotFoil")?.id).toBe(
      "chromeRainbowHotFoil",
    );
  });

  it("returns null when absent or unknown — packs own CSS defaults", () => {
    expect(varnishShader("nope")).toBeNull();
    expect(varnishShader(null)).toBeNull();
    expect(DEFAULT_VARNISH_SHADER_ID).toBe("hotFoil");
    expect(DEFAULT_VARNISH_SHADER_ID).not.toBe(DEFAULT_HOLO_SHADER_ID);
  });
});

describe("isHoloShaderId", () => {
  it("accepts only the ids the library defines", () => {
    expect(isHoloShaderId("lava")).toBe(true);
    expect(isHoloShaderId("Lava")).toBe(false);
    expect(isHoloShaderId("")).toBe(false);
    expect(isHoloShaderId(null)).toBe(false);
    expect(isHoloShaderId(42)).toBe(false);
  });
});

describe("the library itself", () => {
  it("gives every id a look, and every look its own id back", () => {
    for (const id of HOLO_SHADER_IDS) {
      expect(holoShader(id)?.id).toBe(id);
    }
  });

  it("names only textures that ship with the app", () => {
    // The recipes were transcribed with the publisher's hashed asset names
    // rewritten to local ones. A typo there is invisible until a card renders
    // blank, so pin the shape of every reference.
    for (const id of HOLO_SHADER_IDS) {
      const look = holoShader(id)!;
      for (const url of look.backgroundImage.matchAll(/url\((\/[^)]+)\)/g)) {
        expect(url[1]).toMatch(
          /^\/assets\/lorcana\/web\/[a-z0-9]+\.(jpg|png)$/,
        );
      }
    }
  });

  it("blends every look onto the artwork rather than covering it", () => {
    // A look with no `mix-blend-mode` paints an opaque rectangle over the card.
    for (const id of HOLO_SHADER_IDS) {
      const look = holoShader(id)!;
      expect(look.mixBlendMode).toBeTruthy();
      expect(look.mixBlendMode).not.toBe("normal");
    }
  });

  it("keeps the everyday foil colourless", () => {
    // Silver is a metal, not a spectrum: it reached the right look only by
    // desaturating, and losing that filter turns every common card rainbow.
    expect(holoShader("silver")!.filter).toContain("saturate(0.2)");
  });

  it("leaves no look sitting still while the light sweeps past", () => {
    // The idle sweep drives all three properties, and it has to: every look is
    // positioned against at least one of them, so a look referring to none
    // would hold perfectly still while its neighbours travelled. That is how a
    // finish ends up looking broken rather than absent.
    const driven = ["--colorX", "--colorY", "--combined"];
    for (const id of HOLO_SHADER_IDS) {
      const position = holoShader(id)!.backgroundPosition;
      expect(
        driven.some((name) => position.includes(name)),
        `${id} is positioned against nothing the idle animation moves`,
      ).toBe(true);
    }
  });

  it("places each look against the properties the card actually sets", () => {
    // The recipes are written against `--colorX`, `--colorY` and `--combined`.
    // A look referring to anything else silently never moves.
    for (const id of HOLO_SHADER_IDS) {
      for (const name of holoShader(id)!.backgroundPosition.matchAll(
        /var\((--[a-zA-Z-]+)\)/g,
      )) {
        expect(["--colorX", "--colorY", "--combined"]).toContain(name[1]);
      }
    }
  });
});

describe("extra coats", () => {
  it("gives Lore the second coat it ships with", () => {
    // Five layers, not three. Without this one an Iconique card lost most of
    // its colour — the finish alone is nearly monochrome.
    expect(holoShader("lore")!.overlay).toBe("loreShine");
    expect(holoShader("satin")!.overlay).toBe("satinShine");
  });

  it("leaves the finishes that ship alone without one", () => {
    for (const id of ["silver", "lava", "magma", "glitter"] as const) {
      expect(holoShader(id)!.overlay).toBeUndefined();
    }
  });

  it("points every overlay at a look that exists", () => {
    // A dangling id would render nothing and look like a missing layer again.
    for (const id of HOLO_SHADER_IDS) {
      const overlay = holoShader(id)!.overlay;
      if (overlay) expect(holoShader(overlay)!.id).toBe(overlay);
    }
  });

  it("never chains one overlay into another", () => {
    // Only one extra coat is drawn, so an overlay carrying its own would be
    // silently dropped.
    for (const id of HOLO_SHADER_IDS) {
      const overlay = holoShader(id)!.overlay;
      if (overlay) expect(holoShader(overlay)!.overlay).toBeUndefined();
    }
  });
});

describe("the neutral a coat falls back to", () => {
  it("is the publisher's own, a grey rather than a colour", () => {
    // Read off a HighGloss print, which the catalogue gives no hue. Only 83 of
    // 3241 variants carry one, so this is what most coats actually render —
    // a colour here tinted every single one of them.
    expect(NEUTRAL_VARNISH_COLOR).toBe("#aaa");
  });
});

describe("holoLayerStyle", () => {
  it("carries the whole recipe onto the element", () => {
    const style = holoLayerStyle(shaderOf("silver"));
    expect(style.mixBlendMode).toBe("hard-light");
    expect(style.backgroundBlendMode).toBe("exclusion");
    expect(style.opacity).toBe(0.5);
    expect(style.backgroundImage).toContain("/assets/lorcana/web/silverc.jpg");
  });

  it("leaves out what a look does not set, rather than inventing a value", () => {
    // `undefined` lets the stylesheet decide; a literal would override it.
    expect(holoLayerStyle(shaderOf("magma")).filter).toBeUndefined();
    expect(holoLayerStyle(shaderOf("lore")).opacity).toBeUndefined();
  });
});

describe("maskedByStyle", () => {
  it("masks by alpha, never by luminance", () => {
    const style = maskedByStyle("/uploads/abc.jpg") as Record<string, string>;

    // Safari parses `mask-mode: luminance`, reports it supported and returns it
    // from `getComputedStyle` — and does not apply it to an image mask, so the
    // layer covered the whole card on iPhone. Coverage lives in the alpha
    // channel instead; see `bakeMask`.
    expect(style.maskMode).toBe("alpha");
    expect(style.WebkitMaskSourceType).toBe("alpha");
  });

  it("declares both the prefixed and unprefixed properties", () => {
    const style = maskedByStyle("/uploads/abc.jpg") as Record<string, string>;

    // Safari needs the prefixed ones; dropping either half loses one engine.
    expect(style.maskImage).toBe('url("/uploads/abc.jpg")');
    expect(style.WebkitMaskImage).toBe('url("/uploads/abc.jpg")');
    expect(style.maskSize).toBe("100% 100%");
    expect(style.WebkitMaskSize).toBe("100% 100%");
  });

  it("never uses the mask shorthand, which resets the mode it just set", () => {
    const style = maskedByStyle("/uploads/abc.jpg") as Record<string, string>;

    // `mask` and `-webkit-mask` reset `mask-mode` to its initial value. React
    // writes an inline style object in key order, so one shorthand anywhere in
    // here silently throws the luminance away again.
    expect(style.mask).toBeUndefined();
    expect(style.WebkitMask).toBeUndefined();
  });

  it("points at the file it was given", () => {
    expect(
      (maskedByStyle("/uploads/xy.png") as Record<string, string>).maskImage,
    ).toBe('url("/uploads/xy.png")');
  });
});

describe("holoLayerStyle tuning", () => {
  it("leaves the transcribed recipe untouched when nothing is asked", () => {
    // The whole safety of the tuning API: an absent or unit tuning must be
    // byte-identical, because the recipes are pinned against the publisher's
    // stylesheet and a nudged default would quietly break that.
    for (const id of HOLO_SHADER_IDS) {
      const plain = holoLayerStyle(shaderOf(id));
      expect(holoLayerStyle(shaderOf(id), {})).toEqual(plain);
      expect(
        holoLayerStyle(shaderOf(id), {
          rainbow: 1,
          inkwash: 1,
          motif: 1,
          grain: 1,
        }),
      ).toEqual(plain);
    }
  });

  it("adds saturation for rainbow rather than replacing the look's own", () => {
    const style = holoLayerStyle(shaderOf("silver"), { rainbow: 2 });
    // Silver already desaturates to 0.2; the axis composes onto that.
    expect(style.filter).toBe(
      "brightness(1.6) saturate(0.2) invert() saturate(2)",
    );
  });

  it("darkens as the wash gets stronger, and lifts as it weakens", () => {
    const strong = holoLayerStyle(shaderOf("magma"), { inkwash: 2 });
    expect(strong.filter).toBe("brightness(0.5) contrast(2)");

    const weak = holoLayerStyle(shaderOf("magma"), { inkwash: 0.5 });
    expect(weak.filter).toBe("brightness(2) contrast(0.5)");
  });

  it("scales a look that declares no filter of its own", () => {
    // `magma` has no filter, so the axis must not produce `undefined saturate(…)`.
    expect(holoShader("magma")!.filter).toBeUndefined();
    expect(holoLayerStyle(shaderOf("magma"), { rainbow: 1.5 }).filter).toBe(
      "saturate(1.5)",
    );
  });

  it("weights the whole layer, treating a look with no opacity as opaque", () => {
    expect(holoLayerStyle(shaderOf("silver"), { motif: 0.5 }).opacity).toBe(
      0.25,
    );
    // `lore` declares none, so the weight applies to a full 1.
    expect(holoShader("lore")!.opacity).toBeUndefined();
    expect(holoLayerStyle(shaderOf("lore"), { motif: 0.4 }).opacity).toBe(0.4);
  });

  it("scales the grain by resizing every length, keeping keywords intact", () => {
    // `cover` and `contain` have no size to scale, and dropping them would
    // change which layer covers the card.
    expect(holoLayerStyle(shaderOf("lava"), { grain: 2 }).backgroundSize).toBe(
      "cover, 600% 600%",
    );
    expect(
      holoLayerStyle(shaderOf("silver"), { grain: 0.5 }).backgroundSize,
    ).toBe("150% 50%, 50% 50%");
  });
});
