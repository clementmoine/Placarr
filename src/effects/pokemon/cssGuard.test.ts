import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import "@/effects";
import { getEffectPack } from "@/core/render/foil";
import { holoShader } from "@/core/render/holoShaders";
import { HOUSE_HOLO_SHADER_IDS } from "@/core/render/holoShadersHouse";
import {
  isPokemonHoloShaderId,
  POKEMON_CSS_DODGE_OPACITY_CEILING,
  POKEMON_CSS_OPACITY_CEILING,
  POKEMON_HOLO_SHADER_IDS,
  pokemonHoloShader,
} from "@/core/render/holoShadersPokemon";
import {
  isSimeyHoloShaderId,
  SIMEY_HOLO_SHADER_IDS,
} from "@/core/render/holoShadersSimey";

import {
  LIVE_FINISH_CSS,
  POKEMON_CSS_FOIL_SHIPPED,
  resolveCssRecipe,
} from "./cssRecipes";
import { POKEMON_FOIL_NAMES } from "./foilNames";
import { POKEMON_EFFECT_PACK_ID } from "./index";

describe("pokemon CSS foil fallback", () => {
  it("resolves a textured recipe for Live leaves, house looks for catalogue", () => {
    expect(POKEMON_CSS_FOIL_SHIPPED).toBe(true);
    // Rainbow leaf → Live Spectrum_Rainbow (not SwSecret’s Spectrum).
    expect(resolveCssRecipe("Rainbow", null).finishShaderId).toBe(
      "rainbowFoil",
    );
    // Catalogue finishes: vendored simey regular/reverse holo (not house gradients).
    expect(resolveCssRecipe("holo", null).finishShaderId).toBe("regularHolo");
    expect(resolveCssRecipe("live-ph", null).finishShaderId).toBe("reverseHolo");
  });

  it("keeps sheet aliases on their own recipe rather than their frag stem", () => {
    /*
      `foilManifestToShader` collapses `FlatSilver_CC` onto `FlatSilver` — right
      for GLES, wrong for CSS: CC carves TEX_CC_PB, FlatSilver stays silver.
      Rainbow02 keeps Spectrum (not Rainbow’s Spectrum_Rainbow).
    */
    expect(resolveCssRecipe("FlatSilver_CC", null).finishShaderId).toBe(
      "flatSilverCc",
    );
    expect(resolveCssRecipe("FlatSilver", null).finishShaderId).toBe(
      "flatSilver",
    );
    expect(resolveCssRecipe("Rainbow02", null).finishShaderId).toBe(
      "rainbow02",
    );
    expect(resolveCssRecipe("SwSecreT02", null).finishShaderId).toBe(
      "swSecret",
    );
  });

  it("remaps Live foil_mask the same way WebGL toggles CC / laminate", () => {
    expect(
      resolveCssRecipe("SunPillar", null).finishShaderId,
    ).toBe("sunPillar");
    expect(
      resolveCssRecipe("SunPillar", null, { foilMask: "CastAndCure" })
        .finishShaderId,
    ).toBe("sunPillarCc");
    expect(
      resolveCssRecipe("FlatSilver", null, {
        foilMask: "ReverseLaminatePokeBall",
      }).finishShaderId,
    ).toBe("flatSilverCc");
    expect(
      resolveCssRecipe("FlatSilver", null, {
        foilMask: "ReverseLaminateMasterBall",
      }).finishShaderId,
    ).toBe("flatSilverCcMb");
    expect(
      resolveCssRecipe("FlatSilver_CC", null, {
        foilMask: "ReverseLaminateMasterBall",
      }).finishShaderId,
    ).toBe("flatSilverCcMb");
  });
  it("gives every foiled material a recipe of its own", () => {
    /*
      The gap the side-by-side comparator exposed: all 27 materials were
      rendering one identical house gradient, so the CSS half of the playroom
      was showing the same card 27 times. Distinctness is the property that
      failure violated, so it is the one pinned here.
    */
    const foiled = POKEMON_FOIL_NAMES.filter((name) => name !== "NonFoil");
    const resolved = foiled.map(
      (name) => resolveCssRecipe(name, null).finishShaderId,
    );
    for (const [i, id] of resolved.entries()) {
      expect(
        isPokemonHoloShaderId(id) || isSimeyHoloShaderId(id),
        foiled[i],
      ).toBe(true);
    }
    expect(new Set(resolved).size, "every foil needs its own look").toBe(
      foiled.length,
    );
  });

  it("leaves a non-foil print plain rather than inventing a sheen", () => {
    // The fallback's honesty rests on this: no foil, no look, no guess.
    expect(resolveCssRecipe("NonFoil", null)).toEqual({
      finishShaderId: null,
      varnishShaderId: null,
    });
    expect(resolveCssRecipe("", null)).toEqual({
      finishShaderId: null,
      varnishShaderId: null,
    });
  });

  it("covers every LIVE_FINISH_CSS leaf with a resolvable house shader", () => {
    for (const [leaf, id] of Object.entries(LIVE_FINISH_CSS)) {
      expect(holoShader(id), `${leaf} → ${id}`).toBeTruthy();
    }
  });

  it("round-trips a house look through shader.id without becoming Lorcana", () => {
    /*
      Regression, and the one the isolated resolveCss tests could not see.
      `variantRendering` resolves a look, the card hands `shader.id` down, and
      the face resolves it again. House looks used to declare `id: "silver"` to
      satisfy a Lorcana-only type, so every Pokémon foil came back wearing
      Lorcana's silver texture — through a path this file never exercised.
    */
    for (const finish of ["Rainbow", "Cosmos", "SvUltra", "holo"]) {
      const id = resolveCssRecipe(finish, null).finishShaderId;
      const look = holoShader(id)!;
      expect(look.id, finish).toBe(id);
      expect(holoShader(look.id), finish).toBe(look);
      expect(JSON.stringify(look), finish).not.toContain("/foil/lorcana/");
    }
  });

  it("never reaches for a Lorcana recipe, whatever the finish", () => {
    /*
      The load-bearing invariant, and the reason this file exists. Lorcana's
      looks are photographed textures under `/foil/lorcana/web`, transcribed
      from its publisher's viewer; they describe Lorcana foils and nothing else.
      Pokémon stays on house looks even for a finish neither pack has seen.
    */
    const pack = getEffectPack(POKEMON_EFFECT_PACK_ID)!;
    // House gradients *or* this pack's own textured recipes — never Lorcana's.
    const allowed = new Set<string>([
      ...HOUSE_HOLO_SHADER_IDS,
      ...POKEMON_HOLO_SHADER_IDS,
      ...SIMEY_HOLO_SHADER_IDS,
    ]);
    for (const finish of [
      "SvUltra",
      "SvUltraGoldRainbow",
      "Cosmos",
      "holo",
      "reverse",
      "wpromo",
      "a finish nobody has ever printed",
    ]) {
      const css = pack.resolveCss(finish, "HighGloss");
      expect(allowed.has(css.finishShaderId ?? ""), finish).toBe(true);
      // The load-bearing half: whatever it resolved to, it is not a Lorcana
      // texture recipe.
      expect(
        JSON.stringify(holoShader(css.finishShaderId)),
        finish,
      ).not.toContain("/foil/lorcana/");
      // Paint-etch finishes skip house varnish (double-wash).
      const expectHouseEtch =
        css.finishShaderId !== "radiantHolo" &&
        css.finishShaderId !== "ultraGoldRainbow" &&
        css.finishShaderId !== "ultraScodix" &&
        css.finishShaderId !== "swSecret" &&
        css.finishShaderId !== "secretRare";
      expect(css.varnishShaderId, finish).toBe(
        expectHouseEtch ? "etch" : null,
      );
    }
  });
});

