import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOLO_SHADER_ID,
  NEUTRAL_VARNISH_COLOR,
  DEFAULT_VARNISH_SHADER_ID,
  HOLO_SHADER_IDS,
  holoLayerStyle,
  holoShader,
  isHoloShaderId,
  maskedByStyle,
  varnishShader,
} from "./holoShaders";

describe("holoShader", () => {
  it("returns the look asked for", () => {
    expect(holoShader("lava").id).toBe("lava");
    expect(holoShader("lore").id).toBe("lore");
  });

  it("falls back to the everyday foil rather than nothing", () => {
    // A finish this build has no look for still has to render as some foil —
    // the copy really is one, and drawing it plain would state the opposite.
    expect(holoShader("Lava").id).toBe(DEFAULT_HOLO_SHADER_ID);
    expect(DEFAULT_HOLO_SHADER_ID).toBe("silver");
    expect(holoShader(null).id).toBe(DEFAULT_HOLO_SHADER_ID);
    expect(holoShader(undefined).id).toBe(DEFAULT_HOLO_SHADER_ID);
  });
});

describe("varnishShader", () => {
  it("returns the coat asked for", () => {
    expect(varnishShader("chromeRainbowHotFoil").id).toBe(
      "chromeRainbowHotFoil",
    );
  });

  it("falls back to the stamped coat, not to the everyday foil", () => {
    // The two axes are not interchangeable, so they do not share a default.
    expect(varnishShader("nope").id).toBe(DEFAULT_VARNISH_SHADER_ID);
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
      expect(holoShader(id).id).toBe(id);
    }
  });

  it("names only textures that ship with the app", () => {
    // The recipes were transcribed with the publisher's hashed asset names
    // rewritten to local ones. A typo there is invisible until a card renders
    // blank, so pin the shape of every reference.
    for (const id of HOLO_SHADER_IDS) {
      for (const url of holoShader(id).backgroundImage.matchAll(
        /url\((\/[^)]+)\)/g,
      )) {
        expect(url[1]).toMatch(/^\/foil\/[a-z0-9]+\.(jpg|png)$/);
      }
    }
  });

  it("blends every look onto the artwork rather than covering it", () => {
    // A look with no `mix-blend-mode` paints an opaque rectangle over the card.
    for (const id of HOLO_SHADER_IDS) {
      expect(holoShader(id).mixBlendMode).toBeTruthy();
      expect(holoShader(id).mixBlendMode).not.toBe("normal");
    }
  });

  it("keeps the everyday foil colourless", () => {
    // Silver is a metal, not a spectrum: it reached the right look only by
    // desaturating, and losing that filter turns every common card rainbow.
    expect(holoShader("silver").filter).toContain("saturate(0.2)");
  });

  it("leaves no look sitting still while the light sweeps past", () => {
    // The idle sweep drives all three properties, and it has to: every look is
    // positioned against at least one of them, so a look referring to none
    // would hold perfectly still while its neighbours travelled. That is how a
    // finish ends up looking broken rather than absent.
    const driven = ["--colorX", "--colorY", "--combined"];
    for (const id of HOLO_SHADER_IDS) {
      const position = holoShader(id).backgroundPosition;
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
      for (const name of holoShader(id).backgroundPosition.matchAll(
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
    expect(holoShader("lore").overlay).toBe("loreShine");
    expect(holoShader("satin").overlay).toBe("satinShine");
  });

  it("leaves the finishes that ship alone without one", () => {
    for (const id of ["silver", "lava", "magma", "glitter"] as const) {
      expect(holoShader(id).overlay).toBeUndefined();
    }
  });

  it("points every overlay at a look that exists", () => {
    // A dangling id would render nothing and look like a missing layer again.
    for (const id of HOLO_SHADER_IDS) {
      const overlay = holoShader(id).overlay;
      if (overlay) expect(holoShader(overlay).id).toBe(overlay);
    }
  });

  it("never chains one overlay into another", () => {
    // Only one extra coat is drawn, so an overlay carrying its own would be
    // silently dropped.
    for (const id of HOLO_SHADER_IDS) {
      const overlay = holoShader(id).overlay;
      if (overlay) expect(holoShader(overlay).overlay).toBeUndefined();
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
    const style = holoLayerStyle(holoShader("silver"));
    expect(style.mixBlendMode).toBe("hard-light");
    expect(style.backgroundBlendMode).toBe("exclusion");
    expect(style.opacity).toBe(0.5);
    expect(style.backgroundImage).toContain("/foil/silverc.jpg");
  });

  it("leaves out what a look does not set, rather than inventing a value", () => {
    // `undefined` lets the stylesheet decide; a literal would override it.
    expect(holoLayerStyle(holoShader("magma")).filter).toBeUndefined();
    expect(holoLayerStyle(holoShader("lore")).opacity).toBeUndefined();
  });
});

describe("maskedByStyle", () => {
  it("states luminance rather than leaving it to match-source", () => {
    const style = maskedByStyle("holoFoilABC") as Record<string, string>;

    // The bug this pins: with `mask-mode` unset, the initial `match-source` is
    // resolved by WebKit as *alpha*. The published masks are JPEGs, so their
    // alpha is opaque everywhere and the layer covered the whole card on
    // iPhone — text box, borders and all — while Chrome looked correct.
    expect(style.maskMode).toBe("luminance");
  });

  it("uses the older WebKit spelling of the mode as well", () => {
    const style = maskedByStyle("holoFoilABC") as Record<string, string>;

    // `-webkit-mask-mode` does not exist; `-webkit-mask-source-type` is the
    // property Safari actually reads, and the one the publisher states.
    expect(style.WebkitMaskSourceType).toBe("luminance");
  });

  it("declares both the prefixed and unprefixed properties", () => {
    const style = maskedByStyle("holoFoilABC") as Record<string, string>;

    // Safari needs the prefixed ones; dropping either half loses one engine.
    expect(style.maskImage).toBe("url(#holoFoilABC)");
    expect(style.WebkitMaskImage).toBe("url(#holoFoilABC)");
    expect(style.maskSize).toBe("100% 100%");
    expect(style.WebkitMaskSize).toBe("100% 100%");
  });

  it("never uses the mask shorthand, which resets the mode it just set", () => {
    const style = maskedByStyle("holoFoilABC") as Record<string, string>;

    // `mask` and `-webkit-mask` reset `mask-mode` to its initial value. React
    // writes an inline style object in key order, so one shorthand anywhere in
    // here silently throws the luminance away again.
    expect(style.mask).toBeUndefined();
    expect(style.WebkitMask).toBeUndefined();
  });

  it("points at the id it was given, so layers cannot share a mask by accident", () => {
    expect(
      (maskedByStyle("holoVarnish2xy") as Record<string, string>).maskImage,
    ).toBe("url(#holoVarnish2xy)");
  });
});
