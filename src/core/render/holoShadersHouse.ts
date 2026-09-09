import type { HoloShader } from "@/core/render/holoShaders";

/**
 * The looks this project drew before the publisher's own were transcribed.
 *
 * Ours, entirely: four CSS gradients and a turbulence grain, no external
 * texture. They were replaced in `b3e104b0` — not because they were bad, but
 * because every finish rendered identically through them, so an Enchanted print
 * and a common silver one were indistinguishable. Publisher recipes solved the
 * *distinctness* problem; these still have a character worth keeping in view.
 *
 * `aurora` is the one with real evidence behind it: its stops were measured off
 * a recording of the publisher's app, where between two frames the card's right
 * half moved 30–88 per channel while the left barely shifted, and the movement
 * was chromatic rather than a brightness change. That is one wide soft band
 * travelling and changing hue — hence stops that are few, far apart and
 * desaturated, where the everyday foil repeats a tight spectrum.
 *
 * Converted to the current shape: the old renderer dodged the sweep and the
 * grain onto the artwork as two masked layers with their own filters, which
 * this shape has no room for. They are folded into one layer here, the grain
 * screened over the sweep. Close in character, not byte-identical to what
 * shipped then — nothing pins these, so nothing pretends otherwise.
 */

/** Fractal noise as facets. Inline so a look needs no asset to exist. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)'/%3E%3C/svg%3E\")";

export const HOUSE_HOLO_SHADER_IDS = [
  "rainbowBands",
  "aurora",
  "sheen",
  "sparkle",
  "etch",
  "flare",
  "kayouLenticular",
] as const;

export type HouseHoloShaderId = (typeof HOUSE_HOLO_SHADER_IDS)[number];

export function isHouseHoloShaderId(
  value: unknown,
): value is HouseHoloShaderId {
  return (
    typeof value === "string" &&
    (HOUSE_HOLO_SHADER_IDS as readonly string[]).includes(value)
  );
}

/**
 * How far off-centre the light is, 0 → 1, with a rest value.
 *
 * `HoloCardImage` writes this on the DOM node rather than through React style,
 * so before the first pointer or idle frame the property does not exist at all
 * — a `calc()` without the fallback resolves to nothing and drops the whole
 * filter.
 */
const OFF_CENTRE = "var(--pointer-from-center, 0)";

/**
 * A filter that answers the light instead of ignoring it.
 *
 * Every look here used a constant string, so the pointer slid gradients around
 * and nothing ever flared: the card coasted where a real foil catches the light
 * at an angle and lets it go when you face it. `base + swing × offCentre` is the
 * cheapest honest version of that.
 */
function lit(base: number, swing: number): string {
  return `calc(${base} + ${OFF_CENTRE} * ${swing})`;
}

