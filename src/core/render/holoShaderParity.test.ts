import { describe, expect, it } from "vitest";

import theirs from "./__fixtures__/lorcanaFoilCss.json";
import { holoShader, type HoloShader } from "./holoShaders";

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

/**
 * Field-by-field parity between the library and the recipes it was transcribed
 * from.
 *
 * The fixture is the publisher's own stylesheet, reduced to the declarations of
 * every `.foil-inner` rule. Transcribing by hand went wrong once already —
 * `tempest` was copied from an extraction truncated at 420 characters and ended
 * up with the wrong size, position, both blend modes and filter, none of which
 * any other test could see. This compares all of them at once.
 */
const SELECTOR_TO_LOOK: Readonly<Record<string, string>> = {
  ".Silver .foil-shine .foil-inner": "silver",
  ".Satin .foil-shine .foil-inner": "satin",
  ".Lore .foil-shine .foil-inner": "lore",
  ".Lava .foil-shine .foil-inner": "lava",
  ".Magma .foil-shine .foil-inner": "magma",
  ".Glitter .foil-shine .foil-inner": "glitter",
  ".VerticalWave .foil-shine .foil-inner": "verticalWave",
  ".SeaWave .foil-shine .foil-inner": "seaWave",
  ".RainbowPillars .foil-shine .foil-inner": "rainbowPillars",
  ".FreeForm1 .foil-shine .foil-inner,.FreeForm2 .foil-shine .foil-inner":
    "freeForm",
  ".Tempest .foil-shine .foil-inner": "tempest",
  ".CalendarWave .foil-shine .foil-inner": "calendarWave",
  ".lore-shine .foil-inner": "loreShine",
  ".satin-shine .foil-inner": "satinShine",
  ".foil-top-shine .foil-inner": "hotFoil",
  ".foil-top-shine.ChromeRainbowHotFoil .foil-inner": "chromeRainbowHotFoil",
};

/**
 * Differences that are ours on purpose: their hashed asset names became local
 * ones, and CSS has several spellings for the same value.
 */
function normalize(value: string | undefined): string {
  return (value ?? "")
    .replace(
      /\/foil\/([a-z0-9]+)-[A-Za-z0-9_]+\.(jpg|png)/g,
      "/assets/lorcana/web/$1.$2",
    )
    .replace(/\btransparent\b/g, "#0000")
    .replace(/rgba\(255,\s*255,\s*255,\s*0?\.8\)/g, "#fffc")
    .replace(/(^|[^\d])0\.(\d)/g, "$1.$2")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\)\s*(?=[a-z])/g, ")")
    .trim()
    .toLowerCase()
    // `--combined` is defined as colorX+colorY on pointer; we spell that sum
    // as `var(--combined)` so idle can travel it without freezing on the
    // anti-diagonal (publisher CSS still writes the calc form).
    .replace(
      /calc\(var\(--colorx\)\s*\*\s*1\s*\+\s*var\(--colory\)\)/g,
      "var(--combined)",
    );
}

/**
 * A single value applies to every layer, so it equals the repeated form — and
 * an omitted `background-repeat` is `repeat`, which is what we spell out.
 */
function normalizeRepeat(value: string | undefined): string {
  const normalized = normalize(value) || "repeat";
  return [...new Set(normalized.split(","))].join(",");
}

const FIELDS: ReadonlyArray<
  [string, (shader: HoloShader) => string | undefined]
> = [
  ["background-size", (s) => s.backgroundSize],
  ["background-position", (s) => s.backgroundPosition],
  ["background-blend-mode", (s) => s.backgroundBlendMode],
  ["mix-blend-mode", (s) => s.mixBlendMode],
  ["opacity", (s) => (s.opacity == null ? undefined : String(s.opacity))],
  ["filter", (s) => s.filter],
];

const rules = theirs as Record<string, Record<string, string>>;

describe("parity with the recipes these were transcribed from", () => {
  it("covers every rule the stylesheet defines", () => {
    // A recipe appearing upstream that we never mapped would be a finish
    // rendering as the everyday foil without anyone noticing.
    expect(Object.keys(SELECTOR_TO_LOOK).sort()).toEqual(
      Object.keys(rules)
        .filter((selector) => selector !== ".foil-top-shine-2 .foil-inner")
        .sort(),
    );
  });

  for (const [selector, id] of Object.entries(SELECTOR_TO_LOOK)) {
    describe(id, () => {
      for (const [property, read] of FIELDS) {
        it(`matches on ${property}`, () => {
          expect(normalize(read(shaderOf(id)))).toBe(
            normalize(rules[selector]?.[property]),
          );
        });
      }

      it("matches on background-repeat", () => {
        expect(normalizeRepeat(shaderOf(id).backgroundRepeat)).toBe(
          normalizeRepeat(rules[selector]?.["background-repeat"]),
        );
      });

      it("names the same textures, in the same order", () => {
        // Compared by asset rather than verbatim: one of their layers is an
        // inline base64 JPEG, which we extracted to a file of its own.
        const assets = (value: string | undefined) =>
          [
            ...(value ?? "")
              .replace(
                /url\(data:image\/jpeg[^)]*\)/g,
                "url(/assets/seawavec-inline.jpg)",
              )
              .matchAll(/\/(?:assets|foil)(?:\/[a-z]+)*\/([a-z0-9]+)[-.]/g),
          ].map((match) => match[1]);
        expect(assets(shaderOf(id).backgroundImage)).toEqual(
          assets(rules[selector]?.["background-image"]),
        );
      });
    });
  }
});