describe("pokemon textured recipes", () => {
  const SHARED = join(process.cwd(), "data/pokemon/foil/textures/_shared");

  /**
   * Split a comma-separated CSS list on its *top-level* commas only.
   *
   * `background-image` entries are no longer all `url()`: the banding layers are
   * gradients, and a gradient's colour stops are themselves comma-separated. A
   * naive `split(",")` counts every stop as a layer.
   */
  function cssList(value: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 0) {
        out.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
    out.push(value.slice(start).trim());
    return out;
  }

  it("only names textures the extract actually contains", () => {
    /*
      A misspelt stem is the one mistake here that costs nothing to make and is
      invisible to review: the browser 404s the layer, `background-image` drops
      that entry, and the look renders one texture short — still plausible,
      still wrong. Reviewing the recipes by eye cannot catch it; this can.
    */
    const missing: string[] = [];
    for (const id of POKEMON_HOLO_SHADER_IDS) {
      const { backgroundImage } = pokemonHoloShader(id);
      for (const [, file] of backgroundImage.matchAll(/url\(([^)]+)\)/g)) {
        const stem = file.split("/").pop()!;
        if (!existsSync(join(SHARED, stem))) missing.push(`${id} → ${stem}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps every background list the same length", () => {
    // `background-size` and friends cycle when short, so a missing entry does
    // not error — it silently reuses the wrong value for the last layer.
    for (const id of POKEMON_HOLO_SHADER_IDS) {
      const look = pokemonHoloShader(id);
      const layers = cssList(look.backgroundImage).length;
      expect(cssList(look.backgroundSize).length, id).toBe(layers);
      expect(cssList(look.backgroundPosition).length, id).toBe(layers);
      expect(cssList(look.backgroundRepeat).length, id).toBe(layers);
    }
  });

  it("carves with the stencil plates instead of painting them", () => {
    /*
      The bug the FlatSilver_CC comparison exposed, and the one measurement
      catches where the eye does not. Five plates in the extract are stencils:
      the shape lives in alpha and the RGB is near-black everywhere.

        T_Holofoil_Cosmos_Dots_RGBA_Gradient   luminance 0
        T_Holofoil_Galaxy_Stars                          1
        T_Holofoil_Mask_Cracked_Ice_RGB                  9
        FX_T_Northern_Cross                             13
        TEX_CC_PB                                       28

      Painted as layers they can only darken the card — the Poké Ball laminate
      showed no balls at all, just a grey wash. They belong in `carve`.
    */
    const STENCILS = [
      "T_Holofoil_Cosmos_Dots_RGBA_Gradient",
      "T_Holofoil_Galaxy_Stars",
      "T_Holofoil_Mask_Cracked_Ice_RGB",
      "FX_T_Northern_Cross",
      "TEX_CC_PB",
      "TEX_CC_MB",
    ];
    for (const id of POKEMON_HOLO_SHADER_IDS) {
      const look = pokemonHoloShader(id);
      for (const stencil of STENCILS) {
        expect(look.backgroundImage, `${id} paints ${stencil}`).not.toContain(
          stencil,
        );
      }
    }
    // And the ones that need a stencil actually carry one.
    for (const id of [
      "cosmos",
      "galaxy",
      "crackedIce",
      "sunPillarCc",
    ] as const) {
      expect(pokemonHoloShader(id).carve?.url, id).toBeTruthy();
    }
    expect(pokemonHoloShader("sunPillar").carve).toBeUndefined();
    expect(pokemonHoloShader("flatSilverCc").carve?.url).toContain("TEX_CC_PB");
    expect(pokemonHoloShader("flatSilverCcMb").carve?.url).toContain(
      "TEX_CC_MB",
    );
  });

  it("scrolls a tall spectrum down rather than across", () => {
    /*
      `FX_T_Spectrum_SVHolo2` and `SVHolo3` are 32×256 — the hue varies down the
      strip. Scrolling them horizontally moved the ramp along the axis it is
      constant on, so those looks were lit, filtered and completely static.
    */
    for (const id of POKEMON_HOLO_SHADER_IDS) {
      const look = pokemonHoloShader(id);
      const images = cssList(look.backgroundImage);
      const positions = cssList(look.backgroundPosition);
      images.forEach((img, i) => {
        if (!img.includes("SVHolo")) return;
        // Vertical travel means the *second* axis carries `--background-y`.
        expect(positions[i].trim(), `${id} layer ${i}`).toMatch(
          /^center .*--background-y/,
        );
      });
    }
  });

  it("scrolls motifs on compressed --background-x/y, not raw --combined", () => {
    /*
      Simey splits glare (`--pointer-x/y`) from motif travel (`--background-x/y`
      compressed to ~37–63 / 33–67). Feeding lightX+lightY (0–200%) into
      oversized layers walked the box edge onto the card.
    */
    const look = pokemonHoloShader("ultraGoldRainbow");
    const positions = cssList(look.backgroundPosition);
    for (const pos of positions) {
      expect(pos, pos).not.toMatch(/--combined/);
      if (!pos.includes("--background-")) continue;
      expect(pos, pos).toMatch(/--background-[xy]/);
      // Never multiply a `%` custom prop (engines drop the whole position).
      expect(pos, pos).not.toMatch(/var\(--background-[xy][^)]*\)\s*\*/);
    }
  });

  it("does not tile specular glare sweeps", () => {
    /*
      Soft white `linear-gradient` lobes must be `no-repeat` (simey's
      `.card__glare`). Tiling them shows the tile edge as a hard join.
    */
    for (const id of POKEMON_HOLO_SHADER_IDS) {
      const look = pokemonHoloShader(id);
      const images = cssList(look.backgroundImage);
      const repeats = cssList(look.backgroundRepeat);
      images.forEach((img, i) => {
        if (!/linear-gradient\([^)]*255,\s*255,\s*255/.test(img)) return;
        expect(repeats[i]?.trim(), `${id} glare layer ${i}`).toBe("no-repeat");
      });
    }
  });

  it("scrolls hue bands without walking an oversized box edge", () => {
    /*
      Oversized % boxes need `no-repeat` so they never show an outer tile join.
      Pixel-period lattices (Radiant lozenges) must `repeat` — that's the grid.
    */
    for (const id of POKEMON_HOLO_SHADER_IDS) {
      const look = pokemonHoloShader(id);
      const images = cssList(look.backgroundImage);
      const repeats = cssList(look.backgroundRepeat);
      images.forEach((img, i) => {
        if (!img.includes("repeating-linear-gradient")) return;
        if (/\dpx/.test(img)) return;
        expect(repeats[i]?.trim(), `${id} band repeat ${i}`).toBe("no-repeat");
      });
    }
  });

  it("never draws a displacement or direction map", () => {
    /*
      These are vector fields, not pictures: `_Distort` offsets UVs and the
      `Direction`/`Normal` maps encode angles in red and green. Painted onto a
      card they read as red-green noise. Leaving them out is what the recipes
      mean by an honest ceiling — see the module header.
    */
    for (const id of POKEMON_HOLO_SHADER_IDS) {
      const drawn = pokemonHoloShader(id).backgroundImage;
      expect(drawn, id).not.toMatch(/Distort|Direction|_Normal_|Distortion/);
    }
  });

  it("separates the shine from the spectrum so the layers part", () => {
    /*
      Two layers travelling at the same rate are one layer. The parallax is the
      rate difference and nothing else, so a recipe with a shine must move it
      at a different rate from its spectrum. Locked lattices (Radiant) are the
      exception — both hatches must share travel or the lozenges unlock.
    */
    for (const id of POKEMON_HOLO_SHADER_IDS) {
      const positions = cssList(
        pokemonHoloShader(id).backgroundPosition,
      ).filter(
        (p) =>
          p.includes("--background-x") ||
          p.includes("--background-y") ||
          p.includes("--combined"),
      );
      if (positions.length <= 1) continue;
      if (new Set(positions).size === 1) continue;
      expect(new Set(positions).size, id).toBeGreaterThan(1);
    }
  });
});

describe("every look answers the light", () => {
  it("drives every filter from the off-centre distance, with a rest value", () => {
    /*
      The filters were constant strings, so the pointer slid gradients around
      and nothing ever flared. And the property is written on the DOM node, not
      through React style — a `calc()` without its fallback resolves to nothing
      and silently drops the whole filter before the first frame.

      Exception: Radiant is a faithful simey port with *static* brightness /
      contrast / saturate — pointer-modulating those blew the card white.
    */
    const staticFilter = new Set([
      "radiantHolo",
      "radiantHoloCoat",
      "radiantHoloSparkle",
    ]);
    for (const id of [
      ...HOUSE_HOLO_SHADER_IDS,
      ...POKEMON_HOLO_SHADER_IDS,
      ...SIMEY_HOLO_SHADER_IDS,
    ]) {
      const filter = holoShader(id)!.filter!;
      if (staticFilter.has(id)) {
        // Vendored coats lead with `brightness(…)`; the etch pass leads with
        // `invert(1)` because its plate is dumped in the opposite polarity.
        // Radiant sparkle may lead with `grayscale(1)` to tame Live RGB noise.
        expect(filter, id).toMatch(
          /^(invert\(1\) |grayscale\(1\) )?brightness\(/,
        );
        continue;
      }
      expect(filter, id).toContain("var(--pointer-from-center, 0)");
      expect(filter, id).toContain("calc(");
    }
  });
});

describe("simey catalogue foils", () => {
  it("ships regularHolo / reverseHolo from the vendored poke-holo recipes", () => {
    const holo = holoShader("regularHolo")!;
    expect(holo.mixBlendMode).toBe("color-dodge");
    expect(holo.backgroundImage).toMatch(/repeating-linear-gradient\(\s*110deg/);
    expect(holo.overlay).toBe("regularHoloBars");
    const reverse = holoShader("reverseHolo")!;
    expect(reverse.mixBlendMode).toBe("color-dodge");
    expect(reverse.backgroundBlendMode).toBe("soft-light, difference");
  });
});

describe("pokemon CSS opacity dose", () => {
  it("keeps stacks under the Radiant / glare-stack ceilings", () => {
    /*
      Radiant at color-dodge 0.8 bleached pale art *without* pre-darken.
      poke-holo's radiant runs dodge at full weight behind brightness(0.5) —
      that path is allowed at opacity 1 (vendored recipe). Untamed dodge stays ≤ 0.5.
      Simey catalogue recipes are the same vendor path (full-weight dodge OK).
    */
    for (const id of [...POKEMON_HOLO_SHADER_IDS, ...SIMEY_HOLO_SHADER_IDS]) {
      const look = holoShader(id)!;
      const opacity = look.opacity ?? 1;
      const dodge =
        look.mixBlendMode.includes("color-dodge") ||
        (look.backgroundBlendMode ?? "").includes("color-dodge");
      const brightCalc = /brightness\(calc\(([0-9.]+)/.exec(look.filter ?? "");
      const brightStatic = /brightness\(([0-9.]+)\)/.exec(look.filter ?? "");
      // poke-holo coats use brightness(0.5–0.66) before full-weight dodge.
      const preDarkened = brightCalc
        ? Number(brightCalc[1]) <= 0.66
        : brightStatic
          ? Number(brightStatic[1]) <= 0.66
          : false;
      // Vendored simey stacks are calibrated upstream; house/APK dodge stays capped.
      if (isSimeyHoloShaderId(id)) {
        expect(opacity, id).toBeLessThanOrEqual(1);
        continue;
      }
      const ceiling = dodge
        ? preDarkened
          ? 1
          : POKEMON_CSS_DODGE_OPACITY_CEILING
        : look.pointerFalloff === false
          ? 0.75
          : POKEMON_CSS_OPACITY_CEILING;
      expect(opacity, id).toBeLessThanOrEqual(ceiling);
    }
  });

  it("keeps the calibrated Radiant and gold anchors quiet", () => {
    // Lattice above coat at ~0.48 — slight global dim.
    expect(pokemonHoloShader("radiantHolo").opacity).toBe(0.48);
    expect(pokemonHoloShader("radiantHolo").mixBlendMode).toBe("color-dodge");
    expect(pokemonHoloShader("radiantHolo").pointerFalloff).toBe(false);
    expect(pokemonHoloShader("radiantHolo").filter).toBe(
      "brightness(0.55) contrast(2.05) saturate(1.8)",
    );
    expect(pokemonHoloShader("radiantHolo").overlay).toBe("radiantHoloCoat");
    expect(pokemonHoloShader("radiantHoloCoat").opacity).toBe(0.42);
    expect(pokemonHoloShader("radiantHoloCoat").mixBlendMode).toBe(
      "color-dodge",
    );
    expect(pokemonHoloShader("radiantHoloCoat").backgroundBlendMode).toBe(
      "soft-light",
    );
    expect(pokemonHoloShader("radiantHoloCoat").filter).toBe(
      "brightness(0.62) contrast(1.2) saturate(1.5)",
    );
    expect(pokemonHoloShader("radiantHoloCoat").overlay).toBe(
      "radiantHoloSparkle",
    );
    expect(pokemonHoloShader("radiantHoloSparkle").mixBlendMode).toBe(
      "overlay",
    );
    expect(pokemonHoloShader("ultraGoldRainbow").opacity).toBe(0.42);
    expect(pokemonHoloShader("ultraGoldRainbowCoat").opacity).toBe(0.34);
    expect(pokemonHoloShader("ultraGoldRainbow").overlay).toBe(
      "ultraGoldRainbowCoat",
    );
    expect(pokemonHoloShader("ultraGoldRainbowCoat").overlay).toBe(
      "ultraGoldRainbowEtch",
    );
    const etch = pokemonHoloShader("ultraGoldRainbowEtch");
    expect(etch.backgroundImage).toContain("var(--foil-etch");
    expect(etch.backgroundImage).toContain("FX_T_Highlight_Gold_Band");
    expect(etch.mixBlendMode).toBe("soft-light");
    expect(etch.opacity).toBe(0.62);
    expect(resolveCssRecipe("SvUltraGoldRainbow", null).finishShaderId).toBe(
      "ultraGoldRainbow",
    );
    expect(resolveCssRecipe("SvUltraScodix", null).finishShaderId).toBe(
      "ultraScodix",
    );
    expect(resolveCssRecipe("SwSecret", null).finishShaderId).toBe("swSecret");
    expect(pokemonHoloShader("swSecret").overlay).toBe("swSecretCoat");
    expect(pokemonHoloShader("swSecretCoat").overlay).toBe("swSecretEtch");
    expect(pokemonHoloShader("swSecretEtch").backgroundImage).toContain(
      "var(--foil-etch",
    );
    expect(pokemonHoloShader("rainbowFoil").overlay).toBe("rainbowFoilCoat");
    expect(pokemonHoloShader("cosmos").overlay).toBe("cosmosCoat");
    expect(pokemonHoloShader("galaxy").overlay).toBe("galaxyCoat");
    expect(pokemonHoloShader("flatSilver").overlay).toBe("flatSilverCoat");
    expect(pokemonHoloShader("svUltra").overlay).toBe("svUltraCoat");
    expect(pokemonHoloShader("ultraScodix").overlay).toBe(
      "ultraGoldRainbowEtch",
    );
    // Live remaps — no Simey rarity ids on these leaves.
    expect(resolveCssRecipe("Rainbow", null).finishShaderId).toBe(
      "rainbowFoil",
    );
    expect(resolveCssRecipe("Cosmos", null).finishShaderId).toBe("cosmos");
    expect(resolveCssRecipe("SwHolo", null).finishShaderId).toBe("swHolo");
  });

  it("matches poke-holo Radiant structure with Live etch polarity adapted", () => {
    const look = pokemonHoloShader("radiantHolo");
    expect(look.backgroundImage).toMatch(
      /repeating-linear-gradient\(\s*45deg/,
    );
    expect(look.backgroundImage).toMatch(
      /repeating-linear-gradient\(\s*-45deg/,
    );
    expect(look.backgroundImage).toContain("var(--barwidth");
    // Spot always lit (simey) — gating on --opacity killed the lozenges at idle.
    expect(look.backgroundImage).toContain("radial-gradient");
    expect(look.backgroundImage).toContain("hsl(0, 0%, 95%)");
    expect(look.backgroundImage).toContain("var(--card-glow");
    expect(look.backgroundImage).not.toContain("color-mix(");
    expect(look.backgroundImage).not.toContain("transparent");
    expect(look.backgroundBlendMode).toBe("exclusion, darken, color-dodge");
    // FPTI pan dosage (×0.9 / 240%) — quieter than simey ×1.5 / 210%.
    expect(look.backgroundSize).toContain("240%");
    expect(look.backgroundPosition).toContain("* 0.9)");
    expect(look.opacity).toBe(0.48);
    expect(look.overlay).toBe("radiantHoloCoat");
    expect(look.clipPath).toContain("inset(2.8%");

    const coat = pokemonHoloShader("radiantHoloCoat");
    // Simey :after — foil (top) + pastel rainbow, hard-light.
    expect(coat.backgroundImage).toMatch(/repeating-linear-gradient\(\s*55deg/);
    expect(coat.backgroundImage).toContain("var(--foil-etch");
    expect(coat.backgroundImage.startsWith("var(--foil-etch")).toBe(true);
    expect(coat.backgroundBlendMode).toBe("soft-light");
    expect(coat.mixBlendMode).toBe("color-dodge");
    expect(coat.opacity).toBe(0.42);
    expect(coat.filter).toBe("brightness(0.62) contrast(1.2) saturate(1.5)");
    expect(coat.clipPath).toContain("9.85%");
    expect(coat.overlay).toBe("radiantHoloSparkle");
    // No Live spectrum plates on the CSS coat (those are WebGL inputs).
    expect(coat.backgroundImage).not.toContain("FX_T_Spectrum_BlackSide");
    expect(coat.backgroundImage).not.toContain("Gradient_Shine");
    expect(coat.backgroundImage).not.toContain("linear-gradient(#ffffff");

    const sparkle = pokemonHoloShader("radiantHoloSparkle");
    expect(sparkle.mixBlendMode).toBe("overlay");
    expect(sparkle.backgroundImage).toContain("T_Noise_Random");
    // Live noise μ≈143 vs simey glitter μ≈51 — dim before overlay.
    expect(sparkle.filter).toContain("grayscale(1)");
    expect(sparkle.filter).toContain("brightness(0.28)");
  });
});