const HOUSE_SHADERS: Readonly<Record<HouseHoloShaderId, HoloShader>> = {
  /** Tight repeating spectrum: what every foil used to look like. */
  rainbowBands: {
    id: "rainbowBands",
    backgroundImage: `repeating-linear-gradient(115deg, #ff6b8b 0%, #ffe066 12%, #6bffb8 24%, #6bd5ff 36%, #b98bff 48%, #ff6b8b 60%), ${GRAIN}`,
    backgroundRepeat: "repeat, repeat",
    backgroundSize: "300% 300%, 160px 160px",
    backgroundPosition: "var(--combined) center, center",
    backgroundBlendMode: "screen",
    /*
      `overlay`, not `color-dodge`. Dodge divides by the inverse of the blend
      layer, so on a base that is already near white it saturates instantly and
      the print underneath disappears. A gold Pokémon full-art measures a mean
      luminance of 183/255 with 60% of its pixels above 200, under a mask
      covering 57% of the card — dodge turned it into a flat yellow slab.
      Overlay keeps the artwork's own luminance and tints it instead.
    */
    mixBlendMode: "overlay",
    opacity: 0.55,
    // No pre-darkening: that only existed to survive dodge's blow-out.
    // Tilt the card away and the spectrum sharpens and deepens.
    filter: `contrast(${lit(1.15, 0.5)}) saturate(${lit(1.2, 0.9)})`,
  },

  /** One wide pastel band travelling and changing hue — see the file header. */
  aurora: {
    id: "aurora",
    backgroundImage: `linear-gradient(125deg, #ffd9ec 0%, #cbb2ff 18%, #9fe8ff 36%, #d8ffe6 52%, #fff0b8 68%, #ffc2dd 84%, #b8c6ff 100%), ${GRAIN}`,
    backgroundRepeat: "no-repeat, repeat",
    // Wider than the banded look on purpose: one pass covers the card, so what
    // crosses it is a single light rather than a stack of stripes.
    backgroundSize: "260% 260%, 190px 190px",
    backgroundPosition: "var(--combined) center, center",
    backgroundBlendMode: "screen",
    // Same reasoning as `rainbowBands` — and this one carried the highest
    // opacity of the four, so it was the worst offender on a gold full-art.
    mixBlendMode: "overlay",
    opacity: 0.6,
    // Gentler swing than the banded look: one wide band, one slow bloom.
    filter: `contrast(${lit(1.05, 0.3)}) saturate(${lit(1.15, 0.6)})`,
  },

  /** One soft warm highlight, no spectrum: smooth, not diffracting. */
  sheen: {
    id: "sheen",
    backgroundImage: `linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.75) 45%, rgba(255,236,180,0.9) 50%, rgba(255,255,255,0.75) 55%, transparent 80%), ${GRAIN}`,
    backgroundRepeat: "no-repeat, repeat",
    backgroundSize: "200% 200%, 150px 150px",
    backgroundPosition: "var(--combined) center, center",
    backgroundBlendMode: "screen",
    // Lowest opacity of the four already, so dodge hurt it least — but a
    // highlight that erases what it crosses is not a highlight.
    mixBlendMode: "overlay",
    opacity: 0.4,
    // A specular highlight blooms as the light leaves centre, then fades.
    filter: `brightness(${lit(0.95, 0.5)}) contrast(${lit(1.1, 0.35)})`,
  },

  /** Mostly tooth: the light comes from the facets, not a travelling band. */
  sparkle: {
    id: "sparkle",
    backgroundImage: `${GRAIN}, repeating-linear-gradient(100deg, #fff6d5 0%, #ffffff 20%, #ffe9f5 40%, #ffffff 60%, #fff6d5 80%)`,
    backgroundRepeat: "repeat, repeat",
    backgroundSize: "110px 110px, 220% 220%",
    backgroundPosition: "center, var(--combined) center",
    backgroundBlendMode: "screen",
    /*
      Overlay keeps this one's character rather than costing it: the grain's
      bright facets still lighten and its dark ones still darken, which is what
      separates glitter from a uniform haze. Under dodge the facets survived but
      the card beneath them did not.
    */
    mixBlendMode: "overlay",
    opacity: 0.5,
    // The facets pop hardest off-axis, which is what glitter does.
    filter: `contrast(${lit(1.6, 1.1)})`,
  },

  /**
   * Cold-foil / etch plate coat. Drawn through the per-print etch mask
   * (`_CardEtch`) — a soft specular, not a spectrum. Kept quieter than `sheen`
   * so it reads as stamped metal rather than another holo layer.
   */
  etch: {
    id: "etch",
    backgroundImage: `linear-gradient(118deg, transparent 25%, rgba(255,255,255,0.55) 48%, rgba(255,240,210,0.7) 52%, rgba(255,255,255,0.55) 56%, transparent 75%)`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "220% 220%",
    backgroundPosition: "var(--background-x, 50%) center",
    mixBlendMode: "soft-light",
    opacity: 0.35,
    filter: `brightness(${lit(0.98, 0.35)}) contrast(${lit(1.15, 0.4)})`,
  },

  /**
   * One narrow glint that crosses the card and then leaves it alone.
   *
   * The plainest look here on purpose. It suits a pack whose foil was never
   * captured: a spectrum would invent detail we do not have, while a glint
   * only claims "this copy is shiny", which is exactly what we do know.
   *
   * Shape taken from the Pokémon TCG gallery's own hero cards: a thin white
   * bar at -45°, `luminosity`. That blend is the part that matters — it lifts
   * brightness while leaving the artwork's hue alone, so the card looks
   * polished rather than washed white the way `screen` leaves it.
   *
   * Their bar is on a timer. Ours rides `--combined` like every other look
   * here, so the glint tracks the tilt: it crosses as you turn the card and
   * holds where you stop, instead of sweeping past on a clock that has nothing
   * to do with what your hand is doing.
   */
  flare: {
    id: "flare",
    backgroundImage: `linear-gradient(-45deg, transparent 44%, rgba(255,255,255,0.95) 50%, transparent 56%)`,
    backgroundRepeat: "no-repeat",
    // Wider than the card so the band is fully off it at both ends of the
    // travel, instead of appearing and vanishing mid-face.
    backgroundSize: "250% 250%",
    backgroundPosition: "var(--combined) center",
    mixBlendMode: "luminosity",
    opacity: 0.7,
    /*
      No pointer falloff. That mask fades the foil to nothing 68% out from the
      cursor, which suits a textured holo — light only reads where you point.
      Here it cut the band into a patch around the pointer, so the glint never
      crossed the card: the one thing this look is.
    */
    pointerFalloff: false,
    // Brightest as the card turns away from you, which is when a real foil
    // catches the light; settles as you face it.
    filter: `brightness(${lit(0.95, 0.5)})`,
  },

  /**
   * Kayou HR lenticular — the flip lives on the art layer (sprite crop). This
   * coat is a light glint only; `pointerFalloff: false` so it crosses the
   * whole face like a physical lenticular laminate.
   */
  kayouLenticular: {
    id: "kayouLenticular",
    backgroundImage: `linear-gradient(-45deg, transparent 46%, rgba(255,255,255,0.55) 50%, transparent 54%)`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "250% 250%",
    backgroundPosition: "var(--combined) center",
    mixBlendMode: "soft-light",
    opacity: 0.45,
    pointerFalloff: false,
    filter: `brightness(${lit(0.98, 0.25)})`,
  },
};

export function houseHoloShader(id: HouseHoloShaderId): HoloShader {
  return HOUSE_SHADERS[id];
}

/**
 * Every house look answers to its own name.
 *
 * Not a formality: a look is resolved, handed down as `shader.id`, and resolved
 * again by the face. Declaring `silver` here — which the old Lorcana-only `id`
 * type forced — sent every Pokémon card back through Lorcana's silver recipe.
 */
export function houseHoloShaderIdsAreSelfNaming(): boolean {
  return HOUSE_HOLO_SHADER_IDS.every((id) => HOUSE_SHADERS[id].id === id);
}
