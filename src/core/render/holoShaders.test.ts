import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOLO_SHADER_ID,
  DEFAULT_VARNISH_SHADER_ID,
  HOLO_SHADER_IDS,
  holoLayerStyle,
  holoShader,
  isHoloShaderId,
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
